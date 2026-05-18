// MyMind - 无限画布备忘录
App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        // ⚠️ 请替换为你的云开发环境 ID
        env: 'cloud1-xxx',
        traceUser: true
      });
    }

    // 检查本地缓存的 openid
    var openid = wx.getStorageSync('openid');
    if (openid) {
      this.globalData.openid = openid;
    }
  },

  globalData: {
    userInfo: null,
    openid: null
  }
});
