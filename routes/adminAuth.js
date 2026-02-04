const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const AdminUser = require("../models/AdminUser");
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// Login using AdminUser collection
router.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await AdminUser.findOne({ email });
    if (!user)
      return res.status(401).json({ error: "Invalid email or password" });
    if (!user.verified)
      return res.status(401).json({ error: "Email not verified" });
    // For demo: plain text password check. In production, use bcrypt.
    if (user.password !== password)
      return res.status(401).json({ error: "Invalid email or password" });
    const token = jwt.sign({ email: user.email, admin: true }, JWT_SECRET, {
      expiresIn: "8h",
    });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
