const mongoose = require("mongoose");

const fincenFormDataSchema = new mongoose.Schema({
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "pdfs.files",
    required: true,
  },
  filename: { type: String, required: true },
  uploadDate: { type: Date, default: Date.now },
  fields: [{ name: String, value: String }],
  uploadedBy: { type: String }, // Optionally store user email or ID
  recipient: { type: String }, // Admin email the upload is intended for
  downloadedBy: [
    {
      email: { type: String },
      date: { type: Date, default: Date.now },
    },
  ], // Array of { email, date }
});

module.exports = mongoose.model("FincenFormData", fincenFormDataSchema);
