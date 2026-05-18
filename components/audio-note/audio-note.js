// components/audio-note/audio-note.js
Component({
  properties: {
    itemId: { type: String, value: '' },
    x: { type: Number, value: 0 },
    y: { type: Number, value: 0 },
    title: { type: String, value: '' },
    src: { type: String, value: '' },
    duration: { type: Number, value: 0 },
    dragging: { type: Boolean, value: false },
    selected: { type: Boolean, value: false },
    zIndex: { type: Number, value: 1 },
    locked: { type: Boolean, value: false }
  },

  data: {
    playing: false,
    waveBars: [16, 28, 20, 32, 12, 24, 18, 30, 14, 22],
    _durationText: '0:00'
  },

  observers: {
    'duration': function (val) {
      var sec = val || 0;
      var min = Math.floor(sec / 60);
      var s = sec % 60;
      this.setData({
        _durationText: min + ':' + (s < 10 ? '0' : '') + s
      });
    }
  },

  lifetimes: {
    attached: function () {
      // 创建独立音频上下文（存储在组件实例上，非 data）
      this._innerAudioCtx = wx.createInnerAudioContext();
      this._innerAudioCtx.obeyMuteSwitch = false;

      this._innerAudioCtx.onPlay(function () {
        this.setData({ playing: true });
      }.bind(this));

      this._innerAudioCtx.onPause(function () {
        this.setData({ playing: false });
      }.bind(this));

      this._innerAudioCtx.onStop(function () {
        this.setData({ playing: false });
      }.bind(this));

      this._innerAudioCtx.onEnded(function () {
        this.setData({ playing: false });
      }.bind(this));

      this._innerAudioCtx.onError(function (err) {
        console.error('Audio play error:', err);
        this.setData({ playing: false });
      }.bind(this));

      // 设置音频源
      if (this.data.src) {
        this._innerAudioCtx.src = this.data.src;
      }
    },

    detached: function () {
      if (this._innerAudioCtx) {
        this._innerAudioCtx.stop();
        this._innerAudioCtx.destroy();
        this._innerAudioCtx = null;
      }
    }
  },

  methods: {
    // ===== 触摸事件 → 冒泡给父页面 =====
    onTouchStart: function (e) {
      var touch = e.touches[0];
      this.triggerEvent('itemtouchstart', { id: this.data.itemId, clientX: touch.clientX, clientY: touch.clientY });
    },
    onTouchMove: function (e) {
      var touch = e.touches[0];
      this.triggerEvent('itemtouchmove', { id: this.data.itemId, clientX: touch.clientX, clientY: touch.clientY });
    },
    onTouchEnd: function (e) {
      this.triggerEvent('itemtouchend', { id: this.data.itemId });
    },

    // ===== 标题编辑 =====
    onTitleTap: function () {
      // 让 input 获取焦点进行编辑
    },
    onTitleBlur: function (e) {
      if (this.data.locked) return;
      var value = e.detail.value;
      this.triggerEvent('update', { id: this.data.itemId, field: 'title', value: value });
    },
    onTitleConfirm: function (e) {
      if (this.data.locked) return;
      var value = e.detail.value;
      this.triggerEvent('update', { id: this.data.itemId, field: 'title', value: value });
    },

    // ===== 播放/暂停（基于 touch 的点击检测）=====
    _onPlayTouchStart: function (e) {
      var touch = e.touches[0];
      this._playTapTime = Date.now();
      this._playTapX = touch.clientX;
      this._playTapY = touch.clientY;
    },
    _onPlayTouchEnd: function (e) {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      var touch = e.changedTouches[0];
      var dt = Date.now() - this._playTapTime;
      var dx = Math.abs(touch.clientX - this._playTapX);
      var dy = Math.abs(touch.clientY - this._playTapY);
      if (dt < 300 && dx < 15 && dy < 15) {
        this._togglePlay();
      }
    },

    _togglePlay: function () {
      if (!this.data.src) return;
      if (this.data.locked) return;
      if (this.data.playing) {
        this._innerAudioCtx.pause();
      } else {
        if (this._innerAudioCtx.src !== this.data.src) {
          this._innerAudioCtx.src = this.data.src;
        }
        this._innerAudioCtx.play();
        this.triggerEvent('playaudio', { id: this.data.itemId });
      }
    },

    // ===== 删除（基于 touch 的点击检测）=====
    _onDeleteTouchStart: function (e) {
      var touch = e.touches[0];
      this._delTapTime = Date.now();
      this._delTapX = touch.clientX;
      this._delTapY = touch.clientY;
    },
    _onDeleteTouchEnd: function (e) {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      var touch = e.changedTouches[0];
      var dt = Date.now() - this._delTapTime;
      var dx = Math.abs(touch.clientX - this._delTapX);
      var dy = Math.abs(touch.clientY - this._delTapY);
      if (dt < 300 && dx < 15 && dy < 15) {
        if (this._innerAudioCtx) {
          this._innerAudioCtx.stop();
        }
        this.triggerEvent('delete', { id: this.data.itemId });
      }
    },

    // 阻止冒泡辅助
    stopPropagation: function () {
      // 空函数，仅用于 catchtouchstart/catchtouchend 阻止冒泡到外层
    }
  }
});
