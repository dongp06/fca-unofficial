"use strict";

const { generateOfflineThreadingID } = require("../../utils/format.js");
const log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  function handleUpload(image) {
    const form = {
      images_only: "true",
      "attachment[]": image
    };
    return defaultFuncs
      .postFormData("https://upload.facebook.com/ajax/mercury/upload.php", ctx.jar, form, {})
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then(resData => {
        if (resData.error) throw resData;
        return resData.payload.metadata[0];
      });
  }
  return function changeGroupImage(image, threadID, callback) {
    return new Promise((resolve, reject) => {
      if (!ctx.mqttClient) {
        const err = new Error("Not connected to MQTT");
        callback?.(err);
        return reject(err);
      }
      if (!threadID || typeof threadID !== "string") {
        const err = new Error("Invalid threadID");
        callback?.(err);
        return reject(err);
      }
      const reqID = ++ctx.wsReqNumber;
      const taskID = ++ctx.wsTaskNumber;
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
      handleUpload(image)
        .then(payload => {
          const imageID = payload.image_id;
          const taskPayload = {
            thread_key: threadID,
            image_id: imageID,
            sync_group: 1
          };

          const mqttPayload = {
            epoch_id: generateOfflineThreadingID(),
            tasks: [
              {
                failure_count: null,
                label: "37",
                payload: JSON.stringify(taskPayload),
                queue_name: "thread_image",
                task_id: taskID
              }
            ],
            version_id: "8798795233522156"
          };
          const request = {
            app_id: "2220391788200892",
            payload: JSON.stringify(mqttPayload),
            request_id: reqID,
            type: 3
          };
          ctx.mqttClient.publish("/ls_req", JSON.stringify(request), {
            qos: 1,
            retain: false
          });
        })
        .catch(err => {
          ctx.mqttClient.removeListener("message", onResponse);
          log.error("changeGroupImageMqtt", err);
          callback?.(err);
          reject(err);
        });
    });
  };
};
