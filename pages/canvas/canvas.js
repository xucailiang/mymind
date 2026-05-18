// pages/canvas/canvas.js
var storage = require('../../utils/storage');

Page({
  data: {
    items: [],
    translateX: 0,
    translateY: 0,
    scale: 1,
    scaleText: '100%',
    selectedId: '',
    hasSelection: false,
    canUndo: false,
    canRedo: false,
    isRecording: false,
    isEmpty: true,
    // 长按菜单
    contextMenu: null,  // { id, x, y, type, locked }
    // 拖拽 ghost
    ghostX: 0,
    ghostY: 0,
    ghostW: 0,
    ghostH: 0,
    ghostVisible: false,
    ghostType: ''
  },

  // ===== 模块变量（非 data，无需 setData）=====
  _canvasStartX: 0,
  _canvasStartY: 0,
  _isDraggingItem: false,
  _dragItemId: null,
  _lastTouchX: 0,
  _lastTouchY: 0,
  _longPressTimer: null,
  _canvasTapStartX: 0,
  _canvasTapStartY: 0,
  _longPressFired: false,  // 标记长按是否已触发（区分长按菜单 vs 短按选中）

  // 缩放相关
  _pinchStartDist: 0,
  _pinchStartScale: 1,
  _lastTapTime: 0,

  // 撤销/重做
  _historyStack: [],
  _historyIndex: -1,

  // 元素缩放（Resize）
  _resizing: false,
  _resizeItemId: null,
  _resizeStartX: 0,
  _resizeStartY: 0,
  _resizeStartW: 0,
  _resizeStartH: 0,
  _resizeItemIdx: -1,

  // 拖拽起始位置（用于 ghost）
  _dragStartX: 0,
  _dragStartY: 0,
  _dragStartW: 0,
  _dragStartH: 0,
  _dragStartType: '',

  // 图层
  _maxZIndex: 0,

  // 录音器
  _recorderInitialized: false,
  _recorderManager: null,

  // ===== 生命周期 =====
  onLoad: function () {
    this._recorderManager = wx.getRecorderManager();
    this._initRecorder();
    this._loadData();
  },

  onShow: function () {
    var app = getApp();
    if (!app.globalData.openid && !wx.getStorageSync('openid')) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
  },

  onUnload: function () {
    if (this.data.isRecording) {
      this._recorderManager.stop();
      this.setData({ isRecording: false });
    }
  },

  // ===== 加载数据 =====
  _loadData: function () {
    var self = this;
    var sys = wx.getSystemInfoSync();
    var rpxToPx = sys.windowWidth / 750;

    storage.loadItems().then(function (items) {
      var maxZ = 0;
      items.forEach(function (item, index) {
        // 兼容旧数据：补充缺失字段
        if (item.zIndex === undefined || item.zIndex === null) {
          item.zIndex = index + 1;
        }
        if (item.width === undefined || item.width === null) {
          if (item.type === 'text') item.width = Math.round(400 * rpxToPx);
          else if (item.type === 'image') item.width = Math.round(240 * rpxToPx);
          else item.width = 0;
        }
        if (item.height === undefined || item.height === null) {
          if (item.type === 'image') item.height = Math.round(240 * rpxToPx);
          else item.height = 0;
        }
        if (item.locked === undefined || item.locked === null) {
          item.locked = false;
        }
        item.dragging = false;
        if (item.zIndex > maxZ) maxZ = item.zIndex;
      });
      self._maxZIndex = maxZ;

      // 按 zIndex 排序
      items.sort(function (a, b) {
        return (a.zIndex || 0) - (b.zIndex || 0);
      });

      self.setData({ items: items, isEmpty: items.length === 0 });

      // 初始化历史栈
      self._historyStack = [self._snapshotItems()];
      self._historyIndex = 0;
      self._updateHistoryBtns();
    }).catch(function (err) {
      console.error('加载数据失败:', err);
      self.setData({ isEmpty: true });
    });
  },

  // ===== 画布触摸 =====
  onCanvasTouchStart: function (e) {
    // 双指缩放开始
    if (e.touches.length >= 2) {
      this._pinchStartDist = this._getPinchDist(e.touches);
      this._pinchStartScale = this.data.scale;
      return;
    }
    if (this._isDraggingItem) return;

    // 点击空白区域时关闭菜单
    this._closeContextMenu();

    var touch = e.touches[0];
    this._canvasStartX = touch.clientX - this.data.translateX;
    this._canvasStartY = touch.clientY - this.data.translateY;
    this._canvasTapStartX = touch.clientX;
    this._canvasTapStartY = touch.clientY;
  },

  onCanvasTouchMove: function (e) {
    // 双指缩放中
    if (e.touches.length >= 2) {
      var newDist = this._getPinchDist(e.touches);
      if (this._pinchStartDist === 0) return;
      var ratio = newDist / this._pinchStartDist;
      var newScale = this._pinchStartScale * ratio;
      var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      this._zoomTo(newScale, midX, midY);
      return;
    }
    if (this._isDraggingItem) return;
    var touch = e.touches[0];
    this.setData({
      translateX: touch.clientX - this._canvasStartX,
      translateY: touch.clientY - this._canvasStartY
    });
  },

  onCanvasTouchEnd: function (e) {
    // 仍有手指在屏幕上（从双指过渡），忽略
    if (e.touches && e.touches.length > 0) return;

    if (e.changedTouches && e.changedTouches.length > 0) {
      var touch = e.changedTouches[0];
      var dx = Math.abs(touch.clientX - this._canvasTapStartX);
      var dy = Math.abs(touch.clientY - this._canvasTapStartY);

      // 仅短距离视为点击（非平移）
      if (dx < 10 && dy < 10) {
        var now = Date.now();
        // 双击检测
        if (now - this._lastTapTime < 300) {
          this._onDoubleTap(touch.clientX, touch.clientY);
          this._lastTapTime = 0;
          return;
        }
        this._lastTapTime = now;
        // 点击空白区域取消选中
        this._clearSelection();
        return;
      }
    }
  },

  // ===== 元素触摸处理（组件通过 bind 事件传递）=====
  onItemTouchStart: function (e) {
    var detail = e.detail;
    var id = detail.id;
    if (!id) return;

    // 关闭已有的菜单
    this._closeContextMenu();
    this._longPressFired = false;

    this._dragItemId = id;
    this._lastTouchX = detail.clientX;
    this._lastTouchY = detail.clientY;
    // 记录触摸起始位置（用于判断移动阈值）
    this._itemTouchStartX = detail.clientX;
    this._itemTouchStartY = detail.clientY;

    // 长按 500ms → 仅弹出上下文菜单（不进入拖拽模式）
    this._longPressTimer = setTimeout(function () {
      this._longPressFired = true;
      wx.vibrateShort({ type: 'light' });

      var idx = this._findIdx(id);
      if (idx >= 0) {
        // 长按时自动选中元素
        this._onSelectItem(id);

        var item = this.data.items[idx];

        // 弹出上下文菜单
        this.setData({
          contextMenu: {
            id: id,
            x: detail.clientX,
            y: detail.clientY,
            type: item.type,
            locked: !!item.locked
          }
        });
      }
    }.bind(this), 500);
  },

  onItemTouchMove: function (e) {
    // 长按菜单弹出后，不再处理移动
    if (this._longPressFired) return;

    var detail = e.detail;

    if (!this._isDraggingItem) {
      var moveDx = Math.abs(detail.clientX - this._itemTouchStartX);
      var moveDy = Math.abs(detail.clientY - this._itemTouchStartY);
      // 手指移动超过 10px → 取消长按检测，进入拖拽模式
      if (moveDx > 10 || moveDy > 10) {
        clearTimeout(this._longPressTimer);

        // 检查元素是否存在及是否锁定
        var idx = this._findIdx(this._dragItemId);
        if (idx < 0) return;
        if (this.data.items[idx].locked) return;

        // 进入拖拽模式
        this._isDraggingItem = true;
        var item = this.data.items[idx];

        // 记录拖拽起始位置（用于 ghost）
        this._dragStartX = item.x;
        this._dragStartY = item.y;
        this._dragStartW = item.width || 200;
        this._dragStartH = item.height || (item.type === 'image' ? 200 : 100);
        this._dragStartType = item.type;

        var update = {};
        update['items[' + idx + '].dragging'] = true;
        this.setData(update);

        // 显示 ghost
        this.setData({
          ghostX: item.x,
          ghostY: item.y,
          ghostW: item.width || 200,
          ghostH: item.height || (item.type === 'image' ? 200 : 100),
          ghostType: item.type,
          ghostVisible: true
        });

        // 选中正在拖拽的元素
        this._onSelectItem(this._dragItemId);
      }
      // 还没进入拖拽模式，不处理移动
      if (!this._isDraggingItem) return;
    }

    // 拖拽移动逻辑
    var scale = this.data.scale || 1;
    var dx = (detail.clientX - this._lastTouchX) / scale;
    var dy = (detail.clientY - this._lastTouchY) / scale;
    this._lastTouchX = detail.clientX;
    this._lastTouchY = detail.clientY;

    var idx = this._findIdx(this._dragItemId);
    if (idx >= 0) {
      var item = this.data.items[idx];
      var update = {};
      update['items[' + idx + '].x'] = item.x + dx;
      update['items[' + idx + '].y'] = item.y + dy;
      this.setData(update);
    }
  },

  onItemTouchEnd: function (e) {
    clearTimeout(this._longPressTimer);

    // 拖拽结束
    if (this._isDraggingItem) {
      var idx = this._findIdx(this._dragItemId);
      if (idx >= 0) {
        var update = {};
        update['items[' + idx + '].dragging'] = false;
        var self = this;
        this.setData(update, function () {
          var item = self.data.items[idx];
          if (item._id) {
            storage.updateItem(item._id, { x: item.x, y: item.y }).catch(function (err) {
              console.error('保存位置失败', err);
            });
          }
          self._pushHistory();
        });
      }
      this.setData({ ghostVisible: false });
      this._isDraggingItem = false;
      this._dragItemId = null;
      return;
    }

    // 长按已触发（菜单已弹出），不做额外处理
    if (this._longPressFired) {
      this._dragItemId = null;
      return;
    }

    // 短按未触发长按 → 选中元素
    var id = e.detail.id;
    if (id) {
      this._onSelectItem(id);
    }
    this._dragItemId = null;
  },

  // ===== 长按菜单操作 =====
  onMenuCopy: function () {
    var menu = this.data.contextMenu;
    if (!menu) return;
    this._closeContextMenu();

    var idx = this._findIdx(menu.id);
    if (idx < 0) return;

    var item = this.data.items[idx];
    var self = this;
    this._maxZIndex++;

    var newItem = {
      type: item.type,
      x: item.x + 30,
      y: item.y + 30,
      title: item.title,
      content: item.content || '',
      src: item.src || '',
      duration: item.duration || 0,
      width: item.width,
      height: item.height,
      zIndex: this._maxZIndex,
      locked: false,
      dragging: false
    };

    storage.createItem(newItem).then(function (res) {
      newItem._id = res._id;
      var items = self.data.items.concat([newItem]);
      items.sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); });
      self.setData({ items: items, selectedId: newItem._id, hasSelection: true });
      self._pushHistory();
    }).catch(function (err) {
      console.error('复制失败:', err);
      wx.showToast({ title: '复制失败', icon: 'none' });
    });
  },

  onMenuDelete: function () {
    var menu = this.data.contextMenu;
    if (!menu) return;
    var id = menu.id;
    this._closeContextMenu();
    var self = this;

    // 乐观删除：先从 UI 层移除
    var items = self.data.items.filter(function (i) { return i._id !== id; });
    self.setData({
      items: items,
      selectedId: '',
      hasSelection: false,
      isEmpty: items.length === 0
    });
    self._pushHistory();

    storage.deleteItem(id).catch(function (err) {
      console.error('云端删除失败:', err);
    });
  },

  onMenuLock: function () {
    var menu = this.data.contextMenu;
    if (!menu) return;

    var idx = this._findIdx(menu.id);
    if (idx < 0) return;

    var item = this.data.items[idx];
    var newLocked = !item.locked;
    var update = {};
    update['items[' + idx + '].locked'] = newLocked;
    var self = this;

    this.setData(update, function () {
      if (item._id) {
        storage.updateItem(item._id, { locked: newLocked }).catch(function (err) {
          console.error('保存锁定状态失败', err);
        });
      }
      self._pushHistory();
    });

    this._closeContextMenu();
  },

  onMenuBringToFront: function () {
    var menu = this.data.contextMenu;
    if (!menu) return;

    var idx = this._findIdx(menu.id);
    if (idx < 0) return;

    this._maxZIndex++;
    var newZ = this._maxZIndex;
    var update = {};
    update['items[' + idx + '].zIndex'] = newZ;
    var self = this;

    this.setData(update, function () {
      var item = self.data.items[idx];
      if (item._id) {
        storage.updateItem(item._id, { zIndex: newZ }).catch(function (err) {
          console.error('保存层级失败', err);
        });
      }
      self._pushHistory();
    });

    this._closeContextMenu();
  },

  onMenuSendToBack: function () {
    var menu = this.data.contextMenu;
    if (!menu) return;

    var idx = this._findIdx(menu.id);
    if (idx < 0) return;

    var minZ = Infinity;
    this.data.items.forEach(function (item) {
      var z = item.zIndex || 0;
      if (z < minZ) minZ = z;
    });
    var newZ = minZ - 1;
    var update = {};
    update['items[' + idx + '].zIndex'] = newZ;
    var self = this;

    this.setData(update, function () {
      var item = self.data.items[idx];
      if (item._id) {
        storage.updateItem(item._id, { zIndex: newZ }).catch(function (err) {
          console.error('保存层级失败', err);
        });
      }
      self._pushHistory();
    });

    this._closeContextMenu();
  },

  // 阻止冒泡辅助
  stopPropagation: function () {
    // 空函数，仅用于 catchtap 阻止冒泡
  },

  _closeContextMenu: function () {
    if (this.data.contextMenu) {
      this.setData({ contextMenu: null });
    }
  },

  // 点击菜单外部关闭
  onMenuBackdropTap: function () {
    this._closeContextMenu();
  },

  // ===== 缩放控件操作 =====
  onZoomIn: function () {
    var sys = wx.getSystemInfoSync();
    this._zoomTo(this.data.scale + 0.2, sys.windowWidth / 2, sys.windowHeight / 2);
  },

  onZoomOut: function () {
    var sys = wx.getSystemInfoSync();
    this._zoomTo(this.data.scale - 0.2, sys.windowWidth / 2, sys.windowHeight / 2);
  },

  onZoomReset: function () {
    var sys = wx.getSystemInfoSync();
    this._zoomTo(1, sys.windowWidth / 2, sys.windowHeight / 2);
  },

  onFitAll: function () {
    var items = this.data.items;
    if (items.length === 0) {
      var sys = wx.getSystemInfoSync();
      this._zoomTo(1, sys.windowWidth / 2, sys.windowHeight / 2);
      return;
    }

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    items.forEach(function (item) {
      var w = item.width || 200;
      var h = item.height || (item.type === 'image' ? 200 : 100);
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + w);
      maxY = Math.max(maxY, item.y + h);
    });

    var sys = wx.getSystemInfoSync();
    var padding = 80;
    var contentW = Math.max(maxX - minX, 1);
    var contentH = Math.max(maxY - minY, 1);
    var scaleX = (sys.windowWidth - padding * 2) / contentW;
    var scaleY = (sys.windowHeight - padding * 2) / contentH;
    var newScale = Math.min(scaleX, scaleY, 3.0);
    newScale = Math.max(0.25, newScale);

    var centerX = (minX + maxX) / 2;
    var centerY = (minY + maxY) / 2;
    var tx = sys.windowWidth / 2 - centerX * newScale;
    var ty = sys.windowHeight / 2 - centerY * newScale;

    this.setData({
      scale: newScale,
      scaleText: Math.round(newScale * 100) + '%',
      translateX: tx,
      translateY: ty
    });
  },

  _zoomTo: function (newScale, cx, cy) {
    newScale = Math.max(0.25, Math.min(3.0, newScale));
    var oldScale = this.data.scale || 1;
    var ox = this.data.translateX;
    var oy = this.data.translateY;
    var nx = cx - (cx - ox) * newScale / oldScale;
    var ny = cy - (cy - oy) * newScale / oldScale;
    this.setData({
      scale: newScale,
      scaleText: Math.round(newScale * 100) + '%',
      translateX: nx,
      translateY: ny
    });
  },

  _getPinchDist: function (touches) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },

  _onDoubleTap: function (x, y) {
    if (Math.abs(this.data.scale - 1) < 0.01) {
      this._zoomTo(1.5, x, y);
    } else {
      this._zoomTo(1, x, y);
    }
  },

  // ===== 撤销/重做 =====
  onUndo: function () {
    if (this._historyIndex <= 0) return;
    this._historyIndex--;
    var items = this._historyStack[this._historyIndex].map(function (item) {
      return Object.assign({}, item, { dragging: false });
    });
    this.setData({ items: items });
    this._updateHistoryBtns();
    this._clearSelection();
  },

  onRedo: function () {
    if (this._historyIndex >= this._historyStack.length - 1) return;
    this._historyIndex++;
    var items = this._historyStack[this._historyIndex].map(function (item) {
      return Object.assign({}, item, { dragging: false });
    });
    this.setData({ items: items });
    this._updateHistoryBtns();
    this._clearSelection();
  },

  _pushHistory: function () {
    this._historyStack = this._historyStack.slice(0, this._historyIndex + 1);
    this._historyStack.push(this._snapshotItems());
    this._historyIndex = this._historyStack.length - 1;
    if (this._historyStack.length > 50) {
      this._historyStack.shift();
      this._historyIndex--;
    }
    this._updateHistoryBtns();
  },

  _snapshotItems: function () {
    return this.data.items.map(function (item) {
      return {
        _id: item._id,
        type: item.type,
        x: item.x,
        y: item.y,
        title: item.title,
        content: item.content,
        src: item.src,
        duration: item.duration,
        width: item.width,
        height: item.height,
        zIndex: item.zIndex,
        locked: item.locked
      };
    });
  },

  _updateHistoryBtns: function () {
    this.setData({
      canUndo: this._historyIndex > 0,
      canRedo: this._historyIndex < this._historyStack.length - 1
    });
  },

  // ===== 选中/取消 =====
  _onSelectItem: function (id) {
    this.setData({ selectedId: id, hasSelection: true });
  },

  _clearSelection: function () {
    if (!this.data.selectedId) return;
    this.setData({ selectedId: '', hasSelection: false });
  },

  // ===== 复制元素（选中栏）=====
  onCopyItem: function () {
    var selectedId = this.data.selectedId;
    if (!selectedId) return;
    var idx = this._findIdx(selectedId);
    if (idx < 0) return;

    var item = this.data.items[idx];
    var self = this;
    this._maxZIndex++;

    var newItem = {
      type: item.type,
      x: item.x + 30,
      y: item.y + 30,
      title: item.title,
      content: item.content || '',
      src: item.src || '',
      duration: item.duration || 0,
      width: item.width,
      height: item.height,
      zIndex: this._maxZIndex,
      locked: false,
      dragging: false
    };

    storage.createItem(newItem).then(function (res) {
      newItem._id = res._id;
      var items = self.data.items.concat([newItem]);
      items.sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); });
      self.setData({ items: items, selectedId: newItem._id, hasSelection: true });
      self._pushHistory();
    }).catch(function (err) {
      console.error('复制失败:', err);
      wx.showToast({ title: '复制失败', icon: 'none' });
    });
  },

  // ===== 删除选中元素 =====
  onDeleteSelected: function () {
    var selectedId = this.data.selectedId;
    if (!selectedId) return;
    var self = this;

    // 乐观删除：先从 UI 层移除
    var items = self.data.items.filter(function (i) { return i._id !== selectedId; });
    self.setData({
      items: items,
      selectedId: '',
      hasSelection: false,
      isEmpty: items.length === 0
    });
    self._pushHistory();

    storage.deleteItem(selectedId).catch(function (err) {
      console.error('云端删除失败:', err);
    });
  },

  // ===== 锁定/解锁选中元素（选中栏）=====
  onToggleLock: function () {
    var selectedId = this.data.selectedId;
    if (!selectedId) return;

    var idx = this._findIdx(selectedId);
    if (idx < 0) return;

    var item = this.data.items[idx];
    var newLocked = !item.locked;
    var update = {};
    update['items[' + idx + '].locked'] = newLocked;
    var self = this;

    this.setData(update, function () {
      if (item._id) {
        storage.updateItem(item._id, { locked: newLocked }).catch(function (err) {
          console.error('保存锁定状态失败', err);
        });
      }
      self._pushHistory();
    });
  },

  // ===== 图层排序 =====
  onBringToFront: function () {
    var selectedId = this.data.selectedId;
    if (!selectedId) return;
    var idx = this._findIdx(selectedId);
    if (idx < 0) return;

    this._maxZIndex++;
    var newZ = this._maxZIndex;
    var update = {};
    update['items[' + idx + '].zIndex'] = newZ;
    var self = this;

    this.setData(update, function () {
      var item = self.data.items[idx];
      if (item._id) {
        storage.updateItem(item._id, { zIndex: newZ }).catch(function (err) {
          console.error('保存层级失败', err);
        });
      }
      self._pushHistory();
    });
  },

  onSendToBack: function () {
    var selectedId = this.data.selectedId;
    if (!selectedId) return;
    var idx = this._findIdx(selectedId);
    if (idx < 0) return;

    var minZ = Infinity;
    this.data.items.forEach(function (item) {
      var z = item.zIndex || 0;
      if (z < minZ) minZ = z;
    });
    var newZ = minZ - 1;
    var update = {};
    update['items[' + idx + '].zIndex'] = newZ;
    var self = this;

    this.setData(update, function () {
      var item = self.data.items[idx];
      if (item._id) {
        storage.updateItem(item._id, { zIndex: newZ }).catch(function (err) {
          console.error('保存层级失败', err);
        });
      }
      self._pushHistory();
    });
  },

  // ===== 元素缩放（Resize 手柄）=====
  onResizeStart: function (e) {
    var detail = e.detail;
    if (!detail.id) return;

    // 锁定元素不可缩放
    var idx = this._findIdx(detail.id);
    if (idx >= 0 && this.data.items[idx].locked) return;

    this._resizing = true;
    this._resizeItemId = detail.id;
    this._resizeStartX = detail.clientX;
    this._resizeStartY = detail.clientY;

    if (idx >= 0) {
      this._resizeItemIdx = idx;
      var item = this.data.items[idx];
      this._resizeStartW = item.width || 200;
      this._resizeStartH = item.height || 200;
    }
  },

  onResizeMove: function (e) {
    if (!this._resizing) return;
    var detail = e.detail;
    var idx = this._resizeItemIdx;
    if (idx < 0) return;

    var scale = this.data.scale || 1;
    var dx = (detail.clientX - this._resizeStartX) / scale;
    var item = this.data.items[idx];
    var update = {};

    if (item.type === 'text') {
      update['items[' + idx + '].width'] = Math.max(120, Math.round(this._resizeStartW + dx));
    } else if (item.type === 'image') {
      var newW = Math.max(60, Math.round(this._resizeStartW + dx));
      var ratio = this._resizeStartH / Math.max(this._resizeStartW, 1);
      update['items[' + idx + '].width'] = newW;
      update['items[' + idx + '].height'] = Math.round(newW * ratio);
    }
    this.setData(update);
  },

  onResizeEnd: function (e) {
    if (!this._resizing) return;
    this._resizing = false;

    var idx = this._resizeItemIdx;
    if (idx >= 0) {
      var item = this.data.items[idx];
      if (item._id) {
        var updateData = { width: item.width };
        if (item.type === 'image') updateData.height = item.height;
        storage.updateItem(item._id, updateData).catch(function (err) {
          console.error('保存尺寸失败', err);
        });
      }
      this._pushHistory();
    }
    this._resizeItemId = null;
    this._resizeItemIdx = -1;
  },

  // ===== 组件事件处理 =====
  onDeleteItem: function (e) {
    var id = e.detail.id;
    if (!id) return;
    var self = this;

    // 乐观删除：先从 UI 层移除，再异步删云端
    var items = self.data.items.filter(function (i) { return i._id !== id; });
    var newSelectedId = self.data.selectedId === id ? '' : self.data.selectedId;
    self.setData({
      items: items,
      selectedId: newSelectedId,
      hasSelection: !!newSelectedId,
      isEmpty: items.length === 0
    });
    self._pushHistory();

    storage.deleteItem(id).catch(function (err) {
      console.error('云端删除失败:', err);
    });
  },

  onUpdateItem: function (e) {
    var detail = e.detail;
    if (!detail.id) return;

    // 锁定元素不可编辑内容
    var idx = this._findIdx(detail.id);
    if (idx >= 0 && this.data.items[idx].locked) return;

    if (idx >= 0) {
      var update = {};
      update['items[' + idx + '].' + detail.field] = detail.value;
      var self = this;
      this.setData(update, function () {
        var item = self.data.items[idx];
        if (item._id) {
          var updateData = {};
          updateData[detail.field] = detail.value;
          storage.updateItem(item._id, updateData).catch(function (err) {
            console.error('更新失败', err);
          });
        }
        self._pushHistory();
      });
    }
  },

  // ===== 底部工具栏操作 =====
  onAddText: function () {
    var pos = this._getViewportCenter();
    this._createItem({
      type: 'text',
      title: '',
      content: '',
      x: pos.x,
      y: pos.y
    });
  },

  onAddImage: function () {
    var self = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var tempPath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中...' });
        storage.saveCloudFile(tempPath).then(function (fileID) {
          wx.hideLoading();
          var pos = self._getViewportCenter();
          self._createItem({
            type: 'image',
            title: '',
            src: fileID,
            x: pos.x,
            y: pos.y
          });
        }).catch(function (err) {
          wx.hideLoading();
          console.error('图片上传失败:', err);
          wx.showToast({ title: '上传失败', icon: 'none' });
        });
      },
      fail: function (err) {
        console.error('chooseMedia error:', err);
      }
    });
  },

  onRecordToggle: function () {
    if (!this.data.isRecording) {
      wx.authorize({
        scope: 'scope.record',
        success: function () {
          this._recorderManager.start({
            format: 'mp3',
            duration: 60000
          });
          this.setData({ isRecording: true });
        }.bind(this),
        fail: function () {
          wx.showModal({
            title: '需要录音权限',
            content: '请在设置中开启麦克风权限，以使用录音功能',
            confirmText: '去设置',
            success: function (modalRes) {
              if (modalRes.confirm) {
                wx.openSetting();
              }
            }
          });
        }
      });
    } else {
      this._recorderManager.stop();
      this.setData({ isRecording: false });
    }
  },

  // ===== 录音器初始化 =====
  _initRecorder: function () {
    if (this._recorderInitialized) return;
    this._recorderInitialized = true;

    var self = this;

    this._recorderManager.onStart(function () {
      // 录音开始
    });

    this._recorderManager.onStop(function (res) {
      var tempPath = res.tempFilePath;
      var duration = Math.ceil(res.duration / 1000) || 0;
      wx.showLoading({ title: '保存中...' });
      storage.saveCloudFile(tempPath).then(function (fileID) {
        wx.hideLoading();
        var pos = self._getViewportCenter();
        self._createItem({
          type: 'audio',
          title: '',
          src: fileID,
          duration: duration,
          x: pos.x,
          y: pos.y
        });
      }).catch(function (err) {
        wx.hideLoading();
        console.error('音频上传失败:', err);
        wx.showToast({ title: '保存失败', icon: 'none' });
      });
    });

    this._recorderManager.onError(function (err) {
      console.error('Recorder error:', err);
      self.setData({ isRecording: false });
    });
  },

  // ===== 辅助方法 =====

  _getViewportCenter: function () {
    var sys = wx.getSystemInfoSync();
    var scale = this.data.scale || 1;
    return {
      x: Math.round((sys.windowWidth / 2 - this.data.translateX) / scale - 100),
      y: Math.round((sys.windowHeight / 2 - this.data.translateY) / scale - 80)
    };
  },

  _createItem: function (data) {
    var self = this;
    var sys = wx.getSystemInfoSync();
    var rpxToPx = sys.windowWidth / 750;
    this._maxZIndex++;

    var item = {
      type: data.type,
      x: data.x,
      y: data.y,
      title: data.title || '',
      content: data.content || '',
      src: data.src || '',
      duration: data.duration || 0,
      width: data.width || (data.type === 'text' ? Math.round(400 * rpxToPx) : (data.type === 'image' ? Math.round(240 * rpxToPx) : 0)),
      height: data.height || (data.type === 'image' ? Math.round(240 * rpxToPx) : 0),
      zIndex: this._maxZIndex,
      locked: false,
      dragging: false
    };

    storage.createItem(item).then(function (res) {
      item._id = res._id;
      var items = self.data.items.concat([item]);
      items.sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); });
      self.setData({ items: items, isEmpty: false });
      self._pushHistory();
    }).catch(function (err) {
      console.error('创建元素失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  _findIdx: function (id) {
    return this.data.items.findIndex(function (item) { return item._id === id; });
  }
});
