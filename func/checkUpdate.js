const logger = require("./logger");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const https = require("https");
const pkgName = "@dongdev/fca-unofficial";

let axios = null;
try {
  axios = require("axios");
} catch (e) {
}

const TEMP_DIR = path.join(process.cwd(), "temp");
const LOCK_FILE = path.join(TEMP_DIR, ".fca-update-lock.json");
const RESTART_COOLDOWN_MS = 10 * 60 * 1000;

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) return reject({ error, stderr });
      resolve({ stdout, stderr });
    });
  });
}

function ensureTemp() {
  try { fs.mkdirSync(TEMP_DIR, { recursive: true }); } catch { }
}

function readLock() {
  try { return JSON.parse(fs.readFileSync(LOCK_FILE, "utf8")); } catch { return null; }
}

function writeLock(data) {
  ensureTemp();
  try { fs.writeFileSync(LOCK_FILE, JSON.stringify(data)); } catch { }
}

function clearLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch { }
}

function getInstalledVersion() {
  try {
    const p = require.resolve(`${pkgName}/package.json`, { paths: [process.cwd(), __dirname] });
    return JSON.parse(fs.readFileSync(p, "utf8")).version;
  } catch {
    return null;
  }
}

async function getInstalledVersionByNpm() {
  try {
    const { stdout } = await execPromise(`npm ls ${pkgName} --json --depth=0`);
    const json = JSON.parse(stdout || "{}");
    const v = (json && json.dependencies && json.dependencies[pkgName] && json.dependencies[pkgName].version) || null;
    return v;
  } catch {
    return null;
  }
}

async function getLatestVersionFromNpmRegistry() {
  const url = `https://registry.npmjs.org/${pkgName}/latest`;

  if (axios) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'fca-unofficial-updater',
          'Accept': 'application/json'
        }
      });
      if (response && response.data && response.data.version) {
        return response.data.version;
      }
      throw new Error("Invalid response from npm registry");
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new Error("Request timeout");
      }
      throw error;
    }
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Request timeout"));
    }, 10000);

    https.get(url, {
      headers: {
        'User-Agent': 'fca-unofficial-updater',
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        clearTimeout(timeout);
        try {
          const json = JSON.parse(data);
          if (json && json.version) {
            resolve(json.version);
          } else {
            reject(new Error("Invalid response from npm registry"));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function getLatestVersion() {
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.split('.')[0].substring(1), 10);

  const shouldUseNpmCommand = nodeMajor >= 12 && nodeMajor < 20;

  if (shouldUseNpmCommand) {
    try {
      const { stdout } = await execPromise(`npm view ${pkgName} version`);
      const version = stdout.trim();
      if (version && version.length > 0) {
        return version;
      }
    } catch (npmError) {
      const errorMsg = npmError.error && npmError.error.message ? npmError.error.message : String(npmError);
      if (errorMsg.includes("npm") && errorMsg.includes("not to run")) {
        logger("npm version incompatible, using registry API instead", "warn");
      } else {
        logger("npm view failed, using registry API instead", "warn");
      }
    }
  } else {
    logger("Using npm registry API (bypassing npm command)", "info");
  }
  try {
    const version = await getLatestVersionFromNpmRegistry();
    return version;
  } catch (httpError) {
    const errorMsg = httpError && httpError.message ? httpError.message : String(httpError);
    logger(`Failed to get latest version: ${errorMsg}`, "error");
    throw new Error("Cannot check for updates: npm command failed and registry API unavailable");
  }
}

async function _checkAndUpdateVersionImpl() {
  const lock = readLock();
  if (lock && Date.now() - (lock.ts || 0) < RESTART_COOLDOWN_MS) {
    logger("Skip auto-update due to recent attempt", "info");
    return;
  }

  logger("Checking version...", "info");
  let latest;
  try {
    latest = await getLatestVersion();
  } catch (error) {
    logger(`Cannot check for updates: ${error.message || error}. Skipping version check.`, "warn");
    return;
  }

  let installed = getInstalledVersion();
  if (!installed) installed = await getInstalledVersionByNpm();

  if (installed && installed === latest) {
    clearLock();
    logger(`You're already on the latest version - ${latest}`, "info");
    return;
  }

  if (lock && lock.latest === latest && Date.now() - (lock.ts || 0) < RESTART_COOLDOWN_MS) {
    logger("Update already attempted recently, skipping restart loop", "info");
    return;
  }

  logger(`New version available (${latest}). Current version (${installed || "not installed"}). Updating...`, "info");

  try {
    const { stderr } = await execPromise(`npm i ${pkgName}@latest`);
    if (stderr) logger(stderr, "error");
  } catch (e) {
    logger(`Error running npm install: ${e.error || e}. Trying to install from GitHub...`, "error");
    try {
      const { stderr } = await execPromise("npm i https://github.com/Donix-VN/fca-unofficial");
      if (stderr) logger(stderr, "error");
    } catch (gitErr) {
      writeLock({ ts: Date.now(), latest, status: "failed" });
      logger(`Error installing from GitHub: ${gitErr.error || gitErr}`, "error");
      throw (gitErr.error || gitErr);
    }
  }

  let after = getInstalledVersion();
  if (!after) after = await getInstalledVersionByNpm();

  if (after && after === latest) {
    writeLock({ ts: Date.now(), latest, status: "updated" });
    logger(`Updated fca to the latest version: ${latest}, Restart to apply`, "info");
    process.exit(1);
  } else {
    writeLock({ ts: Date.now(), latest, status: "mismatch" });
    logger(`Installed but version mismatch (have: ${after || "unknown"}, want: ${latest}). Skip restart to avoid loop`, "error");
  }
}

function checkAndUpdateVersion(callback) {
  if (typeof callback === "function") {
    _checkAndUpdateVersionImpl().then(() => callback(null)).catch(err => callback(err));
    return;
  }
  return _checkAndUpdateVersionImpl();
}

module.exports = { checkAndUpdateVersion };
