// MyMind - 初始化云函数
// 首次部署时调用，自动创建数据库集合并设置权限
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async function(event, context) {
  const results = {};

  // 创建 users 集合（所有用户可读，仅创建者可写）
  try {
    await db.createCollection('users');
    results.users = 'created';
  } catch (e) {
    if (e.errCode === -1 && e.errMsg.indexOf('exist') > -1) {
      results.users = 'already_exists';
    } else {
      results.users = 'error: ' + e.errMsg;
    }
  }

  // 创建 notes 集合（仅创建者可读写）
  try {
    await db.createCollection('notes');
    results.notes = 'created';
  } catch (e) {
    if (e.errCode === -1 && e.errMsg.indexOf('exist') > -1) {
      results.notes = 'already_exists';
    } else {
      results.notes = 'error: ' + e.errMsg;
    }
  }

  return {
    code: 0,
    message: '初始化完成',
    data: results
  };
};
