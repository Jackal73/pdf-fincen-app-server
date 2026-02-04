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
});

module.exports = mongoose.model("FincenFormData", fincenFormDataSchema);
