const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();

const templatesDir = path.join(__dirname, "../pdf-templates");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, templatesDir),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
});

// List all template files in pdf-templates directory
router.get("/list-templates", (req, res) => {
  fs.readdir(templatesDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Failed to list templates" });
    }
    // Only return PDF files
    const pdfs = files.filter((f) => f.toLowerCase().endsWith(".pdf"));
    res.json({ templates: pdfs });
  });
});
// Admin-only delete endpoint for template PDFs
router.delete("/admin/delete-template/:filename", async (req, res) => {
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
});

// Admin-only upload endpoint for template PDFs
router.post("/admin/upload-template", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.status(200).json({ message: "Template uploaded successfully" });
});

module.exports = router;
