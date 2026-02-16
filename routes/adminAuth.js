const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const router = express.Router();

const AdminUser = require("../models/AdminUser");
const { validateLogin } = require("../utils/validation");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

// Login using AdminUser collection
router.post(
  "/admin/login",
  (req, res, next) => {
    // Get the login limiter from app's rate limiters
    const loginLimiter = req.app.rateLimiters.login;
    loginLimiter(req, res, next);
  },
  validateLogin, // Strict input validation
  async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await AdminUser.findOne({ email });

      // User not found
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // User not verified - give specific guidance
      if (!user.verified) {
        return res.status(401).json({
          error:
            "Please verify your email first. Use the resend link on the login page.",
          requiresVerification: true,
        });
      }

      // Check password
      const hasBcryptPrefix =
        user.password &&
        (user.password.startsWith("$2a$") ||
          user.password.startsWith("$2b$") ||
          user.password.startsWith("$2y$"));

      let passwordMatches = false;

      if (hasBcryptPrefix) {
        try {
          passwordMatches = await bcrypt.compare(password, user.password);
        } catch (bcryptErr) {
          console.error("Bcrypt compare error:", bcryptErr);
          return res.status(401).json({ error: "Incorrect password" });
        }
      } else {
        // Legacy plain-text support: validate once, then upgrade to hash
        passwordMatches = user.password === password;
        if (passwordMatches) {
          try {
            user.password = await bcrypt.hash(password, 12);
            await user.save();
          } catch (hashErr) {
            console.error("Password upgrade error:", hashErr);
            // Still allow login even if upgrade fails
          }
        }
      }

      if (!passwordMatches) {
        console.log(
          `Login failed for verified user ${email}: password mismatch`,
        );
        return res.status(401).json({ error: "Incorrect password" });
      }

      const token = jwt.sign(
        {
          id: user._id.toString(),
          email: user.email,
          isAdmin: true,
        },
        JWT_SECRET,
        {
          expiresIn: "8h",
        },
      );
      res.json({ token });
    } catch (err) {
      console.error("Login error details:", {
        message: err.message,
        stack: err.stack,
        name: err.name,
      });
      res.status(500).json({ error: "Login failed - server error" });
    }
  },
);

module.exports = router;
