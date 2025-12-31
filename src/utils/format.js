"use strict";
var url = require("url");
const querystring = require("querystring");

function getType(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

function generateOfflineThreadingID() {
  var ret = Date.now();
  var value = Math.floor(Math.random() * 4294967295);
  var str = ("0000000000000000000000" + value.toString(2)).slice(-22);
  var msgs = ret.toString(2) + str;
  return binaryToDecimal(msgs);
}
var h;
var i = {};
var j = {
  _: "%",
  A: "%2",
  B: "000",
  C: "%7d",
  D: "%7b%22",
  E: "%2c%22",
  F: "%22%3a",
  G: "%2c%22ut%22%3a1",
  H: "%2c%22bls%22%3a",
  I: "%2c%22n%22%3a%22%",
  J: "%22%3a%7b%22i%22%3a0%7d",
  K: "%2c%22pt%22%3a0%2c%22vis%22%3a",
  L: "%2c%22ch%22%3a%7b%22h%22%3a%22",
  M: "%7b%22v%22%3a2%2c%22time%22%3a1",
  N: ".channel%22%2c%22sub%22%3a%5b",
  O: "%2c%22sb%22%3a1%2c%22t%22%3a%5b",
  P: "%2c%22ud%22%3a100%2c%22lc%22%3a0",
  Q: "%5d%2c%22f%22%3anull%2c%22uct%22%3a",
  R: ".channel%22%2c%22sub%22%3a%5b1%5d",
  S: "%22%2c%22m%22%3a0%7d%2c%7b%22i%22%3a",
  T: "%2c%22blc%22%3a1%2c%22snd%22%3a1%2c%22ct%22%3a",
  U: "%2c%22blc%22%3a0%2c%22snd%22%3a1%2c%22ct%22%3a",
  V: "%2c%22blc%22%3a0%2c%22snd%22%3a0%2c%22ct%22%3a",
  W: "%2c%22s%22%3a0%2c%22blo%22%3a0%7d%2c%22bl%22%3a%7b%22ac%22%3a",
  X: "%2c%22ri%22%3a0%7d%2c%22state%22%3a%7b%22p%22%3a0%2c%22ut%22%3a1",
  Y:
    "%2c%22pt%22%3a0%2c%22vis%22%3a1%2c%22bls%22%3a0%2c%22blc%22%3a0%2c%22snd%22%3a1%2c%22ct%22%3a",
  Z:
    "%2c%22sb%22%3a1%2c%22t%22%3a%5b%5d%2c%22f%22%3anull%2c%22uct%22%3a0%2c%22s%22%3a0%2c%22blo%22%3a0%7d%2c%22bl%22%3a%7b%22ac%22%3a"
};
(function () {
  var l = [];
  for (var m in j) {
    i[j[m]] = m;
    l.push(j[m]);
  }
  l.reverse();
  h = new RegExp(l.join("|"), "g");
})();

function getAdminTextMessageType(m) {
  switch (m.type) {
    case "joinable_group_link_mode_change":
      return "log:link-status";
    case "magic_words":
      return "log:magic-words";
    case "change_thread_theme":
      return "log:thread-color";
    case "change_thread_icon":
    case "change_thread_quick_reaction":
      return "log:thread-icon";
    case "change_thread_nickname":
      return "log:user-nickname";
    case "change_thread_admins":
      return "log:thread-admins";
    case "group_poll":
      return "log:thread-poll";
    case "change_thread_approval_mode":
      return "log:thread-approval-mode";
    case "messenger_call_log":
    case "participant_joined_group_call":
      return "log:thread-call";
    case "pin_messages_v2":
      return "log:thread-pinned";
    case "unpin_messages_v2":
      return "log:unpin-message";
    default:
      return m.type;
  }
}

function formatDeltaEvent(m) {
  var logMessageType;
  var logMessageData;
  switch (m.class) {
    case "AdminTextMessage":
      logMessageType = getAdminTextMessageType(m);
      logMessageData = m.untypedData;
      break;
    case "ThreadName":
      logMessageType = "log:thread-name";
      logMessageData = { name: m.name };
      break;
    case "ParticipantsAddedToGroupThread":
      logMessageType = "log:subscribe";
      logMessageData = { addedParticipants: m.addedParticipants };
      break;
    case "ParticipantLeftGroupThread":
      logMessageType = "log:unsubscribe";
      logMessageData = { leftParticipantFbId: m.leftParticipantFbId };
      break;
    case "UserLocation": {
      logMessageType = "log:user-location";
      logMessageData = {
        Image:
          m.attachments[0].mercury.extensible_attachment.story_attachment.media
            .image,
        Location:
          m.attachments[0].mercury.extensible_attachment.story_attachment.target
            .location_title,
        coordinates:
          m.attachments[0].mercury.extensible_attachment.story_attachment.target
            .coordinate,
        url: m.attachments[0].mercury.extensible_attachment.story_attachment.url
      };
    }
    case "ApprovalQueue":
      logMessageType = "log:approval-queue";
      logMessageData = {
        approvalQueue: {
          action: m.action,
          recipientFbId: m.recipientFbId,
          requestSource: m.requestSource,
          ...m.messageMetadata
        }
      };
  }
  return {
    type: "event",
    threadID: formatID(
      (
        m.messageMetadata.threadKey.threadFbId ||
        m.messageMetadata.threadKey.otherUserFbId
      ).toString()
    ),
    logMessageType: logMessageType,
    logMessageData: logMessageData,
    logMessageBody: m.messageMetadata.adminText,
    author: m.messageMetadata.actorFbId,
    participantIDs: (m?.participants || []).map(e => e.toString())
  };
}


function _formatAttachment(attachment1, attachment2) {
  attachment2 = attachment2 || { id: "", image_data: {} };
  attachment1 = attachment1.mercury ? attachment1.mercury : attachment1;
  var blob = attachment1.blob_attachment;
  var type =
    blob && blob.__typename ? blob.__typename : attachment1.attach_type;
  if (!type && attachment1.sticker_attachment) {
    type = "StickerAttachment";
    blob = attachment1.sticker_attachment;
  } else if (!type && attachment1.extensible_attachment) {
    if (
      attachment1.extensible_attachment.story_attachment &&
      attachment1.extensible_attachment.story_attachment.target &&
      attachment1.extensible_attachment.story_attachment.target.__typename &&
      attachment1.extensible_attachment.story_attachment.target.__typename ===
      "MessageLocation"
    )
      type = "MessageLocation";
    else type = "ExtensibleAttachment";

    blob = attachment1.extensible_attachment;
  }
  switch (type) {
    case "sticker":
      return {
        type: "sticker",
        ID: attachment1.metadata.stickerID.toString(),
        url: attachment1.url,

        packID: attachment1.metadata.packID.toString(),
        spriteUrl: attachment1.metadata.spriteURI,
        spriteUrl2x: attachment1.metadata.spriteURI2x,
        width: attachment1.metadata.width,
        height: attachment1.metadata.height,

        caption: attachment2.caption,
        description: attachment2.description,

        frameCount: attachment1.metadata.frameCount,
        frameRate: attachment1.metadata.frameRate,
        framesPerRow: attachment1.metadata.framesPerRow,
        framesPerCol: attachment1.metadata.framesPerCol,

        stickerID: attachment1.metadata.stickerID.toString(), // @Legacy
        spriteURI: attachment1.metadata.spriteURI, // @Legacy
        spriteURI2x: attachment1.metadata.spriteURI2x // @Legacy
      };
    case "file":
      return {
        type: "file",
        filename: attachment1.name,
        ID: attachment2.id.toString(),
        url: attachment1.url,

        isMalicious: attachment2.is_malicious,
        contentType: attachment2.mime_type,

        name: attachment1.name, // @Legacy
        mimeType: attachment2.mime_type, // @Legacy
        fileSize: attachment2.file_size // @Legacy
      };
    case "photo":
      return {
        type: "photo",
        ID: attachment1.metadata.fbid.toString(),
        filename: attachment1.fileName,
        thumbnailUrl: attachment1.thumbnail_url,

        previewUrl: attachment1.preview_url,
        previewWidth: attachment1.preview_width,
        previewHeight: attachment1.preview_height,

        largePreviewUrl: attachment1.large_preview_url,
        largePreviewWidth: attachment1.large_preview_width,
        largePreviewHeight: attachment1.large_preview_height,

        url: attachment1.metadata.url, // @Legacy
        width: attachment1.metadata.dimensions.split(",")[0], // @Legacy
        height: attachment1.metadata.dimensions.split(",")[1], // @Legacy
        name: attachment1.fileName // @Legacy
      };
    case "animated_image":
      return {
        type: "animated_image",
        ID: attachment2.id.toString(),
        filename: attachment2.filename,

        previewUrl: attachment1.preview_url,
        previewWidth: attachment1.preview_width,
        previewHeight: attachment1.preview_height,

        url: attachment2.image_data.url,
        width: attachment2.image_data.width,
        height: attachment2.image_data.height,

        name: attachment1.name, // @Legacy
        facebookUrl: attachment1.url, // @Legacy
        thumbnailUrl: attachment1.thumbnail_url, // @Legacy
        mimeType: attachment2.mime_type, // @Legacy
        rawGifImage: attachment2.image_data.raw_gif_image, // @Legacy
        rawWebpImage: attachment2.image_data.raw_webp_image, // @Legacy
        animatedGifUrl: attachment2.image_data.animated_gif_url, // @Legacy
        animatedGifPreviewUrl: attachment2.image_data.animated_gif_preview_url, // @Legacy
        animatedWebpUrl: attachment2.image_data.animated_webp_url, // @Legacy
        animatedWebpPreviewUrl: attachment2.image_data.animated_webp_preview_url // @Legacy
      };
    case "share":
      return {
        type: "share",
        ID: attachment1.share.share_id.toString(),
        url: attachment2.href,

        title: attachment1.share.title,
        description: attachment1.share.description,
        source: attachment1.share.source,

        image: attachment1.share.media.image,
        width: attachment1.share.media.image_size.width,
        height: attachment1.share.media.image_size.height,
        playable: attachment1.share.media.playable,
        duration: attachment1.share.media.duration,

        subattachments: attachment1.share.subattachments,
        properties: {},

        animatedImageSize: attachment1.share.media.animated_image_size, // @Legacy
        facebookUrl: attachment1.share.uri, // @Legacy
        target: attachment1.share.target, // @Legacy
        styleList: attachment1.share.style_list // @Legacy
      };
    case "video":
      return {
        type: "video",
        ID: attachment1.metadata.fbid.toString(),
        filename: attachment1.name,

        previewUrl: attachment1.preview_url,
        previewWidth: attachment1.preview_width,
        previewHeight: attachment1.preview_height,

        url: attachment1.url,
        width: attachment1.metadata.dimensions.width,
        height: attachment1.metadata.dimensions.height,

        duration: attachment1.metadata.duration,
        videoType: "unknown",

        thumbnailUrl: attachment1.thumbnail_url // @Legacy
      };
    case "error":
      return {
        type: "error",
        attachment1: attachment1,
        attachment2: attachment2
      };
    case "MessageImage":
      return {
        type: "photo",
        ID: blob.legacy_attachment_id,
        filename: blob.filename,
        thumbnailUrl: blob.thumbnail.uri,

        previewUrl: blob.preview.uri,
        previewWidth: blob.preview.width,
        previewHeight: blob.preview.height,

        largePreviewUrl: blob.large_preview.uri,
        largePreviewWidth: blob.large_preview.width,
        largePreviewHeight: blob.large_preview.height,

        url: blob.large_preview.uri, // @Legacy
        width: blob.original_dimensions.x, // @Legacy
        height: blob.original_dimensions.y, // @Legacy
        name: blob.filename // @Legacy
      };
    case "MessageAnimatedImage":
      return {
        type: "animated_image",
        ID: blob.legacy_attachment_id,
        filename: blob.filename,

        previewUrl: blob.preview_image.uri,
        previewWidth: blob.preview_image.width,
        previewHeight: blob.preview_image.height,

        url: blob.animated_image.uri,
        width: blob.animated_image.width,
        height: blob.animated_image.height,

        thumbnailUrl: blob.preview_image.uri, // @Legacy
        name: blob.filename, // @Legacy
        facebookUrl: blob.animated_image.uri, // @Legacy
        rawGifImage: blob.animated_image.uri, // @Legacy
        animatedGifUrl: blob.animated_image.uri, // @Legacy
        animatedGifPreviewUrl: blob.preview_image.uri, // @Legacy
        animatedWebpUrl: blob.animated_image.uri, // @Legacy
        animatedWebpPreviewUrl: blob.preview_image.uri // @Legacy
      };
    case "MessageVideo":
      return {
        type: "video",
        filename: blob.filename,
        ID: blob.legacy_attachment_id,

        previewUrl: blob.large_image.uri,
        previewWidth: blob.large_image.width,
        previewHeight: blob.large_image.height,

        url: blob.playable_url,
        width: blob.original_dimensions.x,
        height: blob.original_dimensions.y,

        duration: blob.playable_duration_in_ms,
        videoType: blob.video_type.toLowerCase(),

        thumbnailUrl: blob.large_image.uri // @Legacy
      };
    case "MessageAudio":
      return {
        type: "audio",
        filename: blob.filename,
        ID: blob.url_shimhash,

        audioType: blob.audio_type,
        duration: blob.playable_duration_in_ms,
        url: blob.playable_url,

        isVoiceMail: blob.is_voicemail
      };
    case "StickerAttachment":
      return {
        type: "sticker",
        ID: blob.id,
        url: blob.url,

        packID: blob.pack ? blob.pack.id : null,
        spriteUrl: blob.sprite_image,
        spriteUrl2x: blob.sprite_image_2x,
        width: blob.width,
        height: blob.height,

        caption: blob.label,
        description: blob.label,

        frameCount: blob.frame_count,
        frameRate: blob.frame_rate,
        framesPerRow: blob.frames_per_row,
        framesPerCol: blob.frames_per_column,

        stickerID: blob.id, // @Legacy
        spriteURI: blob.sprite_image, // @Legacy
        spriteURI2x: blob.sprite_image_2x // @Legacy
      };
    case "MessageLocation":
      var urlAttach = blob.story_attachment.url;
      var mediaAttach = blob.story_attachment.media;

      var u = querystring.parse(url.parse(urlAttach).query).u;
      var where1 = querystring.parse(url.parse(u).query).where1;
      var address = where1.split(", ");

      var latitude;
      var longitude;

      try {
        latitude = Number.parseFloat(address[0]);
        longitude = Number.parseFloat(address[1]);
      } catch (err) {
        /* empty */
      }

      var imageUrl;
      var width;
      var height;

      if (mediaAttach && mediaAttach.image) {
        imageUrl = mediaAttach.image.uri;
        width = mediaAttach.image.width;
        height = mediaAttach.image.height;
      }

      return {
        type: "location",
        ID: blob.legacy_attachment_id,
        latitude: latitude,
        longitude: longitude,
        image: imageUrl,
        width: width,
        height: height,
        url: u || urlAttach,
        address: where1,

        facebookUrl: blob.story_attachment.url, // @Legacy
        target: blob.story_attachment.target, // @Legacy
        styleList: blob.story_attachment.style_list // @Legacy
      };
    case "ExtensibleAttachment":
      return {
        type: "share",
        ID: blob.legacy_attachment_id,
        url: blob.story_attachment.url,

        title: blob.story_attachment.title_with_entities.text,
        description:
          blob.story_attachment.description &&
          blob.story_attachment.description.text,
        source: blob.story_attachment.source
          ? blob.story_attachment.source.text
          : null,

        image:
          blob.story_attachment.media &&
          blob.story_attachment.media.image &&
          blob.story_attachment.media.image.uri,
        width:
          blob.story_attachment.media &&
          blob.story_attachment.media.image &&
          blob.story_attachment.media.image.width,
        height:
          blob.story_attachment.media &&
          blob.story_attachment.media.image &&
          blob.story_attachment.media.image.height,
        playable:
          blob.story_attachment.media &&
          blob.story_attachment.media.is_playable,
        duration:
          blob.story_attachment.media &&
          blob.story_attachment.media.playable_duration_in_ms,
        playableUrl:
          blob.story_attachment.media == null
            ? null
            : blob.story_attachment.media.playable_url,

        subattachments: blob.story_attachment.subattachments,
        properties: blob.story_attachment.properties.reduce(function (
          /** @type {{ [x: string]: any; }} */ obj,
          /** @type {{ key: string | number; value: { text: any; }; }} */ cur
        ) {
          obj[cur.key] = cur.value.text;
          return obj;
        },
          {}),

        facebookUrl: blob.story_attachment.url, // @Legacy
        target: blob.story_attachment.target, // @Legacy
        styleList: blob.story_attachment.style_list // @Legacy
      };
    case "MessageFile":
      return {
        type: "file",
        filename: blob.filename,
        ID: blob.message_file_fbid,

        url: blob.url,
        isMalicious: blob.is_malicious,
        contentType: blob.content_type,

        name: blob.filename,
        mimeType: "",
        fileSize: -1
      };
    default:
      throw new Error(
        "unrecognized attach_file of type " +
        type +
        "`" +
        JSON.stringify(attachment1, null, 4) +
        " attachment2: " +
        JSON.stringify(attachment2, null, 4) +
        "`"
      );
  }
}

function formatAttachment(attachments, attachmentIds, attachmentMap, shareMap) {
  attachmentMap = shareMap || attachmentMap;
  return attachments
    ? attachments.map(function (i) {
      if (
        !attachmentMap ||
        !attachmentIds ||
        !attachmentMap[attachmentIds[i]]
      ) {
        return _formatAttachment(val);
      }
      return _formatAttachment(val, attachmentMap[attachmentIds[i]]);
    })
    : [];
}

function formatDeltaMessage(m) {
  var md = m.messageMetadata;
  var mdata =
    m.data === undefined
      ? []
      : m.data.prng === undefined
        ? []
        : JSON.parse(m.data.prng);
  var m_id = mdata.map((/** @type {{ i: any; }} */ u) => u.i);
  var m_offset = mdata.map((/** @type {{ o: any; }} */ u) => u.o);
  var m_length = mdata.map((/** @type {{ l: any; }} */ u) => u.l);
  var mentions = {};
  var body = m.body || "";
  var args = body == "" ? [] : body.trim().split(/\s+/);
  for (var i = 0; i < m_id.length; i++)
    mentions[m_id[i]] = m.body.substring(
      m_offset[i],
      m_offset[i] + m_length[i]
    );
  return {
    type: "message",
    senderID: formatID(md.actorFbId.toString()),
    threadID: formatID(
      (md.threadKey.threadFbId || md.threadKey.otherUserFbId).toString()
    ),
    messageID: md.messageId,
    args: args,
    body: body,
    attachments: (m.attachments || []).map((/** @type {any} */ v) =>
      _formatAttachment(v)
    ),
    mentions: mentions,
    timestamp: md.timestamp,
    isGroup: !!md.threadKey.threadFbId,
    participantIDs: (m.participants || []).map((/** @type {any} */ p) => formatID(p.toString())),
    isUnread: md.isUnread !== undefined ? md.isUnread : false
  };
}

function formatID(id) {
  if (id != undefined && id != null) return id.replace(/(fb)?id[:.]/, "");
  else return id;
}

function formatMessage(m) {
  var originalMessage = m.message ? m.message : m;
  var body = originalMessage.body || "";
  var args = body == "" ? [] : body.trim().split(/\s+/);
  var obj = {
    type: "message",
    senderName: originalMessage.sender_name,
    senderID: formatID(originalMessage.sender_fbid.toString()),
    participantNames: originalMessage.group_thread_info
      ? originalMessage.group_thread_info.participant_names
      : [originalMessage.sender_name.split(" ")[0]],
    participantIDs: originalMessage.group_thread_info
      ? originalMessage.group_thread_info.participant_ids.map(function (v) {
        return formatID(v.toString());
      })
      : [formatID(originalMessage.sender_fbid)],
    body: body,
    args: args,
    threadID: formatID(
      (
        originalMessage.thread_fbid || originalMessage.other_user_fbid
      ).toString()
    ),
    threadName: originalMessage.group_thread_info
      ? originalMessage.group_thread_info.name
      : originalMessage.sender_name,
    location: originalMessage.coordinates ? originalMessage.coordinates : null,
    messageID: originalMessage.mid
      ? originalMessage.mid.toString()
      : originalMessage.message_id,
    attachments: formatAttachment(
      originalMessage.attachments,
      originalMessage.attachmentIds,
      originalMessage.attachment_map,
      originalMessage.share_map
    ),
    timestamp: originalMessage.timestamp,
    timestampAbsolute: originalMessage.timestamp_absolute,
    timestampRelative: originalMessage.timestamp_relative,
    timestampDatetime: originalMessage.timestamp_datetime,
    tags: originalMessage.tags,
    reactions: originalMessage.reactions ? originalMessage.reactions : [],
    isUnread: originalMessage.is_unread
  };
  if (m.type === "pages_messaging")
    obj.pageID = m.realtime_viewer_fbid.toString();
  obj.isGroup = obj.participantIDs.length > 2;
  return obj;
}

function formatEvent(m) {
  var originalMessage = m.message ? m.message : m;
  var logMessageType = originalMessage.log_message_type;
  var logMessageData;
  if (logMessageType === "log:generic-admin-text") {
    logMessageData = originalMessage.log_message_data.untypedData;
    logMessageType = getAdminTextMessageType(
      originalMessage.log_message_data.message_type
    );
  } else logMessageData = originalMessage.log_message_data;
  return Object.assign(formatMessage(originalMessage), {
    type: "event",
    logMessageType: logMessageType,
    logMessageData: logMessageData,
    logMessageBody: originalMessage.log_message_body
  });
}

function formatHistoryMessage(m) {
  switch (m.action_type) {
    case "ma-type:log-message":
      return formatEvent(m);
    default:
      return formatMessage(m);
  }
}

function formatDeltaReadReceipt(delta) {
  return {
    reader: (delta.threadKey.otherUserFbId || delta.actorFbId).toString(),
    time: delta.actionTimestampMs,
    threadID: formatID(
      (delta.threadKey.otherUserFbId || delta.threadKey.threadFbId).toString()
    ),
    type: "read_receipt"
  };
}

function decodeClientPayload(payload) {
  function Utf8ArrayToStr(array) {
    var out, i, len, c;
    var char2, char3;
    out = "";
    len = array.length;
    i = 0;
    while (i < len) {
      c = array[i++];
      switch (c >> 4) {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
          out += String.fromCharCode(c);
          break;
        case 12:
        case 13:
          char2 = array[i++];
          out += String.fromCharCode(((c & 0x1f) << 6) | (char2 & 0x3f));
          break;
        case 14:
          char2 = array[i++];
          char3 = array[i++];
          out += String.fromCharCode(
            ((c & 0x0f) << 12) | ((char2 & 0x3f) << 6) | ((char3 & 0x3f) << 0)
          );
          break;
      }
    }
    return out;
  }
  return JSON.parse(Utf8ArrayToStr(payload));
}

function formatTyp(event) {
  return {
    isTyping: !!event.st,
    from: event.from.toString(),
    threadID: formatID(
      (event.to || event.thread_fbid || event.from).toString()
    ),
    fromMobile: event.hasOwnProperty("from_mobile") ? event.from_mobile : true,
    userID: (event.realtime_viewer_fbid || event.from).toString(),
    type: "typ"
  };
}


function formatThread(data) {
  return {
    threadID: formatID(data.thread_fbid.toString()),
    participants: data.participants.map(formatID),
    participantIDs: data.participants.map(formatID),
    name: data.name,
    nicknames: data.custom_nickname,
    snippet: data.snippet,
    snippetAttachments: data.snippet_attachments,
    snippetSender: formatID((data.snippet_sender || "").toString()),
    unreadCount: data.unread_count,
    messageCount: data.message_count,
    imageSrc: data.image_src,
    timestamp: data.timestamp,
    muteUntil: data.mute_until,
    isCanonicalUser: data.is_canonical_user,
    isCanonical: data.is_canonical,
    isSubscribed: data.is_subscribed,
    folder: data.folder,
    isArchived: data.is_archived,
    recipientsLoadable: data.recipients_loadable,
    hasEmailParticipant: data.has_email_participant,
    readOnly: data.read_only,
    canReply: data.can_reply,
    cannotReplyReason: data.cannot_reply_reason,
    lastMessageTimestamp: data.last_message_timestamp,
    lastReadTimestamp: data.last_read_timestamp,
    lastMessageType: data.last_message_type,
    emoji: data.custom_like_icon,
    color: data.custom_color,
    adminIDs: data.admin_ids,
    threadType: data.thread_type
  };
}

function generateThreadingID(clientID) {
  var k = Date.now();
  var l = Math.floor(Math.random() * 4294967295);
  var m = clientID;
  return "<" + k + ":" + l + "-" + m + "@mail.projektitan.com>";
}

function padZeros(val, len) {
  val = String(val);
  len = len || 2;
  while (val.length < len) val = "0" + val;
  return val;
}

function binaryToDecimal(data) {
  var ret = "";
  while (data !== "0") {
    var end = 0;
    var fullName = "";
    var i = 0;
    for (; i < data.length; i++) {
      end = 2 * end + parseInt(data[i], 10);
      if (end >= 10) {
        fullName += "1";
        end -= 10;
      } else fullName += "0";
    }
    ret = end.toString() + ret;
    data = fullName.slice(fullName.indexOf("1"));
  }
  return ret;
}

function presenceEncode(str) {
  return encodeURIComponent(str)
    .replace(/([_A-Z])|%../g, function (m, n) {
      return n ? "%" + n.charCodeAt(0).toString(16) : m;
    })
    .toLowerCase()
    .replace(h, function (m) {
      return i[m];
    });
}

function presenceDecode(str) {
  return decodeURIComponent(
    str.replace(/[_A-Z]/g, function (/** @type {string | number} */ m) {
      return j[m];
    })
  );
}

function generatePresence(userID) {
  var time = Date.now();
  return (
    "E" +
    presenceEncode(
      JSON.stringify({
        v: 3,
        time: parseInt(time / 1000, 10),
        user: userID,
        state: {
          ut: 0,
          t2: [],
          lm2: null,
          uct2: time,
          tr: null,
          tw: Math.floor(Math.random() * 4294967295) + 1,
          at: time
        },
        ch: {
          ["p_" + userID]: 0
        }
      })
    )
  );
}

function generateAccessiblityCookie() {
  var time = Date.now();
  return encodeURIComponent(
    JSON.stringify({
      sr: 0,
      "sr-ts": time,
      jk: 0,
      "jk-ts": time,
      kb: 0,
      "kb-ts": time,
      hcm: 0,
      "hcm-ts": time
    })
  );
}

function getGUID() {
  var sectionLength = Date.now();
  var id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = Math.floor((sectionLength + Math.random() * 16) % 16);
    sectionLength = Math.floor(sectionLength / 16);
    var _guid = (c == "x" ? r : (r & 7) | 8).toString(16);
    return _guid;
  });
  return id;
}

