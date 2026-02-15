const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const templatesDir = path.join(__dirname, "../pdf-templates");

// List available template PDFs
router.get("/list-templates", (req, res) => {
  fs.readdir(templatesDir, (err, files) => {
    if (err) return res.status(500).json({ error: "Unable to list templates" });
    const pdfs = files.filter((f) => f.endsWith(".pdf"));
    res.json({ templates: pdfs });
  });
});

// Download a template PDF
router.get("/download-template/:filename", (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(templatesDir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `File not found: ${filename}` });
  }
  res.download(filePath);
});

module.exports = router;
