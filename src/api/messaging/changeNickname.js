"use strict";

const { generateOfflineThreadingID } = require("../../utils/format.js");
const log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  return function changeNickname(nickname, threadID, participantID, callback) {
    return new Promise((resolve, reject) => {
      if (!ctx.mqttClient) {
        const err = new Error("Not connected to MQTT");
        callback?.(err);
        return reject(err);
      }
      if (!threadID || !participantID) {
        const err = new Error("Missing required parameters");
        callback?.(err);
        return reject(err);
      }
      const reqID = ++ctx.wsReqNumber;
      const taskID = ++ctx.wsTaskNumber;
      const payload = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: "44",
            payload: JSON.stringify({
              thread_key: threadID,
              contact_id: participantID,
              nickname: nickname || "",
              sync_group: 1
            }),
            queue_name: "thread_participant_nickname",
            task_id: taskID
          }
        ],
        version_id: "8798795233522156"
      };
      const request = {
        app_id: "2220391788200892",
        payload: JSON.stringify(payload),
        request_id: reqID,
        type: 3
      };
      const onResponse = (topic, message) => {
        if (topic !== "/ls_resp") return;
        let jsonMsg;
        try {
          jsonMsg = JSON.parse(message.toString());
          jsonMsg.payload = JSON.parse(jsonMsg.payload);
        } catch (err) {
          return;
        }
        if (jsonMsg.request_id !== reqID) return;
        ctx.mqttClient.removeListener("message", onResponse);
        callback?.(null, { success: true, response: jsonMsg.payload });
        return resolve({ success: true, response: jsonMsg.payload });
      };
      ctx.mqttClient.on("message", onResponse);
      ctx.mqttClient.publish("/ls_req", JSON.stringify(request), { qos: 1, retain: false }, (err) => {
        if (err) {
          ctx.mqttClient.removeListener("message", onResponse);
          log.error("changeNicknameMqtt", err);
          callback?.(err);
          return reject(err);
        }
      });
    });
  };
};
