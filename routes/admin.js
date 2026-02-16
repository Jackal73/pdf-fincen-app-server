const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const {
  validateTemplateFilename,
  isTemplateFilenameValid,
} = require("../utils/validation");
const { requireAdmin } = require("../middleware/auth");
const AuditLog = require("../models/AuditLog");

const templatesDir = path.join(__dirname, "../pdf-templates");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, templatesDir),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are allowed"), false);
      return;
    }
    if (!isTemplateFilenameValid(file.originalname)) {
      cb(new Error("Invalid template filename"), false);
      return;
    }
    cb(null, true);
  },
});

const logAudit = async ({
  action,
  actorEmail,
  req,
  targetId,
  targetName,
  metadata,
}) => {
  try {
    await AuditLog.create({
      action,
      actorEmail,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      targetId,
      targetName,
      metadata: metadata || null,
    });
  } catch (err) {
    // Audit logging should not block the primary action
  }
};

// Admin-only delete endpoint for template PDFs
router.delete(
  "/admin/delete-template/:filename",
  requireAdmin,
  validateTemplateFilename,
  async (req, res) => {
    // Decode URI to handle spaces and special characters
    const requested = req.params.filename;
    const filename = decodeURIComponent(requested);
    const filePath = path.join(templatesDir, filename);
    console.log("Delete requested:", requested);
    console.log("Decoded filename:", filename);
    console.log("Resolved file path:", filePath);
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      try {
        await fs.promises.chmod(filePath, 0o666);
      } catch (chmodErr) {
        console.error("chmod error:", chmodErr);
      }
      await fs.promises.unlink(filePath);
      console.log("File deleted successfully.");
      await logAudit({
        action: "template_delete",
        actorEmail: req.user?.email || null,
        req,
        targetName: filename,
      });
      res.json({ message: "Template deleted successfully" });
    } catch (err) {
      if (err.code === "ENOENT") {
        console.error("File not found:", filePath);
        return res.status(404).json({ error: "File not found" });
      }
      console.error("Failed to delete file:", filePath);
      console.error(err);
      res
        .status(500)
        .json({ error: `Failed to delete template: ${err.message}` });
    }
  },
);

// Admin-only upload endpoint for template PDFs
router.post(
  "/admin/upload-template",
  requireAdmin,
  upload.single("file"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    logAudit({
      action: "template_upload",
      actorEmail: req.user?.email || null,
      req,
      targetName: req.file.originalname,
    });
    res.status(200).json({ message: "Template uploaded successfully" });
  },
);

// Admin-only audit log listing
router.get("/admin/audit-logs", requireAdmin, async (req, res) => {
  try {
    const limitRaw = parseInt(req.query.limit, 10);
    const skipRaw = parseInt(req.query.skip, 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 50;
    const skip = Number.isFinite(skipRaw) ? Math.max(skipRaw, 0) : 0;

    const query = {};
    if (typeof req.query.action === "string" && req.query.action.trim()) {
      query.action = req.query.action.trim();
    }
    if (
      typeof req.query.actorEmail === "string" &&
      req.query.actorEmail.trim()
    ) {
      query.actorEmail = req.query.actorEmail.trim();
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({ logs, limit, skip });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// Admin-only audit log CSV export
router.get("/admin/audit-logs/export", requireAdmin, async (req, res) => {
  try {
    const query = {};
    if (typeof req.query.action === "string" && req.query.action.trim()) {
      query.action = req.query.action.trim();
    }
    if (
      typeof req.query.actorEmail === "string" &&
      req.query.actorEmail.trim()
    ) {
      query.actorEmail = req.query.actorEmail.trim();
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    const csvRows = ["Timestamp,Action,Actor Email,IP,Target ID,Target Name"];
    for (const log of logs) {
      const row = [
        log.createdAt ? new Date(log.createdAt).toISOString() : "",
        log.action || "",
        log.actorEmail || "",
        log.ip || "",
        log.targetId || "",
        log.targetName || "",
      ]
        .map((val) => `"${String(val).replace(/"/g, '""')}"`)
        .join(",");
      csvRows.push(row);
    }

    const csv = csvRows.join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-logs-${Date.now()}.csv"`,
    );
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: "Failed to export audit logs" });
  }
});

module.exports = router;
