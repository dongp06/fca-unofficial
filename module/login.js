const { getType } = require("../src/utils/format");
const { setOptions } = require("./options");
const { loadConfig } = require("./config");
const { checkAndUpdateVersion } = require("../func/checkUpdate");
const loginHelper = require("./loginHelper");
const logger = require("../func/logger");

const { config } = loadConfig();
global.fca = { config };

// Global error handlers to prevent bot crashes
// Handle unhandled promise rejections (e.g., fetch timeouts, network errors)
if (!global.fca._errorHandlersInstalled) {
  global.fca._errorHandlersInstalled = true;

  process.on("unhandledRejection", (reason, promise) => {
    try {
      // Check if it's a fetch/network timeout error
      if (reason && typeof reason === "object") {
        const errorCode = reason.code || reason.cause?.code;
        const errorMessage = reason.message || String(reason);

        // Handle fetch timeout errors gracefully
        if (errorCode === "UND_ERR_CONNECT_TIMEOUT" ||
            errorCode === "ETIMEDOUT" ||
            errorMessage.includes("Connect Timeout") ||
            errorMessage.includes("fetch failed")) {
          logger(`Network timeout error caught (non-fatal): ${errorMessage}`, "warn");
          return; // Don't crash, just log
        }

        // Handle other network errors
        if (errorCode === "ECONNREFUSED" ||
            errorCode === "ENOTFOUND" ||
            errorCode === "ECONNRESET" ||
            errorMessage.includes("ECONNREFUSED") ||
            errorMessage.includes("ENOTFOUND")) {
          logger(`Network connection error caught (non-fatal): ${errorMessage}`, "warn");
          return; // Don't crash, just log
        }
      }

      // For other unhandled rejections, log but don't crash
      logger(`Unhandled promise rejection (non-fatal): ${reason && reason.message ? reason.message : String(reason)}`, "error");
    } catch (e) {
      // Fallback if logger fails
      console.error("[FCA-ERROR] Unhandled promise rejection:", reason);
    }
  });

  // Handle uncaught exceptions (last resort)
  process.on("uncaughtException", (error) => {
    try {
      const errorMessage = error.message || String(error);
      const errorCode = error.code;

      // Handle fetch/network errors
      if (errorCode === "UND_ERR_CONNECT_TIMEOUT" ||
          errorCode === "ETIMEDOUT" ||
          errorMessage.includes("Connect Timeout") ||
          errorMessage.includes("fetch failed")) {
        logger(`Uncaught network timeout error (non-fatal): ${errorMessage}`, "warn");
        return; // Don't crash
      }

      // For other uncaught exceptions, log but try to continue
      logger(`Uncaught exception (attempting to continue): ${errorMessage}`, "error");
      // Note: We don't exit here to allow bot to continue running
      // In production, you might want to restart the process instead
    } catch (e) {
      // Fallback if logger fails
      console.error("[FCA-ERROR] Uncaught exception:", error);
    }
  });
}

function login(loginData, options, callback) {
  if (getType(options) === "Function" || getType(options) === "AsyncFunction") {
    callback = options;
    options = {};
  }
  const globalOptions = {
    selfListen: false,
    selfListenEvent: false,
    listenEvents: false,
    listenTyping: false,
    updatePresence: false,
    forceLogin: false,
    autoMarkDelivery: true,
    autoMarkRead: false,
    autoReconnect: true,
    online: true,
    emitReady: false,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  };
  setOptions(globalOptions, options);
  let prCallback = null;
  let rejectFunc = null;
  let resolveFunc = null;
  let returnPromise = null;
  if (getType(callback) !== "Function" && getType(callback) !== "AsyncFunction") {
    returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    prCallback = function (error, api) {
      if (error) return rejectFunc(error);
      return resolveFunc(api);
    };
    callback = prCallback;
  }
  const proceed = () => loginHelper(loginData.appState, loginData.Cookie, loginData.email, loginData.password, globalOptions, callback, prCallback);
  if (config && config.autoUpdate) {
    const p = checkAndUpdateVersion();
    if (p && typeof p.then === "function") {
      p.then(proceed).catch(err => callback(err));
    } else {
      proceed();
    }
  } else {
    proceed();
  }
  return returnPromise;
}

module.exports = login;
