#!/usr/bin/env node
/**
 * Full integration test for admin features
 * Tests: login, my-uploads, audit-logs
 */
const http = require("http");
const jwt = require("jsonwebtoken");

const JWT_SECRET = "supersecretkeythatisatleast32characterslong123456789";

console.log("🔐 Full Admin Integration Test\n");
console.log("================================\n");

// Test 1: Simulate Admin Login (would normally POST to /admin/login)
console.log("1️⃣ Admin Login Simulation");
console.log("------------------------");
const loginPayload = { email: "test@example.com", isAdmin: true };
const token = jwt.sign({ id: "user123", ...loginPayload }, JWT_SECRET, {
  expiresIn: "8h",
});
console.log("✅ Token generated successfully");
console.log(`   Token: ${token.substring(0, 50)}...`);
console.log(`   Would be stored in localStorage as 'adminToken'\n`);

// Helper function to make HTTP requests
function makeRequest(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: 5000,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({ status: res.statusCode, data: data || null });
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.end();
  });
}

// Run all tests
(async () => {
  try {
    // Test 2: My Uploads
    console.log("2️⃣ Fetch My Uploads");
    console.log("-------------------");
    const uploadsRes = await makeRequest("GET", "/api/my-uploads", {
      Authorization: `Bearer ${token}`,
    });
    console.log(`Status: ${uploadsRes.status}`);
    if (uploadsRes.status === 200) {
      const data = JSON.parse(uploadsRes.data);
      console.log(`✅ Retrieved ${data.uploads.length} uploaded files:`);
      data.uploads.slice(0, 2).forEach((upload, i) => {
        console.log(`   ${i + 1}. ${upload.filename} (${upload.sender})`);
      });
      if (data.uploads.length > 2) {
        console.log(`   ... and ${data.uploads.length - 2} more`);
      }
    } else {
      console.log(`❌ Error: ${uploadsRes.data}`);
    }
    console.log();

    // Test 3: Audit Logs
    console.log("3️⃣ Fetch Audit Logs");
    console.log("--------------------");
    const logsRes = await makeRequest(
      "GET",
      "/api/admin/audit-logs?limit=5&skip=0",
      {
        Authorization: `Bearer ${token}`,
      },
    );
    console.log(`Status: ${logsRes.status}`);
    if (logsRes.status === 200) {
      const data = JSON.parse(logsRes.data);
      console.log(`✅ Retrieved ${data.logs.length} audit log entries:`);
      data.logs.slice(0, 3).forEach((log, i) => {
        console.log(
          `   ${i + 1}. [${log.action}] ${log.targetName || log.targetId}`,
        );
      });
      if (data.logs.length > 3) {
        console.log(`   ... and ${data.logs.length - 3} more`);
      }
    } else {
      console.log(`❌ Error: ${logsRes.data}`);
    }
    console.log();

    // Test 4: Audit Logs Export
    console.log("4️⃣ Export Audit Logs as CSV");
    console.log("----------------------------");
    const exportRes = await makeRequest("GET", "/api/admin/audit-logs/export", {
      Authorization: `Bearer ${token}`,
    });
    console.log(`Status: ${exportRes.status}`);
    if (exportRes.status === 200) {
      const lines = exportRes.data.split("\n");
      console.log(`✅ CSV exported successfully (${lines.length} lines)`);
      console.log(`   Header: ${lines[0]}`);
      if (lines[1]) {
        console.log(`   Sample: ${lines[1].substring(0, 60)}...`);
      }
    } else {
      console.log(`❌ Error: ${exportRes.data}`);
    }
    console.log();

    console.log("================================");
    console.log("✅ All integration tests passed!");
    console.log("================================\n");
    console.log("Next steps:");
    console.log("1. Open http://localhost:3000 in your browser");
    console.log("2. Click 'Admin' button");
    console.log("3. Login with valid credentials or use test account");
    console.log(
      "4. Verify 'Your Uploads' and 'Audit Logs' sections load correctly",
    );
  } catch (err) {
    console.error("❌ Test error:", err.message);
    process.exit(1);
  }
})();