function formatDeltaReadReceipt(delta) {
  return {
    reader: (delta.threadKey.otherUserFbId || delta.actorFbId).toString(),
    time: delta.actionTimestampMs,
    threadID: formatID(
      (delta.threadKey.otherUserFbId || delta.threadKey.threadFbId).toString()
    ),
    type: "read_receipt"
  };
}

function formatReadReceipt(event) {
  return {
    reader: event.reader.toString(),
    time: event.time,
    threadID: formatID((event.thread_fbid || event.reader).toString()),
    type: "read_receipt"
  };
}

function formatRead(event) {
  return {
    threadID: formatID(
      (
        (event.chat_ids && event.chat_ids[0]) ||
        (event.thread_fbids && event.thread_fbids[0])
      ).toString()
    ),
    time: event.timestamp,
    type: "read"
  };
}

function arrToForm(form) {
  return arrayToObject(
    form,
    function (v) {
      return v.name;
    },
    function (v) {
      return v.val;
    }
  );
}

function arrayToObject(arr, getKey, getValue) {
  return arr.reduce(function (acc, val) {
    acc[getKey(val)] = getValue(val);
    return acc;
  }, {});
}

function getSignatureID() {
  return Math.floor(Math.random() * 2147483648).toString(16);
}

function generateTimestampRelative() {
  var d = new Date();
  return d.getHours() + ":" + padZeros(d.getMinutes());
}

