"use strict";

const { generateOfflineThreadingID, getType } = require("../../utils/format.js");
module.exports = function (defaultFuncs, api, ctx) {
  return function addUserToGroup(userID, threadID, callback) {
    return new Promise((resolve, reject) => {
      if (!ctx.mqttClient) {
        const err = new Error("Not connected to MQTT");
        callback?.(err);
        return reject(err);
      }
      if (getType(threadID) !== "Number" && getType(threadID) !== "String") {
        const err = new Error("ThreadID should be of type Number or String.");
        callback?.(err);
        return reject(err);
      }
      if (getType(userID) !== "Array") userID = [userID];
      const reqID = ++ctx.wsReqNumber;
      const taskID = ++ctx.wsTaskNumber;

      const payload = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: "23",
            payload: JSON.stringify({
              thread_key: threadID,
              contact_ids: userID,
              sync_group: 1
            }),
            queue_name: threadID.toString(),
            task_id: taskID
          }
        ],
        version_id: "24502707779384158"
      };
      const form = JSON.stringify({
        app_id: "772021112871879",
        payload: JSON.stringify(payload),
        request_id: reqID,
        type: 3
      });
      const handleRes = (topic, message) => {
        if (topic !== "/ls_resp") return;
        let jsonMsg;
        try {
          jsonMsg = JSON.parse(message.toString());
          jsonMsg.payload = JSON.parse(jsonMsg.payload);
        } catch {
          return;
        }
        if (jsonMsg.request_id !== reqID) return;
        ctx.mqttClient.removeListener("message", handleRes);
        callback?.(null, { success: true, response: jsonMsg.payload });
        resolve({ success: true, response: jsonMsg.payload });
      };
      ctx.mqttClient.on("message", handleRes);
      ctx.mqttClient.publish("/ls_req", form, { qos: 1, retain: false }, (err) => {
        if (err) {
          ctx.mqttClient.removeListener("message", handleRes);
          callback?.(err);
          reject(err);
        }
      });
    });
  };
};
