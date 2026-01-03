//UPDATED BY RON FUNIESTAS
//RECONNECTS WHEN MQTT CLOSES

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

    /* ------------------------------------------------------------------ */
    /* RECONNECT CONTROL                                                   */
    /* ------------------------------------------------------------------ */

    function scheduleReconnect(delayMs) {
      const delay =
        typeof delayMs === "number"
          ? delayMs
          : (ctx._mqttOpt && ctx._mqttOpt.reconnectDelayMs) || 3000;

      if (ctx._ending || ctx._cycling) return;
      if (ctx._reconnectTimer) return;

      logger(`mqtt reconnect scheduled in ${delay}ms`, "warn");

      ctx._reconnectTimer = setTimeout(() => {
        ctx._reconnectTimer = null;
        if (!ctx._ending) {
          listenMqtt(defaultFuncs, api, ctx, globalCallback);
        }
      }, delay);
    }

    /* ------------------------------------------------------------------ */
    /* MQTT CONNECTION SETUP                                               */
    /* ------------------------------------------------------------------ */

    const chatOn = ctx.globalOptions.online;
    const sessionID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

    const username = {
      u: ctx.userID,
      s: sessionID,
      chat_on: chatOn,
      fg: false,
      d: ctx.clientId,
      ct: "websocket",
      aid: 219994525426954,
      mqtt_sid: "",
      cp: 3,
      ecp: 10,
      no_auto_fg: true
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

      clean: false,                 // IMPORTANT
      keepalive: 60,                // IMPORTANT
      connectTimeout: 15000,        // IMPORTANT
      reconnectPeriod: 0,           // manual control only
      reschedulePings: true,

      wsOptions: {
        headers: {
          Cookie: cookies,
          Origin: "https://www.facebook.com",
          Referer: "https://www.facebook.com/",
          "User-Agent": ctx.globalOptions.userAgent || "Mozilla/5.0",
          Connection: "Upgrade",
          Upgrade: "websocket"
        },
        origin: "https://www.facebook.com",
        binaryType: "arraybuffer"
      }
    };

    if (ctx.globalOptions.proxy) {
      options.wsOptions.agent = new HttpsProxyAgent(ctx.globalOptions.proxy);
    }

    ctx.mqttClient = new mqtt.Client(
      () => buildStream(options, new WebSocket(host, options.wsOptions), buildProxy()),
      options
    );

    const mqttClient = ctx.mqttClient;

    /* ------------------------------------------------------------------ */
    /* EVENTS                                                              */
    /* ------------------------------------------------------------------ */

    mqttClient.on("connect", () => {
      logger("mqtt connected", "info");
      ctx._cycling = false;

      topics.forEach(t => mqttClient.subscribe(t));

      const queue = {
        sync_api_version: 11,
        max_deltas_able_to_process: 100,
        delta_batch_size: 500,
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

      mqttClient.publish(topic, JSON.stringify(queue), { qos: 1 });
      mqttClient.publish("/foreground_state", JSON.stringify({ foreground: chatOn }), { qos: 1 });
      mqttClient.publish("/set_client_settings", JSON.stringify({ make_user_available_when_in_foreground: true }), { qos: 1 });
    });

    mqttClient.on("message", (topic, message) => {
      if (ctx._ending) return;

      let json;
      try {
        json = JSON.parse(message.toString());
      } catch {
        return;
      }

      if (topic === "/t_ms") {
        if (json.firstDeltaSeqId) ctx.lastSeqId = json.firstDeltaSeqId;
        if (json.syncToken) ctx.syncToken = json.syncToken;
        if (json.lastIssuedSeqId) ctx.lastSeqId = Number(json.lastIssuedSeqId);

        for (const d of json.deltas || []) {
          parseDelta(defaultFuncs, api, ctx, globalCallback, { delta: d });
        }
      }

      else if (topic === "/thread_typing" || topic === "/orca_typing_notifications") {
        globalCallback(null, {
          type: "typ",
          isTyping: !!json.state,
          from: json.sender_fbid.toString(),
          threadID: formatID((json.thread || json.sender_fbid).toString())
        });
      }

      else if (topic === "/ls_resp") {
        const payload = JSON.parse(json.payload);
        const task = ctx.tasks && ctx.tasks.get(json.request_id);
        if (task) {
          const data = getTaskResponseData(task.type, payload);
          task.callback(data ? null : "error", data);
        }
      }
    });

    mqttClient.on("error", err => {
      const msg = String(err?.message || err || "");
      logger(`mqtt error: ${msg}`, "error");

      if (/not logged in|blocked/i.test(msg)) {
        emitAuth(ctx, api, globalCallback, "not_logged_in", msg);
        return;
      }

      try { mqttClient.end(true); } catch {}
      scheduleReconnect();
    });

    mqttClient.on("close", () => {
      if (ctx._ending || ctx._cycling) return;
      logger("mqtt connection closed (remote)", "warn");
      scheduleReconnect();
    });

    mqttClient.on("disconnect", () => {
      if (ctx._ending || ctx._cycling) return;
      logger("mqtt disconnected", "warn");
      scheduleReconnect();
    });
  };
};
