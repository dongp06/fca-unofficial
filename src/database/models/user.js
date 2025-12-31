module.exports = function (sequelize) {
  const { Model, DataTypes } = require("sequelize");

  class User extends Model { }

  User.init(
    {
      num: {
        type: DataTypes.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true
      },
      userID: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: true
      }
    },
    {
      sequelize,
      modelName: "User",
      timestamps: true
    }
  );

  return User;
};
