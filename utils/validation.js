const Joi = require("joi");

/**
 * Validation schemas using Joi for strict input validation
 */

// ===== AUTHENTICATION SCHEMAS =====

/**
 * Login validation schema
 * - Email: valid email format, required, normalized to lowercase
 * - Password: required, non-empty string
 * Note: Password complexity not enforced on login since it validates existing passwords
 */
const loginSchema = Joi.object({
  email: Joi.string().email().required().lowercase().messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
  password: Joi.string().required().min(1).messages({
    "any.required": "Password is required",
    "string.empty": "Password cannot be empty",
  }),
});

/**
 * Signup validation schema - SERVER-SIDE PASSWORD COMPLEXITY ENFORCEMENT
 * - Email: valid format, required, normalized to lowercase
 * - Password: minimum 8 characters with required character types:
 *   • At least one uppercase letter (A-Z)
 *   • At least one lowercase letter (a-z)
 *   • At least one number (0-9)
 *   • At least one special character (!@#$%^&*)
 *
 * All validation is enforced server-side via Joi regex patterns to prevent
 * weak password bypass if frontend validation is circumvented
 */
const signupSchema = Joi.object({
  email: Joi.string().email().required().lowercase().messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
  password: Joi.string()
    .required()
    .min(8)
    .pattern(/[A-Z]/, "uppercase letter")
    .pattern(/[a-z]/, "lowercase letter")
    .pattern(/[0-9]/, "number")
    .pattern(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>?]/, "special character")
    .messages({
      "any.required": "Password is required",
      "string.min": "Password must be at least 8 characters",
      "string.pattern.base": "Password must contain at least one {#label}",
    }),
});

/**
 * Email verification validation schema
 * - Token: required JWT token string
 */
const emailVerifySchema = Joi.object({
  token: Joi.string().required().messages({
    "any.required": "Verification token is required",
    "string.empty": "Verification token cannot be empty",
  }),
});

// ===== FILE UPLOAD SCHEMAS =====

/**
 * File upload validation schema
 * - Sender (optional): valid email format if provided, normalized to lowercase
 * - Template (optional): string representing the template being filled
 * - File: validated by multer middleware
 */
const fileUploadSchema = Joi.object({
  sender: Joi.string().email().lowercase().optional().allow(null, "").messages({
    "string.email": "Sender must be a valid email address",
  }),
  template: Joi.string().optional().allow(null, "").messages({
    "string.base": "Template must be a string",
  }),
}).unknown(true);

/**
 * File ID validation (for URL parameters)
 * - ID: valid MongoDB ObjectId format
 */
const fileIdSchema = Joi.object({
  id: Joi.string()
    .required()
    .pattern(/^[a-f\d]{24}$/)
    .messages({
      "any.required": "File ID is required",
      "string.pattern.base": "Invalid file ID format",
    }),
});

/**
 * Template filename validation (for URL parameters)
 * - filename: only safe characters, must end with .pdf
 */
const templateFilenameSchema = Joi.object({
  filename: Joi.string()
    .required()
    .pattern(/^[a-zA-Z0-9._ -]+\.pdf$/)
    .messages({
      "any.required": "Filename is required",
      "string.pattern.base": "Invalid template filename",
    }),
});

const isTemplateFilenameValid = (filename) => {
  const { error } = templateFilenameSchema.validate({ filename });
  return !error;
};

// ===== VALIDATION MIDDLEWARE FACTORY =====

/**
 * Creates a middleware that validates request data against a Joi schema
 * @param {Joi.ObjectSchema} schema - Joi validation schema
 * @param {string} source - Where to validate: 'body', 'query', 'params', or 'all'
 * @returns {Function} Express middleware
 */
const validate = (schema, source = "body") => {
  return (req, res, next) => {
    let dataToValidate = {};

    if (source === "body" || source === "all") {
      dataToValidate = { ...dataToValidate, ...req.body };
    }
    if (source === "query" || source === "all") {
      dataToValidate = { ...dataToValidate, ...req.query };
    }
    if (source === "params" || source === "all") {
      dataToValidate = { ...dataToValidate, ...req.params };
    }

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false, // Return all validation errors
      stripUnknown: true, // Remove properties not in schema
    });

    if (error) {
      const messages = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return res.status(400).json({
        error: "Validation failed",
        details: messages,
      });
    }

    // Update request with validated/normalized data
    if (source === "body" || source === "all") {
      req.body = { ...req.body, ...value };
    }
    if (source === "query" || source === "all") {
      req.query = { ...req.query, ...value };
    }
    if (source === "params" || source === "all") {
      req.params = { ...req.params, ...value };
    }

    next();
  };
};

module.exports = {
  // Schemas
  loginSchema,
  signupSchema,
  emailVerifySchema,
  fileUploadSchema,
  fileIdSchema,
  templateFilenameSchema,
  isTemplateFilenameValid,

  // Middleware factory
  validate,

  // Convenience middleware
  validateLogin: validate(loginSchema, "body"),
  validateSignup: validate(signupSchema, "body"),
  validateEmailVerify: validate(emailVerifySchema, "query"),
  validateFileUpload: validate(fileUploadSchema, "body"),
  validateFileId: validate(fileIdSchema, "params"),
  validateTemplateFilename: validate(templateFilenameSchema, "params"),
};
