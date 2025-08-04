const { doubleCsrf } = require("csrf-csrf");

const csrfOptions = {
  getSecret: () => process.env.CSRF_SECRET || "default-secret",
  cookieName: "x-csrf-token",
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production"
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
};

const { generateToken, validateRequest } = doubleCsrf(csrfOptions);

module.exports = {
  doubleCsrfProtection: validateRequest,
  generateCsrfToken: generateToken
};
