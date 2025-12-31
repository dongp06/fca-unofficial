"use strict";
const mqtt = require("mqtt");
const WebSocket = require("ws");
const HttpsProxyAgent = require("https-proxy-agent");
const EventEmitter = require("events");
const logger = require("../../../func/logger");
const { parseAndCheckLogin } = require("../../utils/client");
const { buildProxy, buildStream } = require("./detail/buildStream");
const { topics } = require("./detail/constants");
const createParseDelta = require("./core/parseDelta");
const createListenMqtt = require("./core/connectMqtt");
const createGetSeqID = require("./core/getSeqID");
const markDelivery = require("./core/markDelivery");
const getTaskResponseData = require("./core/getTaskResponseData");
const createEmitAuth = require("./core/emitAuth");
const createMiddlewareSystem = require("./middleware");
const parseDelta = createParseDelta({ markDelivery, parseAndCheckLogin });
// Create emitAuth first so it can be injected into both factories
const emitAuth = createEmitAuth({ logger });
// Pass emitAuth into connectMqtt so errors there can signal auth state
const listenMqtt = createListenMqtt({ WebSocket, mqtt, HttpsProxyAgent, buildStream, buildProxy, topics, parseDelta, getTaskResponseData, logger, emitAuth });
// Inject emitAuth into getSeqID so its catch handler can notify properly
const getSeqIDFactory = createGetSeqID({ parseAndCheckLogin, listenMqtt, logger, emitAuth });

const MQTT_DEFAULTS = { cycleMs: 60 * 60 * 1000, reconnectDelayMs: 2000, autoReconnect: true, reconnectAfterStop: false };
function mqttConf(ctx, overrides) {
  ctx._mqttOpt = Object.assign({}, MQTT_DEFAULTS, ctx._mqttOpt || {}, overrides || {});
  if (typeof ctx._mqttOpt.autoReconnect === "boolean") ctx.globalOptions.autoReconnect = ctx._mqttOpt.autoReconnect;
  return ctx._mqttOpt;
}

