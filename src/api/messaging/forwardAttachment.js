"use strict";

const { generateOfflineThreadingID } = require("../../utils/format");

module.exports = function (defaultFuncs, api, ctx) {
  return async function forwardMessage(threadID, forwardedMsgID, callback) {
    let resolveFunc, rejectFunc;
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
    let count_req = 0
    const payload = {
      epoch_id: generateOfflineThreadingID(),
      tasks: [
        {
          failure_count: null,
          label: "46",
          payload: JSON.stringify({
            thread_id: threadID,
            otid: generateOfflineThreadingID(),
            source: 65544,
            send_type: 5,
            sync_group: 1,
            mark_thread_read: 0,
            forwarded_msg_id: forwardedMsgID,
            strip_forwarded_msg_caption: 0,
            initiating_source: 1
          }),
          queue_name: threadID,
          task_id: Math.floor(Math.random() * 1001)
        }
      ],
      version_id: "8768858626531631"
    };
    const form = JSON.stringify({
      app_id: "772021112871879",
      payload: JSON.stringify(payload),
      "request_id": ++count_req,
      "type": 3
    });
    mqttClient.publish("/ls_req", form);
    return returnPromise;
  };
};
