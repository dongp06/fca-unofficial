//UPDATED BY RON FUNIESTAS

"use strict";
const { formatID } = require("../../../utils/format");

module.exports = function createListenMqtt(deps) {
  const {
    WebSocket,
    mqtt,
    HttpsProxyAgent,
    buildStream,
    buildProxy,
    topics,
    parseDelta,
    getTaskResponseData,
    logger,
    emitAuth
  } = deps;

  return function listenMqtt(defaultFuncs, api, ctx, globalCallback) {

    function scheduleReconnect(delayMs) {
      const d = (ctx._mqttOpt && ctx._mqttOpt.reconnectDelayMs) || 8000;
      const ms = typeof delayMs === "number" ? delayMs : d;

      if (ctx._reconnectTimer) {
        logger("mqtt reconnect already scheduled", "warn");
        return;
      }
      if (ctx._ending) {
        logger("mqtt reconnect skipped - ending", "warn");
        return;
      }

      logger(`mqtt will reconnect in ${ms}ms`, "warn");
      ctx._reconnectTimer = setTimeout(() => {
        ctx._reconnectTimer = null;
        if (!ctx._ending) {
          listenMqtt(defaultFuncs, api, ctx, globalCallback);
        }
      }, ms);
    }

    function isEndingLikeError(msg) {
      return /No subscription existed|client disconnecting|socket hang up|ECONNRESET/i.test(msg || "");
    }

    const chatOn = ctx.globalOptions.online;
    const sessionID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + 1;

    const username = {
      u: ctx.userID,
      s: sessionID,
      chat_on: chatOn,
      fg: false,
      d: ctx.clientId,
      ct: "websocket",
      aid: 219994525426954,
      aids: null,
      mqtt_sid: "",
      cp: 3,
      ecp: 10,
      st: [],
      pm: [],
      dc: "",
      no_auto_fg: true,
      gas: null,
      pack: [],
      p: null,
      php_override: ""
    };

    const cookies = api.getCookies();
    let host;

    if (ctx.mqttEndpoint) {
      host = `${ctx.mqttEndpoint}&sid=${sessionID}&cid=${ctx.clientId}`;
    } else if (ctx.region) {
      host = `wss://edge-chat.facebook.com/chat?region=${ctx.region.toLowerCase()}&sid=${sessionID}&cid=${ctx.clientId}`;
    } else {
      host = `wss://edge-chat.facebook.com/chat?sid=${sessionID}&cid=${ctx.clientId}`;
    }

    const options = {
      clientId: "mqttwsclient",
      protocolId: "MQIsdp",
      protocolVersion: 3,
      username: JSON.stringify(username),
      clean: true,
      wsOptions: {
        headers: {
          Cookie: cookies,
          Origin: "https://www.facebook.com",
          "User-Agent": ctx.globalOptions.userAgent || "Mozilla/5.0",
          Referer: "https://www.facebook.com/",
          Host: "edge-chat.facebook.com",
          Connection: "Upgrade",
          Pragma: "no-cache",
          "Cache-Control": "no-cache",
          Upgrade: "websocket",
          "Sec-WebSocket-Version": "8",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "vi,en;q=0.9",
          "Sec-WebSocket-Extensions": ""
        },
        origin: "https://www.facebook.com",
        protocolVersion: 8,
        binaryType: "arraybuffer"
      },
      keepalive: 60,
      reschedulePings: true,
      reconnectPeriod: 0,
      connectTimeout: 15000
    };

    if (ctx.globalOptions.proxy !== undefined) {
      const agent = new HttpsProxyAgent(ctx.globalOptions.proxy);
      options.wsOptions.agent = agent;
    }

    ctx.mqttClient = new mqtt.Client(
      () => buildStream(options, new WebSocket(host, options.wsOptions), buildProxy()),
      options
    );

    const mqttClient = ctx.mqttClient;

    if (process.env.DEBUG_MQTT) {
      global.mqttClient = mqttClient;
    }

    mqttClient.on("error", function (err) {
      const msg = String(err && err.message ? err.message : err || "");

      if ((ctx._ending || ctx._cycling) && isEndingLikeError(msg)) {
        logger(`mqtt expected during shutdown: ${msg}`, "info");
        return;
      }

      if (/Not logged in|blocked the login|401|403/i.test(msg)) {
        try {
          if (mqttClient && mqttClient.connected) mqttClient.end(true);
        } catch (_) {}

        return emitAuth(
          ctx,
          api,
          globalCallback,
          /blocked/i.test(msg) ? "login_blocked" : "not_logged_in",
          msg
        );
      }

      logger(`mqtt error: ${msg}`, "error");

      try {
        if (mqttClient && mqttClient.connected) mqttClient.end(true);
      } catch (_) {}

      if (ctx._ending || ctx._cycling) return;

      if (ctx.globalOptions.autoReconnect && !ctx._ending) {
        const d = (ctx._mqttOpt && ctx._mqttOpt.reconnectDelayMs) || 8000;
        logger(`mqtt autoReconnect listenMqtt() in ${d}ms`, "warn");
        scheduleReconnect(d);
      } else {
        globalCallback({ type: "stop_listen", error: msg || "Connection refused" }, null);
      }
    });

    mqttClient.on("connect", function () {
      if (process.env.OnStatus === undefined) {
        logger("fca-unofficial premium", "info");
        process.env.OnStatus = true;
      }

      ctx._cycling = false;

      topics.forEach(t => mqttClient.subscribe(t));

      const queue = {
        sync_api_version: 11,
        max_deltas_able_to_process: 30,
        delta_batch_size: 100,
        encoding: "JSON",
        entity_fbid: ctx.userID,
        initial_titan_sequence_id: ctx.lastSeqId,
        device_params: null
      };

      const topic = ctx.syncToken
        ? "/messenger_sync_get_diffs"
        : "/messenger_sync_create_queue";

      if (ctx.syncToken) {
        queue.last_seq_id = ctx.lastSeqId;
        queue.sync_token = ctx.syncToken;
      }

      mqttClient.publish(topic, JSON.stringify(queue), { qos: 1, retain: false });
      mqttClient.publish("/foreground_state", JSON.stringify({ foreground: chatOn }), { qos: 1 });
      mqttClient.publish("/set_client_settings", JSON.stringify({ make_user_available_when_in_foreground: true }), { qos: 1 });

      const d = (ctx._mqttOpt && ctx._mqttOpt.reconnectDelayMs) || 8000;

      let rTimeout = setTimeout(function () {
        rTimeout = null;
        if (ctx._ending) return;

        logger(`mqtt t_ms timeout, cycling in ${d}ms`, "warn");

        try {
          if (mqttClient && mqttClient.connected) mqttClient.end(true);
        } catch (_) {}

        scheduleReconnect(d);
      }, 12000);

      ctx._rTimeout = rTimeout;

      ctx.tmsWait = function () {
        if (rTimeout) clearTimeout(rTimeout);
        if (ctx._rTimeout) delete ctx._rTimeout;

        if (ctx.globalOptions.emitReady) {
          globalCallback({ type: "ready", error: null });
        }

        delete ctx.tmsWait;
      };
    });

    mqttClient.on("message", function (topic, message) {
      if (ctx._ending) return;

      try {
        let jsonMessage = Buffer.isBuffer(message)
          ? Buffer.from(message).toString()
          : message;

        try {
          jsonMessage = JSON.parse(jsonMessage);
        } catch {
          jsonMessage = {};
        }

        if (jsonMessage.type === "jewel_requests_add") {
          globalCallback(null, {
            type: "friend_request_received",
            actorFbId: jsonMessage.from.toString(),
            timestamp: Date.now().toString()
          });

        } else if (jsonMessage.type === "jewel_requests_remove_old") {
          globalCallback(null, {
            type: "friend_request_cancel",
            actorFbId: jsonMessage.from.toString(),
            timestamp: Date.now().toString()
          });

        } else if (topic === "/t_ms") {
          if (ctx.tmsWait) ctx.tmsWait();

          if (jsonMessage.firstDeltaSeqId && jsonMessage.syncToken) {
            ctx.lastSeqId = jsonMessage.firstDeltaSeqId;
            ctx.syncToken = jsonMessage.syncToken;
          }

          if (jsonMessage.lastIssuedSeqId) {
            ctx.lastSeqId = parseInt(jsonMessage.lastIssuedSeqId);
          }

          for (const dlt of (jsonMessage.deltas || [])) {
            parseDelta(defaultFuncs, api, ctx, globalCallback, { delta: dlt });
          }

        } else if (topic === "/thread_typing" || topic === "/orca_typing_notifications") {
          globalCallback(null, {
            type: "typ",
            isTyping: !!jsonMessage.state,
            from: jsonMessage.sender_fbid.toString(),
            threadID: formatID((jsonMessage.thread || jsonMessage.sender_fbid).toString())
          });

        } else if (topic === "/orca_presence" && !ctx.globalOptions.updatePresence) {
          for (const data of (jsonMessage.list || [])) {
            globalCallback(null, {
              type: "presence",
              userID: String(data.u),
              timestamp: data.l * 1000,
              statuses: data.p
            });
          }

        } else if (topic === "/ls_resp") {
          const parsedPayload = JSON.parse(jsonMessage.payload);
          const reqID = jsonMessage.request_id;

          if (ctx.tasks.has(reqID)) {
            const task = ctx.tasks.get(reqID);
            const resp = getTaskResponseData(task.type, parsedPayload);
            if (resp) task.callback(null, { type: task.type, reqID, ...resp });
          }
        }

      } catch (ex) {
        logger(`mqtt message handler error: ${ex.message}`, "error");
      }
    });

    mqttClient.on("close", function () {
      if (ctx._ending || ctx._cycling) return;
      logger("mqtt connection closed", "warn");
    });

    mqttClient.on("disconnect", function () {
      if (ctx._ending || ctx._cycling) return;
      logger("mqtt disconnected", "warn");
    });
  };
};
