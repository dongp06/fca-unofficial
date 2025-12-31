"use strict";

const { getType } = require("../../utils/format");

module.exports = function(defaultFuncs, api, ctx) {
  return function addExternalModule(moduleObj) {
    if (getType(moduleObj) == "Object") {
      for (const apiName in moduleObj) {
        if (getType(moduleObj[apiName]) == "Function") {
          api[apiName] = moduleObj[apiName](defaultFuncs, api, ctx);
        } else {
          throw new Error(
            `Item "${apiName}" in moduleObj must be a function, not ${getType(
              moduleObj[apiName]
            )}!`
          );
        }
      }
    } else {
      throw new Error(
        `moduleObj must be an object, not ${getType(moduleObj)}!`
      );
    }
  };
};
