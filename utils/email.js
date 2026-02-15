const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = (process.env.SMTP_USER || "").trim();
const SMTP_PASS = (process.env.SMTP_PASS || "").trim();
const SMTP_SERVICE = (process.env.SMTP_SERVICE || "").trim();
const EMAIL_FROM = (
  process.env.EMAIL_FROM || "noreply@freedom-title.com"
).trim();

let transporter = null;

// Load logo once
const LOGO_PATH = path.join(
  __dirname,
  "../../client/src/assets/images/freedom-title-logo.png",
);
let logoDataUri = "";

try {
  const logoBase64 = fs.readFileSync(LOGO_PATH, { encoding: "base64" });
  logoDataUri = `data:image/png;base64,${logoBase64}`;
} catch (err) {
  console.warn("Email logo not found:", err.message);
}

/**
 * Get or create email transporter
 */
const getTransporter = async () => {
  if (transporter) return transporter;

  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "SMTP credentials not configured. Please set SMTP_USER and SMTP_PASS in .env",
    );
  }

  const config = {
    service: SMTP_SERVICE || "gmail",
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  };

  console.log("Creating email transporter with config:", {
    service: config.service,
    user: config.auth.user,
    passLength: config.auth.pass.length,
  });

  transporter = nodemailer.createTransport(config);

  // Verify connection
  try {
    await transporter.verify();
    console.log("✓ Email transporter verified successfully");
  } catch (error) {
    console.error("✗ Email transporter verification failed:", error.message);
    throw error;
  }

  return transporter;
};

/**
 * Send admin verification email
 */
const sendVerificationEmail = async (email, verifyToken, baseUrl) => {
  const verifyUrl = `${baseUrl}/api/admin/verify?token=${verifyToken}`;
  const appName = "FinCEN PDF Filler";
  const subject = `Verify your ${appName} admin account`;

  const text = `Welcome to ${appName}.

Please verify your admin email address to activate your account:
${verifyUrl}

This link expires in 24 hours. If you did not request this, you can ignore this email.

Need help? Contact ${EMAIL_FROM}.
`;

  const logoHtml = logoDataUri
    ? `
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="${logoDataUri}" alt="${appName} logo" width="120" style="display:block; height:auto;" />
        <div style="font-size:18px; font-weight:700; color:#0f172a;">${appName}</div>
      </div>
    `
    : `<div style="font-size:18px; font-weight:700; color:#0f172a;">${appName}</div>`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${subject}</title>
      </head>
      <body style="margin:0; background:#f1f5f9; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color:#0f172a;">
        <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
          Verify your admin email address to activate your account.
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9; padding:32px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px; background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(15, 23, 42, 0.08); overflow:hidden;">
                <tr>
                  <td style="padding:28px 32px; background:linear-gradient(135deg, #e2e8f0, #f8fafc); border-bottom:1px solid #e2e8f0;">
                    ${logoHtml}
                    <div style="font-size:12px; letter-spacing:1.5px; text-transform:uppercase; color:#64748b; margin-top:4px;">Admin Verification</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <h1 style="margin:0 0 12px; font-size:22px; line-height:1.3; color:#0f172a;">Verify your email</h1>
                    <p style="margin:0 0 18px; font-size:15px; color:#334155;">
                      Thanks for signing up. Please confirm your admin email address to activate your account.
                    </p>
                    <div style="margin:24px 0 28px;">
                      <a href="${verifyUrl}" style="display:inline-block; padding:12px 22px; background:#2563eb; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:600; font-size:14px;">Verify Email</a>
                    </div>
                    <p style="margin:0 0 10px; font-size:13px; color:#64748b;">
                      This link expires in 24 hours. If you did not request this, you can safely ignore this email.
                    </p>
                    <p style="margin:0; font-size:13px; color:#64748b;">
                      Need help? Contact <a href="mailto:${EMAIL_FROM}" style="color:#2563eb; text-decoration:none;">${EMAIL_FROM}</a>.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 32px; background:#f8fafc; border-top:1px solid #e2e8f0; font-size:12px; color:#94a3b8;">
                    If the button does not work, copy and paste this link into your browser:
                    <div style="word-break:break-all; margin-top:8px; color:#475569;">${verifyUrl}</div>
                  </td>
                </tr>
              </table>
              <div style="font-size:11px; color:#94a3b8; margin-top:16px;">${appName} security notification</div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to: email,
    subject,
    text,
    html,
  });

  console.log("✓ Verification email sent to:", email);
  return info;
};

