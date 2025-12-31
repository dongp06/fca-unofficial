"use strict";
const fs = require("fs");
const path = require("path");
const logger = require("../../../func/logger");

/**
 * Enable automatic AppState saving
 * @param {Object} options - Options for auto-save
 * @param {string} [options.filePath] - Path to save AppState (default: "appstate.json")
 * @param {number} [options.interval] - Save interval in milliseconds (default: 10 minutes)
 * @param {boolean} [options.saveOnLogin] - Save immediately on login (default: true)
 * @returns {Function} Function to disable auto-save
 */
module.exports = function (defaultFuncs, api, ctx) {
  return function enableAutoSaveAppState(options = {}) {
    const filePath = options.filePath || path.join(process.cwd(), "appstate.json");
    const interval = options.interval || 10 * 60 * 1000; // 10 minutes default
    const saveOnLogin = options.saveOnLogin !== false; // default true

    // Save function
    function saveAppState() {
      try {
        const appState = api.getAppState();
        if (!appState || !appState.appState || appState.appState.length === 0) {
          logger("AppState is empty, skipping save", "warn");
          return;
        }

        const data = JSON.stringify(appState, null, 2);
        fs.writeFileSync(filePath, data, "utf8");
        logger(`AppState saved to ${filePath}`, "info");
      } catch (error) {
        logger(`Error saving AppState: ${error && error.message ? error.message : String(error)}`, "error");
      }
    }

    // Save immediately if requested
    let immediateSaveTimer = null;
    if (saveOnLogin) {
      // Delay a bit to ensure login is complete
      immediateSaveTimer = setTimeout(() => {
        saveAppState();
        immediateSaveTimer = null;
      }, 2000);
    }

    // Set up interval
    const intervalId = setInterval(saveAppState, interval);
    logger(`Auto-save AppState enabled: ${filePath} (every ${Math.round(interval / 1000 / 60)} minutes)`, "info");

    // Store interval ID for cleanup
    if (!ctx._autoSaveInterval) {
      ctx._autoSaveInterval = [];
    }
    ctx._autoSaveInterval.push(intervalId);

    // Return disable function
    return function disableAutoSaveAppState() {
      // Clear immediate save timer if still pending
      if (immediateSaveTimer) {
        clearTimeout(immediateSaveTimer);
        immediateSaveTimer = null;
      }
      // Clear interval
      clearInterval(intervalId);
      const index = ctx._autoSaveInterval ? ctx._autoSaveInterval.indexOf(intervalId) : -1;
      if (index !== -1) {
        ctx._autoSaveInterval.splice(index, 1);
      }
      logger("Auto-save AppState disabled", "info");
    };
  };
};