var NUM_TO_MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
var NUM_TO_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(date) {
  var d = date.getUTCDate();
  d = d >= 10 ? d : "0" + d;
  var h = date.getUTCHours();
  h = h >= 10 ? h : "0" + h;
  var m = date.getUTCMinutes();
  m = m >= 10 ? m : "0" + m;
  var s = date.getUTCSeconds();
  s = s >= 10 ? s : "0" + s;
  return (
    NUM_TO_DAY[date.getUTCDay()] +
    ", " +
    d +
    " " +
    NUM_TO_MONTH[date.getUTCMonth()] +
    " " +
    date.getUTCFullYear() +
    " " +
    h +
    ":" +
    m +
    ":" +
    s +
    " GMT"
  );
}

function formatCookie(arr, url) {
  return (
    arr[0] + "=" + arr[1] + "; Path=" + arr[3] + "; Domain=" + url + ".com"
  );
}

function formatProxyPresence(presence, userID) {
  if (presence.lat === undefined || presence.p === undefined) return null;
  return {
    type: "presence",
    timestamp: presence.lat * 1000,
    userID: userID || "",
    statuses: presence.p
  };
}

function formatPresence(presence, userID) {
  return {
    type: "presence",
    timestamp: presence.la * 1000,
    userID: userID || "",
    statuses: presence.a
  };
}

