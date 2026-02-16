const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { GridFSBucket } = require("mongodb");
const router = express.Router();
const pdfParse = require("pdf-parse");
const FincenFormData = require("../models/FincenFormData");
const { sendUploadConfirmation } = require("../utils/email");
const { validateFileId, validateFileUpload } = require("../utils/validation");
const { requireAdmin } = require("../middleware/auth");
const AuditLog = require("../models/AuditLog");

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

// Delete an uploaded PDF by file ID
router.delete(
  "/delete-upload/:id",
  (req, res, next) => {
    // Get the delete limiter from app's rate limiters
    const deleteLimiter = req.app.rateLimiters.delete;
    deleteLimiter(req, res, next);
  },
  requireAdmin,
  validateFileId,
  async (req, res) => {
    try {
      const db = mongoose.connection.db;
      const bucket = new GridFSBucket(db, { bucketName: "pdfs" });
      const fileId = new mongoose.Types.ObjectId(req.params.id);
      // Delete file from GridFS
      await bucket.delete(fileId);
      // Delete associated form data
      await db.collection("fincenformdatas").deleteMany({ fileId });
      await logAudit({
        action: "file_delete",
        actorEmail: req.user?.email || null,
        req,
        targetId: String(fileId),
      });
      res.json({ message: "File deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete file" });
    }
  },
);

// Download and decrypt an uploaded PDF by file ID
router.get(
  "/download-upload/:id",
  (req, res, next) => {
    // Get the download limiter from app's rate limiters
    const downloadLimiter = req.app.rateLimiters.download;
    downloadLimiter(req, res, next);
  },
  requireAdmin,
  validateFileId,
  async (req, res) => {
    try {
      const db = mongoose.connection.db;
      const bucket = new GridFSBucket(db, { bucketName: "pdfs" });
      const fileId = new mongoose.Types.ObjectId(req.params.id);
      const files = await db
        .collection("pdfs.files")
        .find({ _id: fileId })
        .toArray();
      if (!files.length)
        return res.status(404).json({ error: "File not found" });

      const downloadStream = bucket.openDownloadStream(fileId);
      let chunks = [];
      downloadStream.on("data", (chunk) => chunks.push(chunk));
      downloadStream.on("end", () => {
        const encrypted = Buffer.concat(chunks);
        // Decrypt
        const iv = encrypted.slice(0, IV_LENGTH);
        const encryptedData = encrypted.slice(IV_LENGTH);
        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        const decrypted = Buffer.concat([
          decipher.update(encryptedData),
          decipher.final(),
        ]);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=\"${files[0].filename}\"`,
        );
        res.send(decrypted);
      });
      downloadStream.on("error", () => {
        res.status(500).json({ error: "Failed to download file" });
      });
    } catch (error) {
      res.status(500).json({ error: "Download failed" });
    }
  },
);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/x-pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
});

const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
const IV_LENGTH = 16;

router.post(
  "/upload-fincen",
  (req, res, next) => {
    // Get the upload limiter from app's rate limiters
    const uploadLimiter = req.app.rateLimiters.upload;
    uploadLimiter(req, res, next);
  },
  upload.single("file"),
  validateFileUpload,
  async (req, res) => {
    try {
      const sender =
        typeof req.body.sender === "string" ? req.body.sender.trim() : null;
      if (!req.file) {
        return res.status(400).json({ error: "PDF file is required" });
      }
      const fileData = req.file.buffer;
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
      const encrypted = Buffer.concat([
        iv,
        cipher.update(fileData),
        cipher.final(),
      ]);

      // Save encrypted Buffer to MongoDB GridFS
      const db = mongoose.connection.db;
      const bucket = new GridFSBucket(db, { bucketName: "pdfs" });
      const uploadStream = bucket.openUploadStream(req.file.originalname, {
        metadata: { sender: sender || null },
      });
      uploadStream.end(encrypted);

      uploadStream.on("finish", async () => {
        // Extract form data from PDF
        let fields = [];
        try {
          const pdfData = await pdfParse(fileData);
          if (pdfData && pdfData.acroForm && pdfData.acroForm.fields) {
            fields = pdfData.acroForm.fields.map((f) => ({
              name: f.name,
              value: f.value,
            }));
          }
        } catch (err) {
          // Extraction failed, continue without fields
          fields = [];
        }
        // Save form data to MongoDB
        try {
          await FincenFormData.create({
            fileId: uploadStream.id,
            filename: req.file.originalname,
            fields,
            uploadedBy: sender,
          });
        } catch (err) {
          // Ignore DB error, file upload still succeeds
        }

        // Send confirmation email to sender if provided
        if (sender) {
          try {
            await sendUploadConfirmation(sender, req.file.originalname);
            console.log(`✓ Confirmation email sent to ${sender}`);
          } catch (emailErr) {
            console.error(
              "Failed to send confirmation email:",
              emailErr.message,
            );
            // Don't fail upload if email fails
          }
        }

        await logAudit({
          action: "file_upload",
          actorEmail: req.user?.email || null,
          req,
          targetId: String(uploadStream.id),
          targetName: req.file.originalname,
          metadata: { sender },
        });

        res.status(200).json({
          message: "File uploaded and encrypted successfully",
          fileId: uploadStream.id,
        });
      });
      uploadStream.on("error", (err) => {
        res.status(500).json({ error: "Failed to save encrypted file" });
      });
    } catch (error) {
      res.status(500).json({ error: "Encryption failed" });
    }
  },
);

// List all uploaded PDFs (sorted by newest first with sender info)
router.get("/my-uploads", requireAdmin, async (req, res) => {
  try {
    const db = mongoose.connection.db;

    // Get files sorted by uploadDate descending with lean projection
    const files = await db
      .collection("pdfs.files")
      .find(
        {},
        { projection: { _id: 1, filename: 1, uploadDate: 1, metadata: 1 } },
      )
      .sort({ uploadDate: -1 })
      .toArray();

    // Batch fetch form data for all files
    const fileIds = files.map((f) => f._id);
    const formDataMap = new Map();
    if (fileIds.length > 0) {
      const formDataList = await FincenFormData.find(
        { fileId: { $in: fileIds } },
        { fileId: 1, uploadedBy: 1 },
      ).lean();
      formDataList.forEach((fd) => {
        formDataMap.set(String(fd.fileId), fd.uploadedBy);
      });
    }

    // Build response
    const uploadsWithSender = files.map((file) => ({
      id: file._id,
      filename: file.filename,
      uploadDate: file.uploadDate,
      sender:
        formDataMap.get(String(file._id)) || file.metadata?.sender || "Unknown",
    }));

    res.json({ uploads: uploadsWithSender });
  } catch (error) {
    res.status(500).json({ error: "Failed to list uploads" });
  }
});

module.exports = router;
