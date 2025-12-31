const fs = require("fs");
const path = require("path");
const logger = require("../func/logger");
const defaultConfig = {
  autoUpdate: true,
  mqtt: { enabled: true, reconnectInterval: 3600 },
  autoLogin: true,
  credentials: { email: "", password: "", twofactor: "" }
};

function loadConfig() {
  const configPath = path.join(process.cwd(), "fca-config.json");
  let config;
  if (!fs.existsSync(configPath)) {
    try {
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      config = defaultConfig;
    } catch (err) {
      logger(`Error writing config file: ${err.message}`, "error");
      config = defaultConfig;
    }
  } else {
    try {
      const fileContent = fs.readFileSync(configPath, "utf8");
      config = Object.assign({}, defaultConfig, JSON.parse(fileContent));
    } catch (err) {
      logger(`Error reading config file: ${err.message}`, "error");
      config = defaultConfig;
    }
  }
  return { config, configPath };
}

module.exports = { loadConfig, defaultConfig };