function getData_Path(Obj, Arr, Stt) {
  if (Arr.length === 0 && Obj != undefined) {
    return Obj;
  } else if (Obj == undefined) {
    return Stt;
  }
  const head = Arr[0];
  if (head == undefined) {
    return Stt;
  }
  const tail = Arr.slice(1);
  return getData_Path(Obj[head], tail, Stt++);
}

function setData_Path(obj, path, value) {
  if (!path.length) {
    return obj;
  }
  const currentKey = path[0];
  let currentObj = obj[currentKey];

  if (!currentObj) {
    obj[currentKey] = value;
    currentObj = obj[currentKey];
  }
  path.shift();
  if (!path.length) {
    currentObj = value;
  } else {
    currentObj = setData_Path(currentObj, path, value);
  }

  return obj;
}

function getPaths(obj, parentPath = []) {
  let paths = [];
  for (let prop in obj) {
    if (typeof obj[prop] === "object") {
      paths = paths.concat(getPaths(obj[prop], [...parentPath, prop]));
    } else {
      paths.push([...parentPath, prop]);
    }
  }
  return paths;
}

function cleanHTML(text) {
  text = text.replace(
    /(<br>)|(<\/?i>)|(<\/?em>)|(<\/?b>)|(!?~)|(&amp;)|(&#039;)|(&lt;)|(&gt;)|(&quot;)/g,
    match => {
      switch (match) {
        case "<br>":
          return "\n";
        case "<i>":
        case "<em>":
        case "</i>":
        case "</em>":
          return "*";
        case "<b>":
        case "</b>":
          return "**";
        case "~!":
        case "!~":
          return "||";
        case "&amp;":
          return "&";
        case "&#039;":
          return "'";
        case "&lt;":
          return "<";
        case "&gt;":
          return ">";
        case "&quot;":
          return '"';
      }
    }
  );
  return text;
}

function getCurrentTimestamp() {
  const date = new Date();
  const unixTime = date.getTime();
  return unixTime;
}

module.exports = {
  getType,
  generateOfflineThreadingID,
  getAdminTextMessageType,
  formatDeltaEvent,
  formatHistoryMessage,
  formatMessage,
  _formatAttachment,
  formatDeltaEvent,
  formatDeltaMessage,
  formatDeltaReadReceipt,
  getType,
  formatID,
  decodeClientPayload,
  formatTyp,
  formatThread,
  generateThreadingID,
  formatRead,
  formatTyp,
  getGUID,
  getPaths,
  cleanHTML,
  generateTimestampRelative,
  formatDate,
  formatCookie,
  formatProxyPresence,
  formatPresence,
  getData_Path,
  setData_Path,
  getSignatureID,
  getCurrentTimestamp
};
