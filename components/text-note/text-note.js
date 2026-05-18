// components/text-note/text-note.js
Component({
  properties: {
    itemId: { type: String, value: '' },
    x: { type: Number, value: 0 },
    y: { type: Number, value: 0 },
    title: { type: String, value: '' },
    content: { type: String, value: '' },
    dragging: { type: Boolean, value: false },
    selected: { type: Boolean, value: false },
    zIndex: { type: Number, value: 1 },
    width: { type: Number, value: 200 },
    locked: { type: Boolean, value: false }
  },

  data: {
    editing: false
  },

  _lastTapTime: 0,

  methods: {
    // ===== 触摸事件 → 冒泡给父页面 =====
    onTouchStart: function (e) {
      // 编辑模式下不向上传递触摸（避免误触拖拽）
      if (this.data.editing) return;
      var touch = e.touches[0];
      this.triggerEvent('itemtouchstart', { id: this.data.itemId, clientX: touch.clientX, clientY: touch.clientY });
    },
    onTouchMove: function (e) {
      if (this.data.editing) return;
      var touch = e.touches[0];
      this.triggerEvent('itemtouchmove', { id: this.data.itemId, clientX: touch.clientX, clientY: touch.clientY });
    },
    onTouchEnd: function (e) {
      if (this.data.editing) return;
      this.triggerEvent('itemtouchend', { id: this.data.itemId });

      // 锁定状态下不允许双击编辑
      if (this.data.locked) return;

      // 双击检测 → 进入编辑模式
      var now = Date.now();
      if (now - this._lastTapTime < 300) {
        this._lastTapTime = 0;
        if (!this.data.editing) {
          this.setData({ editing: true });
        }
        return;
      }
      this._lastTapTime = now;
    },

    // ===== 标题编辑 =====
    onTitleTap: function () {
      // 让 input 获取焦点进行编辑
    },
    onTitleBlur: function (e) {
      // 锁定时不触发更新
      if (this.data.locked) return;
      var value = e.detail.value;
      this.triggerEvent('update', { id: this.data.itemId, field: 'title', value: value });
    },
    onTitleConfirm: function (e) {
      if (this.data.locked) return;
      var value = e.detail.value;
      this.triggerEvent('update', { id: this.data.itemId, field: 'title', value: value });
    },

    // ===== 内容编辑 =====
    onContentBlur: function (e) {
      if (this.data.locked) return;
      var value = e.detail.value;
      this.setData({ editing: false });
      this.triggerEvent('update', { id: this.data.itemId, field: 'content', value: value });
    },
    onContentInput: function () {
      // 实时不保存，失焦时保存
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

    // ===== 删除（基于 touch 的点击检测，绕开 catchtouchstart 导致 tap 不触发的问题）=====
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
      // 空函数，仅用于 catchtap 阻止冒泡
    }
  }
});
