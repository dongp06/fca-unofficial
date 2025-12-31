"use strict";

const log = require("npmlog");
const { parseAndCheckLogin, saveCookies } = require("../../utils/client");
module.exports = function(defaultFuncs, api, ctx) {
  return function markAsReadAll(callback) {
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

    const form = {
      folder: "inbox"
    };

    defaultFuncs
      .post(
        "https://www.facebook.com/ajax/mercury/mark_folder_as_read.php",
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
        log.error("markAsReadAll", err);
        return callback(err);
      });

    return returnPromise;
  };
};
