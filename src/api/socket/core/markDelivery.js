"use strict";
module.exports = function markDelivery(ctx, api, threadID, messageID) {
  if (threadID && messageID) {
    api.markAsDelivered(threadID, messageID, err => {
      if (err) {} else {
        if (ctx.globalOptions.autoMarkRead) {
          api.markAsRead(threadID, err2 => {});
        }
      }
    });
  }
};
