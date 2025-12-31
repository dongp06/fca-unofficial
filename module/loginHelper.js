"use strict";
const fs = require("fs");
const path = require("path");
const models = require("../src/database/models");
const logger = require("../func/logger");
const { get, post, jar, makeDefaults } = require("../src/utils/request");
const { saveCookies, getAppState } = require("../src/utils/client");
const { getFrom } = require("../src/utils/constants");
const { loadConfig } = require("./config");
const { config } = loadConfig();
const { v4: uuidv4 } = require("uuid");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");
const axiosBase = require("axios");
const qs = require("querystring");
const crypto = require("crypto");
const { TOTP } = require("totp-generator");

const regions = [
  { code: "PRN", name: "Pacific Northwest Region", location: "Khu vực Tây Bắc Thái Bình Dương" },
  { code: "VLL", name: "Valley Region", location: "Valley" },
  { code: "ASH", name: "Ashburn Region", location: "Ashburn" },
  { code: "DFW", name: "Dallas/Fort Worth Region", location: "Dallas/Fort Worth" },
  { code: "LLA", name: "Los Angeles Region", location: "Los Angeles" },
  { code: "FRA", name: "Frankfurt", location: "Frankfurt" },
  { code: "SIN", name: "Singapore", location: "Singapore" },
  { code: "NRT", name: "Tokyo", location: "Japan" },
  { code: "HKG", name: "Hong Kong", location: "Hong Kong" },
  { code: "SYD", name: "Sydney", location: "Sydney" },
  { code: "PNB", name: "Pacific Northwest - Beta", location: "Pacific Northwest " }
];

const REGION_MAP = new Map(regions.map(r => [r.code, r]));

