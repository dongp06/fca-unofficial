"use strict";

const log = require("npmlog");
const { getFrom } = require("../../utils/constants");
const { get } = require("../../utils/request")
const { getType } = require("../../utils/format");
module.exports = function (defaultFuncs, api, ctx) {
  return function refreshFb_dtsg(obj, callback) {
    if (typeof obj === "function") {
      callback = obj;
      obj = {};
    }
    if (!obj) obj = {};
    if (getType(obj) !== "Object") {
      throw new CustomError("The first parameter must be an object or a callback function");
    }
    let resolveFunc, rejectFunc;
    const returnPromise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    if (!callback) {
      callback = (err, data) => err ? rejectFunc(err) : resolveFunc(data);
    }
    if (Object.keys(obj).length === 0) {
      get("https://www.facebook.com/", ctx.jar, null, ctx.globalOptions, { noRef: true }).then(({ data }) => {
        const fb_dtsg = getFrom(data, '["DTSGInitData",[],{"token":"', '","');
        const jazoest = getFrom(data, "jazoest=", '",');
        if (!fb_dtsg) throw new Error("Could not find fb_dtsg in HTML after requesting Facebook.");
        Object.assign(ctx, { fb_dtsg, jazoest });
        callback(null, {
          data: { fb_dtsg, jazoest },
          message: "Refreshed fb_dtsg and jazoest",
        });
      }).catch(err => {
        console.error("refreshFb_dtsg", err);
        callback(err);
      });
    } else {
      Object.assign(ctx, obj);
      callback(null, {
        data: obj,
        message: `Refreshed ${Object.keys(obj).join(", ")}`,
      });
    }
    return returnPromise;
  };
};
