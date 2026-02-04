require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const uploadRouter = require("./routes/upload");
const templatesRouter = require("./routes/templates");
const adminRouter = require("./routes/admin");
const adminAuthRouter = require("./routes/adminAuth");
const adminSignupRouter = require("./routes/adminSignup");

const app = express();
// Trust proxy to allow express-rate-limit to work with X-Forwarded-For header (needed for dev proxy)
app.set("trust proxy", 1);

// Security headers
app.use(helmet());

// Rate limiting: only enable in production
if (process.env.NODE_ENV === "production") {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  });
  app.use(limiter);
}

// JSON parsing
app.use(express.json());

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));

// Routes
app.use("/api", uploadRouter);
app.use("/api", templatesRouter);
app.use("/api", adminRouter);
app.use("/api", adminAuthRouter);
app.use("/api", adminSignupRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
