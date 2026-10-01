/* ============================================================================
 * js/dataSync.js — v9.0.0 統一資料同步管理器
 * 職責：
 *   ① 城池 ↔ 地圖節點（三向同步：city.mapNode / activeMapNodes / Firebase）
 *   ② 城池刪除 → 連動清路線 + 宣戰
 *   ③ 路線孤兒清理（端點城池不存在）+ 跨圖清理
 *   ④ 宣戰孤兒清理（來源/目標城池不存在）+ 跨圖清理
 *   ⑤ 戰區孤兒清理
 *   ⑥ 一鍵修復（節點 + 路線 + 宣戰 + 戰區）
 *   ⑦ 舊資料遷移（zone.mapId 推斷）
 *   ⑧ v9.0.0：共享沙盤支援（sandboxId 參數）
 *   ⑨ v9.0.0：syncFromShared（從共享沙盤同步節點）
 * ========================================================================== */
(function(){
'use strict';

window.SLG = window.SLG || {};

/* ── 從全域取得 ── */
const getState = () => window.SLG.state;
const getEmit = () => window.SLG.emit;
const EVT = () => window.SLG.EVT;
const uid = () => window.SLG.uid();
const logSystem = (t) => window.SLG.logSystem(t);
const markDirty = (k, id) => window.SLG.markDirty(k, id);
const tickLamport = () => window.SLG.tickLamport();
const flushPatches = () => window.SLG.flushPatches();
const saveState = (r) => window.SLG.saveState(r);
const getCityMapId = (c) => window.SLG.getCityMapId(c);

/* ============================================================
   DataSyncManager
   ============================================================ */
const DataSyncManager = (() => {

  /* ── 內部工具 ── */
  function _cityNodeId(city){
    if(!city) return '';
    return city.code || ('n_' + city.id);
  }

  function _getActiveMapNodes(){
    if(window.SLG.GameMap && typeof window.SLG.GameMap.getActiveMapNodes === 'function'){
      return window.SLG.GameMap.getActiveMapNodes();
    }
    return null;
  }

  function _getActiveMapId(){
    return getState().mapLibrary.activeMapId || '';
  }

  function _findCity(cityId){
    return getState().cities.find(c => c.id === cityId) || null;
  }

  /* ══════════════════════════════════════════════════════
     ① 設定節點（新增 / 更新，三向同步）
     @param {string} cityId
     @param {number} x
     @param {number} y
     @param {Object} opts - { source, mapId, silent, sandboxId }
     ══════════════════════════════════════════════════════ */
  function setNode(cityId, x, y, opts = {}){
    const state = getState();
    const city = _findCity(cityId);
    if(!city){
      console.warn('[DataSync.setNode] 找不到城池', cityId);
      return false;
    }

    const mapId = opts.mapId || _getActiveMapId();
    const nodeId = _cityNodeId(city);
    const source = opts.source || 'manual';
    const rx = Math.round(Number(x) || 0);
    const ry = Math.round(Number(y) || 0);
    const sandboxId = opts.sandboxId || '';  /* ★ v9.0.0 */

    /* --- 1. city.mapNode --- */
    city.mapNode = {
      mapId,
      nodeId,
      x: rx,
      y: ry,
      method: source,
      /* v9.0.0：可選記錄 sandboxId（共享模式時） */
      ...(sandboxId ? { sandboxId } : {}),
    };
    state.entityRev.city[cityId] = (state.entityRev.city[cityId] || 0) + 1;
    markDirty('city', cityId);

    /* --- 2. activeMapNodes（GameMap 記憶體快取）--- */
    const amn = _getActiveMapNodes();
    if(amn){
      amn[nodeId] = {
        name: city.name,
        code: city.code || '',
        x: rx,
        y: ry,
        namedCityId: city.id,
        source,
      };
    }

    /* --- 3. state.mapLibrary.loaded[mapId].nodes（本機快取）--- */
    if(mapId){
      const loaded = state.mapLibrary.loaded[mapId];
      if(loaded){
        if(!loaded.nodes) loaded.nodes = {};
        loaded.nodes[nodeId] = {
          name: city.name,
          code: city.code || '',
          x: rx,
          y: ry,
          namedCityId: city.id,
          source,
        };
      }
    }

    /* --- 4. Firebase（異步）--- */
    if(mapId && window.SLG.writeNodeToMapLibrary){
      window.SLG.writeNodeToMapLibrary(mapId, nodeId, {
        name: city.name,
        code: city.code || '',
        x: rx,
        y: ry,
        source,
      }).catch(err => console.warn('[DataSync] Firebase 節點寫入失敗', err));
    }

    tickLamport();
    flushPatches();
    saveState('important');
    return true;
  }

  /* ══════════════════════════════════════════════════════
     ② 刪除節點（僅刪節點，保留城池）
     @param {string} cityId
     @param {Object} opts - { silent, sandboxId }
     ══════════════════════════════════════════════════════ */
  async function deleteNode(cityId, opts = {}){
    const city = _findCity(cityId);
    if(!city) return false;

    const mapId = (city.mapNode && city.mapNode.mapId) || _getActiveMapId();
    const nodeId = _cityNodeId(city);

    /* --- 1. Firebase（先等完成，避免 watcher 又拉回來）--- */
    if(mapId && window.SLG.removeNodeFromMapLibrary){
      try{
        await window.SLG.removeNodeFromMapLibrary(mapId, nodeId);
      }catch(err){
        console.warn('[DataSync] Firebase 節點刪除失敗', err);
        if(!opts.silent){
          alert(
            '⚠️ 雲端節點刪除失敗：' + (err.message || err) +
            '\n\n本機已移除，但雲端仍保留。\n' +
            '請確認：① 已登入 ② 網路正常'
          );
        }
      }
    }

    /* --- 2. city.mapNode --- */
    if(city.mapNode){
      delete city.mapNode;
      getState().entityRev.city[cityId] = (getState().entityRev.city[cityId] || 0) + 1;
      markDirty('city', cityId);
    }

    /* --- 3. activeMapNodes --- */
    const amn = _getActiveMapNodes();
    if(amn && amn[nodeId]){
      delete amn[nodeId];
    }

    /* --- 4. mapLibrary.loaded（雙保險）--- */
    if(mapId){
      const loaded = getState().mapLibrary.loaded[mapId];
      if(loaded && loaded.nodes && loaded.nodes[nodeId]){
        delete loaded.nodes[nodeId];
      }
    }

    tickLamport();
    flushPatches();
    saveState('important');
    return true;
  }

  /* ══════════════════════════════════════════════════════
     ③ 城池改名 → 同步節點名稱
     ══════════════════════════════════════════════════════ */
  function renameCity(cityId){
    const city = _findCity(cityId);
    if(!city || !city.mapNode) return false;
    return setNode(cityId, city.mapNode.x, city.mapNode.y, {
      source: city.mapNode.method || 'manual',
      mapId: city.mapNode.mapId,
    });
  }

  /* ══════════════════════════════════════════════════════
     ④ 刪除城池（連動：節點 + 路線 + 宣戰）
     ══════════════════════════════════════════════════════ */
  async function deleteCityCascade(cityId){
    const state = getState();
    const city = _findCity(cityId);
    if(!city) return { routesRemoved: 0, warsRemoved: 0 };

    /* --- 1. 刪節點（含 Firebase）--- */
    await deleteNode(cityId, { silent: true });

    /* --- 2. 清理相關路線 --- */
    const routesBefore = state.routes.length;
    state.routes = state.routes.filter(r =>
      r.cityAId !== cityId && r.cityBId !== cityId
    );
    const routesRemoved = routesBefore - state.routes.length;

    /* --- 3. 清理其他城池指向此城的宣戰 --- */
    let warsRemoved = 0;
    for(const o of state.cities){
      if(o.id === cityId) continue;

      if(o.attackTargets && o.attackTargets.length > 0){
        const before = o.attackTargets.length;
        o.attackTargets = o.attackTargets.filter(t => t.cityId !== cityId);
        const diff = before - o.attackTargets.length;
        if(diff > 0){
          warsRemoved += diff;
          state.entityRev.city[o.id] = (state.entityRev.city[o.id] || 0) + 1;
          markDirty('city', o.id);
        }
      }
      if(o.defendTargets && o.defendTargets.length > 0){
        const before = o.defendTargets.length;
        o.defendTargets = o.defendTargets.filter(t => t.cityId !== cityId);
        const diff = before - o.defendTargets.length;
        if(diff > 0){
          warsRemoved += diff;
          state.entityRev.city[o.id] = (state.entityRev.city[o.id] || 0) + 1;
          markDirty('city', o.id);
        }
      }
    }

    /* --- 4. 刪除城池本體 --- */
    if(typeof window.SLG.deleteEntity === 'function'){
      window.SLG.deleteEntity('city', cityId);
    } else {
      const idx = state.cities.findIndex(c => c.id === cityId);
      if(idx >= 0){
        state.cities.splice(idx, 1);
        state.entityRev.city[cityId] = (state.entityRev.city[cityId] || 0) + 1;
        markDirty('cityDeleted', cityId);
      }
    }

    /* --- 5. 重算防守開始時間 --- */
    if(window.SLG.computeDefStartTimes){
      window.SLG.computeDefStartTimes(state.cities);
    }

    tickLamport();
    flushPatches();
    saveState('important');

    if(routesRemoved > 0 || warsRemoved > 0){
      logSystem(`🗑️ 刪城連動：路線 -${routesRemoved}，宣戰 -${warsRemoved}`);
    }
    return { routesRemoved, warsRemoved };
  }

  /* ══════════════════════════════════════════════════════
     ⑤ 路線孤兒清理 + 跨圖清理
     ══════════════════════════════════════════════════════ */
  function reconcileRoutes(){
    const state = getState();
    const cityIds = new Set(state.cities.map(c => c.id));
    const cityMap = new Map(state.cities.map(c => [c.id, c]));
    const requireSameMap = !!state.settings.routeRequireSameMap;

    const before = state.routes.length;
    const seen = new Set();

    state.routes = state.routes.filter(r => {
      /* 端點城池不存在 */
      if(!cityIds.has(r.cityAId) || !cityIds.has(r.cityBId)) return false;

      /* 跨圖檢查 */
      if(requireSameMap){
        const a = cityMap.get(r.cityAId);
        const b = cityMap.get(r.cityBId);
        const ma = (a && a.mapNode && a.mapNode.mapId) || '';
        const mb = (b && b.mapNode && b.mapNode.mapId) || '';
        if(ma && mb && ma !== mb) return false;
      }

      /* 重複路線（無向） */
      const key = [r.cityAId, r.cityBId].sort().join('|');
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const removed = before - state.routes.length;
    if(removed > 0){
      saveState('important');
      logSystem(`🧹 路線清理：移除 ${removed} 條`);
    }
    return { removed };
  }

  /* ══════════════════════════════════════════════════════
     ⑥ 宣戰孤兒清理 + 跨圖清理
     ══════════════════════════════════════════════════════ */
  function reconcileWars(){
    const state = getState();
    const cityIds = new Set(state.cities.map(c => c.id));
    const cityMap = new Map(state.cities.map(c => [c.id, c]));
    const requireSameMap = !!state.settings.warRequireSameMap;

    let removed = 0;
    const touched = new Set();

    for(const city of state.cities){
      const myMapId = (city.mapNode && city.mapNode.mapId) || '';

      const cleanList = (arr) => {
        if(!arr || arr.length === 0) return arr;
        const before = arr.length;
        const seen = new Set();
        const filtered = arr.filter(t => {
          /* 目標城池不存在 */
          if(!t.cityId || !cityIds.has(t.cityId)) return false;

          /* 重複 */
          if(seen.has(t.cityId)) return false;
          seen.add(t.cityId);

          /* 跨圖檢查 */
          if(requireSameMap){
            const tgt = cityMap.get(t.cityId);
            const tgtMapId = (tgt && tgt.mapNode && tgt.mapNode.mapId) || '';
            if(myMapId && tgtMapId && myMapId !== tgtMapId) return false;
          }
          return true;
        });
        const diff = before - filtered.length;
        if(diff > 0){
          removed += diff;
          touched.add(city.id);
        }
        return filtered;
      };

      city.attackTargets = cleanList(city.attackTargets);
      city.defendTargets = cleanList(city.defendTargets);
    }

    if(removed > 0){
      for(const id of touched){
        state.entityRev.city[id] = (state.entityRev.city[id] || 0) + 1;
        markDirty('city', id);
      }
      tickLamport();
      flushPatches();
      saveState('important');
      logSystem(`🧹 宣戰清理：移除 ${removed} 條`);
    }
    return { removed };
  }

  /* ══════════════════════════════════════════════════════
     ⑦ 節點全量修復（city.mapNode ↔ 地圖庫）
     ══════════════════════════════════════════════════════ */
  async function reconcileMapNodes(mapId){
    if(!mapId) return { fixed: 0, removed: 0 };
    const state = getState();
    const loaded = state.mapLibrary.loaded[mapId];
    if(!loaded || !loaded.nodes){
      return { fixed: 0, removed: 0 };
    }
    const nodes = loaded.nodes;

    let fixed = 0;
    let removed = 0;

    /* --- A. 補回：city.mapNode 有，地圖庫缺 --- */
    for(const c of state.cities){
      if(!c.mapNode) continue;
      if(c.mapNode.mapId && c.mapNode.mapId !== mapId) continue;

      const nodeId = c.mapNode.nodeId || _cityNodeId(c);
      if(!nodes[nodeId]){
        nodes[nodeId] = {
          name: c.name,
          code: c.code || '',
          x: Math.round(c.mapNode.x),
          y: Math.round(c.mapNode.y),
          namedCityId: c.id,
          source: c.mapNode.method || 'manual',
        };
        fixed++;
      }
    }

    /* --- B. 刪除：地圖庫有，找不到對應城池 --- */
    const cityIds = new Set(state.cities.map(c => c.id));
    const cityCodes = new Set(state.cities.map(c => c.code).filter(Boolean));
    const cityNames = new Set(state.cities.map(c => c.name));
    const toDelete = [];

    for(const nid in nodes){
      const n = nodes[nid];
      if(!n) continue;
      let matched = false;
      if(n.namedCityId && cityIds.has(n.namedCityId)) matched = true;
      if(!matched && n.code && cityCodes.has(n.code)) matched = true;
      if(!matched && n.name && cityNames.has(n.name)) matched = true;
      if(!matched) toDelete.push(nid);
    }

    for(const nid of toDelete){
      delete nodes[nid];
      removed++;
    }

    /* --- C. 上傳 Firebase --- */
    if(fixed > 0 || removed > 0){
      if(window.SLG.updateMapNodes){
        try{
          await window.SLG.updateMapNodes(mapId, nodes);
        }catch(err){
          console.warn('[DataSync] 節點上傳失敗', err);
        }
      }

      /* 同步 activeMapNodes */
      const amn = _getActiveMapNodes();
      if(amn){
        for(const nid in nodes){
          if(!amn[nid]) amn[nid] = nodes[nid];
        }
        for(const nid of toDelete){
          delete amn[nid];
        }
      }
      logSystem(`🔧 節點修復：補回 ${fixed}，刪除 ${removed}`);
    }

    return { fixed, removed };
  }

  /* ══════════════════════════════════════════════════════
     ⑧ 戰區孤兒清理（mapId 不存在）
     ══════════════════════════════════════════════════════ */
  function reconcileZones(){
    const state = getState();
    const mapIds = new Set(Object.keys(state.mapLibrary.index || {}));
    let removed = 0;

    /* 若地圖庫完全空（未登入或未載入），跳過 */
    if(mapIds.size === 0) return { removed: 0 };

    state.zones = state.zones.filter(z => {
      if(!z.mapId) return true;         /* 無 mapId 保留（尚未遷移） */
      if(mapIds.has(z.mapId)) return true;
      removed++;
      return false;
    });

    if(removed > 0){
      saveState('important');
      logSystem(`🧹 戰區清理：移除 ${removed} 個`);
    }
    return { removed };
  }

  /* ══════════════════════════════════════════════════════
     ⑨ 一鍵全修復
     ══════════════════════════════════════════════════════ */
  async function reconcileAll(){
    const mapId = _getActiveMapId();
    const result = {
      nodeFixed: 0,
      nodeRemoved: 0,
      routesRemoved: 0,
      warsRemoved: 0,
      zonesRemoved: 0,
      hadMap: !!mapId,
    };

    /* --- 節點修復 --- */
    if(mapId){
      const r = await reconcileMapNodes(mapId);
      result.nodeFixed = r.fixed;
      result.nodeRemoved = r.removed;
    }

    /* --- 路線清理 --- */
    const rr = reconcileRoutes();
    result.routesRemoved = rr.removed;

    /* --- 宣戰清理 --- */
    const rw = reconcileWars();
    result.warsRemoved = rw.removed;

    /* --- 戰區清理 --- */
    const rz = reconcileZones();
    result.zonesRemoved = rz.removed;

    /* --- 觸發全局重繪 --- */
    getEmit()(EVT().ROUTES_UPDATED);
    if(window.SLG.GameMap && typeof window.SLG.GameMap.invalidateLayout === 'function'){
      window.SLG.GameMap.invalidateLayout();
    }
    getEmit()(EVT().DATA);

    return result;
  }

  /* ══════════════════════════════════════════════════════
     ★ v9.0.0 新增：從共享沙盤同步節點
     用途：切換到共享沙盤後，把共享沙盤的節點座標
          套用到當前沙盤的城池（覆蓋現有 mapNode）
     @param {string} sandboxId - 共享沙盤 ID
     @param {Object} opts - { applyToCities: boolean, preserveExisting: boolean }
     ══════════════════════════════════════════════════════ */
  async function syncFromShared(sandboxId, opts = {}){
    if(!sandboxId) throw new Error('缺少 sandboxId');
    const state = getState();
    if(!state.auth.signedIn) throw new Error('請先登入');
    if(!window.SLG.isOnline || !window.SLG.isOnline()) throw new Error('離線中，無法同步');

    logSystem(`🔄 開始從共享沙盤同步節點（${sandboxId.slice(0, 12)}...）`);

    /* 1. 讀取共享沙盤 */
    let sharedData;
    if(window.SLG.fetchSharedSandbox){
      sharedData = await window.SLG.fetchSharedSandbox(sandboxId);
    }
    if(!sharedData || !sharedData.data){
      throw new Error('共享沙盤無資料');
    }

    /* 2. 遷移（若需要） */
    let migrated = sharedData;
    if(window.SLG.DataMigrations && window.SLG.DataMigrations.needsMigration(sharedData)){
      try{
        migrated = window.SLG.DataMigrations.migrate(sharedData);
        logSystem(`🔀 共享沙盤已升級至 v${window.SLG.DATA_VERSION}`);
      }catch(e){
        console.warn('[DataSync] 共享沙盤遷移失敗', e);
      }
    }

    const sharedCities = migrated.data.cities || [];
    const applyToCities = opts.applyToCities !== false;  /* 預設 true */
    const preserveExisting = !!opts.preserveExisting;

    let synced = 0;
    let skipped = 0;
    let created = 0;

    /* 3. 以「編號 → 名稱 → 正規化名稱」比對 */
    for(const sc of sharedCities){
      if(!sc.mapNode || typeof sc.mapNode.x !== 'number'){ skipped++; continue; }

      /* 匹配本機城池 */
      let localCity = null;
      if(sc.code){
        localCity = state.cities.find(c => c.code && c.code === sc.code);
      }
      if(!localCity && sc.name){
        localCity = state.cities.find(c => c.name === sc.name);
      }
      if(!localCity && sc.name && window.SLG.normalizeCityName){
        const norm = window.SLG.normalizeCityName(sc.name);
        localCity = state.cities.find(c => {
          const n = window.SLG.normalizeCityName(c.name);
          return n === norm;
        });
      }

      if(!localCity){
        /* 若允許新建，可擴充；目前僅跳過 */
        skipped++;
        continue;
      }

      /* 若已有 mapNode 且要求保留 → 跳過 */
      if(preserveExisting && localCity.mapNode){
        skipped++;
        continue;
      }

      /* 套用節點 */
      if(applyToCities){
        localCity.mapNode = {
          mapId: sc.mapNode.mapId || '',
          nodeId: sc.mapNode.nodeId || sc.code || ('n_' + localCity.id),
          x: Math.round(sc.mapNode.x),
          y: Math.round(sc.mapNode.y),
          method: 'shared-sync',
          sandboxId: sandboxId,
        };
        state.entityRev.city[localCity.id] = (state.entityRev.city[localCity.id] || 0) + 1;
        markDirty('city', localCity.id);
        synced++;
      }
    }

    if(synced > 0){
      tickLamport();
      flushPatches();
      saveState('important');
    }

    logSystem(`✅ 共享沙盤同步完成：同步 ${synced}，跳過 ${skipped}${created > 0 ? `，新建 ${created}` : ''}`);

    /* 4. 觸發重繪 */
    if(synced > 0){
      getEmit()(EVT().DATA);
      if(window.SLG.GameMap){
        if(window.SLG.GameMap.invalidateLayout) window.SLG.GameMap.invalidateLayout();
        window.SLG.GameMap.render();
      }
    }

    return { synced, skipped, created };
  }

  /* ══════════════════════════════════════════════════════
     ★ v9.0.0 新增：匯出節點到共享沙盤
     用途：把當前沙盤的節點座標寫入共享沙盤
     @param {string} sandboxId
     ══════════════════════════════════════════════════════ */
  async function exportToShared(sandboxId){
    if(!sandboxId) throw new Error('缺少 sandboxId');
    const state = getState();
    if(!state.auth.signedIn) throw new Error('請先登入');
    if(!window.SLG.isOnline || !window.SLG.isOnline()) throw new Error('離線中，無法匯出');

    /* 權限檢查 */
    if(!(window.SLG.Auth && window.SLG.Auth.canEditSharedSandbox && window.SLG.Auth.canEditSharedSandbox())){
      throw new Error('權限不足：需要共享沙盤編輯權限');
    }

    logSystem(`📤 開始匯出節點到共享沙盤（${sandboxId.slice(0, 12)}...）`);

    /* 1. 讀取共享沙盤 */
    const sharedData = await window.SLG.fetchSharedSandbox(sandboxId);
    if(!sharedData || !sharedData.data){
      throw new Error('共享沙盤無資料');
    }

    /* 2. 建立 本機城池 → 節點 對照 */
    const nodeMap = new Map();
    for(const c of state.cities){
      if(!c.mapNode || typeof c.mapNode.x !== 'number') continue;
      const key = c.code || c.name;
      nodeMap.set(key, {
        name: c.name,
        code: c.code || '',
        mapId: c.mapNode.mapId || '',
        nodeId: c.mapNode.nodeId || (c.code || ('n_' + c.id)),
        x: Math.round(c.mapNode.x),
        y: Math.round(c.mapNode.y),
      });
    }

    /* 3. 套用到共享沙盤的 cities */
    const sharedCities = sharedData.data.cities || [];
    let updated = 0;

    for(const sc of sharedCities){
      const key = sc.code || sc.name;
      const localNode = nodeMap.get(key);
      if(!localNode) continue;

      sc.mapNode = {
        mapId: localNode.mapId,
        nodeId: localNode.nodeId,
        x: localNode.x,
        y: localNode.y,
        method: 'personal-export',
      };
      updated++;
    }

    /* 4. 儲存共享沙盤（呼叫 SharedSandboxManager.save 或直接寫入） */
    if(window.SLG.SharedSandboxManager && state.activeSharedSandboxId === sandboxId){
      /* 若正處於共享模式 → 用 SharedSandboxManager 的 save */
      try{
        /* 暫時把共享資料寫入 state，再 save */
        const originalCities = state.cities;
        /* 只套用節點部分，不覆蓋其他資料 */
        for(const sc of sharedCities){
          const key = sc.code || sc.name;
          const localNode = nodeMap.get(key);
          if(!localNode) continue;
          const localCity = originalCities.find(c => (c.code || c.name) === key);
          if(localCity && sc.mapNode){
            localCity.mapNode = sc.mapNode;
          }
        }
        await window.SLG.SharedSandboxManager.save(sandboxId, { silent: true });
      }catch(e){
        console.warn('[DataSync] 共享沙盤儲存失敗', e);
        throw e;
      }
    } else {
      /* 否則直接呼叫 firebase 的 saveSharedSandbox */
      if(window.SLG.saveSharedSandbox){
        await window.SLG.saveSharedSandbox(sandboxId, {
          ...sharedData,
          data: sharedData.data,
        });
      }
    }

    logSystem(`✅ 已匯出 ${updated} 個節點到共享沙盤`);

    /* 5. 觸發索引更新 */
    if(window.SLG.SharedSandboxManager){
      try{
        await window.SLG.SharedSandboxManager.fetchIndex();
      }catch(e){}
    }

    return { updated, total: sharedCities.length };
  }

  /* ══════════════════════════════════════════════════════
     ★ v9.0.0 新增：檢查共享沙盤與本機的一致性
     ══════════════════════════════════════════════════════ */
  async function checkSharedConsistency(sandboxId){
    if(!sandboxId) throw new Error('缺少 sandboxId');
    const state = getState();
    if(!state.auth.signedIn) throw new Error('請先登入');
    if(!window.SLG.isOnline || !window.SLG.isOnline()) throw new Error('離線中，無法檢查');

    const sharedData = await window.SLG.fetchSharedSandbox(sandboxId);
    if(!sharedData || !sharedData.data){
      throw new Error('共享沙盤無資料');
    }

    const sharedCities = sharedData.data.cities || [];
    const result = {
      sharedOnly: [],   /* 共享有節點，本機無 */
      localOnly: [],    /* 本機有節點，共享無 */
      mismatch: [],     /* 兩邊都有但座標不同 */
      same: 0,
    };

    for(const sc of sharedCities){
      if(!sc.mapNode) continue;
      const key = sc.code || sc.name;
      const localCity = state.cities.find(c => (c.code || c.name) === key);

      if(!localCity || !localCity.mapNode){
        result.sharedOnly.push({
          name: sc.name,
          code: sc.code,
          sharedX: sc.mapNode.x,
          sharedY: sc.mapNode.y,
        });
        continue;
      }

      const lx = localCity.mapNode.x;
      const ly = localCity.mapNode.y;
      const sx = sc.mapNode.x;
      const sy = sc.mapNode.y;
      const dist = Math.hypot(lx - sx, ly - sy);

      if(dist > 5){
        result.mismatch.push({
          name: sc.name,
          code: sc.code,
          localX: lx, localY: ly,
          sharedX: sx, sharedY: sy,
          dist: Math.round(dist),
        });
      } else {
        result.same++;
      }
    }

    for(const lc of state.cities){
      if(!lc.mapNode) continue;
      const key = lc.code || lc.name;
      const sharedCity = sharedCities.find(c => (c.code || c.name) === key);
      if(!sharedCity || !sharedCity.mapNode){
        result.localOnly.push({
          name: lc.name,
          code: lc.code,
          localX: lc.mapNode.x,
          localY: lc.mapNode.y,
        });
      }
    }

    return result;
  }

  return {
    setNode,
    deleteNode,
    renameCity,
    deleteCityCascade,
    reconcileRoutes,
    reconcileWars,
    reconcileMapNodes,
    reconcileZones,
    reconcileAll,
    /* ★ v9.0.0 */
    syncFromShared,
    exportToShared,
    checkSharedConsistency,
  };
})();

/* ============================================================
   資料遷移：舊 zone 補 mapId
   優先序：
     ① 找該戰區第一個城池的 mapNode.mapId
     ② 若無 → 用當前使用中地圖
     ③ 若無 → 用第一個地圖
     ④ 若仍無 → 空字串（未綁定）
   ============================================================ */
function migrateZonesForMap(){
  const state = getState();
  let changed = false;
  const activeMapId = state.mapLibrary.activeMapId || '';

  for(const zone of state.zones){
    if(zone.mapId) continue;

    /* 推斷策略 ①：找該戰區第一個城池的 mapNode.mapId */
    const citiesInZone = state.cities.filter(c => c.zoneId === zone.id);
    let inferred = '';
    for(const c of citiesInZone){
      if(c.mapNode && c.mapNode.mapId){
        inferred = c.mapNode.mapId;
        break;
      }
    }

    /* 推斷策略 ②：當前使用中地圖 */
    if(!inferred) inferred = activeMapId;

    /* 推斷策略 ③：第一個地圖 */
    if(!inferred && state.mapLibrary.index){
      const firstMap = Object.keys(state.mapLibrary.index)[0];
      if(firstMap) inferred = firstMap;
    }

    zone.mapId = inferred;
    changed = true;
  }

  if(changed){
    saveState();
    logSystem('🔀 已遷移戰區 mapId');
  }
  return changed;
}

/* ============================================================
   ★ v9.0.0：共享沙盤切換時的資料同步掛鉤
   由 SharedSandboxManager.switchToShared 呼叫
   ============================================================ */
async function onSharedSandboxSwitched(sandboxId, oldMode, newMode){
  logSystem(`🔀 沙盤切換：${oldMode} → ${newMode}（${sandboxId ? sandboxId.slice(0, 12) + '...' : '無'}）`);

  /* 若切到共享 → 可選擇性套用共享節點（若有需要，由呼叫端決定） */
  if(newMode === 'shared' && sandboxId){
    try{
      /* 預設不自動同步，避免覆蓋本機編輯；由使用者手動觸發 */
      logSystem(`📡 已進入共享沙盤模式，如需同步節點請按「🔄 從共享同步」`);
    }catch(e){
      console.warn('[DataSync] 共享沙盤切換掛鉤失敗', e);
    }
  }

  /* 若切回個人 → 重繪地圖 */
  if(newMode === 'personal'){
    if(window.SLG.GameMap){
      if(window.SLG.GameMap.invalidateLayout) window.SLG.GameMap.invalidateLayout();
      window.SLG.GameMap.render();
    }
  }
}

/* ============================================================
   暴露
   ============================================================ */
Object.assign(window.SLG, {
  DataSyncManager,
  migrateZonesForMap,
  /* ★ v9.0.0 */
  onSharedSandboxSwitched,
});

})();
/* ============================================================================
 * dataSync.js 結束（v9.0.0）
 * ========================================================================== */