/**
 * Send upload confirmation email to sender
 */
const sendUploadConfirmation = async (senderEmail, filename) => {
  const appName = "FinCEN PDF Filler";
  const subject = `PDF Form Upload Confirmation - ${appName}`;

  const text = `Your FinCEN PDF form has been successfully uploaded.

Filename: ${filename}
Upload Date: ${new Date().toLocaleString()}
Status: Encrypted and Stored

Your document has been securely encrypted and stored. Thank you for using ${appName}.

If you did not upload this document, please contact ${EMAIL_FROM} immediately.
`;

  const logoHtml = logoDataUri
    ? `
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="${logoDataUri}" alt="${appName} logo" width="120" style="display:block; height:auto;" />
        <div style="font-size:18px; font-weight:700; color:#0f172a;">${appName}</div>
      </div>
    `
    : `<div style="font-size:18px; font-weight:700; color:#0f172a;">${appName}</div>`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${subject}</title>
      </head>
      <body style="margin:0; background:#f1f5f9; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color:#0f172a;">
        <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
          Your FinCEN PDF form has been successfully uploaded and encrypted.
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9; padding:32px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px; background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(15, 23, 42, 0.08); overflow:hidden;">
                <tr>
                  <td style="padding:28px 32px; background:linear-gradient(135deg, #dcfce7, #f0fdf4); border-bottom:1px solid #bbf7d0;">
                    ${logoHtml}
                    <div style="font-size:12px; letter-spacing:1.5px; text-transform:uppercase; color:#16a34a; margin-top:4px;">Upload Confirmation</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <h1 style="margin:0 0 12px; font-size:22px; line-height:1.3; color:#0f172a;">✓ Upload Successful</h1>
                    <p style="margin:0 0 18px; font-size:15px; color:#334155;">
                      Your FinCEN PDF form has been successfully uploaded and securely encrypted.
                    </p>
                    <div style="background:#f8fafc; border-left:4px solid #22c55e; padding:16px; margin:20px 0; border-radius:6px;">
                      <p style="margin:0 0 8px; font-size:14px; color:#64748b;"><strong style="color:#0f172a;">Filename:</strong> ${filename}</p>
                      <p style="margin:0 0 8px; font-size:14px; color:#64748b;"><strong style="color:#0f172a;">Upload Date:</strong> ${new Date().toLocaleString()}</p>
                      <p style="margin:0; font-size:14px; color:#64748b;"><strong style="color:#0f172a;">Status:</strong> <span style="color:#16a34a; font-weight:600;">Encrypted and Stored</span></p>
                    </div>
                    <p style="margin:0 0 10px; font-size:13px; color:#64748b;">
                      Your document has been securely encrypted using AES-256 encryption and stored in our database.
                    </p>
                    <p style="margin:0; font-size:13px; color:#64748b;">
                      If you did not upload this document, please contact <a href="mailto:${EMAIL_FROM}" style="color:#2563eb; text-decoration:none;">${EMAIL_FROM}</a> immediately.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 32px; background:#f8fafc; border-top:1px solid #e2e8f0; font-size:12px; color:#94a3b8; text-align:center;">
                    ${appName} - Secure compliance document management
                  </td>
                </tr>
              </table>
              <div style="font-size:11px; color:#94a3b8; margin-top:16px;">${appName} security notification</div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: EMAIL_FROM,
    to: senderEmail,
    subject,
    text,
    html,
  });

  console.log("✓ Upload confirmation email sent to:", senderEmail);
  return info;
};

module.exports = {
  sendVerificationEmail,
  sendUploadConfirmation,
};
