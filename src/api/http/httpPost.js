"use strict";

const { post } = require("../../utils/request");
const { getType } = require("../../utils/format");

const httpPostFactory = function (defaultFuncs, api, ctx) {
  return function httpPost(url, form, callback, notAPI) {
    let resolveFunc = () => { };
    let rejectFunc = () => { };

    const returnPromise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (
      !callback &&
      (getType(form) === "Function" || getType(form) === "AsyncFunction")
    ) {
      callback = form;
      form = {};
    }

    form = form || {};

    callback =
      callback ||
      function (err, data) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };

    const executor = notAPI ? post : defaultFuncs.post;

    executor(url, ctx.jar, form, ctx.globalOptions)
      .then((resData) => {
        let data = resData.data;
        if (typeof data === "object") {
          data = JSON.stringify(data, null, 2);
        }
        callback(null, data);
      })
      .catch((err) => {
        console.error("httpPost", err);
        return callback(err);
      });

    return returnPromise;
  };
};

module.exports = httpPostFactory;
