const fs = require("fs");
const path = require("path");
const logger = require("../../../func/logger");
const { parseAndCheckLogin } = require("../../utils/client");
const { formatID, getType } = require("../../utils/format");

function formatEventReminders(reminder) {
  return {
    reminderID: reminder?.id,
    eventCreatorID: reminder?.lightweight_event_creator?.id,
    time: reminder?.time,
    eventType: String(reminder?.lightweight_event_type || "").toLowerCase(),
    locationName: reminder?.location_name,
    locationCoordinates: reminder?.location_coordinates,
    locationPage: reminder?.location_page,
    eventStatus: String(reminder?.lightweight_event_status || "").toLowerCase(),
    note: reminder?.note,
    repeatMode: String(reminder?.repeat_mode || "").toLowerCase(),
    eventTitle: reminder?.event_title,
    triggerMessage: reminder?.trigger_message,
    secondsToNotifyBefore: reminder?.seconds_to_notify_before,
    allowsRsvp: reminder?.allows_rsvp,
    relatedEvent: reminder?.related_event,
    members: Array.isArray(reminder?.event_reminder_members?.edges) ? reminder.event_reminder_members.edges.map(m => ({
      memberID: m?.node?.id,
      state: String(m?.guest_list_state || "").toLowerCase(),
    })) : [],
  };
}

function formatThreadGraphQLResponse(data) {
  if (!data) return null;
  if (data?.errors) return null;
  const t = data.message_thread;
  if (!t) return null;
  const threadID = t?.thread_key?.thread_fbid || t?.thread_key?.other_user_id || null;
  const lastM = t?.last_message;
  const lastNode = Array.isArray(lastM?.nodes) && lastM.nodes[0] ? lastM.nodes[0] : null;
  const snippetID = lastNode?.message_sender?.messaging_actor?.id || null;
  const snippetText = lastNode?.snippet || null;
  const lastRNode = Array.isArray(t?.last_read_receipt?.nodes) && t.last_read_receipt.nodes[0] ? t.last_read_receipt.nodes[0] : null;
  const lastReadTimestamp = lastRNode?.timestamp_precise || null;
  const participants = Array.isArray(t?.all_participants?.edges) ? t.all_participants.edges : [];
  const approvals = Array.isArray(t?.group_approval_queue?.nodes) ? t.group_approval_queue.nodes : [];
  const customInfo = t?.customization_info || {};
  const bubble = customInfo?.outgoing_bubble_color;
  const participantCustoms = Array.isArray(customInfo?.participant_customizations) ? customInfo.participant_customizations : [];
  const nicknames = participantCustoms.reduce((res, val) => {
    if (val?.nickname && val?.participant_id) res[val.participant_id] = val.nickname;
    return res;
  }, {});
  return {
    threadID,
    threadName: t?.name || null,
    participantIDs: participants.map(d => d?.node?.messaging_actor?.id).filter(Boolean),
    userInfo: participants.map(d => ({
      id: d?.node?.messaging_actor?.id || null,
      name: d?.node?.messaging_actor?.name || null,
      firstName: d?.node?.messaging_actor?.short_name || null,
      vanity: d?.node?.messaging_actor?.username || null,
      url: d?.node?.messaging_actor?.url || null,
      thumbSrc: d?.node?.messaging_actor?.big_image_src?.uri || null,
      profileUrl: d?.node?.messaging_actor?.big_image_src?.uri || null,
      gender: d?.node?.messaging_actor?.gender || null,
      type: d?.node?.messaging_actor?.__typename || null,
      isFriend: !!d?.node?.messaging_actor?.is_viewer_friend,
      isBirthday: !!d?.node?.messaging_actor?.is_birthday,
    })),
    unreadCount: t?.unread_count ?? 0,
    messageCount: t?.messages_count ?? 0,
    timestamp: t?.updated_time_precise || null,
    muteUntil: t?.mute_until || null,
    isGroup: t?.thread_type === "GROUP",
    isSubscribed: !!t?.is_viewer_subscribed,
    isArchived: !!t?.has_viewer_archived,
    folder: t?.folder || null,
    cannotReplyReason: t?.cannot_reply_reason || null,
    eventReminders: Array.isArray(t?.event_reminders?.nodes) ? t.event_reminders.nodes.map(formatEventReminders) : [],
    emoji: customInfo?.emoji || null,
    color: bubble ? String(bubble).slice(2) : null,
    threadTheme: t?.thread_theme || null,
    nicknames,
    adminIDs: Array.isArray(t?.thread_admins) ? t.thread_admins : [],
    approvalMode: !!t?.approval_mode,
    approvalQueue: approvals.map(a => ({
      inviterID: a?.inviter?.id || null,
      requesterID: a?.requester?.id || null,
      timestamp: a?.request_timestamp || null,
      request_source: a?.request_source || null,
    })),
    reactionsMuteMode: String(t?.reactions_mute_mode || "").toLowerCase(),
    mentionsMuteMode: String(t?.mentions_mute_mode || "").toLowerCase(),
    isPinProtected: !!t?.is_pin_protected,
    relatedPageThread: t?.related_page_thread || null,
    name: t?.name || null,
    snippet: snippetText,
    snippetSender: snippetID,
    snippetAttachments: [],
    serverTimestamp: t?.updated_time_precise || null,
    imageSrc: t?.image?.uri || null,
    isCanonicalUser: !!t?.is_canonical_neo_user,
    isCanonical: t?.thread_type !== "GROUP",
    recipientsLoadable: true,
    hasEmailParticipant: false,
    readOnly: false,
    canReply: t?.cannot_reply_reason == null,
    lastMessageTimestamp: t?.last_message ? t.last_message.timestamp_precise : null,
    lastMessageType: "message",
    lastReadTimestamp,
    threadType: t?.thread_type === "GROUP" ? 2 : 1,
    inviteLink: {
      enable: t?.joinable_mode ? t.joinable_mode.mode == 1 : false,
      link: t?.joinable_mode ? t.joinable_mode.link : null,
    },
  };
}

