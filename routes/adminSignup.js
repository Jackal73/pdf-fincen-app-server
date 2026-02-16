const express = require("express");
const AdminUser = require("../models/AdminUser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { sendVerificationEmail } = require("../utils/email");
const { validateSignup, validateEmailVerify } = require("../utils/validation");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// Signup route
router.post(
  "/admin/signup",
  (req, res, next) => {
    // Get the signup limiter from app's rate limiters
    const signupLimiter = req.app.rateLimiters.signup;
    signupLimiter(req, res, next);
  },
  validateSignup, // Strict input validation (password requirements, email format)
  async (req, res) => {
    const { email, password } = req.body;

    try {
      // Check if user already exists
      const existing = await AdminUser.findOne({ email });
      if (existing) {
        // Use generic error message to prevent user enumeration
        return res
          .status(400)
          .json({
            error: "Signup failed, please try again or contact support",
          });
      }

      // Create verification token
      const verifyToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: "1d" });

      // Hash password with salt before saving
      const passwordHash = await bcrypt.hash(password, 12);

      // Save new user (not verified yet)
      const newUser = new AdminUser({
        email,
        password: passwordHash,
        verified: false,
      });
      await newUser.save();

      // Send verification email
      await sendVerificationEmail(email, verifyToken, BASE_URL);

      res.json({ message: "Signup successful, check your email to verify." });
    } catch (err) {
      console.error("Admin signup error:", err);
      const message =
        process.env.NODE_ENV === "production"
          ? "Failed to signup or send verification email"
          : `Failed to signup or send verification email: ${err.message}`;
      res.status(500).json({ error: message });
    }
  },
);

// Email verification route
router.get(
  "/admin/verify",
  validateEmailVerify, // Strict token validation
  (req, res, next) => {
    // Get the verify limiter from app's rate limiters
    const verifyLimiter = req.app.rateLimiters.verify;
    verifyLimiter(req, res, next);
  },
  async (req, res) => {
    const { token } = req.query;

    try {
      const { email } = jwt.verify(token, JWT_SECRET);
      const user = await AdminUser.findOne({ email });

      if (!user) {
        return res.status(400).send("User not found");
      }

      user.verified = true;
      await user.save();

      // Show success page
      res.send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Email Verified</title>
        </head>
        <body style="margin:0; padding:40px; background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height:100vh; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">
          <div style="max-width: 480px; margin: 0 auto; padding: 32px; border-radius: 12px; background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); box-shadow: 0 8px 32px rgba(0,0,0,0.3); border: 1px solid rgba(59, 130, 246, 0.3);">
            <h2 style="color: #22c55e; margin-top:0; font-size: 24px;">✓ Email Verified!</h2>
            <p style="color:#e2e8f0; line-height: 1.6;"><strong style="color:#94a3b8;">Email:</strong> ${user.email}</p>
            <p style="color:#e2e8f0; line-height: 1.6;"><strong style="color:#94a3b8;">Status:</strong> <span style="color:#22c55e;">Verified</span></p>
            <p style="margin-top: 24px; color:#cbd5e1; line-height: 1.6;">You can now log in as admin.</p>
            <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}" style="display:inline-block; margin-top:20px; padding:12px 28px; background:#3b82f6; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); transition: background 0.3s;">Go to App</a>
          </div>
        </body>
      </html>
    `);
    } catch (err) {
      console.error("Email verification error:", err);
      res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Verification Failed</title>
        </head>
        <body style="margin:0; padding:40px; background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height:100vh; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">
          <div style="max-width: 480px; margin: 0 auto; padding: 32px; border-radius: 12px; background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); box-shadow: 0 8px 32px rgba(0,0,0,0.3); border: 1px solid rgba(59, 130, 246, 0.3);">
            <h2 style="color: #ef4444; margin-top:0; font-size: 24px;">✗ Verification Failed</h2>
            <p style="color:#e2e8f0; line-height: 1.6;">Invalid or expired verification link.</p>
            <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}" style="display:inline-block; margin-top:20px; padding:12px 28px; background:#64748b; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; box-shadow: 0 4px 12px rgba(100, 116, 139, 0.4); transition: background 0.3s;">Go to App</a>
          </div>
        </body>
      </html>
    `);
    }
  },
);

// Resend verification email route - helps users who haven't verified yet
router.post(
  "/admin/resend-verification",
  (req, res, next) => {
    // Get the verify limiter from app's rate limiters
    const verifyLimiter = req.app.rateLimiters.verify;
    verifyLimiter(req, res, next);
  },
  async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      const user = await AdminUser.findOne({ email });

      // Use generic message to prevent user enumeration
      if (!user || user.verified) {
        return res.status(200).json({
          message:
            "If an unverified account exists, a verification email will be sent.",
        });
      }

      // Create new verification token
      const verifyToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: "1d" });

      // Send verification email
      await sendVerificationEmail(email, verifyToken, BASE_URL);

      res.json({
        message: "Verification email sent! Check your inbox and spam folder.",
      });
    } catch (err) {
      console.error("Resend verification error:", err);
      const message =
        process.env.NODE_ENV === "production"
          ? "Failed to resend verification email"
          : `Failed to resend verification email: ${err.message}`;
      res.status(500).json({ error: message });
    }
  },
);

module.exports = router;
