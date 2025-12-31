"use strict";

const log = require("npmlog");
const { parseAndCheckLogin } = require("../../utils/client");
const { getType } = require("../../utils/format");
module.exports = function(defaultFuncs, api, ctx) {
  return function deleteMessage(messageOrMessages, callback) {
    let resolveFunc = function() {};
    let rejectFunc = function() {};
    const returnPromise = new Promise(function(resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    if (!callback) {
      callback = function(err) {
        if (err) {
          return rejectFunc(err);
        }
        resolveFunc();
      };
    }

    const form = {
      client: "mercury"
    };

    if (getType(messageOrMessages) !== "Array") {
      messageOrMessages = [messageOrMessages];
    }

    for (let i = 0; i < messageOrMessages.length; i++) {
      form["message_ids[" + i + "]"] = messageOrMessages[i];
    }

    defaultFuncs
      .post(
        "https://www.facebook.com/ajax/mercury/delete_messages.php",
        ctx.jar,
        form
      )
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then(function(resData) {
        if (resData.error) {
          throw resData;
        }

        return callback();
      })
      .catch(function(err) {
        log.error("deleteMessage", err);
        return callback(err);
      });

    return returnPromise;
  };
};