const queue = [];
let isProcessingQueue = false;
const processingThreads = new Set();
const queuedThreads = new Set();
const cooldown = new Map();
const inflight = new Map();
let loopStarted = false;

module.exports = function (defaultFuncs, api, ctx) {
  const getMultiInfo = async function (threadIDs) {
    const buildQueries = () => {
      const form = {};
      threadIDs.forEach((x, y) => {
        form["o" + y] = {
          doc_id: "3449967031715030",
          query_params: {
            id: x,
            message_limit: 0,
            load_messages: false,
            load_read_receipts: false,
            before: null,
          },
        };
      });
      return {
        queries: JSON.stringify(form),
        batch_name: "MessengerGraphQLThreadFetcher",
      };
    };
    const maxAttempts = 3;
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const Submit = buildQueries();
        const resData = await defaultFuncs.post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, Submit).then(parseAndCheckLogin(ctx, defaultFuncs));
        if (!Array.isArray(resData) || resData.length === 0) throw new Error("EmptyGraphBatch");
        const tail = resData[resData.length - 1];
        if (tail?.error_results && tail.error_results !== 0) throw new Error("GraphErrorResults");
        const body = resData.slice(0, -1).sort((a, b) => Object.keys(a)[0].localeCompare(Object.keys(b)[0]));
        const out = [];
        body.forEach((x, y) => out.push(formatThreadGraphQLResponse(x["o" + y]?.data)));
        const valid = out.some(d => !!d && !!d.threadID);
        if (!valid) throw new Error("GraphNoData");
        return { Success: true, Data: out };
      } catch (e) {
        lastErr = e;
        if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 300 * attempt));
      }
    }
    return { Success: false, Data: null, Error: lastErr ? String(lastErr.message || lastErr) : "Unknown" };
  };

  const dbFiles = fs.readdirSync(path.join(__dirname, "../../database")).filter(f => path.extname(f) === ".js").reduce((acc, file) => {
    acc[path.basename(file, ".js")] = require(path.join(__dirname, "../../database", file))(api);
    return acc;
  }, {});
  const { threadData, userData } = dbFiles;
  const { create, get, update, getAll } = threadData;
  const { update: updateUser } = userData;

  function isValidThread(d) {
    return d && d.threadID;
  }

  async function upsertUsersFromThreadInfo(info) {
    try {
      if (!info || !Array.isArray(info.userInfo) || info.userInfo.length === 0) return;
      const tasks = info.userInfo.filter(u => u && u.id).map(u => {
        const data = {
          id: u.id,
          name: u.name || null,
          firstName: u.firstName || null,
          vanity: u.vanity || null,
          url: u.url || null,
          thumbSrc: u.thumbSrc || null,
          profileUrl: u.profileUrl || null,
          gender: u.gender || null,
          type: u.type || null,
          isFriend: !!u.isFriend,
          isBirthday: !!u.isBirthday,
        };
        return updateUser(u.id, { data });
      });
      await Promise.allSettled(tasks);
    } catch (e) {
      logger(`upsertUsers error: ${e?.message || e}`, "warn");
    }
  }

  async function createOrUpdateThread(id, data) {
    const existing = await get(id);
    if (existing) {
      await update(id, { data });
      return "update";
    } else {
      await create(id, { data });
      return "create";
    }
  }

  async function fetchThreadInfo(tID, isNew) {
    try {
      const response = await getMultiInfo([tID]);
      if (!response.Success || !response.Data || !isValidThread(response.Data[0])) {
        cooldown.set(tID, Date.now() + 5 * 60 * 1000);
        logger(`GraphQL empty for ${tID}, cooldown applied`, "warn");
        return;
      }
      const threadInfo = response.Data[0];
      await upsertUsersFromThreadInfo(threadInfo);
      const op = await createOrUpdateThread(tID, threadInfo);
      logger(`${op === "create" ? "Success create data thread" : "Success update data thread"}: ${tID}`, "info");
    } catch (err) {
      cooldown.set(tID, Date.now() + 5 * 60 * 1000);
      logger(`fetchThreadInfo error ${tID}: ${err?.message || err}`, "error");
    } finally {
      queuedThreads.delete(tID);
    }
  }

  async function checkAndUpdateThreads() {
    try {
      const allThreads = await getAll("threadID");
      const existingThreadIDs = new Set(allThreads.map(t => t.threadID));
      const now = Date.now();
      for (const t of existingThreadIDs) {
        const cd = cooldown.get(t);
        if (cd && now < cd) continue;
        const result = await get(t);
        if (!result) continue;
        const lastUpdated = new Date(result.updatedAt).getTime();
        if ((now - lastUpdated) / (1000 * 60) > 10 && !queuedThreads.has(t)) {
          queuedThreads.add(t);
          queue.push(() => fetchThreadInfo(t, false));
        }
      }
    } catch (err) {
      logger(`checkAndUpdateThreads error: ${err?.message || err}`, "error");
    }
  }

  async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;
    while (queue.length > 0) {
      const task = queue.shift();
      try {
        await task();
      } catch (err) {
        logger(`Queue processing error: ${err?.message || err}`, "error");
      }
    }
    isProcessingQueue = false;
  }

  if (!loopStarted) {
    loopStarted = true;
    setInterval(() => {
      checkAndUpdateThreads();
      processQueue();
    }, 10000);
  }

  return async function getThreadInfoGraphQL(threadID, callback) {
    let resolveFunc = function () { };
    let rejectFunc = function () { };
    const returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    if (getType(callback) != "Function" && getType(callback) != "AsyncFunction") {
      callback = function (err, data) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }
    if (getType(threadID) !== "Array") threadID = [threadID];
    const tid = String(threadID[0]);
    try {
      const cd = cooldown.get(tid);
      if (cd && Date.now() < cd) {
        const cachedCd = await get(tid);
        if (cachedCd?.data && isValidThread(cachedCd.data)) {
          await upsertUsersFromThreadInfo(cachedCd.data);
          callback(null, cachedCd.data);
          return returnPromise;
        }
        const stub = {
          threadID: tid,
          threadName: null,
          participantIDs: [],
          userInfo: [],
          unreadCount: 0,
          messageCount: 0,
          timestamp: null,
          muteUntil: null,
          isGroup: false,
          isSubscribed: false,
          isArchived: false,
          folder: null,
          cannotReplyReason: null,
          eventReminders: [],
          emoji: null,
          color: null,
          threadTheme: null,
          nicknames: {},
          adminIDs: [],
          approvalMode: false,
          approvalQueue: [],
          reactionsMuteMode: "",
          mentionsMuteMode: "",
          isPinProtected: false,
          relatedPageThread: null,
          name: null,
          snippet: null,
          snippetSender: null,
          snippetAttachments: [],
          serverTimestamp: null,
          imageSrc: null,
          isCanonicalUser: false,
          isCanonical: true,
          recipientsLoadable: false,
          hasEmailParticipant: false,
          readOnly: false,
          canReply: false,
          lastMessageTimestamp: null,
          lastMessageType: "message",
          lastReadTimestamp: null,
          threadType: 1,
          inviteLink: { enable: false, link: null },
          __status: "cooldown",
        };
        await createOrUpdateThread(tid, stub);
        callback(null, stub);
        return returnPromise;
      }

      const cached = await get(tid);
      if (cached?.data && isValidThread(cached.data)) {
        await upsertUsersFromThreadInfo(cached.data);
        callback(null, cached.data);
        return returnPromise;
      }

      if (inflight.has(tid)) {
        inflight.get(tid).then(data => callback(null, data)).catch(err => callback(err));
        return returnPromise;
      }

      const p = (async () => {
        processingThreads.add(tid);
        const response = await getMultiInfo([tid]);
        if (response.Success && response.Data && isValidThread(response.Data[0])) {
          const data = response.Data[0];
          await upsertUsersFromThreadInfo(data);
          await createOrUpdateThread(tid, data);
          return data;
        } else {
          const stub = {
            threadID: tid,
            threadName: null,
            participantIDs: [],
            userInfo: [],
            unreadCount: 0,
            messageCount: 0,
            timestamp: null,
            muteUntil: null,
            isGroup: false,
            isSubscribed: false,
            isArchived: false,
            folder: null,
            cannotReplyReason: null,
            eventReminders: [],
            emoji: null,
            color: null,
            threadTheme: null,
            nicknames: {},
            adminIDs: [],
            approvalMode: false,
            approvalQueue: [],
            reactionsMuteMode: "",
            mentionsMuteMode: "",
            isPinProtected: false,
            relatedPageThread: null,
            name: null,
            snippet: null,
            snippetSender: null,
            snippetAttachments: [],
            serverTimestamp: null,
            imageSrc: null,
            isCanonicalUser: false,
            isCanonical: true,
            recipientsLoadable: false,
            hasEmailParticipant: false,
            readOnly: false,
            canReply: false,
            lastMessageTimestamp: null,
            lastMessageType: "message",
            lastReadTimestamp: null,
            threadType: 1,
            inviteLink: { enable: false, link: null },
            __status: "unavailable",
          };
          cooldown.set(tid, Date.now() + 5 * 60 * 1000);
          await createOrUpdateThread(tid, stub);
          return stub;
        }
      })()
        .finally(() => {
          processingThreads.delete(tid);
          inflight.delete(tid);
        });

      inflight.set(tid, p);
      p.then(data => callback(null, data)).catch(err => callback(err));
    } catch (err) {
      callback(err);
    }
    return returnPromise;
  };
};
