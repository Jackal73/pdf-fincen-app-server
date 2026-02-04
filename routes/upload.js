const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { GridFSBucket } = require("mongodb");
const router = express.Router();

// Delete an uploaded PDF by file ID
router.delete("/delete-upload/:id", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: "pdfs" });
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    // Delete file from GridFS
    await bucket.delete(fileId);
    // Delete associated form data
    await db.collection("fincenformdatas").deleteMany({ fileId });
    res.json({ message: "File deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete file" });
  }
});
const pdfParse = require("pdf-parse");
const FincenFormData = require("../models/FincenFormData");

// Download and decrypt an uploaded PDF by file ID
router.get("/download-upload/:id", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: "pdfs" });
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const files = await db
      .collection("pdfs.files")
      .find({ _id: fileId })
      .toArray();
    if (!files.length) return res.status(404).json({ error: "File not found" });

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
});

const storage = multer.memoryStorage();
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

const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
const IV_LENGTH = 16;

router.post("/upload-fincen", upload.single("file"), async (req, res) => {
  try {
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
    const uploadStream = bucket.openUploadStream(req.file.originalname);
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
        });
      } catch (err) {
        // Ignore DB error, file upload still succeeds
      }
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
});

// List all uploaded PDFs (for demo, lists all files; add user filtering if needed)
router.get("/my-uploads", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: "pdfs" });
    const files = await db.collection("pdfs.files").find({}).toArray();
    const uploads = files.map((file) => ({
      id: file._id,
      filename: file.filename,
      uploadDate: file.uploadDate,
    }));
    res.json({ uploads });
  } catch (error) {
    res.status(500).json({ error: "Failed to list uploads" });
  }
});

module.exports = router;
