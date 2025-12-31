"use strict";
const logger = require('../../func/logger');

function saveCookies(jar) {
  return res => {
    try {
      const setCookie = res?.headers?.["set-cookie"];
      if (Array.isArray(setCookie) && setCookie.length) {
        const url = res?.request?.res?.responseUrl || (res?.config?.baseURL ? new URL(res.config.url || "/", res.config.baseURL).toString() : res?.config?.url || "https://www.facebook.com");
        for (const c of setCookie) {
          try {
            jar.setCookieSync(c, url);
          } catch { }
        }
      }
    } catch { }
    return res;
  };
}

function getAppState(jar) {
  if (!jar || typeof jar.getCookiesSync !== "function") return [];
  const urls = ["https://www.facebook.com", "https://www.messenger.com"];
  const all = urls.flatMap(u => {
    try { return jar.getCookiesSync(u) || []; } catch { return []; }
  });
  const seen = new Set();
  const out = [];
  for (const c of all) {
    const key = c.key || c.name;
    if (!key) continue;
    const id = key + "|" + (c.domain || "") + "|" + (c.path || "/");
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      key,
      value: c.value,
      domain: c.domain || ".facebook.com",
      path: c.path || "/",
      hostOnly: !!c.hostOnly,
      creation: c.creation || new Date(),
      lastAccessed: c.lastAccessed || new Date(),
      secure: !!c.secure,
      httpOnly: !!c.httpOnly,
      expires: c.expires && c.expires !== "Infinity" ? c.expires : "Infinity"
    });
  }
  return out;
}

function makeParsable(html) {
  const raw = cleanXssi(String(html || ""));
  const split = raw.split(/\}\r?\n\s*\{/);
  if (split.length === 1) return raw;
  return "[" + split.join("},{") + "]";
}

function cleanXssi(t) {
  if (t == null) return "";
  let s = String(t);
  s = s.replace(/^[\uFEFF\xEF\xBB\xBF]+/, "");
  s = s.replace(/^\)\]\}',?\s*/, "");
  s = s.replace(/^\s*for\s*\(;;\);\s*/i, "");
  return s;
}

