"use strict";

const { generateOfflineThreadingID } = require("../../utils/format.js");
module.exports = (defaultFuncs, api, ctx) => {
  return async (color, threadID, callback) => {
    let reqID = ++ctx.wsReqNumber;
    let resolveFunc = () => { };
    let rejectFunc = () => { };
    const returnPromise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = (err, data) => {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    const content = {
      app_id: "2220391788200892",
      payload: JSON.stringify({
        data_trace_id: null,
        epoch_id: parseInt(generateOfflineThreadingID()),
        tasks: [
          {
            failure_count: null,
            label: "43",
            payload: JSON.stringify({
              thread_key: threadID,
              theme_fbid: color,
              source: null,
              sync_group: 1,
              payload: null
            }),
            queue_name: "thread_theme",
            task_id: ++ctx.wsTaskNumber
          }
        ],
        version_id: "8798795233522156"
      }),
      request_id: reqID,
      type: 3
    };

    ctx.mqttClient.publish("/ls_req", JSON.stringify(content), {
      qos: 1,
      retain: false
    });

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
        const msgID = jsonMsg.payload.step[1][2][2][1][2];
        const msgReplace = jsonMsg.payload.step[1][2][2][1][4];
        const bodies = {
          body: msgReplace,
          messageID: msgID
        };
        return callback(null, bodies);
      } catch (err) {
        return callback(null, { success: true });
      }
    };

    ctx.mqttClient.on("message", handleRes);
    return returnPromise;
  };
};
