"use strict";
const { getType } = require("../../../utils/format");
const { parseAndCheckLogin } = require("../../../utils/client");
module.exports = function createGetSeqID(deps) {
  const { listenMqtt, logger, emitAuth } = deps;

  return function getSeqID(defaultFuncs, api, ctx, globalCallback, form) {
    ctx.t_mqttCalled = false;
    return defaultFuncs
      .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then(resData => {
        if (getType(resData) !== "Array") throw { error: "Not logged in" };
        if (!Array.isArray(resData) || !resData.length) return;
        const lastRes = resData[resData.length - 1];
        if (lastRes && lastRes.successful_results === 0) return;

        const syncSeqId = resData[0]?.o0?.data?.viewer?.message_threads?.sync_sequence_id;
        if (syncSeqId) {
          ctx.lastSeqId = syncSeqId;
          logger("mqtt getSeqID ok -> listenMqtt()", "info");
          listenMqtt(defaultFuncs, api, ctx, globalCallback);
        } else {
          throw { error: "getSeqId: no sync_sequence_id found." };
        }
      })
      .catch(err => {
        const detail = (err && err.detail && err.detail.message) ? ` | detail=${err.detail.message}` : "";
        const msg = ((err && err.error) || (err && err.message) || String(err || "")) + detail;
        if (/Not logged in/i.test(msg)) {
          return emitAuth(ctx, api, globalCallback, "not_logged_in", msg);
        }
        if (/blocked the login/i.test(msg)) {
          return emitAuth(ctx, api, globalCallback, "login_blocked", msg);
        }
        logger(`getSeqID error: ${msg}`, "error");
        return emitAuth(ctx, api, globalCallback, "auth_error", msg);
      });
  };
};
