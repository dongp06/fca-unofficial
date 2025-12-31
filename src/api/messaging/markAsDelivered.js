"use strict";
const log = require("npmlog");
const { parseAndCheckLogin, saveCookies } = require("../../utils/client");
const { getType } = require("../../utils/format");
module.exports = function(defaultFuncs, api, ctx) {
  return function markAsDelivered(threadID, messageID, callback) {
    let resolveFunc = function() {};
    let rejectFunc = function() {};
    const returnPromise = new Promise(function(resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function(err, friendList) {
        if (err) {
          return rejectFunc(err);
        }
        resolveFunc(friendList);
      };
    }

    if (!threadID || !messageID) {
      return callback("Error: messageID or threadID is not defined");
    }

    const form = {};

    form["message_ids[0]"] = messageID;
    form["thread_ids[" + threadID + "][0]"] = messageID;

    defaultFuncs
      .post(
        "https://www.facebook.com/ajax/mercury/delivery_receipts.php",
        ctx.jar,
        form
      )
      .then(saveCookies(ctx.jar))
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then(function(resData) {
        if (resData.error) {
          throw resData;
        }

        return callback();
      })
      .catch(function(err) {
        log.error("markAsDelivered", err);
        if (getType(err) == "Object" && err.error === "Not logged in.") {
          ctx.loggedIn = false;
        }
        return callback(err);
      });

    return returnPromise;
  };
};
