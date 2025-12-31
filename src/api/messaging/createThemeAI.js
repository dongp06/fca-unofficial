"use strict";

const log = require("npmlog");
const { getType } = require("../../utils/format");
const { parseAndCheckLogin } = require("../../utils/client");

module.exports = function (defaultFuncs, api, ctx) {
  return function createThemeAI(prompt, callback) {
    let resolveFunc = function () { };
    let rejectFunc = function () { };
    const returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function (err, data) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    if (getType(prompt) !== "String") {
      return callback({ error: "Invalid prompt. Please provide a string." });
    }

    if (!prompt || prompt.trim().length === 0) {
      return callback({ error: "Prompt cannot be empty." });
    }

    const form = {
      av: ctx.userID,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: "useGenerateAIThemeMutation",
      doc_id: "23873748445608673",
      variables: JSON.stringify({
        input: {
          client_mutation_id: Math.round(Math.random() * 19).toString(),
          actor_id: ctx.userID,
          bypass_cache: true,
          caller: "MESSENGER",
          num_themes: 1,
          prompt: prompt.trim()
        }
      }),
      server_timestamps: true
    };

    defaultFuncs
      .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
      .then(parseAndCheckLogin(ctx, defaultFuncs))
      .then(function (resData) {
        if (resData.errors) {
          throw resData;
        }

        if (!resData.data || !resData.data.xfb_generate_ai_themes_from_prompt) {
          throw {
            error: "Invalid response from Facebook API",
            res: resData
          };
        }

        const themes = resData.data.xfb_generate_ai_themes_from_prompt.themes;
        if (!themes || !Array.isArray(themes) || themes.length === 0) {
          throw {
            error: "No themes generated",
            res: resData
          };
        }

        const theme = themes[0];
        if (!theme || !theme.id || !theme.background_asset) {
          throw {
            error: "Invalid theme data",
            res: resData
          };
        }

        callback(null, {
          id: theme.id,
          accessibility_label: theme.accessibility_label || null,
          background_asset: {
            id: theme.background_asset.id,
            image: {
              url: theme.background_asset.image?.uri || null
            }
          }
        });
      })
      .catch(function (err) {
        log.error("createThemeAI", err);
        return callback(err);
      });

    return returnPromise;
  };
};
