// components/image-note/image-note.js
Component({
  properties: {
    itemId: { type: String, value: '' },
    x: { type: Number, value: 0 },
    y: { type: Number, value: 0 },
    title: { type: String, value: '' },
    src: { type: String, value: '' },
    dragging: { type: Boolean, value: false },
    selected: { type: Boolean, value: false },
    zIndex: { type: Number, value: 1 },
    width: { type: Number, value: 200 },
    height: { type: Number, value: 200 },
    locked: { type: Boolean, value: false }
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

    // ===== 缩放手柄 =====
    onResizeStart: function (e) {
      if (this.data.locked) return;
      var touch = e.touches[0];
      this.triggerEvent('resizestart', { id: this.data.itemId, clientX: touch.clientX, clientY: touch.clientY });
    },
    onResizeMove: function (e) {
      if (this.data.locked) return;
      var touch = e.touches[0];
      this.triggerEvent('resizemove', { id: this.data.itemId, clientX: touch.clientX, clientY: touch.clientY });
    },
    onResizeEnd: function () {
      if (this.data.locked) return;
      this.triggerEvent('resizeend', { id: this.data.itemId });
    },

    // ===== 图片预览（基于 touch 的点击检测）=====
    _onImageTouchStart: function (e) {
      var touch = e.touches[0];
      this._imgTapTime = Date.now();
      this._imgTapX = touch.clientX;
      this._imgTapY = touch.clientY;
    },
    _onImageTouchEnd: function (e) {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      var touch = e.changedTouches[0];
      var dt = Date.now() - this._imgTapTime;
      var dx = Math.abs(touch.clientX - this._imgTapX);
      var dy = Math.abs(touch.clientY - this._imgTapY);
      if (dt < 300 && dx < 15 && dy < 15) {
        if (this.data.src) {
          wx.previewImage({
            current: this.data.src,
            urls: [this.data.src]
          });
        }
      }
    },

    // ===== 图片加载失败 =====
    onImageError: function (e) {
      console.error('Image load error:', e);
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
        this.triggerEvent('delete', { id: this.data.itemId });
      }
    },

    // 阻止冒泡辅助
    stopPropagation: function () {
      // 空函数，仅用于 catchtouchstart/catchtouchend 阻止冒泡到外层
    }
  }
});
