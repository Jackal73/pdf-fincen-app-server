const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    actorEmail: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    targetId: { type: String, default: null },
    targetName: { type: String, default: null },
    metadata: { type: Object, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
