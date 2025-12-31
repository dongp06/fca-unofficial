const { Sequelize } = require("sequelize");
const fs = require("fs");
const path = require("path");
const databasePath = path.join(process.cwd(), "Fca_Database");
if (!fs.existsSync(databasePath)) {
  fs.mkdirSync(databasePath, { recursive: true });
}
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: path.join(databasePath, "database.sqlite"),
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  retry: {
    max: 3
  },
  dialectOptions: {
    timeout: 5000
  },
  isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
});
const models = {};
fs.readdirSync(__dirname)
  .filter(file => file.endsWith(".js") && file !== "index.js")
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize);
    models[model.name] = model;
  });
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});
models.sequelize = sequelize;
models.Sequelize = Sequelize;
models.syncAll = async () => {
  try {
    await sequelize.sync({ force: false });
  } catch (error) {
    console.error("Failed to synchronize models:", error);
    throw error;
  }
};

module.exports = models;
