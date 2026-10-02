/* ============================================================================
 * sharedSandbox.js — v9.0.0 共享沙盤管理器
 * 職責：
 *   ① 共享沙盤 CRUD（建立、讀取、更新、刪除、改名）
 *   ② 沙盤切換（個人 ↔ 共享）
 *   ③ 定時同步（每 5 分鐘）
 *   ④ 歷史備份（保留 20 筆）
 *   ⑤ 權限控制（編輯 / 新增 / 刪除）
 *   ⑥ 上傳 / 下載（共享 ↔ 個人）
 * ========================================================================== */
(function(){
'use strict';

window.SLG = window.SLG || {};

const {
  state, emit, EVT,
  uid, logSystem,
  saveState, saveStateImportant,
  buildSandboxData, applySandboxData,
  isOnline,
} = window.SLG;

/* ============================================================
   常量
   ============================================================ */
const SHARED_SYNC_INTERVAL = 5 * 60 * 1000; /* 5 分鐘 */
const SHARED_HISTORY_LIMIT = 20; /* 保留 20 筆歷史 */
const SWITCH_LOCK_DURATION = 5000; /* 切換鎖定 5 秒 */
const SYNC_PROMPT_COOLDOWN_MS = 5 * 60 * 1000; /* ★ v9.0.2：使用者拒絕後，提示冷卻 5 分鐘 */

/* ============================================================
   內部狀態
   ============================================================ */
   
let syncTimer = null;
let syncInProgress = false;
let switchLockedUntil = 0;
let lastSyncPromptAt = 0; /* ★ v9.0.2：上次彈窗時間戳（避免短時間重複提示） */

/* ============================================================
   SharedSandboxManager
   ============================================================ */
const SharedSandboxManager = (() => {

  /* ── 內部工具 ── */
  function _getDb(){
    if(window.SLG.getDb) return window.SLG.getDb();
    return null;
  }

  function _getActiveSandboxId(){
    return state.activeSharedSandboxId || '';
  }

  /* ══════════════════════════════════════════════════════
     ① 讀取索引（所有共享沙盤清單）
     ══════════════════════════════════════════════════════ */
  async function fetchIndex(){
    const db = _getDb();
    if(!db) return {};
    if(!state.auth.signedIn) return {};
    if(!isOnline()) return state.sharedSandboxesIndex || {};

    try{
      const snap = await db.ref('sharedSandboxesIndex').once('value');
      const val = snap.val() || {};
      state.sharedSandboxesIndex = val;
      emit(EVT.SHARED_SANDBOXES_UPDATED, { type: 'index-loaded', index: val });
      return val;
    }catch(e){
      console.warn('[SharedSB] 讀取索引失敗', e);
      return {};
    }
  }

  /* ══════════════════════════════════════════════════════
     ② 讀取單一共享沙盤（含遷移）
     ══════════════════════════════════════════════════════ */
  async function fetch(sandboxId){
    const db = _getDb();
    if(!db || !sandboxId) return null;
    if(!state.auth.signedIn) return null;
    if(!isOnline()) throw new Error('離線中，無法讀取共享沙盤');

    try{
      const snap = await db.ref(`sharedSandboxes/${sandboxId}`).once('value');
      const raw = snap.val();
      if(!raw) throw new Error('共享沙盤不存在');

      /* 驗證結構 */
      if(!window.SLG.DataMigrations.validate(raw)){
        throw new Error('共享沙盤結構異常');
      }

      /* 遷移 */
      let migrated = raw;
      if(window.SLG.DataMigrations.needsMigration(raw)){
        try{
          migrated = window.SLG.DataMigrations.migrate(raw);
          logSystem(`🔀 共享沙盤「${raw.name}」已升級至 v${window.SLG.DATA_VERSION}`);

          /* 若有權限，存回雲端 */
          if(canEdit()){
            try{
              await db.ref(`sharedSandboxes/${sandboxId}`).update({
                dataVersion: migrated.dataVersion,
                appVersion: migrated.appVersion,
                dataUpdatedAt: migrated.dataUpdatedAt,
              });
            }catch(e){
              console.warn('[SharedSB] 遷移後存回失敗', e);
            }
          }
        }catch(e){
          console.error('[SharedSB] 遷移失敗', e);
          throw new Error('共享沙盤版本不相容：' + e.message);
        }
      }

      return migrated;
    }catch(e){
      console.warn(`[SharedSB] 讀取 ${sandboxId} 失敗`, e);
      throw e;
    }
  }

  /* ══════════════════════════════════════════════════════
     ③ 建立新沙盤（空白）
     ══════════════════════════════════════════════════════ */
  async function create(name){
    const db = _getDb();
    if(!db) throw new Error('Firebase 未就緒');
    if(!state.auth.signedIn) throw new Error('請先登入');
    if(!isOnline()) throw new Error('離線中，無法建立');

    /* 檢查權限 */
    if(!canCreate()){
      throw new Error('權限不足：只有超管或管理員可以建立共享沙盤');
    }

    /* 檢查名稱 */
    const trimmedName = String(name || '').trim();
    if(!trimmedName) throw new Error('沙盤名稱不能為空');
    if(trimmedName.length > 30) throw new Error('沙盤名稱最多 30 字');

    /* 檢查名稱衝突 */
    const existing = Object.values(state.sharedSandboxesIndex || {})
      .find(sb => sb.name === trimmedName);

    if(existing){
      /* 名稱衝突 → 呼叫端需處理 */
      throw new Error(`名稱衝突：已有沙盤「${trimmedName}」`);
    }

    /* 建立空白沙盤 */
    const now = Date.now();
    const sandboxId = 'shared_' + uid();
    const payload = {
      id: sandboxId,
      name: trimmedName,

      /* 空白資料 */
      data: {
        settings: {
          timeLimitMin: 120,
          consumeMinPerMin: 10,
          consumeMaxPerMin: 30,
          siegeEfficiency: 1,
          marchTimeSec: 0,
          maxLossRatio: 0.9,
          minLossRatio: 0.1,
          attackRequireRoute: false,
          crossZoneWarAllowed: false,
          routeRequireSameMap: true,
          warRequireSameMap: true,
        },
        alliances: [],
        zones: [],
        cities: [],
        routes: [],
        troopTiers: {
          tiers: [
            { maxLevel: 17, teamsPerPlayer: 3 },
            { maxLevel: 20, teamsPerPlayer: 4 },
            { maxLevel: 24, teamsPerPlayer: 5 },
            { maxLevel: 'Infinity', teamsPerPlayer: 6 },
          ],
          autoCalcOnImport: true,
          preserveOldTotal: false,
        },
      },
      mapIds: [],

      /* 版本 */
      version: 1,
      dataVersion: window.SLG.DATA_VERSION,
      appVersion: window.SLG.APP_VERSION,
      dataUpdatedAt: now,

      /* 建立資訊 */
      createdAt: now,
      createdBy: state.auth.accountUid || '',
      createdByName: state.auth.displayName || '',

      /* 更新資訊 */
      updatedAt: now,
      updatedBy: state.auth.accountUid || '',
      updatedByName: state.auth.displayName || '',
    };

    const updates = {};
    updates[`sharedSandboxes/${sandboxId}`] = payload;
    updates[`sharedSandboxesIndex/${sandboxId}`] = {
      name: trimmedName,
      mapCount: 0,
      cityCount: 0,
      allianceCount: 0,
      version: 1,
      updatedAt: now,
      updatedByName: state.auth.displayName || '',
      createdByName: state.auth.displayName || '',
    };

    await db.ref().update(updates);
    logSystem(`✅ 已建立共享沙盤：${trimmedName}`);

    /* 重新讀取索引 */
    await fetchIndex();

    return payload;
  }

  /* ══════════════════════════════════════════════════════
     ④ 儲存共享沙盤（含歷史備份）
     ══════════════════════════════════════════════════════ */
  async function save(sandboxId, opts = {}){
    const db = _getDb();
    if(!db || !sandboxId) throw new Error('缺少 sandboxId');
    if(!state.auth.signedIn) throw new Error('請先登入');
    if(!isOnline()) throw new Error('離線中，無法儲存');

    if(!canEdit()){
      throw new Error('權限不足：無法編輯共享沙盤');
    }

    const now = Date.now();
    const sandboxData = buildSandboxData();

    /* 讀取舊版做歷史備份 */
    let prevVersion = 0;
    try{
      const prevSnap = await db.ref(`sharedSandboxes/${sandboxId}`).once('value');
      const prev = prevSnap.val();
      if(prev && prev.version){
        prevVersion = prev.version;

        /* 備份舊版到 history */
        const historyTs = now;
        const historyPayload = {
          ts: historyTs,
          version: prev.version,
          dataVersion: prev.dataVersion || 0,
          appVersion: prev.appVersion || '',
          data: prev.data,
          updatedBy: prev.updatedBy || '',
          updatedByName: prev.updatedByName || '',
        };
        await db.ref(`sharedSandboxes/${sandboxId}/history/${historyTs}`).set(historyPayload);

        /* 清理超過 20 筆 */
        try{
          const histSnap = await db.ref(`sharedSandboxes/${sandboxId}/history`).once('value');
          const hist = histSnap.val() || {};
          const keys = Object.keys(hist).sort();
          while(keys.length > SHARED_HISTORY_LIMIT){
            const k = keys.shift();
            try{
              await db.ref(`sharedSandboxes/${sandboxId}/history/${k}`).remove();
            }catch(e){}
          }
        }catch(e){
          console.warn('[SharedSB] 清理歷史失敗', e);
        }
      }
    }catch(e){
      console.warn('[SharedSB] 讀取舊版失敗', e);
    }

    /* 收集使用的地圖 ID */
    const mapIds = new Set();
    for(const c of state.cities){
      if(c.mapNode && c.mapNode.mapId) mapIds.add(c.mapNode.mapId);
    }
    for(const z of state.zones){
      if(z.mapId) mapIds.add(z.mapId);
    }

    /* 組裝 payload */
    const payload = {
      id: sandboxId,
      name: state.activeSharedSandboxName || '',
      data: sandboxData,
      mapIds: [...mapIds],

      version: prevVersion + 1,
      dataVersion: window.SLG.DATA_VERSION,
      appVersion: window.SLG.APP_VERSION,
      dataUpdatedAt: now,

      updatedAt: now,
      updatedBy: state.auth.accountUid || '',
      updatedByName: state.auth.displayName || '',
    };

    const updates = {};
    updates[`sharedSandboxes/${sandboxId}`] = payload;
    updates[`sharedSandboxesIndex/${sandboxId}`] = {
      name: payload.name,
      mapCount: mapIds.size,
      cityCount: state.cities.length,
      allianceCount: state.alliances.length,
      version: payload.version,
      updatedAt: now,
      updatedByName: state.auth.displayName || '',
    };

    await db.ref().update(updates);
    logSystem(`💾 共享沙盤已儲存（v${payload.version}）`);

    /* 更新本機索引 */
    state.sharedSandboxesIndex[sandboxId] = updates[`sharedSandboxesIndex/${sandboxId}`];
    emit(EVT.SHARED_SANDBOXES_UPDATED, { type: 'saved', sandboxId });

    return payload;
  }

  /* ══════════════════════════════════════════════════════
     ⑤ 刪除共享沙盤（含歷史）
     ══════════════════════════════════════════════════════ */
  async function remove(sandboxId){
    const db = _getDb();
    if(!db || !sandboxId) throw new Error('缺少 sandboxId');
    if(!state.auth.signedIn) throw new Error('請先登入');
    if(!isOnline()) throw new Error('離線中，無法刪除');

    if(!canDelete()){
      throw new Error('權限不足：只有超管可以刪除共享沙盤');
    }

    const updates = {};
    updates[`sharedSandboxes/${sandboxId}`] = null;
    updates[`sharedSandboxesIndex/${sandboxId}`] = null;

    await db.ref().update(updates);
    logSystem(`🗑️ 已刪除共享沙盤：${sandboxId}`);

    delete state.sharedSandboxesIndex[sandboxId];
    if(state.activeSharedSandboxId === sandboxId){
      state.activeSharedSandboxId = '';
      state.activeSharedSandboxName = '';
      saveStateImportant();
    }

    emit(EVT.SHARED_SANDBOXES_UPDATED, { type: 'deleted', sandboxId });

    return true;
  }

  /* ══════════════════════════════════════════════════════
     ⑥ 改名
     ══════════════════════════════════════════════════════ */
  async function rename(sandboxId, newName){
    const db = _getDb();
    if(!db || !sandboxId) throw new Error('缺少 sandboxId');
    if(!state.auth.signedIn) throw new Error('請先登入');
    if(!isOnline()) throw new Error('離線中，無法改名');

    if(!canRename()){
      throw new Error('權限不足：只有超管或管理員可以改名');
    }

    const trimmed = String(newName || '').trim();
    if(!trimmed) throw new Error('名稱不能為空');
    if(trimmed.length > 30) throw new Error('名稱最多 30 字');

    /* 檢查衝突 */
    const conflict = Object.entries(state.sharedSandboxesIndex || {})
      .find(([id, sb]) => id !== sandboxId && sb.name === trimmed);
    if(conflict){
      throw new Error(`名稱衝突：已有沙盤「${trimmed}」`);
    }

    const now = Date.now();
    const updates = {};
    updates[`sharedSandboxes/${sandboxId}/name`] = trimmed;
    updates[`sharedSandboxes/${sandboxId}/updatedAt`] = now;
    updates[`sharedSandboxes/${sandboxId}/updatedBy`] = state.auth.accountUid || '';
    updates[`sharedSandboxes/${sandboxId}/updatedByName`] = state.auth.displayName || '';
    updates[`sharedSandboxesIndex/${sandboxId}/name`] = trimmed;
    updates[`sharedSandboxesIndex/${sandboxId}/updatedAt`] = now;
    updates[`sharedSandboxesIndex/${sandboxId}/updatedByName`] = state.auth.displayName || '';

    await db.ref().update(updates);

    /* 若改的是當前沙盤 → 更新本機狀態 */
    if(state.activeSharedSandboxId === sandboxId){
      state.activeSharedSandboxName = trimmed;
      saveState();
    }

    if(state.sharedSandboxesIndex[sandboxId]){
      state.sharedSandboxesIndex[sandboxId].name = trimmed;
      state.sharedSandboxesIndex[sandboxId].updatedAt = now;
    }

    logSystem(`✏️ 共享沙盤改名為：${trimmed}`);
    emit(EVT.SHARED_SANDBOXES_UPDATED, { type: 'renamed', sandboxId, name: trimmed });

    return true;
  }

  /* ══════════════════════════════════════════════════════
     ⑦ 讀取歷史清單
     ══════════════════════════════════════════════════════ */
  async function fetchHistory(sandboxId){
    const db = _getDb();
    if(!db || !sandboxId) return [];
    if(!state.auth.signedIn) return [];
    if(!isOnline()) return [];

    try{
      const snap = await db.ref(`sharedSandboxes/${sandboxId}/history`).once('value');
      const all = snap.val() || {};
      return Object.entries(all).map(([ts, item]) => ({
        ts: parseInt(ts, 10),
        version: item.version || 0,
        dataVersion: item.dataVersion || 0,
        appVersion: item.appVersion || '',
        cityCount: item.data?.cities?.length || 0,
        allianceCount: item.data?.alliances?.length || 0,
        data: item.data,
        updatedByName: item.updatedByName || '',
      })).sort((a, b) => b.ts - a.ts);
    }catch(e){
      console.warn('[SharedSB] 讀取歷史失敗', e);
      return [];
    }
  }

  /* ══════════════════════════════════════════════════════
     ⑧ 從歷史還原
     ══════════════════════════════════════════════════════ */
  async function restoreFromHistory(sandboxId, ts){
    const db = _getDb();
    if(!db || !sandboxId || !ts) throw new Error('缺少參數');
    if(!canEdit()) throw new Error('權限不足：無法還原');

    const snap = await db.ref(`sharedSandboxes/${sandboxId}/history/${ts}`).once('value');
    const item = snap.val();
    if(!item || !item.data){
      throw new Error('找不到此歷史版本');
    }

    /* 遷移歷史資料 */
    const migrated = window.SLG.DataMigrations.migrate({
      data: item.data,
      dataVersion: item.dataVersion || 0,
    });

    const confirmed = confirm(
      `確定要還原共享沙盤到此版本嗎？\n\n` +
      `時間：${new Date(ts).toLocaleString()}\n` +
      `版本：v${item.version || '?'}\n` +
      `內容：${migrated.data.cities?.length || 0} 城 / ${migrated.data.alliances?.length || 0} 盟\n\n` +
      `⚠️ 目前版本會先備份到歷史`
    );
    if(!confirmed) return false;

    /* 套用資料到記憶體 */
    applySandboxData(migrated.data);

    /* 儲存（會自動備份當前版本到歷史） */
    await save(sandboxId);

    logSystem(`↩️ 已從歷史還原：${new Date(ts).toLocaleString()}`);
    return true;
  }

  /* ══════════════════════════════════════════════════════
     ⑨ 切換沙盤（個人 ↔ 共享）
     ══════════════════════════════════════════════════════ */
  async function switchToShared(sandboxId){
    /* 切換鎖定檢查 */
    if(Date.now() < switchLockedUntil){
      const remain = Math.ceil((switchLockedUntil - Date.now()) / 1000);
      throw new Error(`切換鎖定中，請等待 ${remain} 秒`);
    }

    const db = _getDb();
    if(!db) throw new Error('Firebase 未就緒');
    if(!state.auth.signedIn) throw new Error('請先登入');
    if(!isOnline()) throw new Error('離線中，無法切換');

    /* 讀取沙盤 */
    const sandbox = await fetch(sandboxId);
    if(!sandbox) throw new Error('讀取沙盤失敗');

    /* 備份當前狀態（若目前是個人沙盤） */
    if(state.sandboxMode === 'personal'){
      try{
        await window.SLG.performCloudUpload('switch-to-shared');
      }catch(e){
        console.warn('[SharedSB] 切換前上傳失敗', e);
      }
    }

    /* 切換狀態 */
    state.sandboxMode = 'shared';
    state.activeSharedSandboxId = sandboxId;
    state.activeSharedSandboxName = sandbox.name;

    /* 套用資料 */
    applySandboxData(sandbox.data);

    /* 更新 UI */
    document.body.classList.remove('sandbox-personal');
    document.body.classList.add('sandbox-shared');

    /* 啟動定時同步 */
    startSyncTimer();

    /* 通知重繪 */
    emit(EVT.SANDBOX_MODE_CHANGED, { mode: 'shared', sandboxId });
    emit(EVT.DATA);
    saveState();

    /* 設定切換鎖定 */
    switchLockedUntil = Date.now() + SWITCH_LOCK_DURATION;

    logSystem(`📡 已切換至共享沙盤：${sandbox.name}`);
    return true;
  }

  async function switchToPersonal(){
    /* 切換鎖定檢查 */
    if(Date.now() < switchLockedUntil){
      const remain = Math.ceil((switchLockedUntil - Date.now()) / 1000);
      throw new Error(`切換鎖定中，請等待 ${remain} 秒`);
    }

    /* 若當前是共享，先儲存 */
    if(state.sandboxMode === 'shared' && canEdit() && isOnline()){
      try{
        await save(state.activeSharedSandboxId, { silent: true });
      }catch(e){
        console.warn('[SharedSB] 切換前儲存失敗', e);
      }
    }

    /* 停止定時同步 */
    stopSyncTimer();

    /* 切換狀態 */
    state.sandboxMode = 'personal';
    state.activeSharedSandboxId = '';
    state.activeSharedSandboxName = '';

    /* 從個人雲端載入（若已登入） */
    if(state.auth.signedIn && isOnline()){
      try{
        await window.SLG.loadMySandbox();
      }catch(e){
        console.warn('[SharedSB] 載入個人沙盤失敗', e);
      }
    }

    /* 更新 UI */
    document.body.classList.remove('sandbox-shared');
    document.body.classList.add('sandbox-personal');

    /* 通知重繪 */
    emit(EVT.SANDBOX_MODE_CHANGED, { mode: 'personal' });
    emit(EVT.DATA);
    saveState();

    /* 設定切換鎖定 */
    switchLockedUntil = Date.now() + SWITCH_LOCK_DURATION;

    logSystem('👤 已切換至個人沙盤');
    return true;
  }

  /* ══════════════════════════════════════════════════════
     ⑩ 定時同步（5 分鐘）
     ══════════════════════════════════════════════════════ */
  function startSyncTimer(){
    stopSyncTimer();

    if(state.sandboxMode !== 'shared') return;
    if(!state.auth.signedIn) return;
    if(!state.activeSharedSandboxId) return;

    console.log(`[SharedSB] 啟動定時同步（每 ${SHARED_SYNC_INTERVAL / 60000} 分鐘）`);

    syncTimer = setInterval(async () => {
      if(syncInProgress) return;
      if(!isOnline()) return;
      if(state.sandboxMode !== 'shared') return;

      syncInProgress = true;
      try{
        await syncOnce();
      }catch(e){
        console.warn('[SharedSB] 定時同步失敗', e);
      }finally{
        syncInProgress = false;
      }
    }, SHARED_SYNC_INTERVAL);
  }

  function stopSyncTimer(){
    if(syncTimer){
      clearInterval(syncTimer);
      syncTimer = null;
      console.log('[SharedSB] 已停止定時同步');
    }
  }
  /* ══════════════════════════════════════════════════════
     ⑪ 單次同步
     ★ v9.0.2：使用者拒絕載入雲端版本後，5 分鐘內不再重複提示；
               同時避免「拒絕後立刻自動上傳」覆蓋雲端新版本。
     ══════════════════════════════════════════════════════ */
  async function syncOnce() {
    const sandboxId = state.activeSharedSandboxId;
    if (!sandboxId) return;
    
    const db = _getDb();
    if (!db) return;
    
    /* 讀取雲端版本 */
    const snap = await db.ref(`sharedSandboxes/${sandboxId}/version`).once('value');
    const cloudVersion = snap.val() || 0;
    const localVersion = state.sharedSandboxVersion || 0;
    
    if (cloudVersion > localVersion) {
      /* ★ v9.0.2：冷卻檢查 — 使用者拒絕後 5 分鐘內不再彈窗 */
      const now = Date.now();
      const remain = SYNC_PROMPT_COOLDOWN_MS - (now - lastSyncPromptAt);
      if (lastSyncPromptAt > 0 && remain > 0) {
        console.log(`[SharedSB] 彈窗冷卻中（剩餘 ${Math.round(remain / 1000)} 秒），跳過本次提示`);
        return;
      }
      
      /* 雲端有新版本 → 提示使用者 */
      const confirmed = confirm(
        `📡 共享沙盤已更新\n\n` +
        `雲端版本：v${cloudVersion}\n` +
        `本機版本：v${localVersion}\n\n` +
        `是否載入最新版本？\n\n` +
        `⚠️ 本機未儲存的變更會遺失\n` +
        `（拒絕後 5 分鐘內不會再提示）`
      );
      lastSyncPromptAt = now;
      
      if (confirmed) {
        await reloadCurrentShared();
        /* ★ 載入成功 → 清除冷卻，恢復正常提示節奏 */
        lastSyncPromptAt = 0;
      } else {
        /* ★ 拒絕 → 保留本機版本與 dirty 狀態，
           本機 dirty 保留（使用者可手動按「立即上傳」），
           但因本機版本未更新，下次 syncOnce 仍會檢查雲端是否有更新的版本。 */
        console.log('[SharedSB] 使用者拒絕載入，冷卻 5 分鐘');
      }
    } else if (cloudVersion === localVersion && canEdit()) {
      /* 版本一致，且本機有權限 → 檢查是否需要儲存 */
      if (state.sync.dirty) {
        console.log('[SharedSB] 偵測到未儲存變更，自動上傳');
        await save(sandboxId, { silent: true });
      }
    }
  }
  /* ══════════════════════════════════════════════════════
     ⑫ 重新載入當前共享沙盤
     ══════════════════════════════════════════════════════ */
  async function reloadCurrentShared(){
    const sandboxId = state.activeSharedSandboxId;
    if(!sandboxId) return false;

    try{
      const sandbox = await fetch(sandboxId);
      if(!sandbox) return false;

      applySandboxData(sandbox.data);
      state.sharedSandboxVersion = sandbox.version || 0;

      emit(EVT.DATA);
      logSystem(`📥 已重新載入共享沙盤：${sandbox.name}（v${sandbox.version}）`);
      return true;
    }catch(e){
      console.warn('[SharedSB] 重新載入失敗', e);
      return false;
    }
  }

  /* ══════════════════════════════════════════════════════
     ⑬ 下載共享 → 個人
     ══════════════════════════════════════════════════════ */
  async function downloadToPersonal(sandboxId){
    const db = _getDb();
    if(!db || !sandboxId) throw new Error('缺少 sandboxId');
    if(!state.auth.signedIn) throw new Error('請先登入');
    if(!isOnline()) throw new Error('離線中，無法下載');

    const confirmed = confirm(
      `📥 下載共享沙盤到個人沙盤\n\n` +
      `⚠️ 這會覆蓋你目前的個人沙盤。\n\n` +
      `確定要下載嗎？`
    );
    if(!confirmed) return false;

    const sandbox = await fetch(sandboxId);
    if(!sandbox) throw new Error('讀取共享沙盤失敗');

    /* 記錄切換前的模式 */
    const prevMode = state.sandboxMode;

    /* 切換到個人模式並套用資料 */
    state.sandboxMode = 'personal';

    /* 套用共享沙盤的資料到個人 */
    applySandboxData(sandbox.data);

    /* 儲存到個人雲端 */
    try{
      await window.SLG.saveMySandbox();
    }catch(e){
      console.warn('[SharedSB] 儲存個人沙盤失敗', e);
    }

    /* 若原本是共享模式 → 切回共享模式（不改變當前顯示） */
    if(prevMode === 'shared'){
      state.sandboxMode = 'shared';
    }

    emit(EVT.DATA);
    logSystem(`📥 已下載共享沙盤「${sandbox.name}」到個人沙盤`);
    return true;
  }

  /* ══════════════════════════════════════════════════════
     ⑭ 上傳個人 → 共享（僅超管）
     ══════════════════════════════════════════════════════ */
  async function uploadPersonalToShared(sandboxId){
    const db = _getDb();
    if(!db || !sandboxId) throw new Error('缺少 sandboxId');
    if(!state.auth.signedIn) throw new Error('請先登入');
    if(!isOnline()) throw new Error('離線中，無法上傳');

    if(!canUploadFromPersonal()){
      throw new Error('權限不足：只有超管可以上傳個人沙盤到共享');
    }

    const confirmed = confirm(
      `📤 上傳個人沙盤到共享沙盤\n\n` +
      `⚠️ 這會覆蓋共享沙盤的所有資料，且無法復原！\n\n` +
      `（舊版會備份到歷史，可還原）\n\n` +
      `確定要上傳嗎？`
    );
    if(!confirmed) return false;

    /* 從個人雲端讀取（或當前記憶體） */
    const personalData = buildSandboxData();

    /* 寫入共享 */
    const sandbox = await fetch(sandboxId);
    if(!sandbox) throw new Error('讀取共享沙盤失敗');

    /* 建立新的 payload */
    const now = Date.now();
    const mapIds = new Set();
    for(const c of personalData.cities || []){
      if(c.mapNode && c.mapNode.mapId) mapIds.add(c.mapNode.mapId);
    }

    const payload = {
      id: sandboxId,
      name: sandbox.name,
      data: personalData,
      mapIds: [...mapIds],
      version: (sandbox.version || 0) + 1,
      dataVersion: window.SLG.DATA_VERSION,
      appVersion: window.SLG.APP_VERSION,
      dataUpdatedAt: now,
      updatedAt: now,
      updatedBy: state.auth.accountUid || '',
      updatedByName: state.auth.displayName || '',
    };

    /* 備份舊版到歷史 */
    try{
      await db.ref(`sharedSandboxes/${sandboxId}/history/${now}`).set({
        ts: now,
        version: sandbox.version || 0,
        dataVersion: sandbox.dataVersion || 0,
        appVersion: sandbox.appVersion || '',
        data: sandbox.data,
        updatedBy: sandbox.updatedBy || '',
        updatedByName: sandbox.updatedByName || '',
      });
    }catch(e){
      console.warn('[SharedSB] 備份舊版失敗', e);
    }

    const updates = {};
    updates[`sharedSandboxes/${sandboxId}`] = payload;
    updates[`sharedSandboxesIndex/${sandboxId}`] = {
      name: sandbox.name,
      mapCount: mapIds.size,
      cityCount: personalData.cities?.length || 0,
      allianceCount: personalData.alliances?.length || 0,
      version: payload.version,
      updatedAt: now,
      updatedByName: state.auth.displayName || '',
    };

    await db.ref().update(updates);

    logSystem(`📤 已上傳個人沙盤到共享：${sandbox.name}（v${payload.version}）`);
    emit(EVT.SHARED_SANDBOXES_UPDATED, { type: 'uploaded', sandboxId });
    return true;
  }

  /* ══════════════════════════════════════════════════════
     權限檢查
     ══════════════════════════════════════════════════════ */
  function canEdit(){
    if(!state.auth.signedIn) return false;
    const Auth = window.SLG.Auth;
    if(!Auth) return false;
    if(Auth.isSuperAdmin()) return true;
    if(Auth.isAdmin()) return true;
    if(Auth.isOfficer() && state.auth.extraPerms.canEditSharedSandbox) return true;
    return false;
  }

  function canCreate(){
    if(!state.auth.signedIn) return false;
    const Auth = window.SLG.Auth;
    if(!Auth) return false;
    return Auth.isSuperAdmin() || Auth.isAdmin();
  }

  function canDelete(){
    if(!state.auth.signedIn) return false;
    const Auth = window.SLG.Auth;
    if(!Auth) return false;
    return Auth.isSuperAdmin();
  }

  function canRename(){
    if(!state.auth.signedIn) return false;
    const Auth = window.SLG.Auth;
    if(!Auth) return false;
    return Auth.isSuperAdmin() || Auth.isAdmin();
  }

  function canUploadFromPersonal(){
    if(!state.auth.signedIn) return false;
    const Auth = window.SLG.Auth;
    if(!Auth) return false;
    return Auth.isSuperAdmin();
  }

  /* ══════════════════════════════════════════════════════
     初始化
     ══════════════════════════════════════════════════════ */
  function init(){
    /* 若當前是共享模式（從 localStorage 恢復）*/
    if(state.sandboxMode === 'shared' && state.activeSharedSandboxId){
      document.body.classList.add('sandbox-shared');
      startSyncTimer();
    } else {
      document.body.classList.add('sandbox-personal');
    }
  }

  return {
    /* CRUD */
    fetchIndex,
    fetch,
    create,
    save,
    remove,
    rename,

    /* 歷史 */
    fetchHistory,
    restoreFromHistory,

    /* 切換 */
    switchToShared,
    switchToPersonal,
    reloadCurrentShared,

    /* 上下載 */
    downloadToPersonal,
    uploadPersonalToShared,

    /* 同步 */
    startSyncTimer,
    stopSyncTimer,
    syncOnce,

    /* 權限 */
    canEdit,
    canCreate,
    canDelete,
    canRename,
    canUploadFromPersonal,

    /* 初始化 */
    init,

    /* 狀態查詢 */
    getSwitchLockRemain(){
      const remain = switchLockedUntil - Date.now();
      return remain > 0 ? Math.ceil(remain / 1000) : 0;
    },
  };
})();

/* ============================================================
   暴露
   ============================================================ */
Object.assign(window.SLG, {
  SharedSandboxManager,
  SHARED_SYNC_INTERVAL,
  SHARED_HISTORY_LIMIT,
});

})();