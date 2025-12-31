"use strict";

const { generateOfflineThreadingID, getType } = require("../../utils/format");

module.exports = function (defaultFuncs, api, ctx) {
  function changeAdminStatusNoMqtt(threadID, adminID, adminStatus) {
    if (getType(threadID) !== "String") throw { error: "changeAdminStatus: threadID must be a string" };
    if (getType(adminID) !== "String" && getType(adminID) !== "Array") throw { error: "changeAdminStatus: adminID must be a string or an array" };
    if (getType(adminStatus) !== "Boolean") throw { error: "changeAdminStatus: adminStatus must be true or false" };
    let wsContent = {
      request_id: 1,
      type: 3,
      payload: {
        version_id: '3816854585040595',
        tasks: [],
        epoch_id: generateOfflineThreadingID(),
        data_trace_id: null
      },
      app_id: '772021112871879'
    }
    if (getType(adminID) === "Array") {
      for (let i = 0; i < adminID.length; i++) {
        wsContent.payload.tasks.push({
          label: '25',
          payload: JSON.stringify({ thread_key: threadID, contact_id: adminID[i], is_admin: adminStatus }),
          queue_name: 'admin_status',
          task_id: i + 1,
          failure_count: null
        });
      }
    } else {
      wsContent.payload.tasks.push({
        label: '25',
        payload: JSON.stringify({ thread_key: threadID, contact_id: adminID, is_admin: adminStatus }),
        queue_name: 'admin_status',
        task_id: 1,
        failure_count: null
      });
    }
    wsContent.payload = JSON.stringify(wsContent.payload);
    return new Promise((resolve, reject) => ctx.mqttClient && ctx.mqttClient.publish('/ls_req', JSON.stringify(wsContent), {}, (err, _packet) => err ? reject(err) : resolve()));
  };
  function changeAdminStatusMqtt(threadID, adminID, adminStatus) {
    if (!ctx.mqttClient) {
      throw new Error("Not connected to MQTT");
    }
    if (getType(threadID) !== "String") {
      throw { error: "changeAdminStatus: threadID must be a string" };
    }
    if (getType(adminID) !== "String" && getType(adminID) !== "Array") {
      throw { error: "changeAdminStatus: adminID must be a string or an array" };
    }
    if (getType(adminStatus) !== "Boolean") {
      throw { error: "changeAdminStatus: adminStatus must be true or false" };
    }
    const tasks = [];
    const isAdmin = adminStatus ? 1 : 0;
    const epochID = generateOfflineThreadingID();
    if (getType(adminID) === "Array") {
      adminID.forEach((id, index) => {
        tasks.push({
          failure_count: null,
          label: "25",
          payload: JSON.stringify({
            thread_key: threadID,
            contact_id: id,
            is_admin: isAdmin
          }),
          queue_name: "admin_status",
          task_id: index + 1
        });
      });
    } else {
      tasks.push({
        failure_count: null,
        label: "25",
        payload: JSON.stringify({
          thread_key: threadID,
          contact_id: adminID,
          is_admin: isAdmin
        }),
        queue_name: "admin_status",
        task_id: 1
      });
    }
    let count_req = 0
    const form = JSON.stringify({
      app_id: "2220391788200892",
      payload: JSON.stringify({
        epoch_id: epochID,
        tasks: tasks,
        version_id: "8798795233522156"
      }),
      request_id: ++count_req,
      type: 3
    });
    return new Promise((resolve, reject) => {
      if (ctx.mqttClient) {
        ctx.mqttClient.publish("/ls_req", form, {}, (err, _packet) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        reject(new Error("MQTT client is not available"));
      }
    });
  };
  return function changeAdminStatus(threadID, adminID, adminStatus) {
    if (ctx.mqttClient) {
      try {
        changeAdminStatusMqtt(threadID, adminID, adminStatus);
      } catch (e) {
        changeAdminStatusNoMqtt(threadID, adminID, adminStatus);
      }
    } else {
      changeAdminStatusNoMqtt(threadID, adminID, adminStatus);
    }
  };
};
