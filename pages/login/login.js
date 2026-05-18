// pages/login/login.js
var app = getApp();

Page({
  data: {
    canIUseGetUserProfile: wx.getUserProfile ? true : false,
    canIUseGetUserInfo: wx.canIUse('button.open-type.getUserInfo')
  },

  onLoad: function () {
    // 检查是否已登录（openid 存在）
    if (app.globalData.openid) {
      this.redirectToCanvas();
      return;
    }

    // 首次启动时自动初始化数据库（幂等，已存在会跳过）
    this.initDatabase();
  },

  /**
   * 初始化数据库集合并设置权限（仅首次执行）
   */
  initDatabase: function () {
    var inited = wx.getStorageSync('db_initialized');
    if (inited) return;

    wx.cloud.callFunction({ name: 'init' }).then(function () {
      wx.setStorageSync('db_initialized', true);
    }).catch(function (err) {
      console.error('init database error:', err);
      // 初始化失败不阻塞登录流程，集合可能已存在
    });
  },

  /**
   * 方案1：getUserInfo（兼容旧版基础库）
   * @param {Object} e - 按钮事件对象
   */
  onGetUserInfo: function (e) {
    if (e.detail.userInfo) {
      this.doLogin(e.detail.userInfo);
    }
  },

  /**
   * 方案2：新版授权（getUserProfile，推荐）
   */
  onGetUserProfile: function () {
    wx.getUserProfile({
      desc: '用于展示你的个人信息',
      success: function (res) {
        this.doLogin(res.userInfo);
      }.bind(this),
      fail: function () {
        wx.showToast({ title: '需要授权才能使用', icon: 'none' });
      }
    });
  },

  /**
   * 执行登录：调用云函数获取 openid
   * @param {Object} userInfo - 用户信息（nickName, avatarUrl 等）
   */
  doLogin: function (userInfo) {
    wx.showLoading({ title: '登录中...' });

    wx.cloud.callFunction({
      name: 'login',
      data: {
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl
      }
    }).then(function (res) {
      app.globalData.openid = res.result.openid;
      app.globalData.userInfo = userInfo;
      wx.setStorageSync('openid', res.result.openid);
      wx.hideLoading();
      this.redirectToCanvas();
    }.bind(this)).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      console.error('login error:', err);
    });
  },

  /**
   * 跳转到画布页
   */
  redirectToCanvas: function () {
    wx.redirectTo({ url: '/pages/canvas/canvas' });
  }
});
