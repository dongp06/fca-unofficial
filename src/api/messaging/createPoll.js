"use strict";

const { generateOfflineThreadingID } = require("../../utils/format");

module.exports = function (defaultFuncs, api, ctx) {
  return async function createPoll(threadID, questionText, options) {
    let count_req = 0
    return new Promise((resolve, reject) => {
      const payload = {
        epoch_id: generateOfflineThreadingID(),
        tasks: [
          {
            failure_count: null,
            label: "163",
            payload: JSON.stringify({
              question_text: questionText,
              thread_key: threadID,
              options: options,
              sync_group: 1
            }),
            queue_name: "poll_creation",
            task_id: Math.floor(Math.random() * 1001)
          }
        ],
        version_id: "8768858626531631"
      };

      const form = JSON.stringify({
        app_id: "772021112871879",
        payload: JSON.stringify(payload),
        request_id: ++count_req,
        type: 3
      });

      try {
        mqttClient.publish("/ls_req", form);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  };
};
