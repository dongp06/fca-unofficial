"use strict";
const logger = require("../../../func/logger");

/**
 * Message Scheduler System
 * Allows scheduling messages to be sent at a specific time in the future
 */
module.exports = function (defaultFuncs, api, ctx) {
  // Initialize scheduler on first call
  if (!ctx._scheduler) {
    ctx._scheduler = createSchedulerInstance(api);
  }

  return ctx._scheduler;
};

function createSchedulerInstance(api) {
  const scheduledMessages = new Map(); // Map<id, ScheduledMessage>
  let nextId = 1;

  /**
   * Scheduled Message Object
   * @typedef {Object} ScheduledMessage
   * @property {string} id - Unique identifier
   * @property {string|Object} message - Message content
   * @property {string|string[]} threadID - Target thread ID(s)
   * @property {number} timestamp - When to send (Unix timestamp in ms)
   * @property {number} createdAt - When scheduled (Unix timestamp in ms)
   * @property {Object} options - Additional options (replyMessageID, isGroup, etc.)
   * @property {Function} callback - Optional callback when sent
   * @property {NodeJS.Timeout} timeout - Timeout reference
   * @property {boolean} cancelled - Whether cancelled
   */

  /**
   * Schedule a message to be sent at a specific time
   * @param {string|Object} message - Message content
   * @param {string|string[]} threadID - Target thread ID(s)
   * @param {Date|number|string} when - When to send (Date, timestamp, or ISO string)
   * @param {Object} [options] - Additional options
   * @param {string} [options.replyMessageID] - Message ID to reply to
   * @param {boolean} [options.isGroup] - Whether it's a group chat
   * @param {Function} [options.callback] - Callback when sent
   * @returns {string} Scheduled message ID
   */
  function scheduleMessage(message, threadID, when, options = {}) {
    let timestamp;

    // Parse when parameter
    if (when instanceof Date) {
      timestamp = when.getTime();
    } else if (typeof when === "number") {
      timestamp = when;
    } else if (typeof when === "string") {
      timestamp = new Date(when).getTime();
    } else {
      throw new Error("Invalid 'when' parameter. Must be Date, number (timestamp), or ISO string");
    }

    // Validate timestamp
    if (isNaN(timestamp)) {
      throw new Error("Invalid date/time");
    }

    const now = Date.now();
    if (timestamp <= now) {
      throw new Error("Scheduled time must be in the future");
    }

    const id = `scheduled_${nextId++}_${Date.now()}`;
    const delay = timestamp - now;

    // Create scheduled message object
    const scheduled = {
      id,
      message,
      threadID,
      timestamp,
      createdAt: now,
      options: {
        replyMessageID: options.replyMessageID,
        isGroup: options.isGroup,
        callback: options.callback
      },
      cancelled: false
    };

    // Set timeout to send message
    scheduled.timeout = setTimeout(() => {
      if (scheduled.cancelled) return;

      try {
        logger(`Sending scheduled message ${id}`, "info");

        // Send message
        api.sendMessage(
          message,
          threadID,
          scheduled.options.callback || (() => {}),
          scheduled.options.replyMessageID,
          scheduled.options.isGroup
        ).then(() => {
          logger(`Scheduled message ${id} sent successfully`, "info");
          scheduledMessages.delete(id);
        }).catch(err => {
          logger(`Error sending scheduled message ${id}: ${err && err.message ? err.message : String(err)}`, "error");
          if (scheduled.options.callback) {
            scheduled.options.callback(err);
          }
          scheduledMessages.delete(id);
        });
      } catch (err) {
        logger(`Error in scheduled message ${id}: ${err && err.message ? err.message : String(err)}`, "error");
        scheduledMessages.delete(id);
      }
    }, delay);

    scheduledMessages.set(id, scheduled);
    logger(`Message scheduled: ${id} (in ${Math.round(delay / 1000)}s)`, "info");

    return id;
  }

  /**
   * Cancel a scheduled message
   * @param {string} id - Scheduled message ID
   * @returns {boolean} True if cancelled, false if not found
   */
  function cancelScheduledMessage(id) {
    const scheduled = scheduledMessages.get(id);
    if (!scheduled) {
      return false;
    }

    if (scheduled.cancelled) {
      return false; // Already cancelled
    }

    clearTimeout(scheduled.timeout);
    scheduled.cancelled = true;
    scheduledMessages.delete(id);
    logger(`Scheduled message ${id} cancelled`, "info");
    return true;
  }

  /**
   * Get scheduled message info
   * @param {string} id - Scheduled message ID
   * @returns {ScheduledMessage|null} Scheduled message or null if not found
   */
  function getScheduledMessage(id) {
    const scheduled = scheduledMessages.get(id);
    if (!scheduled || scheduled.cancelled) {
      return null;
    }

    // Return a copy without internal properties
    return {
      id: scheduled.id,
      message: scheduled.message,
      threadID: scheduled.threadID,
      timestamp: scheduled.timestamp,
      createdAt: scheduled.createdAt,
      options: { ...scheduled.options },
      timeUntilSend: scheduled.timestamp - Date.now()
    };
  }

  /**
   * List all scheduled messages
   * @returns {ScheduledMessage[]} Array of scheduled messages
   */
  function listScheduledMessages() {
    const now = Date.now();
    const list = [];

    for (const scheduled of scheduledMessages.values()) {
      if (scheduled.cancelled) continue;

      list.push({
        id: scheduled.id,
        message: scheduled.message,
        threadID: scheduled.threadID,
        timestamp: scheduled.timestamp,
        createdAt: scheduled.createdAt,
        options: { ...scheduled.options },
        timeUntilSend: scheduled.timestamp - now
      });
    }

    // Sort by timestamp
    return list.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Cancel all scheduled messages
   * @returns {number} Number of cancelled messages
   */
  function cancelAllScheduledMessages() {
    let count = 0;
    for (const id of scheduledMessages.keys()) {
      if (cancelScheduledMessage(id)) {
        count++;
      }
    }
    logger(`Cancelled ${count} scheduled messages`, "info");
    return count;
  }

  /**
   * Get count of scheduled messages
   * @returns {number} Count
   */
  function getScheduledCount() {
    return scheduledMessages.size;
  }

  /**
   * Clear expired/cancelled messages from memory
   */
  function cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, scheduled] of scheduledMessages.entries()) {
      if (scheduled.cancelled || scheduled.timestamp < now) {
        scheduledMessages.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger(`Cleaned up ${cleaned} scheduled messages`, "info");
    }
  }

  // Auto cleanup every 5 minutes
  const cleanupInterval = setInterval(cleanup, 5 * 60 * 1000);

  /**
   * Destroy scheduler and cleanup all resources
   * @returns {number} Number of cancelled messages
   */
  function destroy() {
    clearInterval(cleanupInterval);
    const count = cancelAllScheduledMessages();
    logger("Scheduler destroyed and all resources cleaned up", "info");
    return count;
  }

  // Return scheduler API
  return {
    scheduleMessage,
    cancelScheduledMessage,
    getScheduledMessage,
    listScheduledMessages,
    cancelAllScheduledMessages,
    getScheduledCount,
    cleanup,
    destroy,
    // Cleanup interval reference for manual cleanup if needed
    _cleanupInterval: cleanupInterval
  };
}
