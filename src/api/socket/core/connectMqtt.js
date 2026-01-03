//UPDATED BY RON FUNIESTAS
//RECONNECTS WHEN MQTT CLOSES

"use strict";

const { formatID } = require("../../../utils/format");

module.exports = function createListenMqtt(deps) {
  const { WebSocket, mqtt, HttpsProxyAgent, buildStream, buildProxy,
    topics, parseDelta, getTaskResponseData, logger, emitAuth
  } = deps;

  return function listenMqtt(defaultFuncs, api, ctx, globalCallback) {

    // --- Helper: Centralized Reconnection ---
    function scheduleReconnect(delayMs) {
      const d = (ctx._mqttOpt && ctx._mqttOpt.reconnectDelayMs) || 2000;
      const ms = typeof delayMs === "number" ? delayMs : d;
      
      if (ctx._reconnectTimer) return; // Debounce multiple calls
      if (ctx._ending) return;

      logger(`MQTT: Reconnecting in ${ms}ms...`, "warn");
      ctx._reconnectTimer = setTimeout(() => {
        ctx._reconnectTimer = null;
        if (!ctx._ending) {
          listenMqtt(defaultFuncs, api, ctx, globalCallback);
        }
      }, ms);
    }

    const chatOn = ctx.globalOptions.online;
    const sessionID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + 1;
    const username = {
      u: ctx.userID, s: sessionID, chat_on: chatOn, fg: false, d: ctx.clientId,
      ct: "websocket", aid: 219994525426954, aids: null, mqtt_sid: "",
      cp: 3, ecp: 10, st: [], pm: [], dc: "", no_auto_fg: true, gas: null, pack: [], p: null, php_override: ""
    };

    const cookies = api.getCookies();
    let host;
    if (ctx.mqttEndpoint) host = `${ctx.mqttEndpoint}&sid=${sessionID}&cid=${ctx.clientId}`;
    else if (ctx.region) host = `wss://edge-chat.facebook.com/chat?region=${ctx.region.toLowerCase()}&sid=${sessionID}&cid=${ctx.clientId}`;
    else host = `wss://edge-chat.facebook.com/chat?sid=${sessionID}&cid=${ctx.clientId}`;

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
          Upgrade: "websocket",
          "Sec-WebSocket-Version": "13"
        },
        origin: "https://www.facebook.com",
        protocolVersion: 13,
        binaryType: "arraybuffer"
      },
      keepalive: 10,           // Lowered from 30 to 10 to keep Contabo sockets alive
      reschedulePings: true,
      reconnectPeriod: 1000,   // Internal MQTT retry period
      connectTimeout: 10000    // Increased for slower routing
    };

    if (ctx.globalOptions.proxy !== undefined) {
      options.wsOptions.agent = new HttpsProxyAgent(ctx.globalOptions.proxy);
    }

    // --- Initialize Client ---
    ctx.mqttClient = new mqtt.Client(
      () => buildStream(options, new WebSocket(host, options.wsOptions), buildProxy()),
      options
    );
    const mqttClient = ctx.mqttClient;

    // --- Event Listeners ---

    mqttClient.on("error", function (err) {
      const msg = String(err?.message || err || "");
      if (ctx._ending || ctx._cycling) return;

      // Handle Authentication failures
      if (/Not logged in|401|403|blocked/i.test(msg)) {
        mqttClient.end(true);
        return emitAuth(ctx, api, globalCallback, /blocked/i.test(msg) ? "login_blocked" : "not_logged_in", msg);
      }

      logger(`MQTT Error: ${msg}`, "error");
      mqttClient.end(true);
      scheduleReconnect();
    });

    mqttClient.on("connect", function () {
      logger("MQTT Connected", "info");
      ctx._cycling = false;
      ctx.tmsReceived = false;

      // Subscribe and Initialize
      topics.forEach(t => mqttClient.subscribe(t));

      const queue = {
        sync_api_version: 11, max_deltas_able_to_process: 100, delta_batch_size: 500,
        encoding: "JSON", entity_fbid: ctx.userID, initial_titan_sequence_id: ctx.lastSeqId, device_params: null
      };
      const topic = ctx.syncToken ? "/messenger_sync_get_diffs" : "/messenger_sync_create_queue";
      if (ctx.syncToken) { queue.last_seq_id = ctx.lastSeqId; queue.sync_token = ctx.syncToken; }

      mqttClient.publish(topic, JSON.stringify(queue), { qos: 1, retain: false });
      mqttClient.publish("/foreground_state", JSON.stringify({ foreground: chatOn }), { qos: 1 });
      mqttClient.publish("/set_client_settings", JSON.stringify({ make_user_available_when_in_foreground: true }), { qos: 1 });

      // Safety timeout for the first /t_ms response
      let rTimeout = setTimeout(() => {
        if (!ctx._ending && !ctx.tmsReceived) {
          logger("MQTT t_ms handshake timeout - cycling connection", "warn");
          mqttClient.end(true);
          scheduleReconnect();
        }
      }, 8000);

      ctx.tmsWait = function () {
        ctx.tmsReceived = true;
        if (rTimeout) { clearTimeout(rTimeout); rTimeout = null; }
        if (ctx.globalOptions.emitReady) globalCallback({ type: "ready", error: null });
        delete ctx.tmsWait;
      };
    });

    mqttClient.on("message", function (topic, message) {
      if (ctx._ending) return;
      try {
        let jsonMessage = Buffer.isBuffer(message) ? message.toString() : message;
        try { jsonMessage = JSON.parse(jsonMessage); } catch (e) { jsonMessage = {}; }

        // Standard Handlers
        if (topic === "/t_ms") {
          if (ctx.tmsWait) ctx.tmsWait();
          if (jsonMessage.firstDeltaSeqId && jsonMessage.syncToken) {
            ctx.lastSeqId = jsonMessage.firstDeltaSeqId;
            ctx.syncToken = jsonMessage.syncToken;
          }
          if (jsonMessage.lastIssuedSeqId) ctx.lastSeqId = parseInt(jsonMessage.lastIssuedSeqId);
          for (const dlt of (jsonMessage.deltas || [])) {
            parseDelta(defaultFuncs, api, ctx, globalCallback, { delta: dlt });
          }
        } 
        else if (topic === "/thread_typing" || topic === "/orca_typing_notifications") {
          globalCallback(null, {
            type: "typ",
            isTyping: !!jsonMessage.state,
            from: jsonMessage.sender_fbid.toString(),
            threadID: formatID((jsonMessage.thread || jsonMessage.sender_fbid).toString())
          });
        }
        else if (topic === "/orca_presence") {
          if (!ctx.globalOptions.updatePresence) {
            for (const data of (jsonMessage.list || [])) {
              globalCallback(null, { type: "presence", userID: String(data.u), timestamp: data.l * 1000, statuses: data.p });
            }
          }
        }
        else if (topic === "/ls_resp") {
          const parsedPayload = JSON.parse(jsonMessage.payload);
          const reqID = jsonMessage.request_id;
          if (ctx["tasks"].has(reqID)) {
            const { type: taskType, callback: taskCallback } = ctx["tasks"].get(reqID);
            const taskRespData = getTaskResponseData(taskType, parsedPayload);
            if (!taskRespData) taskCallback("error", null);
            else taskCallback(null, Object.assign({ type: taskType, reqID }, taskRespData));
          }
        }
      } catch (ex) {
        logger(`MQTT Message Handler Error: ${ex.message}`, "error");
      }
    });

    mqttClient.on("close", () => {
      if (!ctx._ending && !ctx._cycling) {
        logger("MQTT connection lost (close). Retrying...", "warn");
        scheduleReconnect();
      }
    });

    mqttClient.on("disconnect", () => {
      if (!ctx._ending && !ctx._cycling) {
        logger("MQTT disconnected by server. Retrying...", "warn");
        scheduleReconnect();
      }
    });
  };
};
