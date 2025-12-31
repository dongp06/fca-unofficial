"use strict";

const { generateOfflineThreadingID } = require("../../utils/format");
const log = require("npmlog");
const { parseAndCheckLogin } = require("../../utils/client");
module.exports = function (defaultFuncs, api, ctx) {
  function changeThreadEmojiNoMqtt(emoji, threadID, callback) {
    var resolveFunc = function () { };
    var rejectFunc = function () { };
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    if (!callback) {
      callback = function (err) {
        if (err) {
          return rejectFunc(err);
        }
        resolveFunc();
      };
    }
    var form = {
      emoji_choice: emoji,
      thread_or_other_fbid: threadID,
    };
    defaultFuncs
      .post(
        "https://www.facebook.com/messaging/save_thread_emoji/?source=thread_settings&__pc=EXP1%3Amessengerdotcom_pkg",
        ctx.jar,
        form,
      )
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then(function (resData) {
        if (resData.error === 1357031) {
          throw {
            error:
              "Trying to change emoji of a chat that doesn't exist. Have at least one message in the thread before trying to change the emoji.",
          };
        }
        if (resData.error) {
          throw resData;
        }
        return callback();
      })
      .catch(function (err) {
        log.error("changeThreadEmoji", err);
        return callback(err);
      });
    return returnPromise;
  };
  function changeThreadEmojiMqtt(emoji, threadID, callback) {
    if (!ctx.mqttClient) {
      throw new Error("Not connected to MQTT");
    }
    var resolveFunc = function () { };
    var rejectFunc = function () { };
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    if (!callback) {
      callback = function (err, data) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
        data
      };
    }
    let count_req = 0
    var form = JSON.stringify({
      "app_id": "2220391788200892",
      "payload": JSON.stringify({
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: '100003',
            payload: JSON.stringify({
              "thread_key": threadID,
              "custom_emoji": emoji,
              "avatar_sticker_instruction_key_id": null,
              "sync_group": 1
            }),
            queue_name: 'thread_quick_reaction',
            task_id: Math.random() * 1001 << 0
          }
        ],
        version_id: '8798795233522156'
      }),
      "request_id": ++count_req,
      "type": 3
    });
    mqttClient.publish('/ls_req', form);
    return returnPromise;
  };
  return function changeThreadEmoji(emoji, threadID, callback) {
    if (ctx.mqttClient) {
      try {
        changeThreadEmojiMqtt(emoji, threadID, callback);
      } catch (e) {
        changeThreadEmojiNoMqtt(emoji, threadID, callback);
      }
    } else {
      changeThreadEmojiNoMqtt(emoji, threadID, callback);
    }
  };
};