function parseRegion(html) {
  try {
    const m1 = html.match(/"endpoint":"([^"]+)"/);
    const m2 = m1 ? null : html.match(/endpoint\\":\\"([^\\"]+)\\"/);
    const raw = (m1 && m1[1]) || (m2 && m2[1]);
    if (!raw) return "PRN";
    const endpoint = raw.replace(/\\\//g, "/");
    const url = new URL(endpoint);
    const rp = url.searchParams ? url.searchParams.get("region") : null;
    return rp ? rp.toUpperCase() : "PRN";
  } catch {
    return "PRN";
  }
}

function mask(s, keep = 3) {
  if (!s) return "";
  const n = s.length;
  return n <= keep ? "*".repeat(n) : s.slice(0, keep) + "*".repeat(Math.max(0, n - keep));
}

function md5(s) {
  return crypto.createHash("md5").update(s).digest("hex");
}

function randomString(length = 24) {
  let s = "abcdefghijklmnopqrstuvwxyz";
  let out = s.charAt(Math.floor(Math.random() * s.length));
  for (let i = 1; i < length; i++) out += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(36 * Math.random()));
  return out;
}

function sortObject(o) {
  const keys = Object.keys(o).sort();
  const x = {};
  for (const k of keys) x[k] = o[k];
  return x;
}

function encodeSig(obj) {
  let data = "";
  for (const k of Object.keys(obj)) data += `${k}=${obj[k]}`;
  return md5(data + "62f8ce9f74b12f84c123cc23437a4a32");
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBuildId() {
  const prefixes = ["QP1A", "RP1A", "SP1A", "TP1A", "UP1A", "AP4A"];
  return `${choice(prefixes)}.${rand(180000, 250000)}.${rand(10, 99)}`;
}

function randomResolution() {
  const presets = [{ w: 720, h: 1280, d: 2.0 }, { w: 1080, h: 1920, d: 2.625 }, { w: 1080, h: 2400, d: 3.0 }, { w: 1440, h: 3040, d: 3.5 }, { w: 1440, h: 3200, d: 4.0 }];
  return choice(presets);
}

function randomFbav() {
  return `${rand(390, 499)}.${rand(0, 3)}.${rand(0, 2)}.${rand(10, 60)}.${rand(100, 999)}`;
}

function randomOrcaUA() {
  const androidVersions = ["8.1.0", "9", "10", "11", "12", "13", "14"];
  const devices = [{ brand: "samsung", model: "SM-G996B" }, { brand: "samsung", model: "SM-S908E" }, { brand: "Xiaomi", model: "M2101K9AG" }, { brand: "OPPO", model: "CPH2219" }, { brand: "vivo", model: "V2109" }, { brand: "HUAWEI", model: "VOG-L29" }, { brand: "asus", model: "ASUS_I001DA" }, { brand: "Google", model: "Pixel 6" }, { brand: "realme", model: "RMX2170" }];
  const carriers = ["Viettel Telecom", "Mobifone", "Vinaphone", "T-Mobile", "Verizon", "AT&T", "Telkomsel", "Jio", "NTT DOCOMO", "Vodafone", "Orange"];
  const locales = ["vi_VN", "en_US", "en_GB", "id_ID", "th_TH", "fr_FR", "de_DE", "es_ES", "pt_BR"];
  const archs = ["arm64-v8a", "armeabi-v7a"];
  const a = choice(androidVersions);
  const d = choice(devices);
  const b = randomBuildId();
  const r = randomResolution();
  const fbav = randomFbav();
  const fbbv = rand(320000000, 520000000);
  const arch = `${choice(archs)}:${choice(archs)}`;
  const ua = `Dalvik/2.1.0 (Linux; U; Android ${a}; ${d.model} Build/${b}) [FBAN/Orca-Android;FBAV/${fbav};FBPN/com.facebook.orca;FBLC/${choice(locales)};FBBV/${fbbv};FBCR/${choice(carriers)};FBMF/${d.brand};FBBD/${d.brand};FBDV/${d.model};FBSV/${a};FBCA/${arch};FBDM/{density=${r.d.toFixed(1)},width=${r.w},height=${r.h}};FB_FW/1;]`;
  return ua;
}

const MOBILE_UA = randomOrcaUA();

function buildHeaders(url, extra = {}) {
  const u = new URL(url);
  return { "content-type": "application/x-www-form-urlencoded", "x-fb-http-engine": "Liger", "user-agent": MOBILE_UA, Host: u.host, Origin: "https://www.facebook.com", Referer: "https://www.facebook.com/", Connection: "keep-alive", ...extra };
}

const genTotp = async secret => {
  const cleaned = String(secret || "").replace(/\s+/g, "").toUpperCase();
  const r = await TOTP.generate(cleaned);
  return typeof r === "object" ? r.otp : r;
};

function normalizeCookieHeaderString(s) {
  let str = String(s || "").trim();
  if (!str) return [];
  if (/^cookie\s*:/i.test(str)) str = str.replace(/^cookie\s*:/i, "").trim();
  str = str.replace(/\r?\n/g, " ").replace(/\s*;\s*/g, ";");
  const parts = str.split(";").map(v => v.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const k = p.slice(0, eq).trim();
    const v = p.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!k) continue;
    out.push(`${k}=${v}`);
  }
  return out;
}

function setJarFromPairs(j, pairs, domain) {
  const expires = new Date(Date.now() + 31536e6).toUTCString();
  for (const kv of pairs) {
    const cookieStr = `${kv}; expires=${expires}; domain=${domain}; path=/;`;
    try {
      if (typeof j.setCookieSync === "function") j.setCookieSync(cookieStr, "https://www.facebook.com");
      else j.setCookie(cookieStr, "https://www.facebook.com");
    } catch { }
  }
}

function cookieHeaderFromJar(j) {
  const urls = ["https://www.facebook.com", "https://www.messenger.com"];
  const seen = new Set();
  const parts = [];
  for (const u of urls) {
    let s = "";
    try {
      s = typeof j.getCookieStringSync === "function" ? j.getCookieStringSync(u) : "";
    } catch { }
    if (!s) continue;
    for (const kv of s.split(";")) {
      const t = kv.trim();
      const name = t.split("=")[0];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      parts.push(t);
    }
  }
  return parts.join("; ");
}

let uniqueIndexEnsured = false;

function getBackupModel() {
  if (!models || !models.sequelize || !models.Sequelize) return null;
  const sequelize = models.sequelize;
  const { DataTypes } = models.Sequelize;
  if (sequelize.models && sequelize.models.AppStateBackup) return sequelize.models.AppStateBackup;
  const dialect = typeof sequelize.getDialect === "function" ? sequelize.getDialect() : "sqlite";
  const LongText = (dialect === "mysql" || dialect === "mariadb") ? DataTypes.TEXT("long") : DataTypes.TEXT;
  const AppStateBackup = sequelize.define(
    "AppStateBackup",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userID: { type: DataTypes.STRING, allowNull: false },
      type: { type: DataTypes.STRING, allowNull: false },
      data: { type: LongText }
    },
    { tableName: "app_state_backups", timestamps: true, indexes: [{ unique: true, fields: ["userID", "type"] }] }
  );
  return AppStateBackup;
}

async function ensureUniqueIndex(sequelize) {
  if (uniqueIndexEnsured) return;
  try {
    await sequelize.getQueryInterface().addIndex("app_state_backups", ["userID", "type"], { unique: true, name: "app_state_user_type_unique" });
  } catch { }
  uniqueIndexEnsured = true;
}

async function upsertBackup(Model, userID, type, data) {
  const where = { userID: String(userID || ""), type };
  const row = await Model.findOne({ where });
  if (row) {
    await row.update({ data });
    logger(`Overwrote existing ${type} backup for user ${where.userID}`, "info");
    return;
  }
  await Model.create({ ...where, data });
  logger(`Created new ${type} backup for user ${where.userID}`, "info");
}

async function backupAppStateSQL(j, userID) {
  try {
    const Model = getBackupModel();
    if (!Model) return;
    await Model.sync();
    await ensureUniqueIndex(models.sequelize);
    const appJson = getAppState(j);
    const ck = cookieHeaderFromJar(j);
    await upsertBackup(Model, userID, "appstate", JSON.stringify(appJson));
    await upsertBackup(Model, userID, "cookie", ck);
    try {
      const out = path.join(process.cwd(), "appstate.json");
      fs.writeFileSync(out, JSON.stringify(appJson, null, 2));
    } catch { }
    logger("Backup stored (overwrite mode)", "info");
  } catch (e) {
    logger(`Failed to save appstate backup ${e && e.message ? e.message : String(e)}`, "warn");
  }
}

async function getLatestBackup(userID, type) {
  try {
    const Model = getBackupModel();
    if (!Model) return null;
    const row = await Model.findOne({ where: { userID: String(userID || ""), type } });
    return row ? row.data : null;
  } catch {
    return null;
  }
}

