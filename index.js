require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const compression = require("compression");

const uploadRouter = require("./routes/upload");
const templatesRouter = require("./routes/templates");
const adminRouter = require("./routes/admin");
const adminAuthRouter = require("./routes/adminAuth");
const adminSignupRouter = require("./routes/adminSignup");

const app = express();
// Trust proxy to allow express-rate-limit to work with X-Forwarded-For header
app.set("trust proxy", 1);

// Security headers
app.use(helmet());

// CORS Configuration
const corsOptions = {
  credentials: true,
};

// In development, allow all localhost origins
// In production, only allow specific origins
if (process.env.NODE_ENV === "production") {
  corsOptions.origin = [
    process.env.FRONTEND_URL,
    "http://localhost:3000",
  ].filter(Boolean);
} else {
  // Development: allow all origins (or be very permissive)
  corsOptions.origin = true;
}

app.use(cors(corsOptions));

// ===== RATE LIMITERS =====
// Global API limiter (lenient for general endpoints)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    process.env.NODE_ENV === "development" &&
    process.env.RATE_LIMIT_DEV !== "true",
});

// Strict limiter for login (prevent brute force attacks)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per window
  message: "Too many login attempts. Please try again in 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count even successful logins
});

// Moderate limiter for signup (prevent account enumeration)
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 signup attempts per hour
  message: "Too many signup attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Moderate limiter for email verification (prevent spam)
const verifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 verification attempts per hour
  message: "Too many verification attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Upload limiter (prevent DoS via large uploads)
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads per minute per IP
  message: "Too many uploads. Please wait before uploading again.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Download limiter (prevent enumeration and DoS)
const downloadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 downloads per minute per IP
  message: "Too many downloads. Please wait before downloading again.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Delete limiter (prevent accidental/malicious mass deletion)
const deleteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 deletes per minute per IP
  message: "Too many delete requests. Please wait before deleting again.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Export limiters so routes can use them
app.rateLimiters = {
  global: globalLimiter,
  login: loginLimiter,
  signup: signupLimiter,
  verify: verifyLimiter,
  upload: uploadLimiter,
  download: downloadLimiter,
  delete: deleteLimiter,
};

// Apply global limiter to all API requests
app.use("/api", globalLimiter);

// Compression middleware for all responses
app.use(compression());

// JSON parsing
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Cache static files
app.use((req, res, next) => {
  if (
    req.method === "GET" &&
    /\.(pdf|jpg|jpeg|png|gif|svg|css|js)$/i.test(req.path)
  ) {
    res.setHeader("Cache-Control", "public, max-age=3600");
  }
  next();
});

// MongoDB connection with optimized pool settings
mongoose
  .connect(process.env.MONGO_URI, {
    maxPoolSize: 10,
    minPoolSize: 5,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log("✓ MongoDB connected"))
  .catch((err) => console.error("✗ MongoDB connection failed:", err));

// Routes
app.use("/api", uploadRouter);
app.use("/api", templatesRouter);
app.use("/api", adminRouter);
app.use("/api", adminAuthRouter);
app.use("/api", adminSignupRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  const mode = process.env.NODE_ENV || "development";
  console.log(`✓ Server running on port ${PORT} (${mode} mode)`);
  console.log(
    `✓ Rate limiting: ${process.env.RATE_LIMIT_DEV === "true" ? "ENABLED (dev)" : "Enabled in production"}`,
  );
});
