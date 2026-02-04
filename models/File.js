const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
  filename: String,
  encryptedGridFSId: mongoose.Schema.Types.ObjectId,
  customerEmail: String,
  uploadDate: { type: Date, default: Date.now },
  status: { type: String, default: "pending" },
});

module.exports = mongoose.model("File", fileSchema);
