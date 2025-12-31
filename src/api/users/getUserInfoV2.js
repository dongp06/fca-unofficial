"use strict";

const { parseAndCheckLogin } = require("../../utils/client.js");
const logger = require("../../../func/logger");
const DEFAULT_DOC_ID = "24418640587785718";
const DEFAULT_FRIENDLY_NAME = "CometHovercardQueryRendererQuery";
const DEFAULT_CALLER_CLASS = "RelayModern";

function toJSONMaybe(s) {
  if (!s) return null;
  if (typeof s === "string") {
    const t = s.trim().replace(/^for\s*\(\s*;\s*;\s*\)\s*;/, "");
    try { return JSON.parse(t); } catch { return null; }
  }
  return s;
}

function usernameFromUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (/^www\.facebook\.com$/i.test(u.hostname)) {
      const seg = u.pathname.replace(/^\//, "").replace(/\/$/, "");
      if (seg && !/^profile\.php$/i.test(seg) && !seg.includes("/")) return seg;
    }
  } catch { }
  return null;
}

function pickMeta(u) {
  let friendshipStatus = null;
  let gender = null;
  let shortName = u?.short_name || null;
  const pa = Array.isArray(u?.primaryActions) ? u.primaryActions : [];
  const sa = Array.isArray(u?.secondaryActions) ? u.secondaryActions : [];
  const aFriend = pa.find(x => x?.profile_action_type === "FRIEND");
  if (aFriend?.client_handler?.profile_action?.restrictable_profile_owner) {
    const p = aFriend.client_handler.profile_action.restrictable_profile_owner;
    friendshipStatus = p?.friendship_status || null;
    gender = p?.gender || gender;
    shortName = p?.short_name || shortName;
  }
  if (!gender || !shortName) {
    const aBlock = sa.find(x => x?.profile_action_type === "BLOCK");
    const p2 = aBlock?.client_handler?.profile_action?.profile_owner;
    if (p2) {
      gender = p2.gender || gender;
      shortName = p2.short_name || shortName;
    }
  }
  return { friendshipStatus, gender, shortName };
}

function normalizeUser(u) {
  if (!u) return null;
  const vanity = usernameFromUrl(u.profile_url || u.url);
  const meta = pickMeta(u);
  return {
    id: u.id || null,
    name: u.name || null,
    username: vanity || u.username_for_profile || null,
    profileUrl: u.profile_url || u.url || null,
    url: u.url || null,
    isVerified: !!u.is_verified,
    isMemorialized: !!u.is_visibly_memorialized,
    avatar: u.profile_picture?.uri || null,
    shortName: meta.shortName || null,
    gender: meta.gender || null,
    friendshipStatus: meta.friendshipStatus || null
  };
}

function toRetObjEntry(nu) {
  return {
    name: nu?.name || null,
    firstName: nu?.shortName || null,
    vanity: nu?.username || null,
    thumbSrc: nu?.avatar || null,
    profileUrl: nu?.profileUrl || null,
    gender: nu?.gender || null,
    type: "User",
    isFriend: nu?.friendshipStatus === "ARE_FRIENDS",
    isMessengerUser: null,
    isMessageBlockedByViewer: false,
    workInfo: null,
    messengerStatus: null
  };
}

module.exports = function (defaultFuncs, api, ctx) {
  async function fetchOne(uid) {
    const av = String(ctx?.userID || "");
    const variablesObj = {
      actionBarRenderLocation: "WWW_COMET_HOVERCARD",
      context: "DEFAULT",
      entityID: String(uid),
      scale: 1,
      __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false
    };
    const form = {
      av,
      fb_api_caller_class: DEFAULT_CALLER_CLASS,
      fb_api_req_friendly_name: DEFAULT_FRIENDLY_NAME,
      server_timestamps: true,
      doc_id: DEFAULT_DOC_ID,
      variables: JSON.stringify(variablesObj)
    };
    const raw = await defaultFuncs.post("https://www.facebook.com/api/graphql/", null, form).then(parseAndCheckLogin(ctx, defaultFuncs));
    const parsed = toJSONMaybe(raw) ?? raw;
    const root = Array.isArray(parsed) ? parsed[0] : parsed;
    const user = root?.data?.node?.comet_hovercard_renderer?.user || null;
    return normalizeUser(user);
  }

  return function getUserInfoV2(idOrList, callback) {
    let resolveFunc, rejectFunc;
    const returnPromise = new Promise((resolve, reject) => { resolveFunc = resolve; rejectFunc = reject; });
    if (typeof callback !== "function") {
      callback = (err, data) => { if (err) return rejectFunc(err); resolveFunc(data); };
    }
    const ids = Array.isArray(idOrList) ? idOrList.map(v => String(v)) : [String(idOrList)];
    Promise.allSettled(ids.map(fetchOne))
      .then(results => {
        const retObj = {};
        for (let i = 0; i < ids.length; i++) {
          const nu = results[i].status === "fulfilled" ? results[i].value : null;
          retObj[ids[i]] = toRetObjEntry(nu);
        }
        return callback(null, retObj);
      })
      .catch(err => { logger("getUserInfoV2" + err, "error"); callback(err); });
    return returnPromise;
  };
};
