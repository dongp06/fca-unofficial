const { Thread } = require("./models");

const validateThreadID = threadID => {
  if (typeof threadID !== "string" && typeof threadID !== "number") {
    throw new Error("Invalid threadID: must be a string or number.");
  }
  return String(threadID);
};
const validateData = data => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid data: must be a non-empty object.");
  }
};

module.exports = function(bot) {
  return {
    async create(threadID, data) {
      try {
        let thread = await Thread.findOne({ where: { threadID } });
        if (thread) {
          return { thread: thread.get(), created: false };
        }
        thread = await Thread.create({ threadID, ...data });
        return { thread: thread.get(), created: true };
      } catch (error) {
        throw new Error(`Failed to create thread: ${error.message}`);
      }
    },

    async get(threadID) {
      try {
        threadID = validateThreadID(threadID);
        const thread = await Thread.findOne({ where: { threadID } });
        return thread ? thread.get() : null;
      } catch (error) {
        throw new Error(`Failed to get thread: ${error.message}`);
      }
    },

    async update(threadID, data) {
      try {
        threadID = validateThreadID(threadID);
        validateData(data);
        const thread = await Thread.findOne({ where: { threadID } });

        if (thread) {
          await thread.update(data);
          return { thread: thread.get(), created: false };
        } else {
          const newThread = await Thread.create({ ...data, threadID });
          return { thread: newThread.get(), created: true };
        }
      } catch (error) {
        throw new Error(`Failed to update thread: ${error.message}`);
      }
    },

    async del(threadID) {
      try {
        if (!threadID) {
          throw new Error("threadID is required and cannot be undefined");
        }
        threadID = validateThreadID(threadID);
        if (!threadID) {
          throw new Error("Invalid threadID");
        }
        const result = await Thread.destroy({ where: { threadID } });
        if (result === 0) {
          throw new Error("No thread found with the specified threadID");
        }
        return result;
      } catch (error) {
        throw new Error(`Failed to delete thread: ${error.message}`);
      }
    },
    async delAll() {
      try {
        return await Thread.destroy({ where: {} });
      } catch (error) {
        throw new Error(`Failed to delete all threads: ${error.message}`);
      }
    },
    async getAll(keys = null) {
      try {
        const attributes =
          typeof keys === "string"
            ? [keys]
            : Array.isArray(keys)
            ? keys
            : undefined;
        const threads = await Thread.findAll({ attributes });
        return threads.map(thread => thread.get());
      } catch (error) {
        throw new Error(`Failed to get all threads: ${error.message}`);
      }
    }
  };
};
