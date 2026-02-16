require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const AdminUser = require("../models/AdminUser");

const MONGO_URI = process.env.MONGO_URI;
const SALT_ROUNDS = 12;

const isBcryptHash = (value) => {
  return (
    typeof value === "string" &&
    (value.startsWith("$2a$") ||
      value.startsWith("$2b$") ||
      value.startsWith("$2y$"))
  );
};

const run = async () => {
  if (!MONGO_URI) {
    console.error("MONGO_URI is not set. Aborting migration.");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);

  try {
    const users = await AdminUser.find({});
    let migrated = 0;
    let skipped = 0;

    for (const user of users) {
      if (isBcryptHash(user.password)) {
        skipped += 1;
        continue;
      }

      const hashed = await bcrypt.hash(user.password, SALT_ROUNDS);
      user.password = hashed;
      await user.save();
      migrated += 1;
    }

    console.log(
      `Admin password migration complete. Migrated: ${migrated}, Skipped: ${skipped}.`,
    );
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

run();