function parseAndCheckLogin(ctx, http, retryCount = 0) {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const headerOf = (headers, name) => {
    if (!headers) return;
    const k = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
    return k ? headers[k] : undefined;
  };
  const buildUrl = cfg => {
    try {
      return cfg?.baseURL ? new URL(cfg.url || "/", cfg.baseURL).toString() : cfg?.url || "";
    } catch {
      return cfg?.url || "";
    }
  };

  const formatCookie = (arr, service) => {
    const n = String(arr?.[0] || "");
    const v = String(arr?.[1] || "");
    return `${n}=${v}; Domain=.${service}.com; Path=/; Secure`;
  };

  const maybeAutoLogin = async (resData, resConfig) => {
    // Prevent infinite loop if auto login is already in progress
    if (ctx.auto_login) {
      const e = new Error("Not logged in. Auto login already in progress.");
      e.error = "Not logged in.";
      e.res = resData;
      throw e;
    }
    // Check if performAutoLogin function exists
    if (typeof ctx.performAutoLogin !== "function") {
      const e = new Error("Not logged in. Auto login function not available.");
      e.error = "Not logged in.";
      e.res = resData;
      throw e;
    }
    // Set flag to prevent concurrent auto login attempts
    ctx.auto_login = true;
    logger("Login session expired, attempting auto login...", "warn");

    try {
      const ok = await ctx.performAutoLogin();
      if (ok) {
        logger("Auto login successful! Retrying request...", "info");
        ctx.auto_login = false;

        // After successful auto login, retry the original request
        if (resConfig) {
          const url = buildUrl(resConfig);
          const method = String(resConfig?.method || "GET").toUpperCase();
          const ctype = String(headerOf(resConfig?.headers, "content-type") || "").toLowerCase();
          const isMultipart = ctype.includes("multipart/form-data");
          const payload = resConfig?.data;
          const params = resConfig?.params;

          try {
            let newData;
            if (method === "GET") {
              newData = await http.get(url, ctx.jar, params || null, ctx.globalOptions, ctx);
            } else if (isMultipart) {
              newData = await http.postFormData(url, ctx.jar, payload, params, ctx.globalOptions, ctx);
            } else {
              newData = await http.post(url, ctx.jar, payload, ctx.globalOptions, ctx);
            }
            // Retry parsing with the new response
            return await parseAndCheckLogin(ctx, http, retryCount)(newData);
          } catch (retryErr) {
            // Handle ERR_INVALID_CHAR - don't retry, return error immediately
            if (retryErr?.code === "ERR_INVALID_CHAR" || (retryErr?.message && retryErr.message.includes("Invalid character in header"))) {
              logger(`Auto login retry failed: Invalid header detected. Error: ${retryErr.message}`, "error");
              const e = new Error("Not logged in. Auto login retry failed due to invalid header.");
              e.error = "Not logged in.";
              e.res = resData;
              e.originalError = retryErr;
              throw e;
            }
            logger(`Auto login retry failed: ${retryErr && retryErr.message ? retryErr.message : String(retryErr)}`, "error");
            const e = new Error("Not logged in. Auto login retry failed.");
            e.error = "Not logged in.";
            e.res = resData;
            e.originalError = retryErr;
            throw e;
          }
        } else {
          // No config available, can't retry
          const e = new Error("Not logged in. Auto login successful but cannot retry request.");
          e.error = "Not logged in.";
          e.res = resData;
          throw e;
        }
      } else {
        ctx.auto_login = false;
        const e = new Error("Not logged in. Auto login failed.");
        e.error = "Not logged in.";
        e.res = resData;
        throw e;
      }
    } catch (autoLoginErr) {
      ctx.auto_login = false;
      // If error already has the right format, rethrow it
      if (autoLoginErr.error === "Not logged in.") {
        throw autoLoginErr;
      }
      // Otherwise, wrap it
      logger(`Auto login error: ${autoLoginErr && autoLoginErr.message ? autoLoginErr.message : String(autoLoginErr)}`, "error");
      const e = new Error("Not logged in. Auto login error.");
      e.error = "Not logged in.";
      e.res = resData;
      e.originalError = autoLoginErr;
      throw e;
    }
  };
  return async (res) => {
    const status = res?.status ?? 0;
    if (status >= 500 && status < 600) {
      if (retryCount >= 5) {
        const err = new Error("Request retry failed. Check the `res` and `statusCode` property on this error.");
        err.statusCode = status;
        err.res = res?.data;
        err.error = "Request retry failed. Check the `res` and `statusCode` property on this error.";
        logger(`parseAndCheckLogin: Max retries (5) reached for status ${status}`, "error");
        throw err;
      }
      // Exponential backoff with jitter
      // First retry: ~1507ms (1500ms base + small jitter)
      // Subsequent retries: exponential backoff
      const baseDelay = retryCount === 0 ? 1500 : 1000 * Math.pow(2, retryCount);
      const jitter = Math.floor(Math.random() * 200); // 0-199ms jitter
      const retryTime = Math.min(
        baseDelay + jitter,
        10000 // Max 10 seconds
      );
      logger(`parseAndCheckLogin: Retrying request (attempt ${retryCount + 1}/5) after ${retryTime}ms for status ${status}`, "warn");
      await delay(retryTime);
      const url = buildUrl(res?.config);
      const method = String(res?.config?.method || "GET").toUpperCase();
      const ctype = String(headerOf(res?.config?.headers, "content-type") || "").toLowerCase();
      const isMultipart = ctype.includes("multipart/form-data");
      const payload = res?.config?.data;
      const params = res?.config?.params;
      retryCount += 1;
      try {
        if (method === "GET") {
          const newData = await http.get(url, ctx.jar, params || null, ctx.globalOptions, ctx);
          return await parseAndCheckLogin(ctx, http, retryCount)(newData);
        }
        if (isMultipart) {
          const newData = await http.postFormData(url, ctx.jar, payload, params, ctx.globalOptions, ctx);
          return await parseAndCheckLogin(ctx, http, retryCount)(newData);
        } else {
          const newData = await http.post(url, ctx.jar, payload, ctx.globalOptions, ctx);
          return await parseAndCheckLogin(ctx, http, retryCount)(newData);
        }
      } catch (retryErr) {
        // Handle ERR_INVALID_CHAR - don't retry, return error immediately
        if (retryErr?.code === "ERR_INVALID_CHAR" || (retryErr?.message && retryErr.message.includes("Invalid character in header"))) {
          logger(`parseAndCheckLogin: Invalid header detected, aborting retry. Error: ${retryErr.message}`, "error");
          const err = new Error("Invalid header content detected. Request aborted to prevent crash.");
          err.error = "Invalid header content";
          err.statusCode = status;
          err.res = res?.data;
          err.originalError = retryErr;
          throw err;
        }
        // If max retries reached, return error instead of throwing to prevent crash
        if (retryCount >= 5) {
          logger(`parseAndCheckLogin: Max retries reached, returning error instead of crashing`, "error");
          const err = new Error("Request retry failed after 5 attempts. Check the `res` and `statusCode` property on this error.");
          err.statusCode = status;
          err.res = res?.data;
          err.error = "Request retry failed after 5 attempts";
          err.originalError = retryErr;
          throw err;
        }
        // Continue retry loop
        return await parseAndCheckLogin(ctx, http, retryCount)(res);
      }
    }
    if (status === 404) return;
    if (status !== 200) {
      const err = new Error("parseAndCheckLogin got status code: " + status + ". Bailing out of trying to parse response.");
      err.statusCode = status;
      err.res = res?.data;
      throw err;
    }
    const resBodyRaw = res?.data;
    const body = typeof resBodyRaw === "string" ? makeParsable(resBodyRaw) : resBodyRaw;
    let parsed;
    try {
      parsed = typeof body === "object" && body !== null ? body : JSON.parse(body);
    } catch (e) {
      const err = new Error("JSON.parse error. Check the `detail` property on this error.");
      err.error = "JSON.parse error. Check the `detail` property on this error.";
      err.detail = e;
      err.res = resBodyRaw;
      throw err;
    }
    const method = String(res?.config?.method || "GET").toUpperCase();
    if (parsed?.redirect && method === "GET") {
      const redirectRes = await http.get(parsed.redirect, ctx.jar, null, ctx.globalOptions, ctx);
      return await parseAndCheckLogin(ctx, http)(redirectRes);
    }
    if (parsed?.jsmods && parsed.jsmods.require && Array.isArray(parsed.jsmods.require[0]) && parsed.jsmods.require[0][0] === "Cookie") {
      parsed.jsmods.require[0][3][0] = String(parsed.jsmods.require[0][3][0] || "").replace("_js_", "");
      const requireCookie = parsed.jsmods.require[0][3];
      await ctx.jar.setCookie(formatCookie(requireCookie, "facebook"), "https://www.facebook.com");
      await ctx.jar.setCookie(formatCookie(requireCookie, "messenger"), "https://www.messenger.com");
    }
    if (parsed?.jsmods && Array.isArray(parsed.jsmods.require)) {
      for (const item of parsed.jsmods.require) {
        if (item[0] === "DTSG" && item[1] === "setToken") {
          ctx.fb_dtsg = item[3][0];
          ctx.ttstamp = "2";
          for (let j = 0; j < ctx.fb_dtsg.length; j++) ctx.ttstamp += ctx.fb_dtsg.charCodeAt(j);
          break;
        }
      }
    }
    if (parsed?.error === 1357001) {
      const err = new Error("Facebook blocked the login");
      err.error = "Not logged in.";
      throw err;
    }
    const resData = parsed;
    const resStr = JSON.stringify(resData);
    if (resStr.includes("XCheckpointFBScrapingWarningController") || resStr.includes("601051028565049")) {
      return await maybeAutoLogin(resData, res?.config);
    }
    if (resStr.includes("https://www.facebook.com/login.php?") || String(parsed?.redirect || "").includes("login.php?")) {
      return await maybeAutoLogin(resData, res?.config);
    }
    if (resStr.includes("1501092823525282")) {
      logger("Bot checkpoint 282 detected, please check the account!", "error");
      const err = new Error("Checkpoint 282 detected");
      err.error = "checkpoint_282";
      err.res = resData;
      throw err;
    }
    if (resStr.includes("828281030927956")) {
      logger("Bot checkpoint 956 detected, please check the account!", "error");
      const err = new Error("Checkpoint 956 detected");
      err.error = "checkpoint_956";
      err.res = resData;
      throw err;
    }
    return parsed;
  };
}

module.exports = {
  saveCookies,
  getAppState,
  parseAndCheckLogin
};
