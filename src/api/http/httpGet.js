"use strict";

const { getType } = require("../../utils/format.js");
const { get } = require("../../utils/request.js");

const httpGetFactory = function (defaultFuncs, api, ctx) {
  return function httpGet(url, form, callback, notAPI) {
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

    const executor = notAPI ? get : defaultFuncs.get;

    executor(url, ctx.jar, form)
      .then((resData) => callback(null, resData.data))
      .catch(function (err) {
        console.error("httpGet", err);
        return callback(err);
      });

    return returnPromise;
  };
};

module.exports = httpGetFactory;
