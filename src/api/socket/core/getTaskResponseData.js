"use strict";
module.exports = function getTaskResponseData(taskType, payload) {
  try {
    switch (taskType) {
      case "send_message_mqtt":
        return {
          type: taskType,
          threadID: payload.step[1][2][2][1][2],
          messageID: payload.step[1][2][2][1][3],
          payload: payload.step[1][2]
        };
      case "set_message_reaction":
        return { mid: payload.step[1][2][2][1][4] };
      case "edit_message":
        return { mid: payload.step[1][2][2][1][2] };
      default:
        return null;
    }
  } catch (e) {
    return null;
  }
};
