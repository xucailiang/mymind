// cloudfunctions/login/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 登录云函数
 * 获取用户 openid，查询或创建用户记录
 * @param {Object} event - 入参 { nickName: String, avatarUrl: String }
 * @param {Object} context - 云函数上下文
 * @returns {Object} { isNew: Boolean, openid: String }
 */
exports.main = async function(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 查询用户是否已存在
  const userRes = await db.collection('users').where({ _openid: openid }).get();

  if (userRes.data.length === 0) {
    // 新用户，创建记录
    await db.collection('users').add({
      data: {
        _openid: openid,
        nickName: event.nickName || '匿名用户',
        avatarUrl: event.avatarUrl || '',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    return { isNew: true, openid: openid };
  } else {
    // 老用户，更新信息
    if (event.nickName) {
      await db.collection('users').where({ _openid: openid }).update({
        data: {
          nickName: event.nickName,
          avatarUrl: event.avatarUrl || userRes.data[0].avatarUrl,
          updatedAt: db.serverDate()
        }
      });
    }
    return { isNew: false, openid: openid };
  }
};
