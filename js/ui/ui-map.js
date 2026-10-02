/* ============================================================================
 * js/ui/ui-map.js — v9.0.2
 * 內容：
 *   GameMap — 地圖主模組
 *     ★ v9.0.2 節點顯示優化（縮圈 50%）：
 *       - 外框 = 盟專屬色，中間透明
 *       - 圈內顯示：城池名 + 陣營 + 編號
 *       - 名稱折行（每行 5 字；後綴獨立第 2 行）
 *       - 陣營 (本)/(同)/(敵)/(共敵)/(NPC)
 *       - 等級徽章：圈內右上角（縮小）
 *       - 盟徽：取消
 *       - 縮放 < 0.5x 隱藏文字
 *       - 圈半徑：18/21/24/27（原 36/42/48/54 縮 50%）
 *       - 字級：8/11/14（原 10/14/18 縮約 50%）
 *     ★ v9.0.2：buildAllianceColorPicker 已移至 ui-core.js
 * ========================================================================== */
(function(){
'use strict';

window.SLG = window.SLG || {};

/* ── 從全域取得 ── */
const getState = () => window.SLG.state;
const esc = (s) => window.SLG.esc(s);
const logSystem = (t) => window.SLG.logSystem(t);
const getCityMapId = (c) => window.SLG.getCityMapId(c);
const getAuth = () => window.SLG.Auth;

/* ★ v9.0.2：陣營短標籤 */
const SIDE_SHORT_LABELS = {
  self: '(本)',
  ally: '(同)',
  enemy: '(敵)',
  common_enemy: '(共敵)',
  npc: '(NPC)',
};

/* ★ v9.0.2：依縮放決定字體大小（縮小 50%） */
function getFontSizeByZoom(scale){
  if(scale < 0.5) return 0;      /* 隱藏 */
  if(scale < 1.0) return 8;      /* 10 → 8 */
  if(scale < 2.0) return 11;     /* 14 → 11 */
  return 14;                      /* 18 → 14 */
}

/* ★ v9.0.2：依文字行數決定圈半徑（縮小 50%） */
function getRadiusByLineCount(lineCount){
  if(lineCount <= 1) return 18;   /* 36 → 18 */
  if(lineCount === 2) return 21;  /* 42 → 21 */
  if(lineCount === 3) return 24;  /* 48 → 24 */
  return 27;                       /* 54 → 27 */
}

/* ★ v9.0.2：城池名折行（每行 5 字；後綴獨立第 2 行） */
function wrapCityName(name, suffixes){
  if(!name) return [''];
  const MAX_PER_LINE = 5;
  const suffixList = suffixes || [];

  /* ① 檢查是否含後綴 → 拆成兩段 */
  let prefix = name;
  let suffix = '';
  for(const sfx of suffixList){
    if(!sfx) continue;
    const idx = name.lastIndexOf(sfx);
    if(idx > 0 && idx + sfx.length === name.length){
      prefix = name.slice(0, idx);
      suffix = sfx;
      break;
    }
  }

  /* ② prefix 依 MAX_PER_LINE 折行 */
  const lines = [];
  if(prefix.length <= MAX_PER_LINE){
    lines.push(prefix);
  } else {
    for(let i = 0; i < prefix.length; i += MAX_PER_LINE){
      lines.push(prefix.slice(i, i + MAX_PER_LINE));
    }
  }

  /* ③ 若有後綴 → 加第 2 行（獨立） */
  if(suffix){
    lines.push(suffix);
  }

  return lines;
}

/* ============================================================
   GameMap
   ============================================================ */
const GameMap = (() => {
  let canvas, ctx, containerEl, outerEl;
  let view = { x: 0, y: 0, scale: 1 };
  let isFullscreen = false;
  let nodePositions = new Map();
  let layoutDirty = true;
  let dragging = false;
  let dragStart = null;
  let nodeDragging = null;
  let hoveredCityId = null;
  let highlight = null;
  let currentZoneFilter = 'all';
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let pinchStartCenter = null;
  let touchPanStart = null;

  let mapMode = 'none';
  let pendingWarCount = 0;
  let pendingRouteCount = 0;

  let routeFromCityId = '';
  let warFromCityId = '';
  let warHoverTgtId = '';

  let modePointerStart = null;
  let modeTouchStart = null;

  let baseMapVisible = true;

  const CANVAS_W = 2000, CANVAS_H = 2000;
  const LS_MAP_ZONE_KEY = 'slg_map_zone_v862';
  const LS_BASE_MAP_KEY = 'slg_base_map_visible_v893';

  let activeMapId = '';
  let activeMapNodes = null;
  let activeMapImageEl = null;
  let lastActiveMapId = '';

  let longPressTimer = null;
  let longPressStart = null;
  let longPressTriggered = false;

  /* ══════════════════════════════════════════════════════
     初始化
     ══════════════════════════════════════════════════════ */
  function init(){
    containerEl = document.getElementById('gameMapContainer');
    outerEl = document.getElementById('gameMapOuter');
    if(!containerEl) return;
    canvas = document.getElementById('gameMapCanvas');
    if(!canvas) return;
    ctx = canvas.getContext('2d');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    canvas.style.width = CANVAS_W + 'px';
    canvas.style.height = CANVAS_H + 'px';

    loadZoneFilter();
    loadBaseMapPref();
    applyBaseMapUI();

    containerEl.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', () => { hoveredCityId = null; });

    containerEl.addEventListener('touchstart', onTouchStart, { passive: false });
    containerEl.addEventListener('touchmove', onTouchMove, { passive: false });
    containerEl.addEventListener('touchend', onTouchEnd, { passive: false });
    containerEl.addEventListener('touchcancel', onTouchEnd, { passive: false });

    const btnRoute = document.getElementById('btnMapRouteMode');
    if(btnRoute && !btnRoute.dataset.bound){
      btnRoute.dataset.bound = '1';
      btnRoute.addEventListener('click', () => setMapMode('route'));
    }
    const btnWar = document.getElementById('btnMapWarMode');
    if(btnWar && !btnWar.dataset.bound){
      btnWar.dataset.bound = '1';
      btnWar.addEventListener('click', () => setMapMode('war'));
    }
    const btnCity = document.getElementById('btnMapCityMode');
    if(btnCity && !btnCity.dataset.bound){
      btnCity.dataset.bound = '1';
      btnCity.addEventListener('click', () => setMapMode('city'));
    }

    const btnBaseMap = document.getElementById('btnMapBaseMap');
    if(btnBaseMap && !btnBaseMap.dataset.bound){
      btnBaseMap.dataset.bound = '1';
      btnBaseMap.addEventListener('click', toggleBaseMap);
    }

    const btnSyncNodes = document.getElementById('btnMapSyncNodes');
    if(btnSyncNodes && !btnSyncNodes.dataset.bound){
      btnSyncNodes.dataset.bound = '1';
      btnSyncNodes.addEventListener('click', syncNodesToMapLibrary);
    }

    const btnReconcile = document.getElementById('btnMapReconcile');
    if(btnReconcile && !btnReconcile.dataset.bound){
      btnReconcile.dataset.bound = '1';
      btnReconcile.addEventListener('click', reconcileData);
    }

    const btnRelayout = document.getElementById('btnMapRelayout');
    if(btnRelayout && !btnRelayout.dataset.bound){
      btnRelayout.dataset.bound = '1';
      btnRelayout.addEventListener('click', () => {
        layoutDirty = true;
        view = { x: 0, y: 0, scale: 1 };
        applyView();
        render();
      });
    }

    const btnFit = document.getElementById('btnMapFit');
    if(btnFit && !btnFit.dataset.bound){
      btnFit.dataset.bound = '1';
      btnFit.addEventListener('click', () => { fitView(); applyView(); render(); });
    }

    const btnFullscreen = document.getElementById('btnMapFullscreen');
    if(btnFullscreen && !btnFullscreen.dataset.bound){
      btnFullscreen.dataset.bound = '1';
      btnFullscreen.addEventListener('click', toggleFullscreen);
    }

    const btnFullscreenExit = document.getElementById('mapFullscreenExit');
    if(btnFullscreenExit && !btnFullscreenExit.dataset.bound){
      btnFullscreenExit.dataset.bound = '1';
      btnFullscreenExit.addEventListener('click', () => {
        if(isFullscreen) toggleFullscreen();
      });
    }

    const btnClearHighlight = document.getElementById('btnMapClearHighlight');
    if(btnClearHighlight && !btnClearHighlight.dataset.bound){
      btnClearHighlight.dataset.bound = '1';
      btnClearHighlight.addEventListener('click', () => {
        if(window.SLG.clearDistanceHighlight) window.SLG.clearDistanceHighlight();
      });
    }

    const btnExportPDF = document.getElementById('btnMapExportPDF');
    if(btnExportPDF && !btnExportPDF.dataset.bound){
      btnExportPDF.dataset.bound = '1';
      btnExportPDF.addEventListener('click', exportAsPDF);
    }

    /* ★ v9.0.1 新增：盟色對照表浮動按鈕 */
    const btnAllianceColor = document.getElementById('btnAllianceColorList');
    if(btnAllianceColor && !btnAllianceColor.dataset.bound){
      btnAllianceColor.dataset.bound = '1';
      btnAllianceColor.addEventListener('click', () => {
        if(window.SLG.openAllianceColorModal){
          window.SLG.openAllianceColorModal();
        }
      });
    }

    bindFloatButtons();

    const mapZoneSel = document.getElementById('mapZoneSelect');
    if(mapZoneSel && !mapZoneSel.dataset.bound){
      mapZoneSel.dataset.bound = '1';
      mapZoneSel.addEventListener('change', function(){
        setZoneFilter(this.value);
      });
    }

    if(window.SLG.EVT && window.SLG.on){
      window.SLG.on(window.SLG.EVT.DISTANCE_HIGHLIGHT, (h) => {
        highlight = h;
        render();
      });
      window.SLG.on(window.SLG.EVT.DISTANCE_CLEAR, () => {
        highlight = null;
        render();
      });
      window.SLG.on(window.SLG.EVT.MAP_LIBRARY_UPDATED, () => {
        onMapLibraryChanged();
      });
      /* ★ v9.0.1：盟色變更 → 重繪 */
      if(window.SLG.EVT.ALLIANCE_COLOR_CHANGED){
        window.SLG.on(window.SLG.EVT.ALLIANCE_COLOR_CHANGED, () => {
          render();
        });
      }
      /* ★ v9.0.1：後綴變更 → 重繪 */
      if(window.SLG.EVT.CITY_SUFFIXES_CHANGED){
        window.SLG.on(window.SLG.EVT.CITY_SUFFIXES_CHANGED, () => {
          render();
        });
      }
    }

    window.addEventListener('resize', () => {
      if(containerEl) render();
    });

    refreshZoneSelector();
    onMapLibraryChanged();

    if(!window.__fullscreenEscBound){
      window.__fullscreenEscBound = true;
      document.addEventListener('keydown', (e) => {
        if(e.key === 'Escape' && isFullscreen){
          toggleFullscreen();
        }
      });
    }
  }

  /* ══════════════════════════════════════════════════════
     浮動按鈕
     ══════════════════════════════════════════════════════ */
  function bindFloatButtons(){
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if(el && !el.dataset.bound){
        el.dataset.bound = '1';
        el.addEventListener('click', fn);
      }
    };
    bind('btnMapZoomIn', () => zoomAtCenter(1.25));
    bind('btnMapZoomOut', () => zoomAtCenter(1 / 1.25));
    bind('btnMapZoomFitBtn', () => { fitView(); applyView(); render(); });
    bind('btnMapZoomReset', () => {
      view = { x: 0, y: 0, scale: 1 };
      if(containerEl){ containerEl.scrollLeft = 0; containerEl.scrollTop = 0; }
      applyView();
      render();
    });
    bind('btnMapPanLeft',  () => panBy(-1, 0));
    bind('btnMapPanRight', () => panBy( 1, 0));
    bind('btnMapPanUp',    () => panBy( 0, -1));
    bind('btnMapPanDown',  () => panBy( 0,  1));
    bind('mapWarSaveBtn', saveWarChanges);
    bind('mapRouteSaveBtn', saveRouteChanges);
  }

  function zoomAtCenter(factor){
    if(!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const mx = (cx - rect.left + containerEl.scrollLeft) / view.scale;
    const my = (cy - rect.top + containerEl.scrollTop) / view.scale;
    const newScale = Math.max(0.2, Math.min(3, view.scale * factor));
    view.x = mx - (cx - rect.left + containerEl.scrollLeft) / newScale;
    view.y = my - (cy - rect.top + containerEl.scrollTop) / newScale;
    view.scale = newScale;
    applyView();
    render();
  }

  function panBy(dirX, dirY){
    if(!containerEl) return;
    const stepX = containerEl.clientWidth / 3;
    const stepY = containerEl.clientHeight / 3;
    containerEl.scrollLeft += dirX * stepX;
    containerEl.scrollTop += dirY * stepY;
  }

  /* ══════════════════════════════════════════════════════
     模式切換（互斥）
     ══════════════════════════════════════════════════════ */
  function setMapMode(newMode){
    if(mapMode === newMode) newMode = 'none';
    mapMode = newMode;
    routeFromCityId = '';
    warFromCityId = '';
    warHoverTgtId = '';
    modePointerStart = null;
    modeTouchStart = null;

    updateModeButtons();
    if(outerEl){
      outerEl.classList.toggle('route-mode', mapMode === 'route');
      outerEl.classList.toggle('war-mode', mapMode === 'war');
      outerEl.classList.toggle('city-mode', mapMode === 'city');
    }
    updateModeHint();
    applyCursor();
    render();
  }

  function updateModeButtons(){
    const btnRoute = document.getElementById('btnMapRouteMode');
    if(btnRoute){
      btnRoute.textContent = mapMode === 'route' ? '🛣️ 路線：開' : '🛣️ 路線：關';
      btnRoute.classList.toggle('active', mapMode === 'route');
    }
    const btnWar = document.getElementById('btnMapWarMode');
    if(btnWar){
      btnWar.textContent = mapMode === 'war' ? '⚔️ 宣戰：開' : '⚔️ 宣戰：關';
      btnWar.classList.toggle('active', mapMode === 'war');
    }
    const btnCity = document.getElementById('btnMapCityMode');
    if(btnCity){
      btnCity.textContent = mapMode === 'city' ? '🏙️ 城池編輯：開' : '🏙️ 城池編輯：關';
      btnCity.classList.toggle('active', mapMode === 'city');
    }
  }

  function updateModeHint(){
    const hint = document.getElementById('mapModeHint');
    const hintText = document.getElementById('mapModeHintText');
    if(!hint || !hintText) return;

    hint.classList.remove('mode-route','mode-war','mode-city');
    if(mapMode === 'none'){
      hint.classList.add('hidden');
      return;
    }
    hint.classList.remove('hidden');

    if(mapMode === 'route'){
      hint.classList.add('mode-route');
      if(!routeFromCityId){
        hintText.textContent = '🛣️ 請點第一座城';
      } else {
        const c = getState().cities.find(x => x.id === routeFromCityId);
        hintText.textContent = `🛣️ 已選「${c ? c.name : '?'}」→ 請點第二座城（再點同對城可刪除）`;
      }
    } else if(mapMode === 'war'){
      hint.classList.add('mode-war');
      if(!warFromCityId){
        hintText.textContent = '⚔️ 請點出兵城';
      } else {
        const c = getState().cities.find(x => x.id === warFromCityId);
        hintText.textContent = `⚔️ 出兵城：${c ? c.name : '?'} — 請點目標城`;
      }
    } else if(mapMode === 'city'){
      hint.classList.add('mode-city');
      hintText.textContent = '🏙️ 點城池編輯，點空白新增';
    }
  }

  function applyCursor(){
    if(!canvas) return;
    if(mapMode === 'none') canvas.style.cursor = 'grab';
    else canvas.style.cursor = 'crosshair';
  }

  /* ══════════════════════════════════════════════════════
     地圖庫切換
     ══════════════════════════════════════════════════════ */
  function onMapLibraryChanged(){
    const state = getState();
    const newId = state.mapLibrary.activeMapId || '';
    const map = newId ? window.SLG.getLoadedMap(newId) : null;
    activeMapId = newId;
    activeMapNodes = (map && map.nodes) ? map.nodes : null;
    activeMapImageEl = (map && map.imageEl) ? map.imageEl : null;

    const mapChanged = (lastActiveMapId !== newId);
    lastActiveMapId = newId;

    layoutDirty = true;
    nodePositions.clear();

    if(activeMapImageEl){
      const w = activeMapImageEl.naturalWidth || map.imageWidth || CANVAS_W;
      const h = activeMapImageEl.naturalHeight || map.imageHeight || CANVAS_H;
      if(canvas.width !== w || canvas.height !== h){
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
      }
    } else {
      if(canvas.width !== CANVAS_W || canvas.height !== CANVAS_H){
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
        canvas.style.width = CANVAS_W + 'px';
        canvas.style.height = CANVAS_H + 'px';
      }
    }

    if(mapChanged){
      view = { x: 0, y: 0, scale: 1 };
      applyView();
      render();
      if(containerEl && activeMapImageEl){
        fitView();
        applyView();
        render();
      }
    } else {
      render();
    }
  }

  /* ══════════════════════════════════════════════════════
     底圖 / 戰區偏好
     ══════════════════════════════════════════════════════ */
  function loadZoneFilter(){
    try{
      const saved = localStorage.getItem(LS_MAP_ZONE_KEY);
      if(saved) currentZoneFilter = saved;
    }catch(e){}
  }

  function saveZoneFilter(){
    try{ localStorage.setItem(LS_MAP_ZONE_KEY, currentZoneFilter); }catch(e){}
  }

  function loadBaseMapPref(){
    try{
      const saved = localStorage.getItem(LS_BASE_MAP_KEY);
      if(saved === '0') baseMapVisible = false;
      else if(saved === '1') baseMapVisible = true;
    }catch(e){}
  }

  function saveBaseMapPref(){
    try{ localStorage.setItem(LS_BASE_MAP_KEY, baseMapVisible ? '1' : '0'); }catch(e){}
  }

  function applyBaseMapUI(){
    const btnBaseMap = document.getElementById('btnMapBaseMap');
    if(btnBaseMap){
      btnBaseMap.textContent = baseMapVisible ? '🖼️ 底圖：開' : '🖼️ 底圖：關';
      btnBaseMap.classList.toggle('active', !baseMapVisible);
    }
    if(outerEl) outerEl.classList.toggle('base-map-off', !baseMapVisible);
  }

  function toggleBaseMap(){
    baseMapVisible = !baseMapVisible;
    saveBaseMapPref();
    applyBaseMapUI();
    render();
    logSystem(baseMapVisible ? '🖼️ 底圖：開' : '🖼️ 底圖：關');
  }

  /* ══════════════════════════════════════════════════════
     全螢幕
     ══════════════════════════════════════════════════════ */
  function toggleFullscreen(){
    isFullscreen = !isFullscreen;

    if(outerEl){
      outerEl.classList.toggle('fullscreen-mode', isFullscreen);
    }
    document.body.classList.toggle('map-fullscreen', isFullscreen);

    const btn = document.getElementById('btnMapFullscreen');
    if(btn){
      btn.textContent = isFullscreen ? '✖️ 退出全螢幕' : '🖥️ 全螢幕';
      btn.classList.toggle('active', isFullscreen);
    }

    logSystem(isFullscreen ? '🖥️ 進入全螢幕地圖' : '↩️ 退出全螢幕地圖');

    setTimeout(() => {
      if(containerEl){
        fitView();
        applyView();
        render();
      }
    }, 150);
  }

  /* ══════════════════════════════════════════════════════
     長按刪除節點（連城池）
     ══════════════════════════════════════════════════════ */
  async function showNodeDeleteConfirm(cityId){
    const state = getState();
    const city = state.cities.find(c => c.id === cityId);
    if(!city) return;

    const ok = confirm(
      `確定刪除「${city.name}」嗎？\n\n` +
      `⚠️ 這會同時刪除：\n` +
      `  • 城池資料\n` +
      `  • 地圖節點座標\n` +
      `  • 相關路線\n` +
      `  • 相關宣戰指示\n\n` +
      `此操作無法復原。`
    );
    if(!ok){
      longPressTriggered = false;
      longPressStart = null;
      return;
    }

    try{
      if(window.SLG.DataSyncManager){
        const r = await window.SLG.DataSyncManager.deleteCityCascade(cityId);
        logSystem(`🗑️ 已刪除「${city.name}」（路線 -${r.routesRemoved}，宣戰 -${r.warsRemoved}）`);
      } else {
        await window.SLG.deleteEntity('city', cityId);
      }
    }catch(err){
      console.warn('[GameMap] 刪城失敗', err);
      alert('❌ 刪除失敗：' + (err.message || err));
    }

    layoutDirty = true;
    nodePositions.clear();
    render();

    if(window.SLG.CityManager) window.SLG.CityManager.render();
    if(window.SLG.RouteManager) window.SLG.RouteManager.render();
    if(window.SLG.WarManager) window.SLG.WarManager.render();

    alert(`✅ 已刪除「${city.name}」`);
  }

  /* ══════════════════════════════════════════════════════
     同步節點到地圖庫
     ══════════════════════════════════════════════════════ */
  async function syncNodesToMapLibrary(){
    const state = getState();
    const mapId = state.mapLibrary.activeMapId;
    if(!mapId){ alert('請先選擇一張地圖'); return; }
    if(!state.auth.signedIn){ alert('請先登入'); return; }
    if(!window.SLG.isOnline || !window.SLG.isOnline()){ alert('離線中，無法同步'); return; }

    const nodesToSync = {};
    let count = 0;
    for(const c of state.cities){
      if(!c.mapNode || typeof c.mapNode.x !== 'number' || typeof c.mapNode.y !== 'number') continue;
      if(c.mapNode.mapId && c.mapNode.mapId !== mapId) continue;
      const nodeId = c.code || ('n_' + c.id);
      nodesToSync[nodeId] = {
        name: c.name,
        code: c.code || '',
        x: Math.round(c.mapNode.x),
        y: Math.round(c.mapNode.y),
        namedCityId: c.id,
        source: c.mapNode.method || 'manual',
      };
      count++;
    }

    if(count === 0){ alert('沒有任何節點可同步'); return; }

    const ok = confirm(
      `確定同步 ${count} 個節點到地圖庫嗎？\n\n` +
      `這會覆蓋地圖庫中已有的同名節點。\n` +
      `同步後，節點校準與主地圖的節點數量會一致。`
    );
    if(!ok) return;

    const btn = document.getElementById('btnMapSyncNodes');
    if(btn){ btn.disabled = true; btn.textContent = '⏳ 同步中...'; }

    try{
      if(window.SLG.updateMapNodes){
        await window.SLG.updateMapNodes(mapId, nodesToSync);
        logSystem(`🔄 已同步 ${count} 個節點到地圖庫`);
        alert(`✅ 已同步 ${count} 個節點到地圖庫！`);
      } else {
        alert('❌ 同步功能未載入');
      }
    }catch(e){
      console.error(e);
      alert('❌ 同步失敗：' + e.message);
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = '🔄 同步節點'; }
    }
  }

  /* ══════════════════════════════════════════════════════
     一鍵修復資料
     ══════════════════════════════════════════════════════ */
  async function reconcileData(){
    const state = getState();
    if(!state.auth.signedIn){ alert('請先登入'); return; }
    if(!window.SLG.DataSyncManager){
      alert('❌ 修復模組未載入');
      return;
    }

    const ok = confirm(
      `確定要執行資料修復嗎？\n\n` +
      `會執行以下動作：\n` +
      `  ① 補回 city.mapNode 有、地圖庫缺的節點\n` +
      `  ② 刪除地圖庫有、找不到對應城池的孤兒節點\n` +
      `  ③ 清理孤兒路線（端點城池不存在 / 跨圖 / 重複）\n` +
      `  ④ 清理孤兒宣戰（目標城池不存在 / 跨圖 / 重複）\n` +
      `  ⑤ 清理孤兒戰區（地圖已不存在）\n\n` +
      `此操作會修改資料，請確認。`
    );
    if(!ok) return;

    const btn = document.getElementById('btnMapReconcile');
    if(btn){ btn.disabled = true; btn.textContent = '⏳ 修復中...'; }

    try{
      const r = await window.SLG.DataSyncManager.reconcileAll();
      const lines = [];
      if(r.hadMap){
        lines.push(`🗺️ 節點補回：${r.nodeFixed} 個`);
        lines.push(`🗺️ 節點刪除：${r.nodeRemoved} 個`);
      } else {
        lines.push('🗺️ 未選擇地圖，跳過節點修復');
      }
      lines.push(`🛣️ 路線清理：${r.routesRemoved} 條`);
      lines.push(`⚔️ 宣戰清理：${r.warsRemoved} 條`);
      lines.push(`🗺️ 戰區清理：${r.zonesRemoved} 個`);

      alert('✅ 修復完成！\n\n' + lines.join('\n'));

      invalidateLayout();
      render();

      if(window.SLG.CityManager) window.SLG.CityManager.render();
      if(window.SLG.RouteManager) window.SLG.RouteManager.render();
      if(window.SLG.WarManager) window.SLG.WarManager.render();
      if(window.SLG.DeployInstr) window.SLG.DeployInstr.render();
      if(window.SLG.R && window.SLG.R.renderZones) window.SLG.R.renderZones();

      logSystem(`🩺 資料修復完成`);
    }catch(e){
      console.error(e);
      alert('❌ 修復失敗：' + (e.message || e));
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = '🩺 修復資料'; }
    }
  }

  /* ══════════════════════════════════════════════════════
     戰區選擇
     ══════════════════════════════════════════════════════ */
  function getZoneFilter(){ return currentZoneFilter; }

  function setZoneFilter(zoneId){
    currentZoneFilter = zoneId || 'all';
    saveZoneFilter();
    const sel = document.getElementById('mapZoneSelect');
    if(sel && sel.value !== currentZoneFilter) sel.value = currentZoneFilter;
    fitView();
    applyView();
    render();
  }

  function refreshZoneSelector(){
    const state = getState();
    const sel = document.getElementById('mapZoneSelect');
    if(!sel) return;

    const zoneCounts = new Map();
    for(const c of state.cities){
      const zid = c.zoneId || '__none__';
      zoneCounts.set(zid, (zoneCounts.get(zid) || 0) + 1);
    }

    let html = `<option value="all">🌐 全部（${state.cities.length}）</option>`;
    for(const z of state.zones){
      const n = zoneCounts.get(z.id) || 0;
      html += `<option value="${z.id}">${esc(z.name)}（${n}）</option>`;
    }
    const noneCount = zoneCounts.get('__none__') || 0;
    if(noneCount > 0){
      html += `<option value="__none__">未分配（${noneCount}）</option>`;
    }
    sel.innerHTML = html;

    const validValues = ['all', '__none__'].concat(state.zones.map(z => z.id));
    if(!validValues.includes(currentZoneFilter)){
      currentZoneFilter = 'all';
      saveZoneFilter();
    }
    sel.value = currentZoneFilter;
  }

  /* ══════════════════════════════════════════════════════
     視圖工具
     ══════════════════════════════════════════════════════ */
  function getVisibleRect(){
    if(!containerEl) return null;
    const sc = view.scale || 1;
    const left = containerEl.scrollLeft / sc;
    const top = containerEl.scrollTop / sc;
    const width = (containerEl.clientWidth || 600) / sc;
    const height = (containerEl.clientHeight || 400) / sc;
    return { left, top, right: left + width, bottom: top + height };
  }

  function rayToRectEdge(sx, sy, ux, uy, rect){
    let minT = Infinity;
    if(ux > 0.0001) minT = Math.min(minT, (rect.right - sx) / ux);
    else if(ux < -0.0001) minT = Math.min(minT, (rect.left - sx) / ux);
    if(uy > 0.0001) minT = Math.min(minT, (rect.bottom - sy) / uy);
    else if(uy < -0.0001) minT = Math.min(minT, (rect.top - sy) / uy);
    if(!isFinite(minT) || minT <= 0) return null;
    return { x: sx + ux * minT, y: sy + uy * minT };
  }

  /* ══════════════════════════════════════════════════════
     滾輪縮放
     ══════════════════════════════════════════════════════ */
  function onWheel(e){
    e.preventDefault();
    const rect = containerEl.getBoundingClientRect();
    const mx = (e.clientX - rect.left + containerEl.scrollLeft) / view.scale;
    const my = (e.clientY - rect.top + containerEl.scrollTop) / view.scale;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.2, Math.min(3, view.scale * factor));
    view.x = mx - (e.clientX - rect.left + containerEl.scrollLeft) / newScale;
    view.y = my - (e.clientY - rect.top + containerEl.scrollTop) / newScale;
    view.scale = newScale;
    applyView();
    render();
  }

  /* ══════════════════════════════════════════════════════
     觸控
     ══════════════════════════════════════════════════════ */
  function touchDist(t1, t2){
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }

  function touchCenter(t1, t2){
    return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
  }

  function onTouchStart(e){
    if(e.touches.length === 2){
      e.preventDefault();
      clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressStart = null;
      longPressTriggered = false;
      pinchStartDist = touchDist(e.touches[0], e.touches[1]);
      pinchStartScale = view.scale;
      pinchStartCenter = touchCenter(e.touches[0], e.touches[1]);
      dragging = false;
      nodeDragging = null;
      touchPanStart = null;
      modeTouchStart = null;
      return;
    }

    if(e.touches.length === 1){
      const t = e.touches[0];
      const worldPos = getWorldPosFromClient(t.clientX, t.clientY);
      const city = pickCity(worldPos);

      if(city){
        nodeDragging = {
          cityId: city.id,
          offsetX: worldPos.x - nodePositions.get(city.id).x,
          offsetY: worldPos.y - nodePositions.get(city.id).y,
          moved: false,
          startX: t.clientX,
          startY: t.clientY
        };
        if(mapMode !== 'none'){
          modeTouchStart = { x: t.clientX, y: t.clientY, moved: false };
        }

        longPressStart = { x: t.clientX, y: t.clientY, cityId: city.id };
        longPressTriggered = false;
        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
          if(longPressStart && !longPressTriggered && nodeDragging && !nodeDragging.moved){
            longPressTriggered = true;
            const cityId = longPressStart.cityId;
            nodeDragging = null;
            modeTouchStart = null;
            showNodeDeleteConfirm(cityId);
          }
        }, 500);

        e.preventDefault();
        return;
      }

      if(mapMode !== 'none'){
        modeTouchStart = { x: t.clientX, y: t.clientY, moved: false };
        e.preventDefault();
        return;
      }

      touchPanStart = {
        x: t.clientX,
        y: t.clientY,
        sx: containerEl.scrollLeft,
        sy: containerEl.scrollTop
      };
    }
  }

  function onTouchMove(e){
    if(e.touches.length === 2 && pinchStartDist > 0){
      e.preventDefault();
      if(longPressTimer){ clearTimeout(longPressTimer); longPressTimer = null; }
      longPressStart = null;
      const dist = touchDist(e.touches[0], e.touches[1]);
      const center = touchCenter(e.touches[0], e.touches[1]);
      const factor = dist / pinchStartDist;
      const newScale = Math.max(0.2, Math.min(3, pinchStartScale * factor));
      const rect = containerEl.getBoundingClientRect();
      const cx = (center.x - rect.left + containerEl.scrollLeft) / view.scale;
      const cy = (center.y - rect.top + containerEl.scrollTop) / view.scale;
      view.x = cx - (center.x - rect.left + containerEl.scrollLeft) / newScale;
      view.y = cy - (center.y - rect.top + containerEl.scrollTop) / newScale;
      view.scale = newScale;
      applyView();
      render();
      return;
    }

    if(e.touches.length === 1){
      const t = e.touches[0];

      if(nodeDragging){
        e.preventDefault();
        const dx = Math.abs(t.clientX - nodeDragging.startX);
        const dy = Math.abs(t.clientY - nodeDragging.startY);
        if(dx > 5 || dy > 5){
          nodeDragging.moved = true;
          if(modeTouchStart) modeTouchStart.moved = true;
          if(longPressTimer){ clearTimeout(longPressTimer); longPressTimer = null; }
          longPressStart = null;
        }
        if(nodeDragging.moved){
          const worldPos = getWorldPosFromClient(t.clientX, t.clientY);
          const p = nodePositions.get(nodeDragging.cityId);
          if(p){
            p.x = worldPos.x - nodeDragging.offsetX;
            p.y = worldPos.y - nodeDragging.offsetY;
          }
          render();
        }
        return;
      }

      if(mapMode !== 'none' && modeTouchStart){
        const dx = Math.abs(t.clientX - modeTouchStart.x);
        const dy = Math.abs(t.clientY - modeTouchStart.y);
        if(dx > 5 || dy > 5) modeTouchStart.moved = true;
        e.preventDefault();
        return;
      }

      if(touchPanStart){
        e.preventDefault();
        const dx = t.clientX - touchPanStart.x;
        const dy = t.clientY - touchPanStart.y;
        containerEl.scrollLeft = touchPanStart.sx - dx;
        containerEl.scrollTop = touchPanStart.sy - dy;
      }
    }
  }

  function onTouchEnd(e){
    clearTimeout(longPressTimer);
    longPressTimer = null;

    if(e.touches.length < 2){
      pinchStartDist = 0;
      pinchStartCenter = null;
    }

    if(e.touches.length === 0){
      if(nodeDragging){
        const wasMoved = nodeDragging.moved;
        const dragCityId = nodeDragging.cityId;
        const state = getState();
        const city = state.cities.find(c => c.id === dragCityId);
        const p = nodePositions.get(dragCityId);

        if(city && p && wasMoved){
          const newX = Math.round(p.x);
          const newY = Math.round(p.y);

          /* ★ v9.0.3：同步到地圖庫 nodes + city.mapNode + Firebase */
          const mapId = city.mapNode?.mapId || getState().mapLibrary.activeMapId || '';
          if(window.SLG.DataSyncManager){
            window.SLG.DataSyncManager.setNode(city.id, newX, newY, {
              source: 'manual',
              mapId,
            });
          }
          logSystem(`📍 已儲存「${city.name}」→ (${newX}, ${newY})`);
        }

        nodeDragging = null;
        modeTouchStart = null;
        touchPanStart = null;
        longPressStart = null;
        applyCursor();
        render();
        return;
      }

      if(mapMode !== 'none' && modeTouchStart){
        if(!modeTouchStart.moved){
          const t = e.changedTouches[0];
          if(t) handleModeTap(t.clientX, t.clientY);
        }
        modeTouchStart = null;
        e.preventDefault();
        return;
      }

      touchPanStart = null;
      applyCursor();
    }
  }

  /* ══════════════════════════════════════════════════════
     座標轉換
     ══════════════════════════════════════════════════════ */
  function getWorldPos(e){
    return getWorldPosFromClient(e.clientX, e.clientY);
  }

  function getWorldPosFromClient(clientX, clientY){
    const rect = containerEl.getBoundingClientRect();
    const sx = clientX - rect.left + containerEl.scrollLeft;
    const sy = clientY - rect.top + containerEl.scrollTop;
    return { x: sx / view.scale, y: sy / view.scale };
  }

  /* ★ v9.0.2：pickCity 判定半徑縮小（40 → 20） */
  function pickCity(worldPos){
    const state = getState();
    let closest = null, minDist = 20;
    for(const c of state.cities){
      if(!isCityVisibleInCurrentZone(c)) continue;
      const p = nodePositions.get(c.id);
      if(!p) continue;
      const d = Math.hypot(p.x - worldPos.x, p.y - worldPos.y);
      if(d < minDist){ minDist = d; closest = c; }
    }
    return closest;
  }

  function isCityVisibleInCurrentZone(city){
    if(currentZoneFilter === 'all') return true;
    return (city.zoneId || '__none__') === currentZoneFilter;
  }

  /* ══════════════════════════════════════════════════════
     滑鼠事件
     ══════════════════════════════════════════════════════ */
  function onPointerDown(e){
    if(e.pointerType === 'touch') return;
    const worldPos = getWorldPos(e);
    const city = pickCity(worldPos);

    if(city){
      nodeDragging = {
        cityId: city.id,
        offsetX: worldPos.x - nodePositions.get(city.id).x,
        offsetY: worldPos.y - nodePositions.get(city.id).y,
        startClientX: e.clientX,
        startClientY: e.clientY,
        moved: false
      };
      canvas.style.cursor = 'grabbing';
      if(mapMode !== 'none'){
        modePointerStart = { x: e.clientX, y: e.clientY, moved: false };
      }

      longPressStart = { x: e.clientX, y: e.clientY, cityId: city.id };
      longPressTriggered = false;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        if(longPressStart && !longPressTriggered && nodeDragging && !nodeDragging.moved){
          longPressTriggered = true;
          const cityId = longPressStart.cityId;
          nodeDragging = null;
          modePointerStart = null;
          showNodeDeleteConfirm(cityId);
        }
      }, 500);

      e.preventDefault();
      return;
    }

    if(mapMode !== 'none'){
      modePointerStart = { x: e.clientX, y: e.clientY, moved: false };
      return;
    }

    dragging = true;
    dragStart = { x: e.clientX, y: e.clientY, sx: containerEl.scrollLeft, sy: containerEl.scrollTop };
    canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(e){
    if(e.pointerType === 'touch') return;

    if(nodeDragging){
      const dx = Math.abs(e.clientX - nodeDragging.startClientX);
      const dy = Math.abs(e.clientY - nodeDragging.startClientY);
      if(dx > 5 || dy > 5){
        nodeDragging.moved = true;
        if(modePointerStart) modePointerStart.moved = true;
        if(longPressTimer){ clearTimeout(longPressTimer); longPressTimer = null; }
        longPressStart = null;
      }

      if(nodeDragging.moved){
        const worldPos = getWorldPos(e);
        const p = nodePositions.get(nodeDragging.cityId);
        if(p){
          p.x = worldPos.x - nodeDragging.offsetX;
          p.y = worldPos.y - nodeDragging.offsetY;
        }
        render();
      }
      return;
    }

    if(mapMode !== 'none' && modePointerStart){
      const dx = Math.abs(e.clientX - modePointerStart.x);
      const dy = Math.abs(e.clientY - modePointerStart.y);
      if(dx > 5 || dy > 5) modePointerStart.moved = true;

      if(mapMode === 'war' && warFromCityId){
        const worldPos = getWorldPos(e);
        const city = pickCity(worldPos);
        warHoverTgtId = (city && city.id !== warFromCityId) ? city.id : '';
        render();
      }
      return;
    }

    if(dragging){
      const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
      containerEl.scrollLeft = dragStart.sx - dx;
      containerEl.scrollTop = dragStart.sy - dy;
      return;
    }

    const worldPos = getWorldPos(e);
    const city = pickCity(worldPos);
    hoveredCityId = city ? city.id : null;
    if(getState().cities.length > 0) render();
  }

  function onPointerUp(e){
    if(e.pointerType === 'touch') return;

    if(nodeDragging){
      clearTimeout(longPressTimer);
      longPressTimer = null;

      if(longPressTriggered){
        longPressTriggered = false;
        longPressStart = null;
        nodeDragging = null;
        modePointerStart = null;
        applyCursor();
        render();
        return;
      }

      const wasMoved = nodeDragging.moved;
      const dragCityId = nodeDragging.cityId;

      if(!wasMoved && mapMode !== 'none'){
        nodeDragging = null;
        longPressStart = null;
        modePointerStart = null;
        handleModeTap(e.clientX, e.clientY);
        applyCursor();
        render();
        return;
      }

       if(wasMoved){
        const state = getState();
        const city = state.cities.find(c => c.id === dragCityId);
        const p = nodePositions.get(dragCityId);
        if(!city || !p){
          longPressStart = null;
          nodeDragging = null;
          modePointerStart = null;
          applyCursor();
          render();
          return;
        }
        const newX = Math.round(p.x);
        const newY = Math.round(p.y);

        /* ★ v9.0.3：同步到地圖庫 nodes + city.mapNode + Firebase */
        const mapId = city.mapNode?.mapId || state.mapLibrary.activeMapId || '';
        if(window.SLG.DataSyncManager){
          window.SLG.DataSyncManager.setNode(city.id, newX, newY, {
            source: 'manual',
            mapId,
          });
        }
        logSystem(`📍 已儲存「${city.name}」→ (${newX}, ${newY})`);
      }

      longPressStart = null;
      nodeDragging = null;
      modePointerStart = null;
      applyCursor();
      render();
      return;
    }

    if(mapMode !== 'none' && modePointerStart){
      if(!modePointerStart.moved){
        handleModeTap(e.clientX, e.clientY);
      }
      modePointerStart = null;
      return;
    }

    if(dragging){ dragging = false; applyCursor(); }
  }

  /* ══════════════════════════════════════════════════════
     統一處理模式點擊
     ══════════════════════════════════════════════════════ */
  function handleModeTap(clientX, clientY){
    const worldPos = getWorldPosFromClient(clientX, clientY);
    const city = pickCity(worldPos);

    if(mapMode === 'route'){
      handleRouteTap(city);
    } else if(mapMode === 'war'){
      handleWarTapWithCity(city);
    } else if(mapMode === 'city'){
      handleCityEditTap(city, worldPos);
    }
  }

  /* ══════════════════════════════════════════════════════
     路線模式
     ══════════════════════════════════════════════════════ */
  function handleRouteTap(city){
    if(!city){
      routeFromCityId = '';
      updateModeHint();
      render();
      return;
    }

    if(!routeFromCityId){
      routeFromCityId = city.id;
      updateModeHint();
      render();
      return;
    }

    if(city.id === routeFromCityId){
      routeFromCityId = '';
      updateModeHint();
      render();
      return;
    }

    const fromCityId = routeFromCityId;
    const toCityId = city.id;
    const existing = window.SLG.findRoute(fromCityId, toCityId);

    if(existing){
      const state = getState();
      const fromCity = state.cities.find(c => c.id === fromCityId);
      const toCity = state.cities.find(c => c.id === toCityId);
      const fromName = fromCity ? fromCity.name : '?';
      const toName = toCity ? toCity.name : '?';
      showRouteDeleteConfirm(fromName, toName, () => {
        window.SLG.removeRoute(existing.id);
        routeFromCityId = '';
        updateModeHint();
        render();
        if(window.SLG.RouteManager) window.SLG.RouteManager.render();
        logSystem(`🗑️ 已刪除路線：${fromName} — ${toName}`);
      }, () => {});
      return;
    }

    const state = getState();
    if(state.settings.routeRequireSameMap){
      const a = state.cities.find(c => c.id === fromCityId);
      const b = state.cities.find(c => c.id === toCityId);
      const ma = getCityMapId ? getCityMapId(a) : '';
      const mb = getCityMapId ? getCityMapId(b) : '';
      if(ma && mb && ma !== mb){
        alert('⚠️「路線限制同地圖」已開啟：只能在地圖內建立兩城之間的路線。\n\n若要跨圖建立，請至 ⚙️ 參數設定關閉此規則。');
        routeFromCityId = '';
        updateModeHint();
        render();
        return;
      }
    }

    const r = window.SLG.addRoute(fromCityId, toCityId);
    if(r){
      const fromCity = state.cities.find(c => c.id === fromCityId);
      const toCity = state.cities.find(c => c.id === toCityId);
      logSystem(`🛣️ 已新增路線：${fromCity ? fromCity.name : '?'} — ${toCity ? toCity.name : '?'}`);
      routeFromCityId = '';
      updateModeHint();
      render();
      if(window.SLG.RouteManager) window.SLG.RouteManager.render();
    } else {
      routeFromCityId = '';
      updateModeHint();
      render();
    }
  }

  function showRouteDeleteConfirm(fromName, toName, onConfirm, onCancel){
    const modal = document.getElementById('routeDeleteConfirmModal');
    const msg = document.getElementById('routeDeleteConfirmMsg');

    if(msg){
      msg.innerHTML = `城池「<b style="color:var(--neon-blue);">${esc(fromName)}</b>」與「<b style="color:var(--neon-blue);">${esc(toName)}</b>」之間已有連線。<br><br>確定要<b style="color:var(--neon-red);">刪除</b>此路線嗎？`;
    }

    if(!modal){
      if(confirm(`「${fromName}」與「${toName}」之間已有連線，確定要刪除嗎？`)){
        onConfirm();
      } else {
        if(onCancel) onCancel();
      }
      return;
    }

    const confirmBtn = document.getElementById('routeDeleteConfirm');
    const cancelBtn = document.getElementById('routeDeleteCancel');
    const close = () => {
      modal.classList.remove('show');
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
    };
    const handleConfirm = () => { close(); onConfirm(); };
    const handleCancel = () => { close(); if(onCancel) onCancel(); };
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    modal.classList.add('show');
  }

  function saveRouteChanges(){
    if(pendingRouteCount === 0) return;
    pendingRouteCount = 0;
    const btn = document.getElementById('mapRouteSaveBtn');
    if(btn) btn.classList.add('hidden');
    if(document.getElementById('mapRouteSaveCount')){
      document.getElementById('mapRouteSaveCount').textContent = '0';
    }
  }

  function accumulateRouteChange(){
    pendingRouteCount++;
    const btn = document.getElementById('mapRouteSaveBtn');
    const cnt = document.getElementById('mapRouteSaveCount');
    if(btn) btn.classList.remove('hidden');
    if(cnt) cnt.textContent = pendingRouteCount;
  }

  /* ══════════════════════════════════════════════════════
     宣戰模式
     ══════════════════════════════════════════════════════ */
  function handleWarTapWithCity(city){
    if(!city){
      warFromCityId = '';
      warHoverTgtId = '';
      updateModeHint();
      render();
      return;
    }

    if(!warFromCityId){
      warFromCityId = city.id;
      warHoverTgtId = '';
      updateModeHint();
      render();
      return;
    }

    if(city.id === warFromCityId){
      warFromCityId = '';
      warHoverTgtId = '';
      updateModeHint();
      render();
      return;
    }

    const state = getState();
    const fromCity = state.cities.find(c => c.id === warFromCityId);
    const toCity = city;
    if(fromCity && toCity && window.SLG.WarQuickPanel){
      window.SLG.WarQuickPanel.open(fromCity, toCity, () => {
        warFromCityId = '';
        warHoverTgtId = '';
        updateModeHint();
        render();
      });
    }
  }

  function accumulateWarChange(){
    pendingWarCount++;
    const btn = document.getElementById('mapWarSaveBtn');
    const cnt = document.getElementById('mapWarSaveCount');
    if(btn) btn.classList.remove('hidden');
    if(cnt) cnt.textContent = pendingWarCount;
  }

  async function saveWarChanges(){
    if(pendingWarCount === 0) return;
    const btn = document.getElementById('mapWarSaveBtn');
    if(btn) btn.disabled = true;
    try{
      if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(getState().cities);
      if(window.SLG.saveState) window.SLG.saveState('important');
      if(window.SLG.WarManager) window.SLG.WarManager.render();
      if(window.SLG.DeployInstr) window.SLG.DeployInstr.render();
      logSystem(`💾 已儲存 ${pendingWarCount} 筆宣戰變更`);
      pendingWarCount = 0;
      if(btn) btn.classList.add('hidden');
      if(document.getElementById('mapWarSaveCount')){
        document.getElementById('mapWarSaveCount').textContent = '0';
      }
    }catch(e){
      alert('❌ 儲存失敗：' + e.message);
    }finally{
      if(btn) btn.disabled = false;
    }
  }

  /* ══════════════════════════════════════════════════════
     城池編輯模式
     ══════════════════════════════════════════════════════ */
  function handleCityEditTap(city, worldPos){
    if(window.SLG.isInRoom()){
      if(!window.SLG.canEditRoomData()){ alert('🔒 沒有編輯權限'); return; }
    } else {
      const Auth = getAuth();
      if(Auth && !Auth.canEditData()){
        alert('🔒 沒有編輯權限');
        return;
      }
    }

    if(city){
      if(typeof window.SLG.openCityModal === 'function'){
        window.SLG.openCityModal(city.id);
      }
      return;
    }

    const x = Math.round(worldPos.x);
    const y = Math.round(worldPos.y);
    if(typeof window.SLG.openCityModal === 'function'){
      window.SLG.openCityModal(null, { mapNode: { x, y } });
    }
  }

  /* ══════════════════════════════════════════════════════
     節點佈局
     ══════════════════════════════════════════════════════ */
  function resolveCityMapNode(city, mapNodes){
    if(!city || !mapNodes) return null;
    const state = getState();
    const currentMapId = state.mapLibrary.activeMapId;

    if(city.mapNode && city.mapNode.nodeId){
      if(!city.mapNode.mapId || city.mapNode.mapId === currentMapId){
        if(mapNodes[city.mapNode.nodeId]){
          return mapNodes[city.mapNode.nodeId];
        }
      }
    }

    if(city.code){
      for(const nid in mapNodes){
        if(mapNodes[nid].code === city.code) return mapNodes[nid];
      }
    }

    if(city.name){
      for(const nid in mapNodes){
        if(mapNodes[nid].name === city.name) return mapNodes[nid];
      }
    }

    if(city.name && window.SLG.normalizeCityName){
      const nCity = window.SLG.normalizeCityName(city.name);
      for(const nid in mapNodes){
        const nNode = window.SLG.normalizeCityName(mapNodes[nid].name || '');
        if(nNode && nNode === nCity) return mapNodes[nid];
      }
    }

    return null;
  }

  function computeLayout(){
    const state = getState();
    const cities = state.cities;
    if(cities.length === 0){ nodePositions.clear(); return; }

    if(nodeDragging) return;

    const currentMapId = state.mapLibrary.activeMapId;

    if(activeMapNodes && Object.keys(activeMapNodes).length > 0){
      nodePositions.clear();
      const unplaced = [];
      for(const c of cities){
        const mapNodeUsable = c.mapNode &&
                              typeof c.mapNode.x === 'number' &&
                              typeof c.mapNode.y === 'number' &&
                              (!c.mapNode.mapId || c.mapNode.mapId === currentMapId);
        if(mapNodeUsable){
          nodePositions.set(c.id, { x: c.mapNode.x, y: c.mapNode.y });
          continue;
        }
        const n = resolveCityMapNode(c, activeMapNodes);
        if(n){
          nodePositions.set(c.id, { x: Number(n.x) || 0, y: Number(n.y) || 0 });
        } else {
          unplaced.push(c);
        }
      }

      if(unplaced.length > 0){
        const W = CANVAS_W, H = CANVAS_H;
        unplaced.forEach((c) => {
          const hash = (str) => {
            let h = 0;
            for(let k = 0; k < str.length; k++){
              h = ((h << 5) - h) + str.charCodeAt(k);
              h |= 0;
            }
            return Math.abs(h);
          };
          const h = hash(c.id);
          const ang = (h % 3600) / 3600 * Math.PI * 2;
          const r = 400 + (h % 300);
          nodePositions.set(c.id, {
            x: W/2 + Math.cos(ang) * r,
            y: H/2 + Math.sin(ang) * r
          });
        });
        if(unplaced.length > 0){
          /* ★ v9.0.3：同一批 unplaced 只警告一次（用簽章比對） */
          const sig = unplaced.map(c => c.name).sort().join('|');
          if(window.__lastUnplacedSig !== sig){
            window.__lastUnplacedSig = sig;
            console.warn(
              `[GameMap] ${unplaced.length} 座城池未匹配地圖節點，使用臨時座標：`,
              unplaced.map(c => c.name)
            );
          }
        }
      }
      layoutDirty = false;
      return;
    }

    if(!layoutDirty && nodePositions.size === cities.length) return;
    nodePositions.clear();
    const W = CANVAS_W, H = CANVAS_H, PAD = 200;
    const N = cities.length;
    const area = (W - PAD * 2) * (H - PAD * 2);
    const k = Math.sqrt(area / Math.max(N, 1)) * 0.55;

    cities.forEach((c, i) => {
      const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
      const r = 200 + (i % 4) * 80;
      nodePositions.set(c.id, { x: W/2 + Math.cos(ang) * r, y: H/2 + Math.sin(ang) * r });
    });

    const edges = [];
    for(const r of (state.routes || [])){
      if(nodePositions.has(r.cityAId) && nodePositions.has(r.cityBId)){
        edges.push([r.cityAId, r.cityBId]);
      }
    }

    const iterations = N > 60 ? 150 : 300;
    let temp = W / 10;
    const cool = temp / (iterations + 1);

    for(let iter = 0; iter < iterations; iter++){
      const disp = new Map();
      cities.forEach(c => disp.set(c.id, { x: 0, y: 0 }));

      for(let i = 0; i < N; i++){
        for(let j = i + 1; j < N; j++){
          const a = nodePositions.get(cities[i].id);
          const b = nodePositions.get(cities[j].id);
          let dx = a.x - b.x, dy = a.y - b.y;
          let d = Math.hypot(dx, dy);
          if(d < 0.01){
            dx = (Math.random()-0.5)*10;
            dy = (Math.random()-0.5)*10;
            d = Math.hypot(dx, dy) || 0.01;
          }
          const force = (k * k) / d;
          const fx = (dx / d) * force, fy = (dy / d) * force;
          const da = disp.get(cities[i].id), db = disp.get(cities[j].id);
          da.x += fx; da.y += fy;
          db.x -= fx; db.y -= fy;
        }
      }

      for(const [aId, bId] of edges){
        const pa = nodePositions.get(aId), pb = nodePositions.get(bId);
        let dx = pa.x - pb.x, dy = pa.y - pb.y;
        let d = Math.hypot(dx, dy);
        if(d < 0.01) d = 0.01;
        const force = (d * d) / k * 1.2;
        const fx = (dx / d) * force, fy = (dy / d) * force;
        const da = disp.get(aId), db = disp.get(bId);
        da.x -= fx; da.y -= fy;
        db.x += fx; db.y += fy;
      }

      cities.forEach(c => {
        const d = disp.get(c.id);
        const p = nodePositions.get(c.id);
        const len = Math.hypot(d.x, d.y);
        if(len > 0){
          const limit = Math.min(len, temp);
          p.x += (d.x / len) * limit;
          p.y += (d.y / len) * limit;
        }
        p.x = Math.max(PAD, Math.min(W - PAD, p.x));
        p.y = Math.max(PAD, Math.min(H - PAD, p.y));
      });

      temp = Math.max(temp - cool, 0.5);
    }
    layoutDirty = false;
  }

  /* ══════════════════════════════════════════════════════
     適合視窗
     ══════════════════════════════════════════════════════ */
  function fitView(){
    if(nodePositions.size === 0){ view = { x: 0, y: 0, scale: 1 }; return; }
    const state = getState();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let any = false;

    for(const c of state.cities){
      if(!isCityVisibleInCurrentZone(c)) continue;
      const p = nodePositions.get(c.id);
      if(!p) continue;
      any = true;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }

    if(!any){
      if(activeMapImageEl){
        const availW = containerEl.clientWidth || 600;
        const availH = containerEl.clientHeight || 400;
        const sc = Math.min(availW / canvas.width, availH / canvas.height);
        view.scale = sc;
        view.x = 0; view.y = 0;
      }
      return;
    }

    const contentW = Math.max(maxX - minX, 1);
    const contentH = Math.max(maxY - minY, 1);
    const availW = containerEl.clientWidth || 600;
    const availH = containerEl.clientHeight || 400;
    const scale = Math.min(availW / (contentW + 200), availH / (contentH + 200), 1.5);
    view.scale = scale;
    view.x = Math.max(0, minX - 100);
    view.y = Math.max(0, minY - 100);
  }

  function applyView(){
    if(!canvas) return;
    canvas.style.transform = `scale(${view.scale})`;
    canvas.style.transformOrigin = '0 0';
    if(containerEl){
      containerEl.scrollLeft = view.x * view.scale;
      containerEl.scrollTop = view.y * view.scale;
    }
  }

  /* ══════════════════════════════════════════════════════
     跨區邊線 / 箭頭
     ══════════════════════════════════════════════════════ */
  function drawCrossZoneEdge(fromPos, toPos, visRect, color, dashed){
    if(!visRect) return;
    const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
    const len = Math.hypot(dx, dy);
    if(len < 0.01) return;
    const ux = dx / len, uy = dy / len;
    const hit = rayToRectEdge(fromPos.x, fromPos.y, ux, uy, visRect);
    if(!hit) return;
    const startX = fromPos.x + ux * 18;
    const startY = fromPos.y + uy * 18;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    if(dashed) ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(hit.x, hit.y);
    ctx.stroke();
    if(dashed) ctx.setLineDash([]);
  }

  function drawCrossZoneArrow(fromPos, toPos, visRect, isAttack, targetName){
    if(!visRect) return;
    const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
    const len = Math.hypot(dx, dy);
    if(len < 0.01) return;
    const ux = dx / len, uy = dy / len;
    const hit = rayToRectEdge(fromPos.x, fromPos.y, ux, uy, visRect);
    if(!hit) return;

    const color = isAttack ? 'rgba(255,68,102,0.9)' : 'rgba(34,255,136,0.9)';
    const startX = fromPos.x + ux * 18;
    const startY = fromPos.y + uy * 18;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(hit.x, hit.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const angle = Math.atan2(uy, ux);
    ctx.beginPath();
    ctx.moveTo(hit.x, hit.y);
    ctx.lineTo(hit.x - Math.cos(angle - 0.4) * 11, hit.y - Math.sin(angle - 0.4) * 11);
    ctx.lineTo(hit.x - Math.cos(angle + 0.4) * 11, hit.y - Math.sin(angle + 0.4) * 11);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    const labelText = `→ ${targetName}`;
    ctx.font = 'bold 12px sans-serif';
    const textW = ctx.measureText(labelText).width;
    const bw = textW + 12, bh = 20;
    const offset = 28;
    const lx = hit.x - ux * offset, ly = hit.y - uy * offset;
    const clampedLx = Math.max(visRect.left + bw/2 + 4, Math.min(visRect.right - bw/2 - 4, lx));
    const clampedLy = Math.max(visRect.top + bh/2 + 4, Math.min(visRect.bottom - bh/2 - 4, ly));

    ctx.fillStyle = 'rgba(10,14,23,0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if(ctx.roundRect){
      ctx.beginPath();
      ctx.roundRect(clampedLx - bw/2, clampedLy - bh/2, bw, bh, 4);
      ctx.fill(); ctx.stroke();
    } else {
      ctx.fillRect(clampedLx - bw/2, clampedLy - bh/2, bw, bh);
      ctx.strokeRect(clampedLx - bw/2, clampedLy - bh/2, bw, bh);
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, clampedLx, clampedLy);
  }

  function drawNormalRoute(a, b, isHi){
    const scale = view.scale || 1;
    const visualWidth = Math.min(5, 5 * scale);
    const visualOutlineWidth = visualWidth + 4;
    const canvasMainWidth = visualWidth / scale;
    const canvasOutlineWidth = visualOutlineWidth / scale;
    const dashOn = Math.max(6 / scale, 4);
    const dashOff = Math.max(5 / scale, 3);

    ctx.setLineDash([dashOn, dashOff]);
    ctx.strokeStyle = isHi ? 'rgba(34,255,136,0.95)' : 'rgba(255,255,255,0.9)';
    ctx.lineWidth = canvasOutlineWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.strokeStyle = isHi ? '#22ff88' : '#000000';
    ctx.lineWidth = canvasMainWidth;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawWarArrows(){
    if(mapMode !== 'war') return;
    /* ★ v9.0.2：箭頭起點半徑縮小（30 → 18） */
    const NODE_RADIUS = 18;
    const state = getState();
    const cityById = new Map(state.cities.map(c => [c.id, c]));

    for(const src of state.cities){
      if(!isCityVisibleInCurrentZone(src)) continue;
      const fromP = nodePositions.get(src.id);
      if(!fromP) continue;

      const drawOne = (tgtId, isAttack, pct) => {
        const tgt = cityById.get(tgtId);
        if(!tgt) return;
        if(!isCityVisibleInCurrentZone(tgt)) return;
        const toP = nodePositions.get(tgtId);
        if(!toP) return;

        const dx = toP.x - fromP.x;
        const dy = toP.y - fromP.y;
        const dist = Math.hypot(dx, dy);
        if(dist < 1) return;
        const ux = dx / dist, uy = dy / dist;
        const sx = fromP.x + ux * NODE_RADIUS;
        const sy = fromP.y + uy * NODE_RADIUS;
        const ex = toP.x - ux * (NODE_RADIUS + 4);
        const ey = toP.y - uy * (NODE_RADIUS + 4);

        const color = isAttack ? 'rgba(255,68,102,1)' : 'rgba(34,255,136,1)';
        const width = Math.max(2, Math.min(8, (pct / 100) * 8));

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash([8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        const angle = Math.atan2(uy, ux);
        const ah = 12;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(angle - 0.4) * ah, ey - Math.sin(angle - 0.4) * ah);
        ctx.lineTo(ex - Math.cos(angle + 0.4) * ah, ey - Math.sin(angle + 0.4) * ah);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };

      for(const t of (src.attackTargets || [])){
        if(!t.cityId || (t.preWarPercent || 0) <= 0) continue;
        drawOne(t.cityId, true, t.preWarPercent);
      }
      for(const t of (src.defendTargets || [])){
        if(!t.cityId || (t.preWarPercent || 0) <= 0) continue;
        drawOne(t.cityId, false, t.preWarPercent);
      }
    }

    if(warFromCityId && warHoverTgtId){
      const fromP = nodePositions.get(warFromCityId);
      const toP = nodePositions.get(warHoverTgtId);
      if(fromP && toP){
        ctx.beginPath();
        ctx.moveTo(fromP.x, fromP.y);
        ctx.lineTo(toP.x, toP.y);
        ctx.strokeStyle = 'rgba(255,204,0,0.9)';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  /* ══════════════════════════════════════════════════════
     ★ v9.0.2：繪製城池節點（縮圈 50%）
     ══════════════════════════════════════════════════════ */
  function drawCityNode(c, p){
    const state = getState();

    /* ── 決定盟專屬色 ── */
    const colorMap = window.SLG.getAllianceColorMap();
    const allianceColor = colorMap.get(c.allianceId) || c.color || '#64748b';

    /* ── 準備文字行 ── */
    const suffixes = window.SLG.getCitySuffixes();
    const nameLines = wrapCityName(c.name, suffixes);
    const sideLabel = SIDE_SHORT_LABELS[c.side] || '(?)';
    const lines = [...nameLines, sideLabel];
    if(c.code) lines.push(c.code);

    /* ── 動態圈半徑 ── */
    const radius = getRadiusByLineCount(lines.length);

    /* ── 高亮判定 ── */
    const isHovered = (hoveredCityId === c.id);
    const highlightedCities = new Set(highlight ? highlight.cityIds : []);
    const isHi = highlightedCities.has(c.id);
    const isWarFrom = (mapMode === 'war' && c.id === warFromCityId);
    const isWarHover = (mapMode === 'war' && c.id === warHoverTgtId);
    const isRouteFrom = (mapMode === 'route' && c.id === routeFromCityId);

    /* ── 高亮外圈（縮小） ── */
    if(isHovered || isHi || isWarFrom || isWarHover || isRouteFrom){
      ctx.beginPath();
      const r = isHi ? (radius + 5) : ((isWarFrom || isRouteFrom) ? (radius + 7) : (radius + 3));
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = isRouteFrom ? 'rgba(68,170,255,1)'
                      : isWarFrom ? 'rgba(255,204,0,1)'
                      : isWarHover ? 'rgba(255,68,102,1)'
                      : isHi ? 'rgba(34,255,136,1)'
                      : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = (isWarFrom || isRouteFrom) ? 3 : (isHi ? 2.5 : 2);
      if(isWarFrom || isRouteFrom) ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* ── 主圈：外框 = 盟色，中間透明 ── */
    const borderWidth = isHovered ? 3 : 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = allianceColor;
    ctx.lineWidth = borderWidth;
    ctx.stroke();
    /* 中間不填色（透明） */

    /* ── 等級徽章（圈內右上角，縮小） ── */
    const level = c.level || 1;
    const badgeR = 5;
    const badgeX = p.x + radius - 3;
    const badgeY = p.y - radius + 3;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcc00';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = 'bold 7px "Noto Sans TC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(String(level), badgeX, badgeY);

    /* ── 圈內文字（依縮放決定大小） ── */
    const fontSize = getFontSizeByZoom(view.scale);
    if(fontSize === 0){
      /* 縮放 < 0.5x → 隱藏文字 */
      if(c.isCapital){
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👑', p.x, p.y);
      }
      return;
    }

    ctx.font = `bold ${fontSize}px "Noto Sans TC","Microsoft JhengHei",-apple-system,BlinkMacSystemFont,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const lineHeight = fontSize * 1.15;
    const totalHeight = lines.length * lineHeight;
    const startY = p.y - totalHeight / 2 + lineHeight / 2;

    lines.forEach((line, i) => {
      const ly = startY + i * lineHeight;
      /* 黑描邊 */
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 2;
      ctx.strokeText(line, p.x, ly);
      /* 白字 */
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, p.x, ly);
    });

    /* ── 首都標記（圈外左上角，縮小） ── */
    if(c.isCapital){
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👑', p.x - radius - 4, p.y - radius + 4);
    }
  }

  /* ══════════════════════════════════════════════════════
     主渲染
     ══════════════════════════════════════════════════════ */
  function render(){
    if(!canvas || !ctx) return;
    const state = getState();
    computeLayout();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* ── 底圖 ── */
    if(activeMapImageEl && baseMapVisible){
      try{
        ctx.drawImage(activeMapImageEl, 0, 0, canvas.width, canvas.height);
        if(mapMode === 'war'){
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }catch(e){
        console.warn('繪製底圖失敗', e);
        ctx.fillStyle = '#0a0e17';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const isAllView0 = (currentZoneFilter === 'all');
      if(isAllView0){
        const zoneCities = new Map();
        for(const c of state.cities){
          const zid = c.zoneId || '__none__';
          if(!zoneCities.has(zid)) zoneCities.set(zid, []);
          zoneCities.get(zid).push(c);
        }
        const zoneColors = ['#3b82f6','#10b981','#f59e0b','#a855f7','#ef4444','#06b6d4','#84cc16','#f97316'];
        let colorIdx = 0;
        for(const [zid, cities] of zoneCities){
          if(zid === '__none__') continue;
          const pts = cities.map(c => nodePositions.get(c.id)).filter(Boolean);
          if(pts.length === 0) continue;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for(const p of pts){
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
          }
          const pad = 60;
          const color = zoneColors[colorIdx % zoneColors.length];
          colorIdx++;
          ctx.fillStyle = color + '15';
          ctx.beginPath();
          const x = minX - pad, y = minY - pad, w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
          if(ctx.roundRect) ctx.roundRect(x, y, w, h, 20);
          else ctx.rect(x, y, w, h);
          ctx.fill();
          ctx.strokeStyle = color + '60';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 6]);
          ctx.stroke();
          ctx.setLineDash([]);
          const zone = state.zones.find(z => z.id === zid);
          if(zone){
            ctx.font = 'bold 20px sans-serif';
            ctx.fillStyle = color;
            ctx.textAlign = 'left';
            ctx.fillText(zone.name, x + 12, y + 28);
          }
        }
      } else {
        const zoneCities = state.cities.filter(c => (c.zoneId || '__none__') === currentZoneFilter);
        if(zoneCities.length === 0 && !activeMapImageEl){
          ctx.font = 'bold 26px sans-serif';
          ctx.fillStyle = 'rgba(148,163,184,0.55)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('此戰區尚無城池', canvas.width / 2, canvas.height / 2);
          return;
        }
      }
    }

    const isAllView = (currentZoneFilter === 'all');
    const visRect = getVisibleRect();
    const highlightedRoutes = new Set(highlight ? highlight.routeKeys : []);

    /* ── 路線 ── */
    if(mapMode !== 'war'){
      for(const r of (state.routes || [])){
        const a = nodePositions.get(r.cityAId);
        const b = nodePositions.get(r.cityBId);
        if(!a || !b) continue;
        const cityA = state.cities.find(c => c.id === r.cityAId);
        const cityB = state.cities.find(c => c.id === r.cityBId);
        if(!cityA || !cityB) continue;
        const aZone = cityA.zoneId || '__none__';
        const bZone = cityB.zoneId || '__none__';

        if(isAllView){
          const key = [r.cityAId, r.cityBId].sort().join('|');
          drawNormalRoute(a, b, highlightedRoutes.has(key));
          continue;
        }

        const aInZone = (aZone === currentZoneFilter);
        const bInZone = (bZone === currentZoneFilter);
        if(!aInZone && !bInZone) continue;

        if(aInZone && bInZone){
          const key = [r.cityAId, r.cityBId].sort().join('|');
          drawNormalRoute(a, b, highlightedRoutes.has(key));
        } else {
          const fromPos = aInZone ? a : b;
          const toPos = aInZone ? b : a;
          drawCrossZoneEdge(fromPos, toPos, visRect, 'rgba(160,160,160,0.5)', true);
        }
      }
    }

    drawWarArrows();

    /* ── 跨區宣戰箭頭 ── */
    if(!isAllView && mapMode !== 'war'){
      for(const src of state.cities){
        const srcZone = src.zoneId || '__none__';
        if(srcZone !== currentZoneFilter) continue;
        const p = nodePositions.get(src.id);
        if(!p) continue;

        const allTargets = [
          ...(src.attackTargets || []).map(t => ({ cityId: t.cityId, isAttack: true })),
          ...(src.defendTargets || []).map(t => ({ cityId: t.cityId, isAttack: false })),
        ];
        for(const t of allTargets){
          if(!t.cityId) continue;
          const tgt = state.cities.find(c => c.id === t.cityId);
          if(!tgt) continue;
          const tgtZone = tgt.zoneId || '__none__';
          if(tgtZone === currentZoneFilter) continue;
          const tp = nodePositions.get(tgt.id);
          if(!tp) continue;
          drawCrossZoneArrow(p, tp, visRect, t.isAttack, tgt.name);
        }
      }
    }

    /* ── 城池節點（新繪製邏輯） ── */
    for(const c of state.cities){
      if(!isAllView){
        const cZone = c.zoneId || '__none__';
        if(cZone !== currentZoneFilter) continue;
      }
      const p = nodePositions.get(c.id);
      if(!p) continue;
      drawCityNode(c, p);
    }
  }

  /* ══════════════════════════════════════════════════════
     對外方法
     ══════════════════════════════════════════════════════ */
  function activate(){
    if(!containerEl) return;
    refreshZoneSelector();
    render();
  }

  function reset(){
    nodePositions.clear();
    layoutDirty = true;
    view = { x: 0, y: 0, scale: 1 };
    if(containerEl){ containerEl.scrollLeft = 0; containerEl.scrollTop = 0; }
    applyView();
    refreshZoneSelector();
    onMapLibraryChanged();
  }

  function invalidateLayout(){
    layoutDirty = true;
    nodePositions.clear();
  }

  function setHighlight(h){
    highlight = h;
    render();
  }

  /* ══════════════════════════════════════════════════════
     匯出 PDF
     ══════════════════════════════════════════════════════ */
  async function exportAsPDF(){
    if(typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF){
      alert('❌ PDF 函式庫尚未載入，請檢查網路連線後重新整理頁面');
      return;
    }
    const state = getState();
    if(state.cities.length === 0){
      alert('⚠️ 沒有城池可以匯出');
      return;
    }
    if(!canvas){
      alert('⚠️ 畫布尚未初始化');
      return;
    }

    try{
      logSystem('📄 開始匯出 PDF...');

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let any = false;
      for(const c of state.cities){
        if(!isCityVisibleInCurrentZone(c)) continue;
        const p = nodePositions.get(c.id);
        if(!p) continue;
        any = true;
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }

      if(!any){
        if(activeMapImageEl){
          minX = 0; minY = 0; maxX = canvas.width; maxY = canvas.height;
        } else {
          alert('⚠️ 沒有可匯出的城池');
          return;
        }
      }

      const padding = 200;
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(canvas.width, maxX + padding);
      maxY = Math.min(canvas.height, maxY + padding);
      const w = Math.ceil(maxX - minX);
      const h = Math.ceil(maxY - minY);

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.fillStyle = '#0a0e17';
      tempCtx.fillRect(0, 0, w, h);
      tempCtx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);

      const imgData = tempCanvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const orientation = w >= h ? 'landscape' : 'portrait';
      const pdf = new jsPDF({
        orientation: orientation,
        unit: 'px',
        format: [w, h],
        hotfixes: ['px_scaling'],
      });
      pdf.addImage(imgData, 'PNG', 0, 0, w, h);

      let zoneName = '全部';
      if(currentZoneFilter === '__none__'){ zoneName = '未分配'; }
      else if(currentZoneFilter !== 'all'){
        const z = state.zones.find(x => x.id === currentZoneFilter);
        if(z) zoneName = z.name;
      }
      const safeZoneName = String(zoneName).replace(/[\\/:*?"<>|]/g, '_');
      const date = new Date().toISOString().slice(0,10);
      pdf.save(`路線圖_${safeZoneName}_${date}.pdf`);
      logSystem(`📄 已匯出 PDF（${w}×${h}）`);
    }catch(e){
      console.error('PDF 匯出失敗', e);
      alert('❌ PDF 匯出失敗：' + (e.message || e));
    }
  }

  return {
    init, render, activate, reset, fitView, setHighlight,
    getZoneFilter, setZoneFilter, refreshZoneSelector,
    exportAsPDF, onMapLibraryChanged,
    invalidateLayout,
    setMapMode,
    getMapMode: () => mapMode,
    setWarMode: (on) => setMapMode(on ? 'war' : 'none'),
    isWarMode: () => mapMode === 'war',
    accumulateWarChange,
    saveWarChanges,
    accumulateRouteChange,
    saveRouteChanges,
    getPendingWarCount: () => pendingWarCount,
    isBaseMapVisible: () => baseMapVisible,
    toggleBaseMap,
    toggleFullscreen,
    isFullscreen: () => isFullscreen,
    syncNodesToMapLibrary,
    showNodeDeleteConfirm,
    reconcileData,
    getActiveMapNodes: () => activeMapNodes,
  };
})();

/* ============================================================
   暴露
   ============================================================ */
Object.assign(window.SLG, {
  GameMap,
});

})();
/* ============================================================================
 * ui-map.js 結束（v9.0.2）
 * ★ v9.0.2 變更摘要：
 *   1. getRadiusByLineCount：36/42/48/54 → 18/21/24/27（縮 50%）
 *   2. getFontSizeByZoom：10/14/18 → 8/11/14（縮約 50%）
 *   3. drawCityNode：
 *      - badgeR 10 → 5
 *      - badge 位置 radius-6 → radius-3
 *      - borderWidth 5/3 → 3/2
 *      - 高亮外圈 +10/+14/+6 → +5/+7/+3
 *      - 高亮線寬 5/4/3 → 3/2.5/2
 *      - 文字描邊 lineWidth 3 → 2
 *      - 首都標記 14px → 10px，位置微調
 *   4. pickCity：minDist 40 → 20
 *   5. drawWarArrows：NODE_RADIUS 30 → 18
 *   6. drawCrossZoneEdge/Arrow：startX 偏移 36 → 18
 *   7. 移除 buildAllianceColorPicker（已移至 ui-core.js）
 * ========================================================================== */