async function getLatestBackupAny(type) {
  try {
    const Model = getBackupModel();
    if (!Model) return null;
    const row = await Model.findOne({ where: { type }, order: [["updatedAt", "DESC"]] });
    return row ? row.data : null;
  } catch {
    return null;
  }
}

const MESSENGER_USER_AGENT = "Dalvik/2.1.0 (Linux; U; Android 9; ASUS_Z01QD Build/PQ3A.190605.003) [FBAN/Orca-Android;FBAV/391.2.0.20.404;FBPN/com.facebook.orca;FBLC/vi_VN;FBBV/437533963;FBCR/Viettel Telecom;FBMF/asus;FBBD/asus;FBDV/ASUS_Z01QD;FBSV/9;FBCA/x86:armeabi-v7a;FBDM/{density=1.5,width=1600,height=900};FB_FW/1;]";

function encodesig(obj) {
  let data = "";
  Object.keys(obj).forEach(k => { data += `${k}=${obj[k]}`; });
  return md5(data + "62f8ce9f74b12f84c123cc23437a4a32");
}

function sort(obj) {
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

async function setJarCookies(j, appstate) {
  const tasks = [];
  for (const c of appstate) {
    const cookieName = c.name || c.key;
    const cookieValue = c.value;
    if (!cookieName || cookieValue === undefined) continue;

    const cookieDomain = c.domain || ".facebook.com";
    const cookiePath = c.path || "/";
    const dom = cookieDomain.replace(/^\./, "");

    // Format expires if provided
    let expiresStr = "";
    if (c.expires) {
      const expiresDate = typeof c.expires === "number" ? new Date(c.expires) : new Date(c.expires);
      expiresStr = `; expires=${expiresDate.toUTCString()}`;
    }

    // Build cookie string
    const str = `${cookieName}=${cookieValue}${expiresStr}; Domain=${cookieDomain}; Path=${cookiePath};`;

    // Set cookie for both http and https, with and without www
    const base1 = `http://${dom}${cookiePath}`;
    const base2 = `https://${dom}${cookiePath}`;
    const base3 = `http://www.${dom}${cookiePath}`;
    const base4 = `https://www.${dom}${cookiePath}`;

    tasks.push(j.setCookie(str, base1).catch(() => { }));
    tasks.push(j.setCookie(str, base2).catch(() => { }));
    tasks.push(j.setCookie(str, base3).catch(() => { }));
    tasks.push(j.setCookie(str, base4).catch(() => { }));
  }
  await Promise.all(tasks);
}

async function loginViaGraph(username, password, twofactorSecretOrCode, i_user, externalJar) {
  const cookieJar = externalJar instanceof CookieJar ? externalJar : new CookieJar();
  const client = wrapper(axiosBase.create({ jar: cookieJar, withCredentials: true, timeout: 30000, validateStatus: () => true }));
  const device_id = uuidv4();
  const family_device_id = device_id;
  const machine_id = randomString(24);
  const base = {
    adid: "00000000-0000-0000-0000-000000000000",
    format: "json",
    device_id,
    email: username,
    password,
    generate_analytics_claim: "1",
    community_id: "",
    cpl: "true",
    try_num: "1",
    family_device_id,
    secure_family_device_id: "",
    credentials_type: "password",
    enroll_misauth: "false",
    generate_session_cookies: "1",
    source: "login",
    generate_machine_id: "1",
    jazoest: "22297",
    meta_inf_fbmeta: "NO_FILE",
    advertiser_id: "00000000-0000-0000-0000-000000000000",
    currently_logged_in_userid: "0",
    locale: "vi_VN",
    client_country_code: "VN",
    fb_api_req_friendly_name: "authenticate",
    fb_api_caller_class: "AuthOperations$PasswordAuthOperation",
    api_key: "256002347743983",
    access_token: "256002347743983|374e60f8b9bb6b8cbb30f78030438895"
  };
  const headers = {
    "User-Agent": MESSENGER_USER_AGENT,
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/x-www-form-urlencoded",
    "x-fb-connection-quality": "EXCELLENT",
    "x-fb-sim-hni": "45204",
    "x-fb-net-hni": "45204",
    "x-fb-connection-type": "WIFI",
    "x-tigon-is-retry": "False",
    "x-fb-friendly-name": "authenticate",
    "x-fb-request-analytics-tags": '{"network_tags":{"retry_attempt":"0"},"application_tags":"unknown"}',
    "x-fb-http-engine": "Liger",
    "x-fb-client-ip": "True",
    "x-fb-server-cluster": "True",
    authorization: `OAuth ${base.access_token}`
  };
  const form1 = { ...base };
  form1.sig = encodesig(sort(form1));
  const res1 = await client.request({ url: "https://b-graph.facebook.com/auth/login", method: "post", data: qs.stringify(form1), headers });
  if (res1.status === 200 && res1.data && res1.data.session_cookies) {
    const appstate = res1.data.session_cookies.map(c => ({ key: c.name, value: c.value, domain: c.domain, path: c.path }));
    const cUserCookie = appstate.find(c => c.key === "c_user");
    if (i_user) appstate.push({ key: "i_user", value: i_user, domain: ".facebook.com", path: "/" });
    else if (cUserCookie) appstate.push({ key: "i_user", value: cUserCookie.value, domain: ".facebook.com", path: "/" });
    await setJarCookies(cookieJar, appstate);
    let eaau = null;
    let eaad6v7 = null;
    try {
      const r1 = await client.request({ url: `https://api.facebook.com/method/auth.getSessionforApp?format=json&access_token=${res1.data.access_token}&new_app_id=350685531728`, method: "get", headers: { "user-agent": MESSENGER_USER_AGENT, "x-fb-connection-type": "WIFI", authorization: `OAuth ${res1.data.access_token}` } });
      eaau = r1.data && r1.data.access_token ? r1.data.access_token : null;
    } catch { }
    try {
      const r2 = await client.request({ url: `https://api.facebook.com/method/auth.getSessionforApp?format=json&access_token=${res1.data.access_token}&new_app_id=275254692598279`, method: "get", headers: { "user-agent": MESSENGER_USER_AGENT, "x-fb-connection-type": "WIFI", authorization: `OAuth ${res1.data.access_token}` } });
      eaad6v7 = r2.data && r2.data.access_token ? r2.data.access_token : null;
    } catch { }
    return { ok: true, cookies: appstate.map(c => ({ key: c.key, value: c.value })), jar: cookieJar, access_token_mess: res1.data.access_token || null, access_token: eaau, access_token_eaad6v7: eaad6v7, uid: res1.data.uid || cUserCookie?.value || null, session_key: res1.data.session_key || null };
  }
  const err = res1 && res1.data && res1.data.error ? res1.data.error : {};
  if (err && err.code === 406) {
    const data = err.error_data || {};
    let code = null;
    if (twofactorSecretOrCode && /^\d{6}$/.test(String(twofactorSecretOrCode))) code = String(twofactorSecretOrCode);
    else if (twofactorSecretOrCode) {
      try {
        const clean = decodeURI(twofactorSecretOrCode).replace(/\s+/g, "").toUpperCase();
        const { otp } = await TOTP.generate(clean);
        code = otp;
      } catch { }
    } else if (config.credentials?.twofactor) {
      const { otp } = await TOTP.generate(String(config.credentials.twofactor).replace(/\s+/g, "").toUpperCase());
      code = otp;
    }
    if (!code) return { ok: false, message: "2FA required" };
    const form2 = {
      ...base,
      credentials_type: "two_factor",
      twofactor_code: code,
      userid: data.uid || username,
      first_factor: data.login_first_factor || "",
      machine_id: data.machine_id || machine_id
    };
    form2.sig = encodesig(sort(form2));
    const res2 = await client.request({ url: "https://b-graph.facebook.com/auth/login", method: "post", data: qs.stringify(form2), headers });
    if (res2.status === 200 && res2.data && res2.data.session_cookies) {
      const appstate = res2.data.session_cookies.map(c => ({ key: c.name, value: c.value, domain: c.domain, path: c.path }));
      const cUserCookie = appstate.find(c => c.key === "c_user");
      if (i_user) appstate.push({ key: "i_user", value: i_user, domain: ".facebook.com", path: "/" });
      else if (cUserCookie) appstate.push({ key: "i_user", value: cUserCookie.value, domain: ".facebook.com", path: "/" });
      await setJarCookies(cookieJar, appstate);
      let eaau = null;
      let eaad6v7 = null;
      try {
        const r1 = await client.request({ url: `https://api.facebook.com/method/auth.getSessionforApp?format=json&access_token=${res2.data.access_token}&new_app_id=350685531728`, method: "get", headers: { "user-agent": MESSENGER_USER_AGENT, "x-fb-connection-type": "WIFI", authorization: `OAuth ${res2.data.access_token}` } });
        eaau = r1.data && r1.data.access_token ? r1.data.access_token : null;
      } catch { }
      try {
        const r2 = await client.request({ url: `https://api.facebook.com/method/auth.getSessionforApp?format=json&access_token=${res2.data.access_token}&new_app_id=275254692598279`, method: "get", headers: { "user-agent": MESSENGER_USER_AGENT, "x-fb-connection-type": "WIFI", authorization: `OAuth ${res2.data.access_token}` } });
        eaad6v7 = r2.data && r2.data.access_token ? r2.data.access_token : null;
      } catch { }
      return { ok: true, cookies: appstate.map(c => ({ key: c.key, value: c.value })), jar: cookieJar, access_token_mess: res2.data.access_token || null, access_token: eaau, access_token_eaad6v7: eaad6v7, uid: res2.data.uid || cUserCookie?.value || null, session_key: res2.data.session_key || null };
    }
    return { ok: false, message: "2FA failed" };
  }
  return { ok: false, message: "Login failed" };
}

async function tokens(username, password, twofactor = null) {
  const t0 = process.hrtime.bigint();
  if (!username || !password) return { status: false, message: "Please provide email and password" };
  logger(`AUTO-LOGIN: Initialize login ${mask(username, 2)}`, "info");
  const res = await loginViaGraph(username, password, twofactor, null, jar);
  if (res && res.ok && Array.isArray(res.cookies)) {
    logger(`AUTO-LOGIN: Login success ${res.cookies.length} cookies`, "info");
    const t1 = Number(process.hrtime.bigint() - t0) / 1e6;
    logger(`Done success login ${Math.round(t1)}ms`, "info");
    return { status: true, cookies: res.cookies };
  }
  if (res && res.message === "2FA required") {
    logger("AUTO-LOGIN: 2FA required but secret missing", "warn");
    return { status: false, message: "Please provide the 2FA secret!" };
  }
  return { status: false, message: res && res.message ? res.message : "Login failed" };
}

async function hydrateJarFromDB(userID) {
  try {
    let ck = null;
    let app = null;
    if (userID) {
      ck = await getLatestBackup(userID, "cookie");
      app = await getLatestBackup(userID, "appstate");
    } else {
      ck = await getLatestBackupAny("cookie");
      app = await getLatestBackupAny("appstate");
    }
    if (ck) {
      const pairs = normalizeCookieHeaderString(ck);
      if (pairs.length) {
        setJarFromPairs(jar, pairs, ".facebook.com");
        return true;
      }
    }
    if (app) {
      let parsed = null;
      try {
        parsed = JSON.parse(app);
      } catch { }
      if (Array.isArray(parsed)) {
        const pairs = parsed.map(c => [c.name || c.key, c.value].join("="));
        setJarFromPairs(jar, pairs, ".facebook.com");
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function tryAutoLoginIfNeeded(currentHtml, currentCookies, globalOptions, ctxRef, hadAppStateInput = false) {
  const getUID = cs =>
    cs.find(c => c.key === "i_user")?.value ||
    cs.find(c => c.key === "c_user")?.value ||
    cs.find(c => c.name === "i_user")?.value ||
    cs.find(c => c.name === "c_user")?.value;
  const htmlUID = body => {
    const s = typeof body === "string" ? body : String(body ?? "");
    return s.match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] || s.match(/\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/)?.[1];
  };
  let userID = getUID(currentCookies);
  // Also try to extract userID from HTML if not found in cookies
  if (!userID) {
    userID = htmlUID(currentHtml);
  }
  if (userID) return { html: currentHtml, cookies: currentCookies, userID };
  // If appState/Cookie was provided and is not dead (not checkpointed), skip backup
  if (hadAppStateInput) {
    const isCheckpoint = currentHtml.includes("/checkpoint/block/?next");
    if (!isCheckpoint) {
      // AppState provided and not checkpointed, but userID not found
      // This might be a temporary issue - try to refresh cookies from jar
      try {
        const refreshedCookies = await Promise.resolve(jar.getCookies("https://www.facebook.com"));
        userID = getUID(refreshedCookies);
        if (userID) {
          return { html: currentHtml, cookies: refreshedCookies, userID };
        }
      } catch { }
      // If still no userID, skip backup and throw error
      throw new Error("Missing user cookie from provided appState");
    }
    // AppState is dead (checkpointed), proceed to backup/email login
  }
  const hydrated = await hydrateJarFromDB(null);
  if (hydrated) {
    logger("AppState backup live — proceeding to login", "info");
    const initial = await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
    const resB = (await ctxRef.bypassAutomation(initial, jar)) || initial;
    const htmlB = resB && resB.data ? resB.data : "";
    if (htmlB.includes("/checkpoint/block/?next")) throw new Error("Checkpoint");
    const cookiesB = await Promise.resolve(jar.getCookies("https://www.facebook.com"));
    const uidB = getUID(cookiesB);
    if (uidB) return { html: htmlB, cookies: cookiesB, userID: uidB };
  }
  if (config.autoLogin !== true) throw new Error("AppState backup die — Auto-login is disabled");
  logger("AppState backup die — proceeding to email/password login", "warn");
  const u = config.credentials?.email;
  const p = config.credentials?.password;
  const tf = config.credentials?.twofactor || null;
  if (!u || !p) throw new Error("Missing user cookie");
  const r = await tokens(u, p, tf);
  if (!(r && r.status && Array.isArray(r.cookies))) throw new Error(r && r.message ? r.message : "Login failed");
  const pairs = r.cookies.map(c => `${c.key || c.name}=${c.value}`);
  setJarFromPairs(jar, pairs, ".facebook.com");
  const initial2 = await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
  const res2 = (await ctxRef.bypassAutomation(initial2, jar)) || initial2;
  const html2 = res2 && res2.data ? res2.data : "";
  if (html2.includes("/checkpoint/block/?next")) throw new Error("Checkpoint");
  const cookies2 = await Promise.resolve(jar.getCookies("https://www.facebook.com"));
  const uid2 = getUID(cookies2);
  if (!uid2) throw new Error("Login failed");
  return { html: html2, cookies: cookies2, userID: uid2 };
}

function makeLogin(j, email, password, globalOptions) {
  return async function () {
    const u = email || config.credentials?.email;
    const p = password || config.credentials?.password;
    const tf = config.credentials?.twofactor || null;
    if (!u || !p) return;
    const r = await tokens(u, p, tf);
    if (r && r.status && Array.isArray(r.cookies)) {
      const pairs = r.cookies.map(c => `${c.key || c.name}=${c.value}`);
      setJarFromPairs(j, pairs, ".facebook.com");
      await get("https://www.facebook.com/", j, null, globalOptions).then(saveCookies(j));
    } else {
      throw new Error(r && r.message ? r.message : "Login failed");
    }
  };
}

function loginHelper(appState, Cookie, email, password, globalOptions, callback) {
  try {
    const domain = ".facebook.com";
    // Helper to extract userID from appState input
    const extractUIDFromAppState = (appStateInput) => {
      if (!appStateInput) return null;
      let parsed = appStateInput;
      if (typeof appStateInput === "string") {
        try {
          parsed = JSON.parse(appStateInput);
        } catch {
          return null;
        }
      }
      if (Array.isArray(parsed)) {
        const cUser = parsed.find(c => (c.key === "c_user" || c.name === "c_user"));
        if (cUser) return cUser.value;
        const iUser = parsed.find(c => (c.key === "i_user" || c.name === "i_user"));
        if (iUser) return iUser.value;
      }
      return null;
    };
    let userIDFromAppState = extractUIDFromAppState(appState);
    (async () => {
      try {
        if (appState) {
          // Check and convert cookie to appState format
          if (Array.isArray(appState) && appState.some(c => c.name)) {
            // Convert name to key if needed
            appState = appState.map(c => {
              if (c.name && !c.key) {
                c.key = c.name;
                delete c.name;
              }
              return c;
            });
          } else if (typeof appState === "string") {
            // Try to parse as JSON first
            let parsed = appState;
            try {
              parsed = JSON.parse(appState);
            } catch { }

            if (Array.isArray(parsed)) {
              // Already parsed as array, use it
              appState = parsed;
            } else {
              // Parse string cookie format (key=value; key2=value2)
              const arrayAppState = [];
              appState.split(';').forEach(c => {
                const [key, value] = c.split('=');
                if (key && value) {
                  arrayAppState.push({
                    key: key.trim(),
                    value: value.trim(),
                    domain: ".facebook.com",
                    path: "/",
                    expires: new Date().getTime() + 1000 * 60 * 60 * 24 * 365
                  });
                }
              });
              appState = arrayAppState;
            }
          }

          // Set cookies into jar with individual domain/path
          if (Array.isArray(appState)) {
            await setJarCookies(jar, appState);
          } else {
            throw new Error("Invalid appState format");
          }
        }
        if (Cookie) {
          let cookiePairs = [];
          if (typeof Cookie === "string") cookiePairs = normalizeCookieHeaderString(Cookie);
          else if (Array.isArray(Cookie)) cookiePairs = Cookie.map(String).filter(Boolean);
          else if (Cookie && typeof Cookie === "object") cookiePairs = Object.entries(Cookie).map(([k, v]) => `${k}=${v}`);
          if (cookiePairs.length) setJarFromPairs(jar, cookiePairs, domain);
        }
      } catch (e) {
        return callback(e);
      }
      const ctx = { globalOptions, options: globalOptions, reconnectAttempts: 0 };
      ctx.bypassAutomation = async function (resp, j) {
        global.fca = global.fca || {};
        global.fca.BypassAutomationNotification = this.bypassAutomation.bind(this);
        const s = x => (typeof x === "string" ? x : String(x ?? ""));
        const u = r => r?.request?.res?.responseUrl || (r?.config?.baseURL ? new URL(r.config.url || "/", r.config.baseURL).toString() : r?.config?.url || "");
        const isCp = r => typeof u(r) === "string" && u(r).includes("checkpoint/601051028565049");
        const cookieUID = async () => {
          try {
            const cookies = typeof j?.getCookies === "function" ? await j.getCookies("https://www.facebook.com") : [];
            return cookies.find(c => c.key === "i_user")?.value || cookies.find(c => c.key === "c_user")?.value;
          } catch { return undefined; }
        };
        const htmlUID = body => s(body).match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] || s(body).match(/\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/)?.[1];
        const getUID = async body => (await cookieUID()) || htmlUID(body);
        const refreshJar = async () => get("https://www.facebook.com/", j, null, this.options).then(saveCookies(j));
        const bypass = async body => {
          const b = s(body);
          const UID = await getUID(b);
          const fb_dtsg = getFrom(b, '"DTSGInitData",[],{"token":"', '",') || b.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1];
          const jazoest = getFrom(b, 'name="jazoest" value="', '"') || getFrom(b, "jazoest=", '",') || b.match(/name="jazoest"\s+value="([^"]+)"/)?.[1];
          const lsd = getFrom(b, '["LSD",[],{"token":"', '"}') || b.match(/name="lsd"\s+value="([^"]+)"/)?.[1];
          const form = { av: UID, fb_dtsg, jazoest, lsd, fb_api_caller_class: "RelayModern", fb_api_req_friendly_name: "FBScrapingWarningMutation", variables: "{}", server_timestamps: true, doc_id: 6339492849481770 };
          await post("https://www.facebook.com/api/graphql/", j, form, null, this.options).then(saveCookies(j));
          logger("Facebook automation warning detected, handling...", "warn");
          this.reconnectAttempts = 0;
        };
        try {
          if (resp) {
            if (isCp(resp)) {
              await bypass(s(resp.data));
              const refreshed = await refreshJar();
              if (isCp(refreshed)) logger("Checkpoint still present after refresh", "warn");
              else logger("Bypass complete, cookies refreshed", "info");
              return refreshed;
            }
            return resp;
          }
          const first = await get("https://www.facebook.com/", j, null, this.options).then(saveCookies(j));
          if (isCp(first)) {
            await bypass(s(first.data));
            const refreshed = await refreshJar();
            if (!isCp(refreshed)) logger("Bypass complete, cookies refreshed", "info");
            else logger("Checkpoint still present after refresh", "warn");
            return refreshed;
          }
          return first;
        } catch (e) {
          logger(`Bypass automation error: ${e && e.message ? e.message : String(e)}`, "error");
          return resp;
        }
      };
      if (appState || Cookie) {
        const initial = await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
        return (await ctx.bypassAutomation(initial, jar)) || initial;
      }
      const hydrated = await hydrateJarFromDB(null);
      if (hydrated) {
        logger("AppState backup live — proceeding to login", "info");
        const initial = await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
        return (await ctx.bypassAutomation(initial, jar)) || initial;
      }
      logger("AppState backup die — proceeding to email/password login", "warn");
      return get("https://www.facebook.com/", null, null, globalOptions)
        .then(saveCookies(jar))
        .then(makeLogin(jar, email, password, globalOptions))
        .then(function () {
          return get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
        });
    })()
      .then(async function (res) {
        const ctx = {};
        ctx.options = globalOptions;
        ctx.bypassAutomation = async function (resp, j) {
          global.fca = global.fca || {};
          global.fca.BypassAutomationNotification = this.bypassAutomation.bind(this);
          const s = x => (typeof x === "string" ? x : String(x ?? ""));
          const u = r => r?.request?.res?.responseUrl || (r?.config?.baseURL ? new URL(r.config.url || "/", r.config.baseURL).toString() : r?.config?.url || "");
          const isCp = r => typeof u(r) === "string" && u(r).includes("checkpoint/601051028565049");
          const cookieUID = async () => {
            try {
              const cookies = typeof j?.getCookies === "function" ? await j.getCookies("https://www.facebook.com") : [];
              return cookies.find(c => c.key === "i_user")?.value || cookies.find(c => c.key === "c_user")?.value;
            } catch { return undefined; }
          };
          const htmlUID = body => s(body).match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] || s(body).match(/\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/)?.[1];
          const getUID = async body => (await cookieUID()) || htmlUID(body);
          const refreshJar = async () => get("https://www.facebook.com/", j, null, this.options).then(saveCookies(j));
          const bypass = async body => {
            const b = s(body);
            const UID = await getUID(b);
            const fb_dtsg = getFrom(b, '"DTSGInitData",[],{"token":"', '",') || b.match(/name="fb_dtsg"\s+value="([^"]+)"/)?.[1];
            const jazoest = getFrom(b, 'name="jazoest" value="', '"') || getFrom(b, "jazoest=", '",') || b.match(/name="jazoest"\s+value="([^"]+)"/)?.[1];
            const lsd = getFrom(b, '["LSD",[],{"token":"', '"}') || b.match(/name="lsd"\s+value="([^"]+)"/)?.[1];
            const form = { av: UID, fb_dtsg, jazoest, lsd, fb_api_caller_class: "RelayModern", fb_api_req_friendly_name: "FBScrapingWarningMutation", variables: "{}", server_timestamps: true, doc_id: 6339492849481770 };
            await post("https://www.facebook.com/api/graphql/", j, form, null, this.options).then(saveCookies(j));
            logger("Facebook automation warning detected, handling...", "warn");
          };
          try {
            if (res && isCp(res)) {
              await bypass(s(res.data));
              const refreshed = await refreshJar();
              if (!isCp(refreshed)) logger("Bypass complete, cookies refreshed", "info");
              return refreshed;
            }
            logger("No checkpoint detected", "info");
            return res;
          } catch {
            return res;
          }
        };
        const processed = (await ctx.bypassAutomation(res, jar)) || res;
        let html = processed && processed.data ? processed.data : "";
        let cookies = await Promise.resolve(jar.getCookies("https://www.facebook.com"));
        const getUIDFromCookies = cs =>
          cs.find(c => c.key === "i_user")?.value ||
          cs.find(c => c.key === "c_user")?.value ||
          cs.find(c => c.name === "i_user")?.value ||
          cs.find(c => c.name === "c_user")?.value;
        const getUIDFromHTML = body => {
          const s = typeof body === "string" ? body : String(body ?? "");
          return s.match(/"USER_ID"\s*:\s*"(\d+)"/)?.[1] || s.match(/\["CurrentUserInitialData",\[\],\{.*?"USER_ID":"(\d+)".*?\},\d+\]/)?.[1];
        };
        let userID = getUIDFromCookies(cookies);
        // Also try to extract userID from HTML if not found in cookies
        if (!userID) {
          userID = getUIDFromHTML(html);
        }
        // If still not found and appState was provided, use userID from appState input as fallback
        if (!userID && userIDFromAppState) {
          userID = userIDFromAppState;
        }
        if (!userID) {
          // Pass hadAppStateInput=true if appState/Cookie was originally provided
          const retried = await tryAutoLoginIfNeeded(html, cookies, globalOptions, ctx, !!(appState || Cookie));
          html = retried.html;
          cookies = retried.cookies;
          userID = retried.userID;
        }
        if (html.includes("/checkpoint/block/?next")) {
          logger("Appstate die, vui lòng thay cái mới!", "error");
          throw new Error("Checkpoint");
        }
        let mqttEndpoint;
        let region = "PRN";
        let fb_dtsg;
        let irisSeqID;
        try {
          const m1 = html.match(/"endpoint":"([^"]+)"/);
          const m2 = m1 ? null : html.match(/endpoint\\":\\"([^\\"]+)\\"/);
          const raw = (m1 && m1[1]) || (m2 && m2[1]);
          if (raw) mqttEndpoint = raw.replace(/\\\//g, "/");
          region = parseRegion(html);
          const rinfo = REGION_MAP.get(region);
          if (rinfo) logger(`Server region ${region} - ${rinfo.name}`, "info");
          else logger(`Server region ${region}`, "info");
        } catch {
          logger("Not MQTT endpoint", "warn");
        }
        try {
          const userDataMatch = String(html).match(/\["CurrentUserInitialData",\[\],({.*?}),\d+\]/);
          if (userDataMatch) {
            const info = JSON.parse(userDataMatch[1]);
            logger(`Đăng nhập tài khoản: ${info.NAME} (${info.USER_ID})`, "info");
          } else if (userID) {
            logger(`ID người dùng: ${userID}`, "info");
          }
        } catch { }
        const tokenMatch = html.match(/DTSGInitialData.*?token":"(.*?)"/);
        if (tokenMatch) fb_dtsg = tokenMatch[1];
        try {
          if (userID) await backupAppStateSQL(jar, userID);
        } catch { }
        Promise.resolve()
          .then(function () {
            if (models && models.sequelize && typeof models.sequelize.authenticate === "function") {
              return models.sequelize.authenticate();
            }
          })
          .then(function () {
            if (models && typeof models.syncAll === "function") {
              return models.syncAll();
            }
          })
          .catch(function (error) {
            console.error(error);
            console.error("Database connection failed:", error && error.message ? error.message : String(error));
          });
        logger("FCA fix/update by DongDev (Donix-VN)", "info");
        const ctxMain = {
          userID,
          jar,
          globalOptions,
          loggedIn: true,
          access_token: "NONE",
          clientMutationId: 0,
          mqttClient: undefined,
          lastSeqId: irisSeqID,
          syncToken: undefined,
          mqttEndpoint,
          region,
          firstListen: true,
          fb_dtsg,
          clientID: ((Math.random() * 2147483648) | 0).toString(16),
          clientId: getFrom(html, '["MqttWebDeviceID",[],{"clientID":"', '"}') || "",
          wsReqNumber: 0,
          wsTaskNumber: 0,
          tasks: new Map()
        };
        ctxMain.options = globalOptions;
        ctxMain.bypassAutomation = ctx.bypassAutomation.bind(ctxMain);
        ctxMain.performAutoLogin = async () => {
          try {
            const u = config.credentials?.email || email;
            const p = config.credentials?.password || password;
            const tf = config.credentials?.twofactor || null;
            if (!u || !p) return false;
            const r = await tokens(u, p, tf);
            if (!(r && r.status && Array.isArray(r.cookies))) return false;
            const pairs = r.cookies.map(c => `${c.key || c.name}=${c.value}`);
            setJarFromPairs(jar, pairs, ".facebook.com");
            await get("https://www.facebook.com/", jar, null, globalOptions).then(saveCookies(jar));
            return true;
          } catch {
            return false;
          }
        };
        const api = {
          setOptions: require("./options").setOptions.bind(null, globalOptions),
          getCookies: function () {
            return cookieHeaderFromJar(jar);
          },
          getAppState: function () {
            return getAppState(jar);
          },
          getLatestAppStateFromDB: async function (uid = userID) {
            const data = await getLatestBackup(uid, "appstate");
            return data ? JSON.parse(data) : null;
          },
          getLatestCookieFromDB: async function (uid = userID) {
            return await getLatestBackup(uid, "cookie");
          }
        };
        const defaultFuncs = makeDefaults(html, userID, ctxMain);
        const srcRoot = path.join(__dirname, "../src/api");
        let loaded = 0;
        let skipped = 0;
        fs.readdirSync(srcRoot, { withFileTypes: true }).forEach((sub) => {
          if (!sub.isDirectory()) return;
          const subDir = path.join(srcRoot, sub.name);
          fs.readdirSync(subDir, { withFileTypes: true }).forEach((entry) => {
            if (!entry.isFile() || !entry.name.endsWith(".js")) return;
            const p = path.join(subDir, entry.name);
            const key = path.basename(entry.name, ".js");
            if (api[key]) {
              skipped++;
              return;
            }
            api[key] = require(p)(defaultFuncs, api, ctxMain);
            loaded++;
          });
        });
        logger(`Loaded ${loaded} FCA API methods${skipped ? `, skipped ${skipped} duplicates` : ""}`);
        if (api.listenMqtt) api.listen = api.listenMqtt;
        if (api.refreshFb_dtsg) {
          setInterval(function () {
            api.refreshFb_dtsg().then(function () {
              logger("Successfully refreshed fb_dtsg");
            }).catch(function () {
              logger("An error occurred while refreshing fb_dtsg", "error");
            });
          }, 86400000);
        }
        logger("Login successful!");
        callback(null, api);
      })
      .catch(function (e) {
        callback(e);
      });
  } catch (e) {
    callback(e);
  }
}

module.exports = loginHelper;
