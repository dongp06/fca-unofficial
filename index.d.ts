declare module '@dongdev/fca-unofficial' {
  import type EventEmitter from "events";
  import type { Duplex, Readable, Transform } from "stream";

  // ============================================================================
  // Type Definitions
  // ============================================================================

  type ReadableStream = Readable | Duplex | Transform;

  // ============================================================================
  // Login Function
  // ============================================================================

  function login(
    credentials: Partial<{
      email: string;
      password: string;
      appState: AppstateData;
      Cookie?: string | string[] | Record<string, string>;
    }>,
    options: Partial<IFCAU_Options>,
    callback: (err: Error | null, api: IFCAU_API) => void
  ): void;
  function login(
    credentials: Partial<{
      email: string;
      password: string;
      appState: AppstateData;
      Cookie?: string | string[] | Record<string, string>;
    }>,
    options: Partial<IFCAU_Options>
  ): Promise<IFCAU_API>;
  function login(
    credentials: Partial<{
      email: string;
      password: string;
      appState: AppstateData;
      Cookie?: string | string[] | Record<string, string>;
    }>,
    callback: (err: Error | null, api: IFCAU_API) => void
  ): void;
  function login(
    credentials: Partial<{
      email: string;
      password: string;
      appState: AppstateData;
      Cookie?: string | string[] | Record<string, string>;
    }>
  ): Promise<IFCAU_API>;

  export default login;
  export { login };

  // ============================================================================
  // Core Types
  // ============================================================================

  export type Cookie = {
    key: string;
    value: string;
    domain: string;
    path?: string;
    hostOnly?: boolean;
    creation?: string;
    lastAccessed?: string;
  };

  export type AppstateData = {
    appState: Cookie[];
  };

  export type MessageObject = {
    body: string;
    sticker?: string;
    attachment?: ReadableStream | ReadableStream[];
    url?: string;
    emoji?: string;
    emojiSize?: string;
    mentions?: {
      tag: string;
      id: string;
      fromIndex?: number;
    }[];
    location?: {
      latitude: number;
      longitude: number;
      current?: boolean;
    };
  };

  // ============================================================================
  // Send Message Function
  // ============================================================================

  function sendMessage(
    message: string | MessageObject,
    threadID: string | string[],
    callback?: (err?: Error, data?: { threadID: string; messageID: string; timestamp: number }) => void,
    replyMessageID?: string,
    isGroup?: boolean
  ): Promise<{ threadID: string; messageID: string; timestamp: number }>;
  function sendMessage(
    message: string | MessageObject,
    threadID: string | string[],
    replyMessageID?: string,
    isGroup?: boolean
  ): Promise<{ threadID: string; messageID: string; timestamp: number }>;

  // ============================================================================
  // API Interface
  // ============================================================================

  export type IFCAU_API = {
    // Group Management
    addUserToGroup: (userID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
    removeUserFromGroup: (userID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
    createNewGroup: (participantIDs: string[], groupTitle?: string, callback?: (err: Error, threadID: string) => void) => Promise<string>;

    // Admin & Permissions
    changeAdminStatus: (threadID: string, adminIDs: string | string[], adminStatus: boolean, callback?: (err?: Error) => void) => Promise<void>;
    changeApprovalMode: (approvalMode: 0 | 1, threadID: string, callback?: (err?: Error) => void) => Promise<void>;

    // Thread Management
    changeArchivedStatus: (threadOrThreads: string | string[], archive: boolean, callback?: (err?: Error) => void) => Promise<void>;
    changeBlockedStatus: (userID: string, blocked: boolean, callback?: (err?: Error) => void) => Promise<void>;
    changeGroupImage: (image: ReadableStream, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
    changeNickname: (nickname: string, threadID: string, participantID: string, callback?: (err?: Error) => void) => Promise<void>;
    changeThreadColor: (color: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
    changeThreadEmoji: (emoji: string | null, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
    setTitle: (newTitle: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
    deleteThread: (threadOrThreads: string | string[], callback?: (err?: Error) => void) => Promise<void>;
    muteThread: (threadID: string, muteSeconds: number, callback?: (err?: Error) => void) => Promise<void>;

    // Messages
    sendMessage: typeof sendMessage;
    editMessage: (text: string, messageID: string, callback?: (err?: Error) => void) => Promise<void>;
    deleteMessage: (messageOrMessages: string | string[], callback?: (err?: Error) => void) => Promise<void>;
    unsendMessage: (messageID: string, callback?: (err?: Error) => void) => Promise<void>;
    unsendMessageMqtt: (messageID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
    forwardMessage: (messageID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
    forwardAttachment: (attachmentID: string, userOrUsers: string | string[], callback?: (err?: Error) => void) => Promise<void>;
    pinMessage: (pinMode: boolean, messageID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;

    // Reactions & Interactions
    setMessageReaction: (reaction: string, messageID: string, callback?: (err?: Error) => void, forceCustomReaction?: boolean) => Promise<void>;
    setMessageReactionMqtt: (reaction: string, messageID: string, threadID: string, callback?: (err?: Error) => void) => Promise<void>;
    sendTypingIndicator: (threadID: string, callback?: (err?: Error) => void) => Promise<void>;
    sendTypingIndicatorMqtt: (isTyping: boolean, threadID: string, callback?: (err?: Error) => void) => Promise<void>;

    // Polls
    createPoll: (title: string, threadID: string, options?: { [item: string]: boolean }, callback?: (err?: Error) => void) => Promise<void>;

    // Read & Delivery Status
    markAsRead: (threadID: string, read?: boolean, callback?: (err?: Error) => void) => Promise<void>;
    markAsReadAll: (callback?: (err?: Error) => void) => Promise<void>;
    markAsDelivered: (threadID: string, messageID: string, callback?: (err?: Error) => void) => Promise<void>;
    markAsSeen: (seenTimestamp?: number, callback?: (err?: Error) => void) => Promise<void>;

    // Thread Information
    getThreadInfo: (threadID: string, callback?: (err: Error | null, thread: IFCAU_Thread) => void) => Promise<IFCAU_Thread>;
    getThreadList: (limit: number, timestamp: number | null, tags: string[], callback?: (err: Error | null, threads: IFCAU_ThreadList) => void) => Promise<IFCAU_ThreadList>;
    getThreadHistory: (threadID: string, amount: number, time?: number, callback?: (err: Error | null, messages: any[]) => void) => Promise<any[]>;
    getThreadPictures: (threadID: string, offset: number, limit: number, callback?: (err: Error | null, pictures: string[]) => void) => Promise<string[]>;

    // User Information
    getUserInfo: (userOrUsers: string | string[], callback?: (err: Error | null, users: { [id: string]: IFCAU_User }) => void) => Promise<{ [id: string]: IFCAU_User }>;
    getUserID: (name: string, callback?: (err: Error | null, obj: IFCAU_UserIDResponse) => void) => Promise<IFCAU_UserIDResponse>;
    getFriendsList: (callback?: (err: Error | null, friends: IFCAU_Friend[]) => void) => Promise<IFCAU_Friend[]>;
    getCurrentUserID: () => string;

    // Utilities
    getAppState: () => any;
    getEmojiUrl: (c: string, size: number, pixelRatio: number) => string;
    resolvePhotoUrl: (photoID: string, callback?: (err: Error | null, url: string) => void) => Promise<string>;
    threadColors: {
      [color: string]: string;
    };

    // Message Requests
    handleMessageRequest: (threadOrThreads: string | string[], accept: boolean, callback?: (err?: Error) => void) => Promise<void>;

    // Event Listeners
    listen: (callback?: (err: Error | null, message: IFCAU_ListenMessage) => void) => EventEmitter;
    listenMqtt: (callback?: (err: Error | null, message: IFCAU_ListenMessage) => void) => EventEmitter & { stopListening: (callback?: () => void) => void };

    // Middleware System
    useMiddleware: (middleware: IFCAU_Middleware | string, fn?: IFCAU_Middleware) => () => void;
    removeMiddleware: (identifier: string | IFCAU_Middleware) => boolean;
    clearMiddleware: () => void;
    listMiddleware: () => string[];
    setMiddlewareEnabled: (name: string, enabled: boolean) => boolean;
    readonly middlewareCount: number;

    // Configuration & Session
    setOptions: (options: Partial<IFCAU_Options>) => void;
    logout: (callback?: (err?: Error) => void) => Promise<void>;

    // Message Scheduler
    scheduler: {
      scheduleMessage: (message: string | MessageObject, threadID: string | string[], when: Date | number | string, options?: { replyMessageID?: string; isGroup?: boolean; callback?: (err?: Error) => void }) => string;
      cancelScheduledMessage: (id: string) => boolean;
      getScheduledMessage: (id: string) => IFCAU_ScheduledMessage | null;
      listScheduledMessages: () => IFCAU_ScheduledMessage[];
      cancelAllScheduledMessages: () => number;
      getScheduledCount: () => number;
      cleanup: () => void;
    };

    // Auto-save AppState
    enableAutoSaveAppState: (options?: { filePath?: string; interval?: number; saveOnLogin?: boolean }) => () => void;
  };

  // ============================================================================
  // Listen Message Types
  // ============================================================================

  export type IFCAU_ListenMessage =
    | {
      type: "message";
      attachments: IFCAU_Attachment[];
      args: string[];
      body: string;
      isGroup: boolean;
      mentions: { [id: string]: string };
      messageID: string;
      senderID: string;
      threadID: string;
      isUnread: boolean;
      participantIDs: string[];
    }
    | {
      type: "event";
      author: string;
      logMessageBody: string;
      logMessageData: {
        image: {
          attachmentID: string;
          width: number;
          height: number;
          url: string;
        };
      };
      logMessageType: "log:thread-image";
      threadID: string;
    }
    | {
      type: "event";
      author: string;
      logMessageBody: string;
      logMessageData: {
        addedParticipants: {
          fanoutPolicy: string;
          firstName: string;
          fullName: string;
          groupJoinStatus: string;
          initialFolder: string;
          initialFolderId: {
            systemFolderId: string;
          };
          lastUnsubscribeTimestampMs: string;
          userFbId: string;
          isMessengerUser: boolean;
        }[];
      };
      logMessageType: "log:subscribe";
      threadID: string;
      participantIDs: string[];
    }
    | {
      type: "event";
      author: string;
      logMessageBody: string;
      logMessageData: { leftParticipantFbId: string };
      logMessageType: "log:unsubscribe";
      threadID: string;
      participantIDs: string[];
    }
    | {
      type: "event";
      author: string;
      logMessageBody: string;
      logMessageData: { name: string };
      logMessageType: "log:thread-name";
      threadID: string;
      participantIDs: string[];
    }
    | {
      type: "event";
      author: string;
      logMessageBody: string;
      logMessageData: {
        theme_color: string;
        gradient?: string;
        should_show_icon: string;
        theme_id: string;
        accessibility_label: string;
        theme_name_with_subtitle: string;
        theme_emoji?: string;
      };
      logMessageType: "log:thread-color";
      threadID: string;
      participantIDs: string[];
    }
    | {
      type: "event";
      author: string;
      logMessageBody: string;
      logMessageData: {
        thread_quick_reaction_instruction_key_id: string;
        thread_quick_reaction_emoji: string;
        thread_quick_reaction_emoji_url: string;
      };
      logMessageType: "log:thread-icon";
      threadID: string;
      participantIDs: string[];
    }
    | {
      type: "event";
      author: string;
      logMessageBody: string;
      logMessageData: {
        nickname: string;
        participant_id: string;
      };
      logMessageType: "log:user-nickname";
      threadID: string;
      participantIDs: string[];
    }
    | {
      type: "event";
      author: string;
      logMessageBody: string;
      logMessageData: {
        THREAD_CATEGORY: string;
        TARGET_ID: string;
        ADMIN_TYPE: string;
        ADMIN_EVENT: 'add_admin' | 'remove_admin';
      };
      logMessageType: "log:thread-admins";
      threadID: string;
      participantIDs: string[];
    }
    | {
      type: "event";
      author: string;
      logMessageBody: string;
      logMessageData: {
        removed_option_ids: string;
        question_json: string;
        event_type: 'question_creation' | 'update_vote' | 'add_unvoted_option' | 'multiple_updates';
        added_option_ids: string;
        new_option_texts: string;
        new_option_ids: string;
        question_id: string;
      };
      logMessageType: "log:thread-poll";
      threadID: string;
      participantIDs: string[];
    }
    | {
      type: "event";
      author: string;
      logMessageBody: string;
      logMessageData: { APPROVAL_MODE: '0' | '1'; THREAD_CATEGORY: string };
      logMessageType: "log:thread-approval-mode";
      threadID: string;
      participantIDs: string[];
    }
    | {
      type: "event";
      author: string;
      logMessageBody: string;
      logMessageData: any;
      logMessageType: "log:thread-call";
      threadID: string;
      participantIDs: string[];
    }
    | {
      type: "typ";
      from: string;
      fromMobile: boolean;
      isTyping: boolean;
      threadID: string;
    }
    | {
      type: "read";
      threadID: string;
      time: number;
    }
    | {
      type: "read_receipt";
      reader: string;
      threadID: string;
      time: number;
    }
    | {
      type: "message_reaction";
      threadID: string;
      messageID: string;
      reaction: string;
      senderID: string;
      userID: string;
      reactionTimestamp: number;
    }
    | {
      type: "presence";
      statuses: number;
      timestamp: number;
      userID: string;
    }
    | {
      type: "message_unsend";
      threadID: string;
      senderID: string;
      messageID: string;
      deletionTimestamp: number;
    }
    | {
      type: "message_reply";
      attachments: IFCAU_Attachment[];
      args: string[];
      body: string;
      isGroup: boolean;
      mentions: { [id: string]: string };
      messageID: string;
      senderID: string;
      threadID: string;
      isUnread: boolean;
      participantIDs: string[];
      messageReply: {
        attachments: IFCAU_Attachment[];
        body: string;
        isGroup: boolean;
        mentions: { [id: string]: string };
        messageID: string;
        senderID: string;
        threadID: string;
        isUnread: boolean;
      };
    };

  // ============================================================================
  // Attachment Types
  // ============================================================================

  export type IFCAU_Attachment =
    | {
      type: "sticker";
      ID: string;
      url: string;
      packID: string;
      spriteUrl: string;
      spriteUrl2x: string;
      width: number;
      height: number;
      caption: string;
      description: string;
      frameCount: number;
      frameRate: number;
      framesPerRow: number;
      framesPerCol: number;
    }
    | {
      type: "file";
      ID: string;
      filename: string;
      url: string;
      isMalicious: boolean;
      contentType: string;
    }
    | {
      type: "photo";
      ID: string;
      filename: string;
      thumbnailUrl: string;
      previewUrl: string;
      previewWidth: number;
      previewHeight: number;
      largePreviewUrl: string;
      largePreviewWidth: number;
      largePreviewHeight: number;
      url: string;
      width: number;
      height: number;
    }
    | {
      type: "animated_image";
      ID: string;
      filename: string;
      previewUrl: string;
      previewWidth: number;
      previewHeight: number;
      url: string;
      width: number;
      height: number;
    }
    | {
      type: "video";
      ID: string;
      filename: string;
      previewUrl: string;
      previewWidth: number;
      previewHeight: number;
      url: string;
      width: number;
      height: number;
      duration: number;
      videoType: string;
    }
    | {
      type: "audio";
      ID: string;
      filename: string;
      audioType: string;
      duration: number;
      url: string;
      isVoiceMail: boolean;
    }
    | {
      type: "location";
      ID: string;
      latitude: number;
      longitude: number;
      image: string;
      width: number;
      height: number;
      url: string;
      address: string;
    }
    | {
      type: "share";
      ID: string;
      url: string;
      title: string;
      description: string;
      source: string;
      image: string;
      width: number;
      height: number;
      playable: boolean;
      duration: number;
      playableUrl: string;
      subattachments: any;
      properties: any;
    };

  // ============================================================================
  // User Types
  // ============================================================================

  export type IFCAU_User = {
    name: string;
    firstName?: string;
    vanity?: string;
    thumbSrc: string;
    profileUrl: string | null;
    gender?: number;
    type: string;
    isFriend?: boolean;
    isBirthday: boolean;
    searchToken: any;
    alternateName?: string;
  };

  export type IFCAU_UserIDResponse = {
    userID: string;
    photoUrl: string;
    indexRank: number;
    name: string;
    isVerified: boolean;
    profileUrl: string;
    category: string;
    score: number;
    type: string;
  }[];

  export type IFCAU_Friend = {
    alternativeName: string;
    firstName: string;
    gender: string;
    userID: string;
    isFriend: boolean;
    fullName: string;
    profilePicture: string;
    type: string;
    profileUrl: string;
    vanity: string;
    isBirthday: boolean;
  };

  // ============================================================================
  // Thread Types
  // ============================================================================

  export type IFCAU_Thread = {
    threadID: string;
    participantIDs: string[];
    threadName: string;
    userInfo: (IFCAU_User & { id: string })[];
    nicknames: { [id: string]: string } | null;
    unreadCount: number;
    messageCount: number;
    imageSrc: string;
    timestamp: number;
    muteUntil: number | null;
    isGroup: boolean;
    isSubscribed: boolean;
    folder: 'INBOX' | 'ARCHIVE' | string;
    isArchived: boolean;
    cannotReplyReason: string | null;
    lastReadTimestamp: number;
    emoji: string | null;
    color: string | null;
    adminIDs: string[];
    approvalMode: boolean;
    approvalQueue: { inviterID: string; requesterID: string; timestamp: string }[];
  };

  export type IFCAU_ThreadList = {
    threadID: string;
    name: string;
    unreadCount: number;
    messageCount: number;
    imageSrc: string;
    emoji: string | null;
    color: string | null;
    nicknames: { userid: string; nickname: string }[];
    muteUntil: number | null;
    participants: IFCAU_ThreadList_Participants[];
    adminIDs: string[];
    folder: "INBOX" | "ARCHIVED" | "PENNDING" | "OTHER" | string;
    isGroup: boolean;
    customizationEnabled: boolean;
    participantAddMode: string;
    reactionMuteMode: string;
    isArchived: boolean;
    isSubscribed: boolean;
    timestamp: number;
    snippet: string;
    snippetAttachments: string;
    snippetSender: string;
    lastMessageTimestamp: number;
    listReadTimestamp: number | null;
    cannotReplyReason: string | null;
    approvalMode: string;
  }[];

  export type IFCAU_ThreadList_Participants =
    | {
      accountType: "User";
      userID: string;
      name: string;
      shortName: string;
      gender: string;
      url: string;
      profilePicture: string;
      username: string | null;
      isViewerFriend: boolean;
      isMessengerUser: boolean;
      isVerified: boolean;
      isMessageBlockedByViewer: boolean;
      isViewerCoworker: boolean;
    }
    | {
      accountType: "Page";
      userID: string;
      name: string;
      url: string;
      profilePicture: string;
      username: string | null;
      acceptMessengerUserFeedback: boolean;
      isMessengerUser: boolean;
      isVerified: boolean;
      isMessengerPlatformBot: boolean;
      isMessageBlockedByViewer: boolean;
    }
    | {
      accountType: "ReducedMessagingActor";
      userID: string;
      name: string;
      url: string;
      profilePicture: string;
      username: string | null;
      acceptMessengerUserFeedback: boolean;
      isMessageBlockedByViewer: boolean;
    }
    | {
      accountType: "UnavailableMessagingActor";
      userID: string;
      name: string;
      url: null;
      profilePicture: string;
      username: null;
      acceptMessengerUserFeedback: boolean;
      isMessageBlockedByViewer: boolean;
    }
    | {
      accountType: string;
      userID: string;
      name: string;
    };

  // ============================================================================
  // Middleware Types
  // ============================================================================

  export type IFCAU_Middleware = (event: IFCAU_ListenMessage, next: (err?: Error | false | null) => void) => void | Promise<void> | false | null;

  // ============================================================================
  // Scheduler Types
  // ============================================================================

  export type IFCAU_ScheduledMessage = {
    id: string;
    message: string | MessageObject;
    threadID: string | string[];
    timestamp: number;
    createdAt: number;
    options: {
      replyMessageID?: string;
      isGroup?: boolean;
      callback?: (err?: Error) => void;
    };
    timeUntilSend: number;
  };

  // ============================================================================
  // Options Type
  // ============================================================================

  export type IFCAU_Options = {
    pauseLog: boolean;
    logLevel: "silly" | "verbose" | "info" | "http" | "warn" | "error" | "silent";
    selfListen: boolean;
    listenEvents: boolean;
    pageID: string;
    updatePresence: boolean;
    forceLogin: boolean;
    userAgent: string;
    autoMarkDelivery: boolean;
    autoMarkRead: boolean;
    proxy: string;
    online: boolean;
  };
}
