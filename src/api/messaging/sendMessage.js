/**
 * Create by Donix-VN (DongDev)
 * Don't change credit
 * Send a message using MQTT.
 * @param {string} text - The text of the message to send.
 * @param {string} threadID - The ID of the thread to send the message to.
 * @param {string} [msgReplace] - Optional. The message ID of the message to replace.
 * @param {Array<Buffer|Stream>} [attachments] - Optional. The attachments to send with the message.
 * @param {function} [callback] - Optional. The callback function to call when the message is sent.
 * @returns {Promise<object>} A promise that resolves with the bodies of the sent message.
 */

"use strict";
const log = require("npmlog");
const { parseAndCheckLogin } = require("../../utils/client");
const { getType } = require("../../utils/format");
const { isReadableStream } = require("../../utils/constants");
const { generateOfflineThreadingID } = require("../../utils/format");

module.exports = function (defaultFuncs, api, ctx) {
  const hasLinks = s => typeof s === "string" && /(https?:\/\/|www\.|t\.me\/|fb\.me\/|youtu\.be\/|facebook\.com\/|youtube\.com\/)/i.test(s);
  const emojiSizes = { small: 1, medium: 2, large: 3 };

  async function uploadAttachment(streams) {
    const uploads = streams.map(stream => {
      if (!isReadableStream(stream)) throw { error: "Attachment should be a readable stream and not " + getType(stream) + "." };
      const form = { farr: stream };
      return defaultFuncs
        .postFormData("https://www.facebook.com/ajax/mercury/upload.php", ctx.jar, form, {})
        .then(parseAndCheckLogin(ctx, defaultFuncs))
        .then(resData => {
          if (resData.error) throw resData;
          return resData.payload.metadata[0];
        });
    });
    return Promise.all(uploads);
  }

  function extractIdsFromPayload(payload) {
    let messageID = null;
    let threadID = null;
    function walk(n) {
      if (Array.isArray(n)) {
        if (n[0] === 5 && (n[1] === "replaceOptimsiticMessage" || n[1] === "replaceOptimisticMessage")) {
          messageID = String(n[3]);
        }
        if (n[0] === 5 && n[1] === "writeCTAIdToThreadsTable") {
          const a = n[2];
          if (Array.isArray(a) && a[0] === 19) threadID = String(a[1]);
        }
        for (const x of n) walk(x);
      }
    }
    walk(payload?.step);
    return { threadID, messageID };
  }

  function publishWithAck(content, text, reqID, callback) {
    return new Promise((resolve, reject) => {
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        ctx.mqttClient.removeListener("message", handleRes);
      };
      const handleRes = (topic, message) => {
        if (topic !== "/ls_resp") return;
        let jsonMsg;
        try {
          jsonMsg = JSON.parse(message.toString());
          jsonMsg.payload = JSON.parse(jsonMsg.payload);
        } catch {
          return;
        }
        if (jsonMsg.request_id !== reqID) return;
        const { threadID, messageID } = extractIdsFromPayload(jsonMsg.payload);
        const bodies = { body: text || null, messageID, threadID };
        cleanup();
        callback && callback(undefined, bodies);
        resolve(bodies);
      };
      ctx.mqttClient.on("message", handleRes);
      ctx.mqttClient.publish("/ls_req", JSON.stringify(content), { qos: 1, retain: false }, err => {
        if (err) {
          cleanup();
          callback && callback(err);
          reject(err);
        }
      });
      setTimeout(() => {
        if (done) return;
        cleanup();
        const err = { error: "Timeout waiting for ACK" };
        callback && callback(err);
        reject(err);
      }, 15000);
    });
  }

  function buildMentionData(msg, baseBody) {
    if (!msg.mentions || !Array.isArray(msg.mentions) || !msg.mentions.length) return null;
    const base = typeof baseBody === "string" ? baseBody : "";
    const ids = [];
    const offsets = [];
    const lengths = [];
    const types = [];
    let cursor = 0;
    for (const m of msg.mentions) {
      const raw = String(m.tag || "");
      const name = raw.replace(/^@+/, "");
      const start = Number.isInteger(m.fromIndex) ? m.fromIndex : cursor;
      let idx = base.indexOf(raw, start);
      let adj = 0;
      if (idx === -1) {
        idx = base.indexOf(name, start);
        adj = 0;
      } else {
        adj = raw.length - name.length;
      }
      if (idx < 0) {
        idx = 0;
        adj = 0;
      }
      const off = idx + adj;
      ids.push(String(m.id || 0));
      offsets.push(off);
      lengths.push(name.length);
      types.push("p");
      cursor = off + name.length;
    }
    return {
      mention_ids: ids.join(","),
      mention_offsets: offsets.join(","),
      mention_lengths: lengths.join(","),
      mention_types: types.join(",")
    };
  }

  function coerceMsg(x) {
    if (x == null) return { body: "" };
    if (typeof x === "string") return { body: x };
    if (typeof x === "object") return x;
    return { body: String(x) };
  }

  return async function sendMessageMqtt(msg, threadID, callback, replyToMessage) {
    if (typeof threadID === "function") return threadID({ error: "Pass a threadID as a second argument." });
    if (typeof callback === "string" && !replyToMessage) {
      replyToMessage = callback;
      callback = () => { };
    }
    if (typeof callback !== "function") callback = () => { };
    if (!threadID) {
      const err = { error: "threadID is required" };
      callback(err);
      throw err;
    }

    const m = coerceMsg(msg);
    const baseBody = m.body != null ? String(m.body) : "";
    const reqID = Math.floor(100 + Math.random() * 900);
    const epoch = (BigInt(Date.now()) << 22n).toString();

    const payload0 = {
      thread_id: String(threadID),
      otid: generateOfflineThreadingID(),
      source: 2097153,
      send_type: 1,
      sync_group: 1,
      mark_thread_read: 1,
      text: baseBody === "" ? null : baseBody,
      initiating_source: 0,
      skip_url_preview_gen: 0,
      text_has_links: hasLinks(baseBody) ? 1 : 0,
      multitab_env: 0,
      metadata_dataclass: JSON.stringify({ media_accessibility_metadata: { alt_text: null } })
    };

    const mentionData = buildMentionData(m, baseBody);
    if (mentionData) payload0.mention_data = mentionData;

    if (m.sticker) {
      payload0.send_type = 2;
      payload0.sticker_id = m.sticker;
    }

    if (m.emoji) {
      const size = !isNaN(m.emojiSize) ? Number(m.emojiSize) : emojiSizes[m.emojiSize || "small"] || 1;
      payload0.send_type = 1;
      payload0.text = m.emoji;
      payload0.hot_emoji_size = Math.min(3, Math.max(1, size));
    }

    if (m.location && m.location.latitude != null && m.location.longitude != null) {
      payload0.send_type = 1;
      payload0.location_data = {
        coordinates: { latitude: m.location.latitude, longitude: m.location.longitude },
        is_current_location: !!m.location.current,
        is_live_location: !!m.location.live
      };
    }

    if (replyToMessage) {
      payload0.reply_metadata = { reply_source_id: replyToMessage, reply_source_type: 1, reply_type: 0 };
    }

    if (m.attachment) {
      payload0.send_type = 3;
      if (payload0.text === "") payload0.text = null;
      payload0.attachment_fbids = [];
      let list = m.attachment;
      if (getType(list) !== "Array") list = [list];
      const idsFromPairs = [];
      const streams = [];
      for (const it of list) {
        if (Array.isArray(it) && typeof it[0] === "string") {
          idsFromPairs.push(String(it[1]));
        } else if (isReadableStream(it)) {
          streams.push(it);
        }
      }
      if (idsFromPairs.length) payload0.attachment_fbids.push(...idsFromPairs);
      if (streams.length) {
        try {
          const files = await uploadAttachment(streams);
          for (const file of files) {
            const key = Object.keys(file)[0];
            payload0.attachment_fbids.push(file[key]);
          }
        } catch (err) {
          log.error("uploadAttachment", err);
          callback(err);
          throw err;
        }
      }
    }

    const content = {
      app_id: "2220391788200892",
      payload: {
        tasks: [
          {
            label: "46",
            payload: payload0,
            queue_name: String(threadID),
            task_id: 400,
            failure_count: null
          },
          {
            label: "21",
            payload: {
              thread_id: String(threadID),
              last_read_watermark_ts: Date.now(),
              sync_group: 1
            },
            queue_name: String(threadID),
            task_id: 401,
            failure_count: null
          }
        ],
        epoch_id: epoch,
        version_id: "24804310205905615",
        data_trace_id: "#" + Buffer.from(String(Math.random())).toString("base64").replace(/=+$/g, "")
      },
      request_id: reqID,
      type: 3
    };
    content.payload.tasks.forEach(t => (t.payload = JSON.stringify(t.payload)));
    content.payload = JSON.stringify(content.payload);
    return publishWithAck(content, baseBody, reqID, callback);
  };
};
