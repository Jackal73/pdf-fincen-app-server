#!/usr/bin/env node
/**
 * Test the My Uploads and Audit Logs endpoints
 */
const http = require("http");
const jwt = require("jsonwebtoken");

const JWT_SECRET = "supersecretkeythatisatleast32characterslong123456789";

// Generate a test admin token
const token = jwt.sign(
  { id: "test123", email: "admin@test.com", isAdmin: true },
  JWT_SECRET,
  { expiresIn: "1h" },
);

console.log("Generated token:", token);
console.log("\n===== Testing My Uploads Endpoint =====\n");

// Test My Uploads endpoint
const options1 = {
  hostname: "localhost",
  port: 5000,
  path: "/api/my-uploads",
  method: "GET",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
};

const req1 = http.request(options1, (res) => {
  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });
  res.on("end", () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Response:`, data);
    console.log("\n===== Testing Audit Logs Endpoint =====\n");

    // Test Audit Logs endpoint
    const options2 = {
      hostname: "localhost",
      port: 5000,
      path: "/api/admin/audit-logs?limit=5&skip=0",
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    const req2 = http.request(options2, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response:`, data);
        console.log("\n===== Testing Audit Logs Export Endpoint =====\n");

        // Test Audit Logs Export endpoint
        const options3 = {
          hostname: "localhost",
          port: 5000,
          path: "/api/admin/audit-logs/export",
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        };

        const req3 = http.request(options3, (res) => {
          let data = "";
          console.log(`Status: ${res.statusCode}`);
          console.log(`Content-Type: ${res.headers["content-type"]}`);
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            console.log(
              `Response (first 200 chars): ${data.substring(0, 200)}`,
            );
            console.log("\n✅ All tests completed");
          });
        });

        req3.on("error", (error) => {
          console.error("Error:", error.message);
        });

        req3.end();
      });
    });

    req2.on("error", (error) => {
      console.error("Error:", error.message);
    });

    req2.end();
  });
});

req1.on("error", (error) => {
  console.error("Error:", error.message);
});

req1.end();
