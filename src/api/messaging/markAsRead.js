"use strict";

const log = require("npmlog");
const { parseAndCheckLogin, saveCookies } = require("../../utils/client");
const { getType } = require("../../utils/format");
module.exports = function(defaultFuncs, api, ctx) {
  return async function markAsRead(threadID, read, callback) {
    if (
      getType(read) === "Function" ||
      getType(read) === "AsyncFunction"
    ) {
      callback = read;
      read = true;
    }
    if (read == undefined) {
      read = true;
    }

    if (!callback) {
      callback = () => {};
    }

    const form = {};

    if (typeof ctx.globalOptions.pageID !== "undefined") {
      form["source"] = "PagesManagerMessagesInterface";
      form["request_user_id"] = ctx.globalOptions.pageID;
      form["ids[" + threadID + "]"] = read;
      form["watermarkTimestamp"] = new Date().getTime();
      form["shouldSendReadReceipt"] = true;
      form["commerce_last_message_type"] = "";
      //form["titanOriginatedThreadId"] = utils.generateThreadingID(ctx.clientID);

      let resData;
      try {
        resData = await defaultFuncs
          .post(
            "https://www.facebook.com/ajax/mercury/change_read_status.php",
            ctx.jar,
            form
          )
          .then(saveCookies(ctx.jar))
          .then(parseAndCheckLogin(ctx, defaultFuncs));
      } catch (e) {
        callback(e);
        return e;
      }

      if (resData.error) {
        const err = resData.error;
        log.error("markAsRead", err);
        if (getType(err) == "Object" && err.error === "Not logged in.") {
          ctx.loggedIn = false;
        }
        callback(err);
        return err;
      }

      callback();
      return null;
    } else {
      try {
        if (ctx.mqttClient) {
          const err = await new Promise(r =>
            ctx.mqttClient.publish(
              "/mark_thread",
              JSON.stringify({
                threadID,
                mark: "read",
                state: read
              }),
              { qos: 1, retain: false },
              r
            )
          );
          if (err) throw err;
        } else {
          throw {
            error: "You can only use this function after you start listening."
          };
        }
      } catch (e) {
        callback(e);
        return e;
      }
    }
  };
};
