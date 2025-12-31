const { User } = require("./models");

const validateUserID = userID => {
  if (typeof userID !== "string" && typeof userID !== "number") {
    throw new Error("Invalid userID: must be a string or number.");
  }
  return String(userID);
};
const validateData = data => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid data: must be a non-empty object.");
  }
};

module.exports = function (bot) {
  return {
    async create(userID, data) {
      try {
        userID = validateUserID(userID);
        validateData(data);
        let user = await User.findOne({ where: { userID } });
        if (user) return { user: user.get(), created: false };
        const payload = Object.prototype.hasOwnProperty.call(data, "data") ? data : { data };
        user = await User.create({ userID, ...payload });
        return { user: user.get(), created: true };
      } catch (error) {
        throw new Error(`Failed to create user: ${error.message}`);
      }
    },

    async get(userID) {
      try {
        userID = validateUserID(userID);
        const user = await User.findOne({ where: { userID } });
        return user ? user.get() : null;
      } catch (error) {
        throw new Error(`Failed to get user: ${error.message}`);
      }
    },

    async update(userID, data) {
      try {
        userID = validateUserID(userID);
        validateData(data);
        const payload = Object.prototype.hasOwnProperty.call(data, "data") ? data : { data };
        const user = await User.findOne({ where: { userID } });
        if (user) {
          await user.update(payload);
          return { user: user.get(), created: false };
        } else {
          const newUser = await User.create({ userID, ...payload });
          return { user: newUser.get(), created: true };
        }
      } catch (error) {
        throw new Error(`Failed to update user: ${error.message}`);
      }
    },

    async del(userID) {
      try {
        if (!userID) throw new Error("userID is required and cannot be undefined");
        userID = validateUserID(userID);
        const result = await User.destroy({ where: { userID } });
        if (result === 0) throw new Error("No user found with the specified userID");
        return result;
      } catch (error) {
        throw new Error(`Failed to delete user: ${error.message}`);
      }
    },

    async delAll() {
      try {
        return await User.destroy({ where: {} });
      } catch (error) {
        throw new Error(`Failed to delete all users: ${error.message}`);
      }
    },

    async getAll(keys = null) {
      try {
        const attributes = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : undefined;
        const users = await User.findAll({ attributes });
        return users.map(u => u.get());
      } catch (error) {
        throw new Error(`Failed to get all users: ${error.message}`);
      }
    }
  };
};
