"use strict";
const logger = require("../../../../func/logger");

/**
 * Middleware system for filtering and processing events before they are emitted
 *
 * Middleware functions receive (event, next) where:
 * - event: The event object (can be modified)
 * - next: Function to call to continue to next middleware
 *   - next() - continue to next middleware
 *   - next(false) or next(null) - stop processing, don't emit event
 *   - next(error) - emit error instead
 */
module.exports = function createMiddlewareSystem() {
  const middlewareStack = [];

  /**
   * Add middleware to the stack
   * @param {Function|string} middleware - Middleware function or name for named middleware
   * @param {Function} [fn] - Middleware function (if first param is name)
   * @returns {Function} Unsubscribe function
   */
  function use(middleware, fn) {
    let middlewareFn, name;

    if (typeof middleware === "string" && typeof fn === "function") {
      name = middleware;
      middlewareFn = fn;
    } else if (typeof middleware === "function") {
      middlewareFn = middleware;
      name = `middleware_${middlewareStack.length}`;
    } else {
      throw new Error("Middleware must be a function or (name, function)");
    }

    const wrapped = {
      name,
      fn: middlewareFn,
      enabled: true
    };

    middlewareStack.push(wrapped);
    logger(`Middleware "${name}" added`, "info");

    // Return unsubscribe function
    return function remove() {
      const index = middlewareStack.indexOf(wrapped);
      if (index !== -1) {
        middlewareStack.splice(index, 1);
        logger(`Middleware "${name}" removed`, "info");
      }
    };
  }

  /**
   * Remove middleware by name or function
   * @param {string|Function} identifier - Name or function to remove
   * @returns {boolean} True if removed
   */
  function remove(identifier) {
    if (typeof identifier === "string") {
      const index = middlewareStack.findIndex(m => m.name === identifier);
      if (index !== -1) {
        const removed = middlewareStack.splice(index, 1)[0];
        logger(`Middleware "${removed.name}" removed`, "info");
        return true;
      }
      return false;
    } else if (typeof identifier === "function") {
      const index = middlewareStack.findIndex(m => m.fn === identifier);
      if (index !== -1) {
        const removed = middlewareStack.splice(index, 1)[0];
        logger(`Middleware "${removed.name}" removed`, "info");
        return true;
      }
      return false;
    }
    return false;
  }

  /**
   * Remove all middleware
   */
  function clear() {
    const count = middlewareStack.length;
    middlewareStack.length = 0;
    logger(`All middleware cleared (${count} removed)`, "info");
  }

  /**
   * Get list of middleware names
   * @returns {string[]} Array of middleware names
   */
  function list() {
    return middlewareStack.filter(m => m.enabled).map(m => m.name);
  }

  /**
   * Enable/disable middleware by name
   * @param {string} name - Middleware name
   * @param {boolean} enabled - Enable or disable
   * @returns {boolean} True if found and updated
   */
  function setEnabled(name, enabled) {
    const middleware = middlewareStack.find(m => m.name === name);
    if (middleware) {
      middleware.enabled = enabled;
      logger(`Middleware "${name}" ${enabled ? "enabled" : "disabled"}`, "info");
      return true;
    }
    return false;
  }

  /**
   * Process event through middleware stack
   * @param {*} event - Event object
   * @param {Function} finalCallback - Callback to call after all middleware
   * @returns {Promise} Promise that resolves when processing is complete
   */
  function process(event, finalCallback) {
    if (!middlewareStack.length) {
      return finalCallback(null, event);
    }

    let index = 0;
    const enabledMiddleware = middlewareStack.filter(m => m.enabled);

    function next(err) {
      // Error occurred, stop processing
      if (err && err !== false && err !== null) {
        return finalCallback(err, null);
      }

      // Explicitly stopped (next(false) or next(null))
      if (err === false || err === null) {
        return finalCallback(null, null); // null event means don't emit
      }

      // No more middleware, call final callback
      if (index >= enabledMiddleware.length) {
        return finalCallback(null, event);
      }

      // Get next middleware
      const middleware = enabledMiddleware[index++];

      try {
        // Call middleware with event and next
        const result = middleware.fn(event, next);

        // If middleware returns a promise, handle it
        if (result && typeof result.then === "function") {
          result
            .then(() => next())
            .catch(err => next(err));
        } else if (result === false || result === null) {
          // Middleware returned false/null, stop processing
          finalCallback(null, null);
        }
        // If middleware called next() synchronously, it will continue
      } catch (err) {
        logger(`Middleware "${middleware.name}" error: ${err && err.message ? err.message : String(err)}`, "error");
        next(err);
      }
    }

    // Start processing
    next();
  }

  /**
   * Wrap a callback with middleware processing
   * @param {Function} callback - Original callback (err, event)
   * @returns {Function} Wrapped callback
   */
  function wrapCallback(callback) {
    return function wrappedCallback(err, event) {
      if (err) {
        // Errors bypass middleware
        return callback(err, null);
      }

      if (!event) {
        return callback(null, null);
      }

      // Process event through middleware
      process(event, (middlewareErr, processedEvent) => {
        if (middlewareErr) {
          return callback(middlewareErr, null);
        }

        // If processedEvent is null, middleware blocked the event
        if (processedEvent === null) {
          return; // Don't emit
        }

        // Emit processed event
        callback(null, processedEvent);
      });
    };
  }

  return {
    use,
    remove,
    clear,
    list,
    setEnabled,
    process,
    wrapCallback,
    get count() {
      return middlewareStack.filter(m => m.enabled).length;
    }
  };
};
