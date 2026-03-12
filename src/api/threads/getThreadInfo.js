'use strict';

const { parseAndCheckLogin } = require('../../utils/client');
const log = require('../../../func/logAdapter');

function formatEventReminders(reminder) {
  return {
    reminderID: reminder.id,
    eventCreatorID: reminder.lightweight_event_creator?.id,
    time: reminder.time,
    eventType: reminder.lightweight_event_type?.toLowerCase(),
    locationName: reminder.location_name,
    locationCoordinates: reminder.location_coordinates,
    locationPage: reminder.location_page,
    eventStatus: reminder.lightweight_event_status?.toLowerCase(),
    note: reminder.note,
    repeatMode: reminder.repeat_mode?.toLowerCase(),
    eventTitle: reminder.event_title,
    triggerMessage: reminder.trigger_message,
    secondsToNotifyBefore: reminder.seconds_to_notify_before,
    allowsRsvp: reminder.allows_rsvp,
    relatedEvent: reminder.related_event,
    members: (reminder.event_reminder_members?.edges || []).map((member) => ({
      memberID: member.node.id,
      state: member.guest_list_state?.toLowerCase(),
    })),
  };
}

function formatThreadGraphQLResponse(data) {
  if (data.errors) {
    const details = data.errors.map(e => e.message || e).join(', ');
    throw new Error('GraphQL error in getThreadInfo: ' + details);
  }

  const messageThread = data.message_thread;
  if (!messageThread) {
    throw new Error('No message_thread in GraphQL response');
  }

  const threadID =
    messageThread.thread_key?.thread_fbid ||
    messageThread.thread_key?.other_user_id;

  const lastM = messageThread.last_message;
  const snippetID = lastM?.nodes?.[0]?.message_sender?.messaging_actor?.id || null;
  const snippetText = lastM?.nodes?.[0]?.snippet || null;
  const lastReadTimestamp = messageThread.last_read_receipt?.nodes?.[0]?.timestamp_precise || null;

  const participantEdges = messageThread.all_participants?.edges || [];

  return {
    threadID,
    threadName: messageThread.name || null,
    participantIDs: participantEdges.map(d => d?.node?.messaging_actor?.id).filter(Boolean),
    userInfo: participantEdges.map(d => ({
      id: d?.node?.messaging_actor?.id,
      name: d?.node?.messaging_actor?.name,
      firstName: d?.node?.messaging_actor?.short_name,
      vanity: d?.node?.messaging_actor?.username,
      url: d?.node?.messaging_actor?.url,
      thumbSrc: d?.node?.messaging_actor?.big_image_src?.uri || null,
      profileUrl: d?.node?.messaging_actor?.big_image_src?.uri || null,
      gender: d?.node?.messaging_actor?.gender,
      type: d?.node?.messaging_actor?.__typename,
      isFriend: !!d?.node?.messaging_actor?.is_viewer_friend,
      isBirthday: !!d?.node?.messaging_actor?.is_birthday,
    })).filter(u => u.id),
    unreadCount: messageThread.unread_count,
    messageCount: messageThread.messages_count,
    timestamp: messageThread.updated_time_precise,
    muteUntil: messageThread.mute_until,
    isGroup: messageThread.thread_type === 'GROUP',
    isSubscribed: messageThread.is_viewer_subscribed,
    isArchived: messageThread.has_viewer_archived,
    folder: messageThread.folder,
    cannotReplyReason: messageThread.cannot_reply_reason,
    eventReminders: messageThread.event_reminders
      ? messageThread.event_reminders.nodes.map(formatEventReminders)
      : null,
    emoji: messageThread.customization_info?.emoji || null,
    color: messageThread.customization_info?.outgoing_bubble_color
      ? messageThread.customization_info.outgoing_bubble_color.slice(2)
      : null,
    threadTheme: messageThread.thread_theme,
    nicknames:
      messageThread.customization_info?.participant_customizations?.reduce(
        (res, val) => { if (val.nickname) res[val.participant_id] = val.nickname; return res; },
        {}
      ) || {},
    adminIDs: messageThread.thread_admins || [],
    approvalMode: Number(messageThread.approval_mode) === 1,
    approvalQueue:
      messageThread.group_approval_queue?.nodes?.map(a => ({
        inviterID: a.inviter?.id,
        requesterID: a.requester?.id,
        timestamp: a.request_timestamp,
        request_source: a.request_source,
      })) || [],
    reactionsMuteMode: messageThread.reactions_mute_mode?.toLowerCase() || null,
    mentionsMuteMode: messageThread.mentions_mute_mode?.toLowerCase() || null,
    isPinProtected: !!messageThread.is_pin_protected,
    relatedPageThread: messageThread.related_page_thread,
    name: messageThread.name || null,
    snippet: snippetText,
    snippetSender: snippetID,
    snippetAttachments: [],
    serverTimestamp: messageThread.updated_time_precise,
    imageSrc: messageThread.image?.uri || null,
    isCanonicalUser: messageThread.is_canonical_neo_user,
    isCanonical: messageThread.thread_type !== 'GROUP',
    recipientsLoadable: true,
    hasEmailParticipant: false,
    readOnly: false,
    canReply: messageThread.cannot_reply_reason == null,
    lastMessageTimestamp: messageThread.last_message?.timestamp_precise || null,
    lastMessageType: 'message',
    lastReadTimestamp,
    threadType: messageThread.thread_type === 'GROUP' ? 2 : 1,
    inviteLink: {
      enable: messageThread.joinable_mode?.mode === 1,
      link: messageThread.joinable_mode?.link || null,
    },
  };
}

module.exports = function (defaultFuncs, api, ctx) {
  return function getThreadInfo(threadID, callback) {
    let resolveFunc;
    let rejectFunc;

    const returnPromise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (typeof callback !== 'function') {
      callback = (err, data) => {
        if (err) return rejectFunc(err);
        return resolveFunc(data);
      };
    }

    const threadIDs = Array.isArray(threadID) ? threadID.map(String) : [String(threadID)];

    const fetchFromGraphQL = async ids => {
      if (!ids.length) return {};
      const queries = {};
      ids.forEach((t, i) => {
        queries['o' + i] = {
          doc_id: '3449967031715030',
          query_params: {
            id: t,
            message_limit: 0,
            load_messages: false,
            load_read_receipts: false,
            before: null
          }
        };
      });

      const form = {
        queries: JSON.stringify(queries),
        batch_name: 'MessengerGraphQLThreadFetcher'
      };

      const resData = await defaultFuncs
        .post('https://www.facebook.com/api/graphqlbatch/', ctx.jar, form)
        .then(parseAndCheckLogin(ctx, defaultFuncs));

      if (resData.error) throw resData;

      const out = {};
      for (let i = resData.length - 2; i >= 0; i--) {
        const res = resData[i];
        const oKey = Object.keys(res)[0];
        const responseData = res[oKey];
        try {
          const info = formatThreadGraphQLResponse(responseData.data);
          if (info && info.threadID) out[info.threadID] = info;
        } catch (e) {
          log.error('getThreadInfoGraphQL', e && e.message ? e.message : String(e));
        }
      }
      return out;
    };

    (async () => {
      try {
        const fetched = await fetchFromGraphQL(threadIDs);
        const resultMap = {};
        for (const id of threadIDs) resultMap[id] = fetched[id] || null;
        const result = Array.isArray(threadID) ? resultMap : (resultMap[threadIDs[0]] || null);
        return callback(null, result);
      } catch (err) {
        log.error('getThreadInfoGraphQL', 'Error fetching thread info: ' + (err.message || err));
        return callback(err);
      }
    })();

    return returnPromise;
  };
};