module.exports = function (defaultFuncs, api, ctx, opts) {
  const identity = function () { };
  let globalCallback = identity;

  // Initialize middleware system if not already initialized
  if (!ctx._middleware) {
    ctx._middleware = createMiddlewareSystem();
  }
  const middleware = ctx._middleware;

  function installPostGuard() {
    if (ctx._postGuarded) return defaultFuncs.post;
    const rawPost = defaultFuncs.post && defaultFuncs.post.bind(defaultFuncs);
    if (!rawPost) return defaultFuncs.post;

    function postSafe(...args) {
      return rawPost(...args).catch(err => {
        const msg = (err && err.error) || (err && err.message) || String(err || "");
        if (/Not logged in|blocked the login/i.test(msg)) {
          emitAuth(
            ctx,
            api,
            globalCallback,
            /blocked/i.test(msg) ? "login_blocked" : "not_logged_in",
            msg
          );
        }
        throw err;
      });
    }
    defaultFuncs.post = postSafe;
    ctx._postGuarded = true;
    logger("postSafe guard installed for defaultFuncs.post", "info");
    return postSafe;
  }

  let conf = mqttConf(ctx, opts);

  function getSeqIDWrapper() {
    if (ctx._ending && !ctx._cycling) {
      logger("mqtt getSeqID skipped - ending", "warn");
      return Promise.resolve();
    }
    const form = {
      av: ctx.globalOptions.pageID,
      queries: JSON.stringify({
        o0: {
          doc_id: "3336396659757871",
          query_params: {
            limit: 1, before: null, tags: ["INBOX"],
            includeDeliveryReceipts: false, includeSeqID: true
          }
        }
      })
    };
    logger("mqtt getSeqID call", "info");
    return getSeqIDFactory(defaultFuncs, api, ctx, globalCallback, form)
      .then(() => {
        logger("mqtt getSeqID done", "info");
        ctx._cycling = false;
      })
      .catch(e => {
        ctx._cycling = false;
        const errMsg = e && e.message ? e.message : String(e || "Unknown error");
        logger(`mqtt getSeqID error: ${errMsg}`, "error");
        // Don't reconnect if we're ending
        if (ctx._ending) return;
        // Retry after delay if autoReconnect is enabled
        if (ctx.globalOptions.autoReconnect) {
          const d = conf.reconnectDelayMs;
          logger(`mqtt getSeqID will retry in ${d}ms`, "warn");
          setTimeout(() => {
            if (!ctx._ending) getSeqIDWrapper();
          }, d);
        }
      });
  }

  function isConnected() {
    return !!(ctx.mqttClient && ctx.mqttClient.connected);
  }

  function unsubAll(cb) {
    if (!isConnected()) {
      if (cb) setTimeout(cb, 0);
      return;
    }
    let pending = topics.length;
    if (!pending) {
      if (cb) setTimeout(cb, 0);
      return;
    }
    let fired = false;
    const timeout = setTimeout(() => {
      if (!fired) {
        fired = true;
        logger("unsubAll timeout, proceeding anyway", "warn");
        if (cb) cb();
      }
    }, 5000); // 5 second timeout

    topics.forEach(t => {
      try {
        ctx.mqttClient.unsubscribe(t, () => {
          if (--pending === 0 && !fired) {
            clearTimeout(timeout);
            fired = true;
            if (cb) cb();
          }
        });
      } catch (err) {
        logger(`unsubAll error for topic ${t}: ${err && err.message ? err.message : String(err)}`, "warn");
        if (--pending === 0 && !fired) {
          clearTimeout(timeout);
          fired = true;
          if (cb) cb();
        }
      }
    });
  }

  function endQuietly(next) {
    const finish = () => {
      try {
        if (ctx.mqttClient) {
          ctx.mqttClient.removeAllListeners();
        }
      } catch (_) { }
      ctx.mqttClient = undefined;
      ctx.lastSeqId = null;
      ctx.syncToken = undefined;
      ctx.t_mqttCalled = false;
      ctx._ending = false;
      ctx._cycling = false;
      if (ctx._reconnectTimer) {
        clearTimeout(ctx._reconnectTimer);
        ctx._reconnectTimer = null;
      }
      if (ctx._rTimeout) {
        clearTimeout(ctx._rTimeout);
        ctx._rTimeout = null;
      }
      // Clean up tasks Map to prevent memory leak
      if (ctx.tasks && ctx.tasks instanceof Map) {
        ctx.tasks.clear();
      }
      // Clean up userInfo intervals
      if (ctx._userInfoIntervals && Array.isArray(ctx._userInfoIntervals)) {
        ctx._userInfoIntervals.forEach(interval => {
          try {
            clearInterval(interval);
          } catch (_) { }
        });
        ctx._userInfoIntervals = [];
      }
      // Clean up autoSave intervals
      if (ctx._autoSaveInterval && Array.isArray(ctx._autoSaveInterval)) {
        ctx._autoSaveInterval.forEach(interval => {
          try {
            clearInterval(interval);
          } catch (_) { }
        });
        ctx._autoSaveInterval = [];
      }
      // Clean up scheduler
      if (ctx._scheduler && typeof ctx._scheduler.destroy === "function") {
        try {
          ctx._scheduler.destroy();
        } catch (_) { }
        ctx._scheduler = undefined;
      }
      // Clear global mqttClient reference if set
      if (global.mqttClient) {
        delete global.mqttClient;
      }
      next && next();
    };
    try {
      if (ctx.mqttClient) {
        if (isConnected()) {
          try {
            ctx.mqttClient.publish("/browser_close", "{}", { qos: 0 });
          } catch (_) { }
        }
        ctx.mqttClient.end(true, finish);
      } else finish();
    } catch (_) { finish(); }
  }

  function delayedReconnect() {
    const d = conf.reconnectDelayMs;
    logger(`mqtt reconnect in ${d}ms`, "info");
    setTimeout(() => getSeqIDWrapper(), d);
  }

  function forceCycle() {
    if (ctx._cycling) {
      logger("mqtt force cycle already in progress", "warn");
      return;
    }
    ctx._cycling = true;
    ctx._ending = true;
    logger("mqtt force cycle begin", "warn");
    unsubAll(() => endQuietly(() => delayedReconnect()));
  }

  return function (callback) {
    class MessageEmitter extends EventEmitter {
      stopListening(callback2) {
        const cb = callback2 || function () { };
        logger("mqtt stop requested", "info");
        globalCallback = identity;

        if (ctx._autoCycleTimer) {
          clearInterval(ctx._autoCycleTimer);
          ctx._autoCycleTimer = null;
          logger("mqtt auto-cycle cleared", "info");
        }

        if (ctx._reconnectTimer) {
          clearTimeout(ctx._reconnectTimer);
          ctx._reconnectTimer = null;
        }

        ctx._ending = true;
        unsubAll(() => endQuietly(() => {
          logger("mqtt stopped", "info");
          cb();
          conf = mqttConf(ctx, conf);
          if (conf.reconnectAfterStop) delayedReconnect();
        }));
      }
      async stopListeningAsync() {
        return new Promise(resolve => { this.stopListening(resolve); });
      }
    }

    const msgEmitter = new MessageEmitter();

    // Original callback without middleware
    const originalCallback = callback || function (error, message) {
      if (error) { logger("mqtt emit error", "error"); return msgEmitter.emit("error", error); }
      msgEmitter.emit("message", message);
    };

    // Only wrap callback with middleware if middleware exists
    // If no middleware, use callback directly for better performance
    if (middleware.count > 0) {
      globalCallback = middleware.wrapCallback(originalCallback);
    } else {
      globalCallback = originalCallback;
    }

    conf = mqttConf(ctx, conf);

    installPostGuard();

    if (!ctx.firstListen) ctx.lastSeqId = null;
    ctx.syncToken = undefined;
    ctx.t_mqttCalled = false;

    if (ctx._autoCycleTimer) { clearInterval(ctx._autoCycleTimer); ctx._autoCycleTimer = null; }
    if (conf.cycleMs && conf.cycleMs > 0) {
      ctx._autoCycleTimer = setInterval(forceCycle, conf.cycleMs);
      logger(`mqtt auto-cycle enabled ${conf.cycleMs}ms`, "info");
    } else {
      logger("mqtt auto-cycle disabled", "info");
    }

    if (!ctx.firstListen || !ctx.lastSeqId) getSeqIDWrapper();
    else {
      logger("mqtt starting listenMqtt", "info");
      listenMqtt(defaultFuncs, api, ctx, globalCallback);
    }

    api.stopListening = msgEmitter.stopListening;
    api.stopListeningAsync = msgEmitter.stopListeningAsync;

    // Store original callback for re-wrapping when middleware is added/removed
    let currentOriginalCallback = originalCallback;
    let currentGlobalCallback = globalCallback;

    // Function to re-wrap callback when middleware changes
    function rewrapCallbackIfNeeded() {
      if (!ctx.mqttClient || ctx._ending) return; // Not listening or ending

      const hasMiddleware = middleware.count > 0;
      const isWrapped = currentGlobalCallback !== currentOriginalCallback;

      // If middleware exists but callback is not wrapped, wrap it
      if (hasMiddleware && !isWrapped) {
        currentGlobalCallback = middleware.wrapCallback(currentOriginalCallback);
        globalCallback = currentGlobalCallback;
        logger("Middleware added - callback re-wrapped", "info");
      }
      // If no middleware but callback is wrapped, unwrap it
      else if (!hasMiddleware && isWrapped) {
        currentGlobalCallback = currentOriginalCallback;
        globalCallback = currentGlobalCallback;
        logger("All middleware removed - callback unwrapped", "info");
      }
    }

    // Expose middleware API with re-wrapping support
    api.useMiddleware = function (middlewareFn, fn) {
      const result = middleware.use(middlewareFn, fn);
      rewrapCallbackIfNeeded();
      return result;
    };
    api.removeMiddleware = function (identifier) {
      const result = middleware.remove(identifier);
      rewrapCallbackIfNeeded();
      return result;
    };
    api.clearMiddleware = function () {
      const result = middleware.clear();
      rewrapCallbackIfNeeded();
      return result;
    };
    api.listMiddleware = function () {
      return middleware.list();
    };
    api.setMiddlewareEnabled = function (name, enabled) {
      const result = middleware.setEnabled(name, enabled);
      rewrapCallbackIfNeeded();
      return result;
    };
    Object.defineProperty(api, "middlewareCount", {
      get: function () { return middleware.count; }
    });

    return msgEmitter;
  };
};
