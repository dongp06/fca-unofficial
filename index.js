const login = require("./module/login");

// CommonJS default export
module.exports = login;
// Support require('{ login }') named import pattern
module.exports.login = login;
// Support ESM default import interop
module.exports.default = login;
