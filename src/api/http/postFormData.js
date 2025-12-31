"use strict";

var log = require("npmlog");
const { getType } = require("../../utils/format");
const { parseAndCheckLogin } = require("../../utils/client");
module.exports = function(defaultFuncs, api, ctx) {
  return function postFormData(url, form, callback) {
    var resolveFunc = function() {};
    var rejectFunc = function() {};

    var returnPromise = new Promise(function(resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (
      !callback &&
      (getType(form) == "Function" ||
        getType(form) == "AsyncFunction")
    ) {
      callback = form;
      form = {};
    }

    form = form || {};

    callback =
      callback ||
      function(err, data) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };

    defaultFuncs
      .postFormData(url, ctx.jar, form, {})
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then(function(resData) {
        callback(null, resData);
      })
      .catch(function(err) {
        log.error("postFormData", err);
        return callback(err);
      });

    return returnPromise;
  };
};
