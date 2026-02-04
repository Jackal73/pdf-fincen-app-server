const express = require("express");
const AdminUser = require("../models/AdminUser");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const router = express.Router();

// TEMPORARY DEBUG ROUTE: List all admin users in the database
router.get("/admin/debug-list-admins", async (req, res) => {
  try {
    const admins = await AdminUser.find({});
    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch admin users" });
  }
});

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@freedom-title.com";
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// Nodemailer setup (for demo, use ethereal)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.ethereal.email",
  port: process.env.SMTP_PORT || 587,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

// Signup route
router.post("/admin/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });
  if (!email.endsWith("@freedom-title.com"))
    return res.status(400).json({ error: "Email must be @freedom-title.com" });
  try {
    const existing = await AdminUser.findOne({ email });
    if (existing)
      return res.status(400).json({ error: "Email already registered" });
    const verifyToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: "1d" });
    const newUser = new AdminUser({ email, password, verified: false });
    await newUser.save();
    // Send verification email
    const verifyUrl = `${BASE_URL}/api/admin/verify?token=${verifyToken}`;
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: "Verify your admin account",
      text: `Click to verify: ${verifyUrl}`,
      html: `<a href="${verifyUrl}">Verify your admin account</a>`,
    });
    res.json({ message: "Signup successful, check your email to verify." });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to signup or send verification email" });
  }
});

// Email verification route
router.get("/admin/verify", async (req, res) => {
  const { token } = req.query;
  try {
    const { email } = jwt.verify(token, JWT_SECRET);
    const user = await AdminUser.findOne({ email });
    if (!user) return res.status(400).send("User not found");
    user.verified = true;
    await user.save();
    // Show credentials and verification status
    res.send(`
      <div style="font-family: sans-serif; max-width: 480px; margin: 40px auto; padding: 32px; border-radius: 12px; background: #f8fafc; box-shadow: 0 2px 8px #0001;">
        <h2 style="color: #166534;">Email Verified!</h2>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Password:</strong> (hidden for security)</p>
        <p><strong>Verified:</strong> ${user.verified ? "true" : "false"}</p>
        <p style="margin-top: 24px;">You can now log in as admin.</p>
      </div>
    `);
  } catch {
    res.status(400).send("Invalid or expired verification link.");
  }
});

module.exports = router;
