'use strict';
function createAuthController({ userRepository }) {
  // Repository owns validation, cost-12 hashing and the fixed registration defaults.
  // Registration does NOT bind/authenticate the anonymous Express parent.
  return Object.freeze({ registerUser: data => userRepository.createUser(data) });
}
module.exports = { createAuthController,
  registerUser: data => require('../services/auth/httpContext').getDefaultContext().controller.registerUser(data) };
