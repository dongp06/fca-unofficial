"use strict";

const log = require("npmlog");
const { parseAndCheckLogin } = require("../../utils/client");
const { getType } = require("../../utils/format");
module.exports = function (defaultFuncs, api, ctx) {
  return function getThemePictures(id, callback) {
    let resolveFunc = function () { };
    let rejectFunc = function () { };
    const returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      if (
        getType(callback) == "Function" ||
        getType(callback) == "AsyncFunction"
      ) {
        callback = callback;
      } else {
        callback = function (err, data) {
          if (err) {
            return rejectFunc(err);
          }
          resolveFunc(data);
        };
      }
    }

    if (getType(id) != "String") {
      id = "";
    }

    const form = {
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "MWPThreadThemeProviderQuery",
      doc_id: "9734829906576883",
      server_timestamps: true,
      variables: JSON.stringify({
        id
      }),
      av: ctx.userID
    };
    defaultFuncs
      .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then(function (resData) {
        if (resData.errors) {
          throw resData;
        }

        return callback(null, resData);
      })
      .catch(function (err) {
        log.error("getThemePictures", err);
        return callback(err);
      });

    return returnPromise;
  };
};
