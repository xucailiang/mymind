// utils/storage.js - 云数据库操作封装

var db = wx.cloud.database();

/**
 * 获取当前用户 openid
 * @returns {string} 用户 openid
 */
function getOpenid() {
  return wx.getStorageSync('openid') || getApp().globalData.openid;
}

/**
 * 加载当前用户所有画布元素
 * @returns {Promise<Array>} 元素数组，按创建时间倒序
 */
function loadItems() {
  return new Promise(function(resolve, reject) {
    db.collection('notes')
      .where({ _openid: getOpenid() })
      .orderBy('zIndex', 'asc')
      .limit(100)
      .get({
        success: function(res) { resolve(res.data); },
        fail: reject
      });
  });
}

/**
 * 创建新元素
 * @param {Object} item - 元素数据（type, x, y, title, content, src, duration 等）
 * @returns {Promise<Object>} 云数据库返回结果，包含 _id 字段
 */
function createItem(item) {
  return db.collection('notes').add({
    data: {
      type: item.type,
      x: item.x,
      y: item.y,
      title: item.title || '',
      content: item.content || '',
      src: item.src || '',
      duration: item.duration || 0,
      width: item.width || 0,
      height: item.height || 0,
      zIndex: item.zIndex || 0,
      locked: item.locked || false,
      createdAt: db.serverDate()
    }
  });
}

/**
 * 更新元素
 * @param {string} id - 文档 ID（_id）
 * @param {Object} data - 要更新的字段
 * @returns {Promise<Object>} 更新结果
 */
function updateItem(id, data) {
  var updateData = {};
  for (var key in data) {
    if (data.hasOwnProperty(key)) {
      updateData[key] = data[key];
    }
  }
  updateData.updatedAt = db.serverDate();
  return db.collection('notes').doc(id).update({ data: updateData });
}

/**
 * 删除元素
 * @param {string} id - 文档 ID（_id）
 * @returns {Promise<Object>} 删除结果
 */
function deleteItem(id) {
  return db.collection('notes').doc(id).remove();
}

/**
 * 批量更新元素位置
 * @param {Array<{_id: string, x: number, y: number}>} items - 要更新的元素数组
 * @returns {Promise<Array>} 所有更新操作的 Promise 数组
 */
function batchUpdate(items) {
  var promises = items.map(function(item) {
    return db.collection('notes').doc(item._id).update({
      data: {
        x: item.x,
        y: item.y,
        updatedAt: db.serverDate()
      }
    });
  });
  return Promise.all(promises);
}

/**
 * 上传文件到云存储
 * @param {string} tempPath - 本地临时文件路径
 * @returns {Promise<string>} 云文件 fileID
 */
function saveCloudFile(tempPath) {
  return new Promise(function(resolve, reject) {
    var openid = getOpenid();
    var cloudPath = 'uploads/' + openid + '/' + Date.now() + '_' + Math.random().toString(36).substring(2);
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempPath,
      success: function(res) { resolve(res.fileID); },
      fail: reject
    });
  });
}

module.exports = {
  loadItems: loadItems,
  createItem: createItem,
  updateItem: updateItem,
  deleteItem: deleteItem,
  batchUpdate: batchUpdate,
  saveCloudFile: saveCloudFile,
  getOpenid: getOpenid
};
