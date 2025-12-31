"use strict";
const log = require("npmlog");
const { parseAndCheckLogin } = require("../../utils/client");
const { getType } = require("../../utils/format");
const { isReadableStream } = require("../../utils/constants");
module.exports = function(defaultFuncs, api, ctx) {
  function upload(attachments, callback) {
    callback = callback || function() {};
    const uploads = [];

    // create an array of promises
    for (let i = 0; i < attachments.length; i++) {
      if (!isReadableStream(attachments[i])) {
        throw {
          error:
            "Attachment should be a readable stream and not " +
            getType(attachments[i]) +
            "."
        };
      }

      const form = {
        farr: attachments[i]
      };

      uploads.push(
        defaultFuncs
          .postFormData(
            "https://www.facebook.com/ajax/mercury/upload.php",
            ctx.jar,
            form,
            {}
          )
          .then(parseAndCheckLogin(ctx, defaultFuncs))
          .then(function(resData) {
            if (resData.error) {
              throw resData;
            }

            // We have to return the data unformatted unless we want to change it
            // back in sendMessage.
            return resData.payload.metadata[0];
          })
      );
    }

    // resolve all promises
    Promise.all(uploads)
      .then(function(resData) {
        callback(null, resData);
      })
      .catch(function(err) {
        log.error("uploadAttachment", err);
        return callback(err);
      });
  }

  return function uploadAttachment(attachments, callback) {
    if (
      !attachments &&
      !isReadableStream(attachments) &&
      !getType(attachments) === "Array" &&
      getType(attachments) === "Array" && !attachments.length
    )
      throw { error: "Please pass an attachment or an array of attachments." };

    let resolveFunc = function() {};
    let rejectFunc = function() {};
    const returnPromise = new Promise(function(resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function(err, info) {
        if (err) {
          return rejectFunc(err);
        }
        resolveFunc(info);
      };
    }

    if (getType(attachments) !== "Array") attachments = [attachments];

    upload(attachments, (err, info) => {
      if (err) {
        return callback(err);
      }
      callback(null, info);
    });

    return returnPromise;
  };
};
