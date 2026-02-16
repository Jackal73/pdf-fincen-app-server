const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const { validateTemplateFilename } = require("../utils/validation");
const { PDFDocument } = require("pdf-lib");

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
router.get(
  "/download-template/:filename",
  validateTemplateFilename,
  (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(templatesDir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `File not found: ${filename}` });
    }
    res.download(filePath);
  },
);

// Extract form fields from a template PDF
router.get(
  "/extract-fields/:filename",
  validateTemplateFilename,
  async (req, res) => {
    try {
      const filename = decodeURIComponent(req.params.filename);
      const filePath = path.join(templatesDir, filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `File not found: ${filename}` });
      }

      // Read PDF file
      const pdfBytes = fs.readFileSync(filePath);

      // Load PDF and extract fields
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const form = pdfDoc.getForm();
      const formFields = form.getFields();

      const fields = [];

      formFields.forEach((field) => {
        const fieldName = field.getName();
        const fieldType = field.constructor.name;

        // Map pdf-lib types to UI types
        let displayType = "text";
        if (fieldType.includes("Checkbox")) {
          displayType = "checkbox";
        } else if (fieldType.includes("RadioButton")) {
          displayType = "radio";
        } else if (fieldType.includes("Dropdown")) {
          displayType = "select";
        }

        fields.push({
          name: fieldName,
          type: displayType,
          nativeType: fieldType,
        });
      });

      res.json({
        success: true,
        filename,
        fieldCount: fields.length,
        fields,
      });
    } catch (error) {
      console.error("Error extracting PDF fields:", error);
      res.status(500).json({
        success: false,
        error: `Failed to extract fields: ${error.message}`,
      });
    }
  },
);

module.exports = router;
