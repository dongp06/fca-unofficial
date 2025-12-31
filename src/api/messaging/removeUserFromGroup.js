"use strict";

const { getType } = require("../../utils/format");
const { parseAndCheckLogin } = require("../../utils/client");
const log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  function removeUserFromGroupNoMqtt(userID, threadID, callback) {
    if (!callback && (getType(threadID) === "Function" || getType(threadID) === "AsyncFunction")) throw { error: "please pass a threadID as a second argument." };
    if (getType(threadID) !== "Number" && getType(threadID) !== "String") throw { error: "threadID should be of type Number or String and not " + getType(threadID) + "." };
    if (getType(userID) !== "Number" && getType(userID) !== "String") throw { error: "userID should be of type Number or String and not " + getType(userID) + "." };
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
      };
    }
    var form = {
      uid: userID,
      tid: threadID
    };
    defaultFuncs
      .post("https://www.facebook.com/chat/remove_participants", ctx.jar, form)
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then(function (resData) {
        if (!resData) throw { error: "Remove from group failed." };
        if (resData.error) throw resData;
        return callback();
      })
      .catch(function (err) {
        log.error("removeUserFromGroup", err);
        return callback(err);
      });
    return returnPromise;
  };
  function removeUserFromGroupMqtt(userID, threadID, callback) {
    if (!ctx.mqttClient) {
      throw new Error("Not connected to MQTT");
    }
    if (!callback && (getType(threadID) === "Function" || getType(threadID) === "AsyncFunction")) throw { error: "please pass a threadID as a second argument." };
    if (getType(threadID) !== "Number" && getType(threadID) !== "String") throw { error: "threadID should be of type Number or String and not " + getType(threadID) + "." };
    if (getType(userID) !== "Number" && getType(userID) !== "String") throw { error: "userID should be of type Number or String and not " + getType(userID) + "." };
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
      };
    }
    let count_req = 0;
    var form = JSON.stringify({
      "app_id": "2220391788200892",
      "payload": JSON.stringify({
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: '140',
            payload: JSON.stringify({
              "thread_id": threadID,
              "contact_id": userID,
              "sync_group": 1
            }),
            queue_name: 'remove_participant_v2',
            task_id: Math.random() * 1001 << 0
          }
        ],
        version_id: '8798795233522156'
      }),
      "request_id": ++count_req,
      "type": 3
    });
    mqttClient.publish('/ls_req', form, (err, data) => {
      if (err) {
        callback(err, null);
        rejectFunc(false);
      } else {
        callback(null, true);
        resolveFunc(true);
      }
    });
    return returnPromise;
  };
  return function removeUserFromGroup(userID, threadID, callback) {
    if (ctx.mqttClient) {
      try {
        removeUserFromGroupMqtt(userID, threadID, callback);
      } catch (e) {
        removeUserFromGroupNoMqtt(userID, threadID, callback);
      }
    } else {
      removeUserFromGroupNoMqtt(userID, threadID, callback);
    }
  };
};
