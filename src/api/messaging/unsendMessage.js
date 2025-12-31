"use strict";

const { generateOfflineThreadingID } = require("../../utils/format.js");
const log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  return function unsendMessage(messageID, threadID, callback) {
    return new Promise((resolve, reject) => {
      if (!ctx.mqttClient) {
        const err = new Error("Not connected to MQTT");
        callback?.(err);
        return reject(err);
      }
      const reqID = ++ctx.wsReqNumber;
      const taskID = ++ctx.wsTaskNumber;
      const taskPayload = {
        message_id: messageID,
        thread_key: threadID,
        sync_group: 1,
      };
      const task = {
        failure_count: null,
        label: "33",
        payload: JSON.stringify(taskPayload),
        queue_name: "unsend_message",
        task_id: taskID,
      };
      const content = {
        app_id: "2220391788200892",
        payload: JSON.stringify({
          tasks: [task],
          epoch_id: parseInt(generateOfflineThreadingID()),
          version_id: "25393437286970779",
        }),
        request_id: reqID,
        type: 3,
      };
      try {
        ctx.mqttClient.publish("/ls_req", JSON.stringify(content), {
          qos: 1,
          retain: false
        });
      } catch (err) {
        log.error("unsendMessage (MQTT publish failed)", err);
        callback?.(err);
        return reject(err);
      }
      const handleRes = (topic, message) => {
        if (topic !== "/ls_resp") return;
        let jsonMsg;
        try {
          jsonMsg = JSON.parse(message.toString());
          jsonMsg.payload = JSON.parse(jsonMsg.payload);
        } catch (err) {
          return;
        }
        if (jsonMsg.request_id !== reqID) return;
        ctx.mqttClient.removeListener("message", handleRes);
        try {
          const msgID = jsonMsg.payload.step?.[1]?.[2]?.[2]?.[1]?.[2];
          const msgReplace = jsonMsg.payload.step?.[1]?.[2]?.[2]?.[1]?.[4];
          if (msgID && msgReplace) {
            const bodies = {
              body: msgReplace,
              messageID: msgID
            };
            callback?.(null, bodies);
            return resolve(bodies);
          } else {
            callback?.(null, { success: true });
            return resolve({ success: true });
          }
        } catch (err) {
          callback?.(null, { success: true });
          return resolve({ success: true });
        }
      };
      ctx.mqttClient.on("message", handleRes);
    });
  };
};
