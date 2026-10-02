/* ============================================================================
 * js/main.js — v9.0.0
 * 權限、對話框、事件綁定、模擬調度、啟動
 * v9.0.0：共享沙盤整合 + 側邊欄切換器 + mode-bar 切換器 + 定時同步
 * ========================================================================== */
(function(){
'use strict';

window.SLG = window.SLG || {};

/* ── 從全域取得 ── */
const getState = () => window.SLG.state;
const getOn = () => window.SLG.on;
const getEmit = () => window.SLG.emit;
const EVT = () => window.SLG.EVT;
const uid = () => window.SLG.uid();
const esc = (s) => window.SLG.esc(s);
const logSystem = (t) => window.SLG.logSystem(t);
const timeAgo = (ts) => window.SLG.timeAgo(ts);
const buildSandboxFileName = (n, t) => window.SLG.buildSandboxFileName(n, t);
const saveState = (r) => window.SLG.saveState(r);
const saveStateImportant = () => window.SLG.saveStateImportant();
const loadState = () => window.SLG.loadState();
const syncAIParamsToUI = () => window.SLG.syncAIParamsToUI();
const readAIParamsFromUI = () => window.SLG.readAIParamsFromUI();
const syncTroopTiersToUI = () => window.SLG.syncTroopTiersToUI();
const readTroopTiersFromUI = () => window.SLG.readTroopTiersFromUI();
const computeAllocation = (c) => window.SLG.computeAllocation(c);
const isOnline = () => window.SLG.isOnline();
const initNetworkWatcher = () => window.SLG.initNetworkWatcher();
const getSyncPrefs = () => window.SLG.getSyncPrefs();
const setSyncPrefs = (p) => window.SLG.setSyncPrefs(p);
const performCloudUpload = (r) => window.SLG.performCloudUpload(r);
const startSyncTimer = () => window.SLG.startSyncTimer();
const stopSyncTimer = () => window.SLG.stopSyncTimer();
const updateModeBar = () => window.SLG.updateModeBar();
const DYN_ROUTE_SAMPLE_SEC = () => window.SLG.DYN_ROUTE_SAMPLE_SEC;
const hhmmToMinutes = (h) => window.SLG.hhmmToMinutes(h);
const getWorker = () => window.SLG.getWorker();
const releaseWorker = () => window.SLG.releaseWorker();
const bumpSimRunId = () => window.SLG.bumpSimRunId();

const Auth = () => window.SLG.Auth;
const viz = () => window.SLG.viz;
const R = () => window.SLG.R;
const DYN = () => window.SLG.DYN;
const DEPLOY = () => window.SLG.DEPLOY;
const MapLibrary = () => window.SLG.MapLibrary;
const SharedSandboxManager = () => window.SLG.SharedSandboxManager;

/* ============================================================
   確認對話框
   ============================================================ */
let confirmCb = null;

function showConfirm(title, msg, cb){
  document.getElementById('modalTitle').textContent = '⚠️ ' + title;
  document.getElementById('modalMessage').textContent = msg;
  document.getElementById('confirmModal').classList.add('show');
  confirmCb = cb;
}

/* ============================================================
   權限工具
   ============================================================ */
function requirePerm(checkFn, label){
  let ok = false;
  try{ ok = !!checkFn(); }catch(e){ ok = false; }
  if(ok) return true;
  alert('🔒 權限不足：' + label + '\n\n請聯繫管理員開啟權限，或切換至有權限的帳號。');
  return false;
}

function togglePerm(el, enabled, reason){
  if(!el) return;
  if(enabled){
    el.classList.remove('perm-disabled');
    el.removeAttribute('title');
  } else {
    el.classList.add('perm-disabled');
    if(reason) el.title = '🔒 ' + reason;
  }
}

function disableInputs(ids, disabled){
  ids.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.disabled = !!disabled;
  });
}

function effectiveCanEditData(){
  if(window.SLG.isInRoom()) return window.SLG.canEditRoomData();
  return Auth() && Auth().canEditData();
}

function effectiveCanImportExcel(){
  if(window.SLG.isInRoom()) return window.SLG.getEffectiveImportExcelPermission();
  return Auth() && Auth().canImportExcel();
}

function effectiveCanEditMapLibrary(){
  return !!(Auth() && Auth().isSignedIn());
}

function applyPermissions(){
  const state = getState();
  const signedIn = state.auth.signedIn;
  const guestAllowed  = ['tab-rules'];
  const memberAllowed = [
    'tab-room', 'tab-alliances', 'tab-cities', 'tab-deploy',
    'tab-summary', 'tab-map', 'tab-dyn', 'tab-narrative', 'tab-chat',
    'tab-sandbox', 'tab-account', 'tab-rules'
  ];
  const adminAllowed  = [
    'tab-room', 'tab-params', 'tab-alliances', 'tab-cities', 'tab-deploy',
    'tab-summary', 'tab-map', 'tab-dyn', 'tab-narrative', 'tab-chat',
    'tab-sandbox', 'tab-account', 'tab-rules'
  ];
  const superAllowed  = [
    'tab-room', 'tab-params', 'tab-alliances', 'tab-cities', 'tab-deploy',
    'tab-summary', 'tab-map', 'tab-dyn', 'tab-narrative', 'tab-chat',
    'tab-sandbox', 'tab-account', 'tab-accounts', 'tab-rules'
  ];

  document.querySelectorAll('.top-nav button[data-tab]').forEach(btn => {
    const tabId = btn.dataset.tab;
    let allowed = false;
    if(!signedIn){ allowed = guestAllowed.includes(tabId); }
    else if(Auth() && Auth().isSuperAdmin()){ allowed = superAllowed.includes(tabId); }
    else if(Auth() && Auth().isAdmin()){ allowed = adminAllowed.includes(tabId); }
    else { allowed = memberAllowed.includes(tabId); }
    btn.style.display = allowed ? '' : 'none';
  });

  const activeBtn = document.querySelector('.top-nav button.active');
  if(activeBtn && activeBtn.style.display === 'none'){
    const firstVisible = [...document.querySelectorAll('.top-nav button[data-tab]')]
      .find(b => b.style.display !== 'none');
    if(firstVisible) firstVisible.click();
  }

  togglePerm(document.getElementById('btnCreateRoom'), Auth() && Auth().canCreateRoom(), '需要幹部以上權限');
  togglePerm(document.getElementById('btnJoinRoom'), signedIn, '請先登入');

  const canEditSettings = Auth() && Auth().canEditSettings();
  ['btnSaveSettings', 'btnResetAll', 'btnAISave', 'btnAIReset'].forEach(id => {
    togglePerm(document.getElementById(id), canEditSettings, '需要管理員以上權限');
  });
  disableInputs([
    'globalTimeLimit','globalMarchTimeSec','globalConsumeMinPerMin','globalConsumeMaxPerMin',
    'globalSiegeEfficiency','globalMaxLossRatio','globalMinLossRatio',
    'globalAttackRequireRoute','globalCrossZoneWar',
    'globalRouteRequireSameMap','globalWarRequireSameMap',
    'aiR25','aiR20','aiR15','aiR12','aiR10','aiR08','aiR06','aiR00',
    'aiTeamFactor','aiWallFactor1','aiWallFactor2','aiDefendFactor','aiMinPct'
  ], !canEditSettings);

  ['btnSaveTiers','btnResetTiers'].forEach(id => {
    togglePerm(document.getElementById(id), canEditSettings, '需要管理員以上權限');
  });
  disableInputs([
    'tier1Max','tier1Teams','tier2Max','tier2Teams','tier3Max','tier3Teams','tier4Teams',
    'tierAutoCalcOnImport','tierPreserveOldTotal'
  ], !canEditSettings);

  const canEditData = effectiveCanEditData();
  togglePerm(document.getElementById('btnSaveAlliance'), canEditData, '需要編輯資料權限');
  togglePerm(document.getElementById('btnCancelAllianceEdit'), canEditData, '需要編輯資料權限');
  togglePerm(document.getElementById('btnResetAllianceOrder'), canEditData, '需要編輯資料權限');
  disableInputs(['allyName','allyIcon','allySide','allyMemberCount','allyTotalPower'], !canEditData);

  togglePerm(document.getElementById('btnAddZone'), canEditData, '需要編輯資料權限');
  togglePerm(document.getElementById('btnOpenNewCity'), canEditData, '需要編輯資料權限');
  togglePerm(document.getElementById('btnSimulate'), Auth() && Auth().canRunSim(), '請先登入');
  const newZoneNameEl = document.getElementById('newZoneName');
  if(newZoneNameEl) newZoneNameEl.disabled = !canEditData;
  const newZoneMapEl = document.getElementById('newZoneMap');
  if(newZoneMapEl) newZoneMapEl.disabled = !canEditData;

  const cityBatchZoneEl = document.getElementById('cityBatchZone');
  if(cityBatchZoneEl) cityBatchZoneEl.disabled = !canEditData;
  const cityBatchAllianceEl = document.getElementById('cityBatchAlliance');
  if(cityBatchAllianceEl) cityBatchAllianceEl.disabled = !canEditData;
  const cityBatchSideEl = document.getElementById('cityBatchSide');
  if(cityBatchSideEl) cityBatchSideEl.disabled = !canEditData;
  togglePerm(document.getElementById('btnCityBatchApplyZone'), canEditData, '需要編輯資料權限');
  togglePerm(document.getElementById('btnCityBatchApplyAlliance'), canEditData, '需要編輯資料權限');
  togglePerm(document.getElementById('btnCityBatchApplySide'), canEditData, '需要編輯資料權限');
  togglePerm(document.getElementById('btnCityBatchDelete'), canEditData, '需要編輯資料權限');

  togglePerm(document.getElementById('btnAddRouteLine'), canEditData, '需要編輯資料權限');
  togglePerm(document.getElementById('btnQuickAddRoute'), canEditData, '需要編輯資料權限');
  togglePerm(document.getElementById('btnExpandAllRouteGroups'), true, '');
  togglePerm(document.getElementById('btnCollapseAllRouteGroups'), true, '');
  togglePerm(document.getElementById('btnMapRelayout'), true, '');
  togglePerm(document.getElementById('btnMapFit'), true, '');
  togglePerm(document.getElementById('btnMapClearHighlight'), true, '');
  togglePerm(document.getElementById('btnMapReconcile'), signedIn, '請先登入');

  togglePerm(document.getElementById('btnMapRouteMode'), canEditData, '需要編輯資料權限');
  togglePerm(document.getElementById('btnMapWarMode'), canEditData, '需要編輯資料權限');
  togglePerm(document.getElementById('btnMapCityMode'), canEditData, '需要編輯資料權限');
  togglePerm(document.getElementById('btnMapBaseMap'), true, '');

  ['btnMapZoomIn','btnMapZoomOut','btnMapZoomFitBtn','btnMapZoomReset',
   'btnMapPanLeft','btnMapPanRight','btnMapPanUp','btnMapPanDown'].forEach(id => {
    togglePerm(document.getElementById(id), true, '');
  });

  togglePerm(document.getElementById('btnAddWarLine'), canEditData, '需要編輯資料權限');
  togglePerm(document.getElementById('btnWarAddManual'), canEditData, '需要編輯資料權限');
  const warAddSrcEl = document.getElementById('warAddSrc');
  if(warAddSrcEl) warAddSrcEl.disabled = !canEditData;
  const warAddTypeEl = document.getElementById('warAddType');
  if(warAddTypeEl) warAddTypeEl.disabled = !canEditData;
  const warAddTgtEl = document.getElementById('warAddTgt');
  if(warAddTgtEl) warAddTgtEl.disabled = !canEditData;

  const canImportExcel = effectiveCanImportExcel();
  togglePerm(document.getElementById('btnOpenExcelImport'), canImportExcel, '需要 Excel 匯入權限');
  togglePerm(document.getElementById('btnExportCitiesCSV'), signedIn, '請先登入');
  togglePerm(document.getElementById('btnExportRoutesCSV'), signedIn, '請先登入');
  togglePerm(document.getElementById('btnExportMapRoutesCSV'), signedIn, '請先登入');
  togglePerm(document.getElementById('btnExportAlliancesCSV'), signedIn, '請先登入');

  togglePerm(document.getElementById('btnSendChat'), signedIn, '請先登入');
  const chatInputEl = document.getElementById('chatInput');
  if(chatInputEl) chatInputEl.disabled = !signedIn;

  const canEditMapLib = effectiveCanEditMapLibrary();
  togglePerm(document.getElementById('btnMapUpload'), canEditMapLib, '請先登入');
  togglePerm(document.getElementById('btnMapCalibrate'), canEditMapLib, '請先登入');
  togglePerm(document.getElementById('btnMapExportCoords'), signedIn, '請先登入');
  togglePerm(document.getElementById('btnMapSyncNodes'), signedIn, '請先登入');
  const mapLibViewModeEl = document.getElementById('mapLibraryViewMode');
  if(mapLibViewModeEl) mapLibViewModeEl.disabled = !signedIn;
  const mapLibSelectEl = document.getElementById('mapLibrarySelect');
  if(mapLibSelectEl) mapLibSelectEl.disabled = !signedIn;

  document.querySelectorAll(
    '[data-action="edit-city"],[data-action="del-city"],' +
    '[data-action="edit-alliance"],[data-action="del-alliance"],' +
    '[data-action="edit-zone"],[data-action="del-zone"],[data-deploy-edit],' +
    '[data-action="save-alliance-inline"],[data-action="cancel-alliance-inline"],' +
    '[data-action="save-city-inline"],[data-action="cancel-city-inline"]'
  ).forEach(b => {
    togglePerm(b, canEditData, '需要編輯資料權限');
  });

  document.querySelectorAll(
    '.list-table [data-war-time],' +
    '.list-table [data-war-src],' +
    '.list-table [data-war-type],' +
    '.list-table [data-war-tgt],' +
    '.list-table [data-deploy-field]'
  ).forEach(el => { el.disabled = !canEditData; });
  document.querySelectorAll('[data-war-del], [data-route-del]').forEach(b => {
    togglePerm(b, canEditData, '需要編輯資料權限');
  });

  document.querySelectorAll('tr.inline-editing input, tr.inline-editing select').forEach(el => {
    el.disabled = !canEditData;
  });

  document.querySelectorAll('#allianceTableBody tr[draggable]').forEach(tr => {
    tr.draggable = canEditData;
  });
  document.querySelectorAll('#allianceTableBody .drag-handle').forEach(el => {
    el.style.cursor = canEditData ? 'grab' : 'not-allowed';
    el.style.opacity = canEditData ? '' : '.35';
  });

  document.querySelectorAll('#iconQuickRow .icon-quick').forEach(b => {
    if(!canEditData){ b.disabled = true; b.style.pointerEvents = 'none'; b.style.opacity = '.35'; }
  });

  document.querySelectorAll('.city-member-cell').forEach(el => {
    if(canEditData){
      el.classList.remove('disabled-cell');
      el.style.cursor = 'pointer';
    } else {
      el.classList.add('disabled-cell');
      el.style.cursor = 'not-allowed';
    }
  });

  document.querySelectorAll('#mapGalleryGrid [data-action="calibrate"],#mapGalleryGrid [data-action="edit"]').forEach(b => {
    b.disabled = !canEditMapLib;
    if(!canEditMapLib) b.classList.add('perm-disabled');
    else b.classList.remove('perm-disabled');
  });

  /* v9.0.0：共享沙盤權限 */
  const canEditShared = Auth() && Auth().canEditSharedSandbox && Auth().canEditSharedSandbox();
  const canCreateShared = Auth() && (Auth().isSuperAdmin() || Auth().isAdmin());
  document.querySelectorAll('#btnAddSharedSandboxFromList, #btnAddSharedSandboxFromDropdown').forEach(b => {
    if(b) b.style.display = canCreateShared ? '' : 'none';
  });
  document.querySelectorAll('[data-ss-action="edit"], [data-ss-action="rename"]').forEach(b => {
    togglePerm(b, canEditShared, '需要共享沙盤編輯權限');
  });
  document.querySelectorAll('[data-ss-action="delete"]').forEach(b => {
    togglePerm(b, Auth() && Auth().isSuperAdmin(), '只有超管可刪除共享沙盤');
  });
  document.querySelectorAll('[data-ss-action="upload-personal"]').forEach(b => {
    togglePerm(b, Auth() && Auth().isSuperAdmin(), '只有超管可上傳個人沙盤到共享');
  });

  if(window.SLG.updateRoomEditButton) window.SLG.updateRoomEditButton();
  if(window.SLG.updateRoomSandboxActions) window.SLG.updateRoomSandboxActions();
}

/* ============================================================
   網路中斷遮罩
   ============================================================ */
function showNetworkOverlay(){
  const el = document.getElementById('networkOverlay');
  if(el) el.classList.add('show');
}
function hideNetworkOverlay(){
  const el = document.getElementById('networkOverlay');
  if(el) el.classList.remove('show');
}
function showSyncOverlay(){
  const el = document.getElementById('syncOverlay');
  if(el) el.classList.add('show');
}
function hideSyncOverlay(){
  const el = document.getElementById('syncOverlay');
  if(el) el.classList.remove('show');
}

function handleNetworkChange({ online }){
  const state = getState();
  if(online){
    hideNetworkOverlay();
    logSystem('🟢 網路已恢復');
    if(state.sandboxMode === 'shared' && SharedSandboxManager()){
      SharedSandboxManager().syncOnce().catch(e => console.warn('共享沙盤恢復同步失敗', e));
    } else if(state.auth.signedIn && state.mySandbox.cloudLoaded && state.sync.dirty){
      performCloudUpload('reconnect').catch(e => console.warn('恢復後同步失敗', e));
    }
  } else {
    showNetworkOverlay();
    logSystem('🔴 網路已中斷');
  }
}

/* ============================================================
   同步事件
   ============================================================ */
let pendingVisibilityUpload = null;

function bindSyncWatchers(){
  document.addEventListener('visibilitychange', () => {
    const state = getState();

    if(document.visibilityState !== 'hidden'){
      /* 共享模式 */
      if(state.sandboxMode === 'shared' && SharedSandboxManager()){
        SharedSandboxManager().syncOnce().catch(e => console.warn(e));
        return;
      }
      /* 個人模式 */
      if(state.auth.signedIn && state.sync.dirty && !state.sync.uploading && isOnline()){
        logSystem('🔄 偵測到殘留變更，重新觸發上傳');
        performCloudUpload('visibility-restore').catch(e => console.warn(e));
      }
      return;
    }

    /* 頁面隱藏時 */
    if(state.sandboxMode === 'shared'){
      /* 共享模式：觸發一次同步 */
      if(isOnline() && SharedSandboxManager()){
        SharedSandboxManager().syncOnce().catch(e => console.warn(e));
      }
      return;
    }

    /* 個人模式 */
    if(!state.sync.prefs.visibilitySync) return;
    if(!state.auth.signedIn) return;
    if(!state.sync.dirty) return;
    if(!isOnline()) return;
    if(pendingVisibilityUpload) return;

    logSystem('👁️ 分頁隱藏，觸發上傳');
    pendingVisibilityUpload = performCloudUpload('visibilitychange')
      .finally(() => { pendingVisibilityUpload = null; });
  });

  window.addEventListener('beforeunload', (e) => {
    const state = getState();
    saveState();

    /* 共享模式：不同步（由 SharedSandboxManager 定時處理），僅儲存本機 */
    if(state.sandboxMode === 'shared'){
      return;
    }

    if(!state.auth.signedIn) return;
    if(!state.sync.prefs.beforeUnloadSync) return;
    if(!state.sync.dirty) return;
    if(state.sync._allowClose) return;

    try{ performCloudUpload('beforeunload'); }catch(_){}
    showSyncOverlay();
    e.preventDefault();
    e.returnValue = '';
    return '';
  });

  getOn()(EVT().SYNC_STATE, () => {
    if(window.SLG.renderSyncStatus) window.SLG.renderSyncStatus();
    updateModeBar();
    const state = getState();
    if(!state.sync.dirty && !state.sync.uploading){
      hideSyncOverlay();
    }
  });
}

/* ============================================================
   同步設定 UI 綁定
   ============================================================ */
function bindSyncSettingsUI(){
  const intervalEl = document.getElementById('syncIntervalMin');
  const impEl = document.getElementById('syncImportantImmediate');
  const visEl = document.getElementById('syncVisibility');
  const buEl = document.getElementById('syncBeforeUnload');

  const prefs = getSyncPrefs();
  if(intervalEl) intervalEl.value = prefs.intervalMin;
  if(impEl) impEl.checked = !!prefs.importantImmediate;
  if(visEl) visEl.checked = !!prefs.visibilitySync;
  if(buEl) buEl.checked = !!prefs.beforeUnloadSync;

  const btnSave = document.getElementById('btnSaveSyncPrefs');
  if(btnSave && !btnSave.dataset.bound){
    btnSave.dataset.bound = '1';
    btnSave.addEventListener('click', () => {
      const state = getState();
      const intervalMin = Math.max(0, Math.min(60, parseInt(intervalEl?.value, 10) || 0));
      const patch = {
        intervalMin,
        importantImmediate: !!impEl?.checked,
        visibilitySync: !!visEl?.checked,
        beforeUnloadSync: !!buEl?.checked,
      };
      setSyncPrefs(patch);
      if(state.auth.signedIn && intervalMin > 0){ startSyncTimer(); }
      else { stopSyncTimer(); }
      updateModeBar();
      logSystem('☁️ 同步設定已儲存（間隔 ' + (intervalMin === 0 ? '停用' : intervalMin + ' 分鐘') + '）');
      alert('✅ 同步設定已儲存');
    });
  }

  const btnNow = document.getElementById('btnManualSyncNow');
  if(btnNow && !btnNow.dataset.bound){
    btnNow.dataset.bound = '1';
    btnNow.addEventListener('click', async () => {
      const state = getState();
      if(!state.auth.signedIn){ alert('請先登入'); return; }
      if(!isOnline()){ alert('離線中，無法上傳'); return; }

      btnNow.disabled = true;
      btnNow.textContent = '⏳ 上傳中...';
      try{
        if(state.sandboxMode === 'shared' && SharedSandboxManager()){
          await SharedSandboxManager().save(state.activeSharedSandboxId, { silent: true });
          alert('✅ 已上傳共享沙盤到雲端');
        } else {
          await performCloudUpload('manual');
          alert('✅ 已上傳到雲端');
        }
      }catch(e){
        alert('❌ 上傳失敗：' + (e.message || e));
      }finally{
        btnNow.disabled = false;
        btnNow.textContent = '☁️ 立即上傳';
      }
    });
  }

  const statusBtn = document.getElementById('syncStatus');
  if(statusBtn && !statusBtn.dataset.bound){
    statusBtn.dataset.bound = '1';
    statusBtn.addEventListener('click', async () => {
      const state = getState();
      if(!state.auth.signedIn){ alert('請先登入才能查看雲端歷史'); return; }
      if(!isOnline()){ alert('離線中，無法讀取歷史'); return; }

      /* 共享模式 → 開啟共享歷史 Modal */
      if(state.sandboxMode === 'shared' && state.activeSharedSandboxId){
        const modal = document.getElementById('sharedHistoryModal');
        if(modal) modal.classList.add('show');
        await renderSharedHistoryList();
        return;
      }

      /* 個人模式 */
      const modal = document.getElementById('historyModal');
      if(modal) modal.classList.add('show');
      if(window.SLG.renderHistoryList) await window.SLG.renderHistoryList();
    });
  }
}

/* ============================================================
   分級設定 UI 綁定
   ============================================================ */
function bindTroopTierUI(){
  syncTroopTiersToUI();

  const btnSave = document.getElementById('btnSaveTiers');
  if(btnSave && !btnSave.dataset.bound){
    btnSave.dataset.bound = '1';
    btnSave.addEventListener('click', () => {
      if(!requirePerm(() => Auth() && Auth().canEditSettings(), '修改分級設定')) return;
      const state = getState();
      const data = readTroopTiersFromUI();
      const t = data.tiers;

      if(!(t[0].maxLevel < t[1].maxLevel && t[1].maxLevel < t[2].maxLevel)){
        alert('⚠️ 分級門檻必須遞增（級別1 < 級別2 < 級別3）');
        return;
      }

      window.SLG.setTroopTiers(data);
      let recalcCount = 0;
      for(const c of state.cities){
        if(!c.tierCounts) continue;
        const calc = window.SLG.calcTeamsFromTiers(c.tierCounts);
        if(calc.totalTeams !== c.totalTeams){
          c.totalTeams = calc.totalTeams;
          c.memberCount = calc.totalMembers;
          c.avgPower = c.totalTeams > 0 ? Math.floor((Number(c.totalPower) || 0) / c.totalTeams) : 0;
          state.entityRev.city[c.id] = (state.entityRev.city[c.id] || 0) + 1;
          window.SLG.markDirty('city', c.id);
          recalcCount++;
        }
      }
      if(recalcCount > 0){
        window.SLG.tickLamport();
        window.SLG.flushPatches();
      }
      saveStateImportant();
      if(R() && R().renderCities) R().renderCities();
      if(window.SLG.CityManager) window.SLG.CityManager.render();
      if(R() && R().renderCityMatrix) R().renderCityMatrix();
      alert('✅ 分級設定已儲存' + (recalcCount > 0 ? `\n\n已重算 ${recalcCount} 座城池的總隊數` : ''));
      logSystem(`⚔️ 分級設定已儲存（重算 ${recalcCount} 城）`);
    });
  }

  const btnReset = document.getElementById('btnResetTiers');
  if(btnReset && !btnReset.dataset.bound){
    btnReset.dataset.bound = '1';
    btnReset.addEventListener('click', () => {
      if(!requirePerm(() => Auth() && Auth().canEditSettings(), '恢復分級預設')) return;
      showConfirm(
        '恢復分級預設',
        '這會將分級規則恢復為預設值（17/20/24 級）。\n\n現有城池的總隊數不會自動重算。\n\n確定執行？',
        () => {
          window.SLG.resetTroopTiers();
          syncTroopTiersToUI();
          logSystem('🔄 分級設定已恢復預設');
        }
      );
    });
  }
}

/* ============================================================
   模擬調度
   ============================================================ */
let simWatchdog = null;

function collectCitiesForSim(zoneId){
  const state = getState();
  return zoneId === 'all' ? state.cities : state.cities.filter(c => c.zoneId === zoneId);
}

function validateCrossDay(cities, timeLimitMin){
  if(cities.length === 0) return { ok:true };
  const mins = cities.map(c => hhmmToMinutes(c.defStartTime || '19:00'));
  if((Math.max(...mins) - Math.min(...mins)) + timeLimitMin > 1440){
    return { ok: false, msg: '時間跨度 + 時長超過 24 小時。' };
  }
  return { ok:true };
}

function executeSimulation(zoneId){
  const state = getState();
  if(state.isSimulating) return;

  const timeLimitMin = parseInt(document.getElementById('globalTimeLimit').value) || 120;
  const consumeMinPerMin = parseFloat(document.getElementById('globalConsumeMinPerMin').value) || 10;
  const consumeMaxPerMin = parseFloat(document.getElementById('globalConsumeMaxPerMin').value) || 30;
  const siegeEfficiency = parseFloat(document.getElementById('globalSiegeEfficiency').value) || 1;
  const marchTimeSec = parseInt(document.getElementById('globalMarchTimeSec').value) || 0;
  const maxLossRatio = (parseFloat(document.getElementById('globalMaxLossRatio').value) || 90) / 100;
  const minLossRatio = (parseFloat(document.getElementById('globalMinLossRatio').value) || 10) / 100;
  const attackRequireRouteEl = document.getElementById('globalAttackRequireRoute');
  const attackRequireRoute = attackRequireRouteEl ? !!attackRequireRouteEl.checked : false;
  const crossZoneWarEl = document.getElementById('globalCrossZoneWar');
  const crossZoneWarAllowed = crossZoneWarEl ? !!crossZoneWarEl.checked : false;
  const routeRequireSameMapEl = document.getElementById('globalRouteRequireSameMap');
  const routeRequireSameMap = routeRequireSameMapEl ? !!routeRequireSameMapEl.checked : true;
  const warRequireSameMapEl = document.getElementById('globalWarRequireSameMap');
  const warRequireSameMap = warRequireSameMapEl ? !!warRequireSameMapEl.checked : true;

  Object.assign(state.settings, {
    timeLimitMin, consumeMinPerMin, consumeMaxPerMin,
    siegeEfficiency, marchTimeSec, maxLossRatio, minLossRatio,
    attackRequireRoute, crossZoneWarAllowed,
    routeRequireSameMap, warRequireSameMap,
  });
  state.settingsRev++;
  saveState();

  const cities = collectCitiesForSim(zoneId);
  if(cities.length === 0){ logSystem('❌ 無城池資料'); return; }
  if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(cities);

  const v = validateCrossDay(cities, timeLimitMin);
  if(!v.ok){ logSystem('❌ ' + v.msg); return; }

  const defStartMins = cities.map(c => hhmmToMinutes(c.defStartTime || '19:00'));
  state.simBaseMin = Math.min(...defStartMins);
  state.isSimulating = true;
  state.dynRows = []; state.narrativeLines = [];

  document.getElementById('narrativeOutput').innerHTML = '推演中...';
  DYN().setRows([]);
  viz().reset();
  R().renderProgress(0);

  clearTimeout(simWatchdog);
  simWatchdog = setTimeout(() => {
    if(getState().isSimulating){
      console.error('[Sim] watchdog 觸發，強制解鎖');
      getState().isSimulating = false;
      R().renderProgress(0);
      logSystem('❌ 推演逾時，已強制中止');
    }
  }, 30000);

  const runId = bumpSimRunId();
  const maxDefStartRel = Math.max(...defStartMins) - state.simBaseMin;
  const maxSec = maxDefStartRel * 60 + timeLimitMin * 60;
  const snapshotSet = viz().getSchedule(maxSec);
  const dynSet = new Set();
  const dynSampleSec = DYN_ROUTE_SAMPLE_SEC();
  for(let s = 0; s <= maxSec; s += dynSampleSec) dynSet.add(s);
  dynSet.add(maxSec);
  const dynRowsBuffer = [];

  const worker = getWorker();
  if(worker){
    const onMessage = (e) => {
      const msg = e.data || {};
      if(msg.runId !== runId) return;
      switch(msg.type){
        case 'progress':
          R().renderDebug({msg:`⏳ ${Math.round(msg.progress*100)}%`});
          R().renderProgress(msg.progress);
          break;
        case 'snapshot': viz().ingestSnapshot(msg.sec, msg.snap); break;
        case 'dyn_sample':
          if(msg.rows) for(const r of msg.rows) dynRowsBuffer.push(r);
          break;
        case 'done':
          worker.removeEventListener('message', onMessage);
          state.dynRows = dynRowsBuffer;
          handleSimulationDone(msg.result);
          break;
        case 'error':
          worker.removeEventListener('message', onMessage);
          logSystem('❌ 推演失敗：' + msg.error);
          state.isSimulating = false;
          clearTimeout(simWatchdog);
          break;
      }
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({
      type:'run',
      payload:{
        cities: JSON.parse(JSON.stringify(cities)),
        settings: {...state.settings},
        snapshotsAt: snapshotSet,
        dynSampleAt: [...dynSet],
        runId
      }
    });
    return;
  }

  /* Worker 不可用 → 主執行緒備援 */
  setTimeout(async () => {
    try{
      const result = await window.SLG.runSimulation(
        JSON.parse(JSON.stringify(cities)),
        {...state.settings},
        {
          onProgress: ({progress}) => {
            R().renderProgress(progress);
            R().renderDebug({msg:`⏳ ${Math.round(progress*100)}%`});
          },
          onSnapshot: (sec, snap) => viz().ingestSnapshot(sec, snap),
          snapshotAt: new Set(snapshotSet),
          dynSampleAt: new Set(dynSet),
          onDynSample: (sec, rows) => { for(const r of rows) dynRowsBuffer.push(r); },
        }
      );
      state.dynRows = dynRowsBuffer;
      handleSimulationDone(result);
    }catch(err){
      console.error(err);
      getState().isSimulating = false;
      clearTimeout(simWatchdog);
    }
  }, 30);
}

function handleSimulationDone(result){
  const state = getState();
  clearTimeout(simWatchdog);
  R().renderProgress(1);
  setTimeout(() => R().renderProgress(0), 1000);

  if(result.aborted){ logSystem('⛔ 推演已中止'); state.isSimulating = false; return; }
  if(result.minDefStartMin !== undefined) state.simBaseMin = result.minDefStartMin;

  state.narrativeLines = result.narrativeLines || [];
  R().renderNarrative(state.narrativeLines);
  DYN().setRows(state.dynRows);
  DYN().populateCityFilters();
  saveState();

  if(window.SLG.Summary){
    const summary = window.SLG.Summary.build(result, state.cities, state.alliances, state.dynRows);
    window.SLG.Summary.render(summary);
    logSystem('📊 推演總結已建立');
  }

  if(state.isHost && window.SLG.isConnected()){
    window.SLG.publish({ type:'viz_payload', data: viz().getAllSnapshots() });
    window.SLG.publish({ type:'dyn_payload', rows: state.dynRows });
    window.SLG.sendSystemChat('⚡ 推演完成');
  }

  viz().finalize();
  state.isSimulating = false;
  logSystem('✅ 推演完成');

  const summaryTab = document.querySelector('.top-nav button[data-tab="tab-summary"]');
  if(summaryTab && summaryTab.style.display !== 'none'){ summaryTab.click(); }
}

/* ============================================================
   審核彈窗
   ============================================================ */
function renderEditRequestReview(){
  const list = document.getElementById('editRequestList');
  const modal = document.getElementById('editRequestReviewModal');
  if(!list || !modal) return;

  const state = getState();
  const canReview = state.isHost || (Auth() && Auth().isAdmin());
  if(!canReview){ modal.classList.remove('show'); return; }

  const reqs = Object.entries(state.pendingEditRequests || {});
  if(reqs.length === 0){ modal.classList.remove('show'); return; }

  const visibleReqs = reqs.filter(([uid]) => uid !== state.auth.accountUid);
  if(visibleReqs.length === 0){ modal.classList.remove('show'); return; }

  list.innerHTML = visibleReqs.map(([uid, r]) => {
    const time = r.requestedAt ? new Date(r.requestedAt).toLocaleTimeString().slice(0,5) : '—';
    return `<div class="edit-request-item" data-uid="${esc(uid)}">
      <div class="edit-request-info">
        <div class="edit-request-name">🙋 ${esc(r.displayName || r.username || uid)}</div>
        <div class="edit-request-time">申請於 ${esc(time)}</div>
      </div>
      <div class="edit-request-actions">
        <button class="btn btn-danger btn-sm" data-action="reject-edit-req" data-uid="${esc(uid)}">拒絕</button>
        <button class="btn btn-success btn-sm" data-action="approve-edit-req" data-uid="${esc(uid)}">批准</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-action="approve-edit-req"]').forEach(btn => {
    btn.addEventListener('click', function(){
      const uid = this.dataset.uid;
      const item = this.closest('.edit-request-item');
      if(item) item.classList.add('removing');
      window.SLG.approveEditRequest(uid);
    });
  });
  list.querySelectorAll('[data-action="reject-edit-req"]').forEach(btn => {
    btn.addEventListener('click', function(){
      const uid = this.dataset.uid;
      const item = this.closest('.edit-request-item');
      if(item) item.classList.add('removing');
      window.SLG.rejectEditRequest(uid);
    });
  });
  modal.classList.add('show');
}

/* ============================================================
   房間空沙盤提示
   ============================================================ */
function showRoomEmptyPrompt(){
  if(!window.SLG.isInRoom()) return;
  const state = getState();
  if(state.roomHasSnapshot) return;
  if(!window.SLG.canUploadSandboxToRoom()) return;
  const modal = document.getElementById('roomEmptyPromptModal');
  if(!modal) return;
  modal.classList.add('show');
}
function hideRoomEmptyPrompt(){
  const modal = document.getElementById('roomEmptyPromptModal');
  if(modal) modal.classList.remove('show');
}

/* ============================================================
   上載沙盤至房間 / 沙盤清單 / 下載
   ============================================================ */
async function uploadMySandboxToRoom(){
  const state = getState();
  if(!window.SLG.canUploadSandboxToRoom()){ alert('您沒有上載沙盤的權限'); return; }
  if(!window.SLG.isConnected()){ alert('請先加入房間'); return; }

  const myData = window.SLG.buildSandboxData();
  const fileName = buildSandboxFileName(state.auth.displayName, Date.now());
  if(!confirm(`確定要將「我的沙盤」上載到房間嗎？\n\n這會覆蓋房間目前的沙盤。`)) return;

  try{
    await window.SLG.uploadSandboxToRoom(myData, fileName);
    hideRoomEmptyPrompt();
    alert('✅ 已上載沙盤到房間！');
    R().renderAll();
    if(window.SLG.renderSandboxData) window.SLG.renderSandboxData();
  }catch(e){ console.warn(e); }
}

async function openSandboxPicker(){
  const modal = document.getElementById('sandboxPickerModal');
  const tbody = document.getElementById('sandboxPickerTableBody');
  if(!modal || !tbody) return;
  modal.classList.add('show');
  tbody.innerHTML = '<tr><td colspan="5" class="sandbox-empty">載入中...</td></tr>';

  try{
    const all = await window.SLG.fetchAllSandboxes();
    const list = Object.entries(all)
      .map(([uid, sb]) => ({ uid, ...sb }))
      .filter(sb => window.SLG.canViewSandboxOf(sb.uid, sb.role || 'member'))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if(list.length === 0){
      tbody.innerHTML = '<tr><td colspan="5" class="sandbox-empty">無可用沙盤</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(sb => {
      const state = getState();
      const isSelf = sb.uid === state.auth.accountUid;
      const fileName = buildSandboxFileName(sb.displayName, sb.updatedAt);
      const cityCount = sb.data?.cities?.length || 0;
      return `<tr class="${isSelf ? 'row-self' : ''}">
        <td class="sandbox-name">${esc(fileName)}${isSelf ? ' <span class="chip" style="font-size:9px;color:var(--neon-yellow);">你</span>' : ''}</td>
        <td class="sandbox-owner">${esc(sb.displayName || sb.username || '—')}</td>
        <td class="col-num">${cityCount}</td>
        <td class="sandbox-time">${esc(timeAgo(sb.updatedAt))}</td>
        <td class="col-actions">
          <button class="btn btn-primary btn-sm" data-action="pick-sandbox" data-uid="${sb.uid}">📤 上載到房間</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-action="pick-sandbox"]').forEach(btn => {
      btn.addEventListener('click', async function(){
        const uid = this.dataset.uid;
        const sb = all[uid];
        if(!sb || !sb.data){ alert('沙盤資料為空'); return; }
        const fileName = buildSandboxFileName(sb.displayName, sb.updatedAt);
        if(!confirm(`確定要將「${fileName}」上載到房間嗎？\n\n這會覆蓋房間目前的沙盤。`)) return;
        modal.classList.remove('show');
        try{
          await window.SLG.uploadSandboxToRoom(sb.data, fileName);
          hideRoomEmptyPrompt();
          alert('✅ 已上載沙盤到房間！');
          R().renderAll();
          if(window.SLG.renderSandboxData) window.SLG.renderSandboxData();
        }catch(e){ console.warn(e); }
      });
    });
  }catch(e){
    tbody.innerHTML = '<tr><td colspan="5" class="sandbox-empty">載入失敗</td></tr>';
    console.warn(e);
  }
}

async function downloadRoomSandbox(){
  const state = getState();
  if(!state.roomHasSnapshot || !state.roomSnapshot){ alert('房間尚無沙盤'); return; }
  const fileName = buildSandboxFileName(state.auth.displayName, Date.now());
  if(!confirm(`確定要把房間沙盤下載到你的個人沙盤嗎？\n\n這會覆蓋你目前的個人沙盤。`)) return;

  try{
    backupCurrentSandbox();
    window.SLG.applySandboxData(state.roomSnapshot.data);
    saveState();
    await window.SLG.saveMySandbox();
    R().renderAll();
    if(window.SLG.renderSandboxData) window.SLG.renderSandboxData();
    if(window.SLG.RouteManager) window.SLG.RouteManager.render();
    if(window.SLG.GameMap) window.SLG.GameMap.reset();
    alert('✅ 已下載房間沙盤到你的個人沙盤！');
  }catch(e){
    console.warn(e);
    alert('下載失敗：' + e.message);
  }
}

async function loadSandboxFromList(uid){
  if(!uid) return;
  try{
    const sb = await window.SLG.fetchUserSandbox(uid);
    if(!sb || !sb.data){ alert('沙盤資料為空'); return; }
    const fileName = buildSandboxFileName(sb.displayName, sb.updatedAt);
    const ok = confirm(
      `確定要載入「${fileName}」嗎？\n\n` +
      `這會覆蓋你目前的個人沙盤。\n（原沙盤會自動備份到本機）`
    );
    if(!ok) return;

    backupCurrentSandbox();
    window.SLG.applySandboxData(sb.data);
    saveState();
    await window.SLG.saveMySandbox();
    R().renderAll();
    if(window.SLG.renderSandboxData) window.SLG.renderSandboxData();
    if(window.SLG.RouteManager) window.SLG.RouteManager.render();
    if(window.SLG.GameMap) window.SLG.GameMap.reset();
    alert(`✅ 已載入「${fileName}」到你的沙盤！`);
    logSystem(`📥 已載入 ${fileName} 到個人沙盤`);
  }catch(e){
    console.warn(e);
    alert('載入失敗：' + e.message);
  }
}

function backupCurrentSandbox(){
  try{
    const state = getState();
    const key = window.SLG.LS_PREFIX + 'sandboxBackup_' + Date.now();
    const data = {
      backedUpAt: new Date().toISOString(),
      settings: JSON.parse(JSON.stringify(state.settings)),
      alliances: JSON.parse(JSON.stringify(state.alliances)),
      zones: JSON.parse(JSON.stringify(state.zones)),
      cities: JSON.parse(JSON.stringify(state.cities)),
      routes: JSON.parse(JSON.stringify(state.routes)),
    };
    localStorage.setItem(key, JSON.stringify(data));
    logSystem(`💾 已備份目前沙盤（key: ${key}）`);

    const keys = [];
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(window.SLG.LS_PREFIX + 'sandboxBackup_')) keys.push(k);
    }
    keys.sort();
    while(keys.length > 5){ localStorage.removeItem(keys.shift()); }
  }catch(e){ console.warn('備份失敗', e); }
}

/* ============================================================
   ★ v9.0.0：共享沙盤切換器 UI
   ============================================================ */
function renderSharedSandboxList(){
  const state = getState();

  /* 1) 側邊欄展開式清單 */
  const sidebarList = document.getElementById('sharedSandboxList');
  if(sidebarList){
    const idx = state.sharedSandboxesIndex || {};
    const ids = Object.keys(idx).sort((a, b) =>
      (idx[b].updatedAt || 0) - (idx[a].updatedAt || 0));

    const canCreate = Auth() && (Auth().isSuperAdmin() || Auth().isAdmin());

    if(ids.length === 0){
      sidebarList.innerHTML = '<div class="sandbox-empty-hint">尚無共享沙盤</div>';
    } else {
      sidebarList.innerHTML = ids.map(sid => {
        const sb = idx[sid];
        const isActive = (state.sandboxMode === 'shared' && state.activeSharedSandboxId === sid);
        const ver = sb.version || 0;
        return `<button class="sandbox-item ${isActive ? 'active' : ''}" data-ss-id="${esc(sid)}">
          <span class="item-name">${esc(sb.name || '未命名')}</span>
          <span class="item-version">v${ver}</span>
        </button>`;
      }).join('');

      sidebarList.querySelectorAll('[data-ss-id]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const sid = btn.dataset.ssId;
          await switchToSharedSandbox(sid);
        });
      });
    }

    /* 附加「新增」按鈕 */
    if(canCreate){
      const addBtn = document.createElement('button');
      addBtn.className = 'sandbox-item add-new';
      addBtn.innerHTML = '<span>➕</span><span>新增共享沙盤</span>';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddSharedSandboxModal();
      });
      sidebarList.appendChild(addBtn);
    }
  }

  /* 2) Mode-bar 下拉清單 */
  const dropdownList = document.getElementById('sharedSandboxDropdownList');
  if(dropdownList){
    const idx = state.sharedSandboxesIndex || {};
    const ids = Object.keys(idx).sort((a, b) =>
      (idx[b].updatedAt || 0) - (idx[a].updatedAt || 0));

    if(ids.length === 0){
      dropdownList.innerHTML = '<div class="sandbox-dropdown-empty">尚無共享沙盤</div>';
    } else {
      dropdownList.innerHTML = ids.map(sid => {
        const sb = idx[sid];
        const isActive = (state.sandboxMode === 'shared' && state.activeSharedSandboxId === sid);
        const ver = sb.version || 0;
        const cityCount = sb.cityCount || 0;
        return `<button class="sandbox-dropdown-item ${isActive ? 'active' : ''}" data-ss-id="${esc(sid)}">
          <span class="item-name">${esc(sb.name || '未命名')}</span>
          <span class="item-meta">v${ver} · ${cityCount}城</span>
        </button>`;
      }).join('');

      dropdownList.querySelectorAll('[data-ss-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const sid = btn.dataset.ssId;
          hideSandboxDropdown();
          await switchToSharedSandbox(sid);
        });
      });
    }
  }

  /* 3) 沙盤數據頁清單 */
  const tableBody = document.getElementById('sharedSandboxTableBody');
  if(tableBody){
    const idx = state.sharedSandboxesIndex || {};
    const ids = Object.keys(idx).sort((a, b) =>
      (idx[b].updatedAt || 0) - (idx[a].updatedAt || 0));

    if(ids.length === 0){
      tableBody.innerHTML = '<tr><td colspan="7" class="sandbox-empty">尚無共享沙盤</td></tr>';
    } else {
      const canEdit = Auth() && Auth().canEditSharedSandbox && Auth().canEditSharedSandbox();
      const canDel = Auth() && Auth().isSuperAdmin();
      const canUpload = Auth() && Auth().isSuperAdmin();

      tableBody.innerHTML = ids.map(sid => {
        const sb = idx[sid];
        const isActive = (state.sandboxMode === 'shared' && state.activeSharedSandboxId === sid);
        const mapCount = sb.mapCount || 0;
        const cityCount = sb.cityCount || 0;
        const allianceCount = sb.allianceCount || 0;
        const ver = sb.version || 0;
        return `<tr class="${isActive ? 'row-self' : ''}">
          <td class="sandbox-name">${esc(sb.name || '未命名')}${isActive ? ' <span class="chip" style="font-size:9px;color:var(--neon-green);">使用中</span>' : ''}</td>
          <td class="col-num">${mapCount}</td>
          <td class="col-num">${cityCount}</td>
          <td class="col-num">${allianceCount}</td>
          <td class="col-num">v${ver}</td>
          <td class="sandbox-time">${esc(timeAgo(sb.updatedAt))}</td>
          <td class="col-actions">
            <button class="btn btn-primary btn-sm" data-ss-action="load" data-ss-id="${esc(sid)}">📥 載入</button>
            <button class="btn btn-ghost btn-sm" data-ss-action="download" data-ss-id="${esc(sid)}" title="下載到個人沙盤">⬇️</button>
            <button class="btn btn-warning btn-sm" data-ss-action="rename" data-ss-id="${esc(sid)}" ${canEdit?'':'disabled'} title="改名">✏️</button>
            <button class="btn btn-success btn-sm" data-ss-action="upload-personal" data-ss-id="${esc(sid)}" ${canUpload?'':'disabled'} title="上傳我的個人沙盤覆蓋此共享">📤</button>
            <button class="btn btn-danger btn-sm" data-ss-action="delete" data-ss-id="${esc(sid)}" ${canDel?'':'disabled'} title="刪除">🗑️</button>
          </td>
        </tr>`;
      }).join('');

      /* 綁定列表按鈕 */
      tableBody.querySelectorAll('[data-ss-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const action = btn.dataset.ssAction;
          const sid = btn.dataset.ssId;
          if(action === 'load') await switchToSharedSandbox(sid);
          else if(action === 'download') await downloadSharedToPersonal(sid);
          else if(action === 'rename') await renameSharedSandbox(sid);
          else if(action === 'upload-personal') await uploadPersonalToShared(sid);
          else if(action === 'delete') await deleteSharedSandbox(sid);
        });
      });
    }
  }

  /* 4) 更新 mode-bar 切換器狀態 */
  updateSandboxSwitcherUI();
}

function updateSandboxSwitcherUI(){
  const state = getState();

  const sharedBtn = document.getElementById('btnSharedSandboxSwitch');
  const personalBtn = document.getElementById('btnPersonalSandboxSwitch');
  const sharedLabel = document.getElementById('sharedSandboxSwitchLabel');
  const personalActive = document.getElementById('personalSandboxActive');

  const isShared = state.sandboxMode === 'shared';

  /* 按鈕狀態 */
  if(sharedBtn) sharedBtn.classList.toggle('active', isShared);
  if(personalBtn) personalBtn.classList.toggle('active', !isShared);

  /* 標籤 */
  if(sharedLabel){
    if(isShared && state.activeSharedSandboxName){
      sharedLabel.textContent = `${state.activeSharedSandboxName} ▼`;
    } else {
      sharedLabel.textContent = '共享 ▼';
    }
  }
  if(personalActive){
    personalActive.style.display = isShared ? 'none' : '';
  }

  /* body class */
  if(isShared){
    document.body.classList.remove('sandbox-personal');
    document.body.classList.add('sandbox-shared');
  } else {
    document.body.classList.remove('sandbox-shared');
    document.body.classList.add('sandbox-personal');
  }
}

async function switchToSharedSandbox(sandboxId){
  const state = getState();
  if(state.sandboxMode === 'shared' && state.activeSharedSandboxId === sandboxId){
    logSystem('已是當前共享沙盤');
    return;
  }
  if(!SharedSandboxManager()){ alert('共享沙盤管理器未載入'); return; }

  try{
    await SharedSandboxManager().switchToShared(sandboxId);
    renderSharedSandboxList();
    if(window.SLG.renderAll) window.SLG.renderAll();
    if(window.SLG.CityManager) window.SLG.CityManager.render();
    if(window.SLG.GameMap){
      if(window.SLG.GameMap.invalidateLayout) window.SLG.GameMap.invalidateLayout();
      window.SLG.GameMap.render();
    }
    logSystem(`📡 已切換至共享沙盤`);
  }catch(e){
    console.warn(e);
    alert('❌ 切換失敗：' + e.message);
  }
}

async function switchToPersonalSandbox(){
  const state = getState();
  if(state.sandboxMode === 'personal'){
    logSystem('已是個人沙盤');
    return;
  }
  if(!SharedSandboxManager()){ alert('共享沙盤管理器未載入'); return; }

  try{
    await SharedSandboxManager().switchToPersonal();
    renderSharedSandboxList();
    if(window.SLG.renderAll) window.SLG.renderAll();
    if(window.SLG.CityManager) window.SLG.CityManager.render();
    if(window.SLG.GameMap){
      if(window.SLG.GameMap.invalidateLayout) window.SLG.GameMap.invalidateLayout();
      window.SLG.GameMap.render();
    }
    logSystem(`👤 已切換至個人沙盤`);
  }catch(e){
    console.warn(e);
    alert('❌ 切換失敗：' + e.message);
  }
}

function openAddSharedSandboxModal(){
  if(!Auth() || !(Auth().isSuperAdmin() || Auth().isAdmin())){
    alert('🔒 只有超管或管理員可以建立共享沙盤');
    return;
  }
  const modal = document.getElementById('addSharedSandboxModal');
  if(!modal) return;
  const nameEl = document.getElementById('addSs_name');
  if(nameEl) nameEl.value = '';
  modal.classList.add('show');
  setTimeout(() => { if(nameEl) nameEl.focus(); }, 100);
}

function closeAddSharedSandboxModal(){
  const modal = document.getElementById('addSharedSandboxModal');
  if(modal) modal.classList.remove('show');
}

async function submitAddSharedSandbox(){
  const nameEl = document.getElementById('addSs_name');
  const name = (nameEl?.value || '').trim();
  if(!name){ alert('請輸入沙盤名稱'); return; }
  if(name.length > 30){ alert('沙盤名稱最多 30 字'); return; }
  if(!SharedSandboxManager()){ alert('共享沙盤管理器未載入'); return; }

  try{
    const newSb = await SharedSandboxManager().create(name);
    closeAddSharedSandboxModal();
    alert(`✅ 已建立共享沙盤「${newSb.name}」！\n\n新沙盤為空白，可開始建立資料。`);

    /* 自動切換到新建的沙盤 */
    await switchToSharedSandbox(newSb.id);

    /* 重繪側邊欄 */
    renderSharedSandboxList();
  }catch(e){
    if(e.message && e.message.includes('名稱衝突')){
      const ok = confirm(e.message + '\n\n是否仍要建立？');
      if(ok){
        /* 用時間戳後綴 */
        const newName = name + '_' + Date.now().toString(36).slice(-4);
        try{
          const newSb = await SharedSandboxManager().create(newName);
          closeAddSharedSandboxModal();
          alert(`✅ 已建立共享沙盤「${newSb.name}」！`);
          await switchToSharedSandbox(newSb.id);
          renderSharedSandboxList();
        }catch(err2){
          alert('❌ 建立失敗：' + err2.message);
        }
      }
    } else {
      alert('❌ 建立失敗：' + (e.message || e));
    }
  }
}

async function downloadSharedToPersonal(sandboxId){
  if(!SharedSandboxManager()) return;
  try{
    await SharedSandboxManager().downloadToPersonal(sandboxId);
    alert('✅ 已下載共享沙盤到個人沙盤');
  }catch(e){
    alert('❌ 下載失敗：' + e.message);
  }
}

async function uploadPersonalToShared(sandboxId){
  if(!Auth() || !Auth().isSuperAdmin()){
    alert('🔒 只有超管可以上傳個人沙盤到共享');
    return;
  }
  if(!SharedSandboxManager()) return;
  try{
    await SharedSandboxManager().uploadPersonalToShared(sandboxId);
    alert('✅ 已上傳個人沙盤到共享');
  }catch(e){
    alert('❌ 上傳失敗：' + e.message);
  }
}

async function renameSharedSandbox(sandboxId){
  const state = getState();
  const sb = state.sharedSandboxesIndex[sandboxId];
  if(!sb) return;
  const newName = prompt('輸入新的沙盤名稱：', sb.name || '');
  if(newName === null) return;
  const trimmed = String(newName).trim();
  if(!trimmed){ alert('名稱不能為空'); return; }
  if(trimmed === sb.name) return;
  if(!SharedSandboxManager()) return;
  try{
    await SharedSandboxManager().rename(sandboxId, trimmed);
    alert('✅ 已改名');
    renderSharedSandboxList();
  }catch(e){
    alert('❌ 改名失敗：' + e.message);
  }
}

async function deleteSharedSandbox(sandboxId){
  const state = getState();
  const sb = state.sharedSandboxesIndex[sandboxId];
  if(!sb) return;
  if(!Auth() || !Auth().isSuperAdmin()){
    alert('🔒 只有超管可以刪除共享沙盤');
    return;
  }
  if(!confirm(`⚠️ 確定要刪除共享沙盤「${sb.name}」嗎？\n\n此操作無法復原（歷史備份也會一併刪除）。`)) return;
  if(!SharedSandboxManager()) return;
  try{
    await SharedSandboxManager().remove(sandboxId);
    alert('✅ 已刪除');
    renderSharedSandboxList();
    if(state.activeSharedSandboxId === sandboxId){
      await switchToPersonalSandbox();
    }
  }catch(e){
    alert('❌ 刪除失敗：' + e.message);
  }
}

/* 共享沙盤歷史 */
async function renderSharedHistoryList(){
  const listEl = document.getElementById('sharedHistoryList');
  if(!listEl) return;
  const state = getState();
  const sid = state.activeSharedSandboxId;

  if(!sid){ listEl.innerHTML = '<div class="history-empty">無使用中的共享沙盤</div>'; return; }
  if(!SharedSandboxManager()) return;

  listEl.innerHTML = '<div class="text-dim" style="padding:20px;text-align:center;">載入中...</div>';

  try{
    const history = await SharedSandboxManager().fetchHistory(sid);
    if(!history || history.length === 0){
      listEl.innerHTML = '<div class="history-empty">尚無歷史版本<br><span style="font-size:10px;">每次儲存時會自動備份前一版</span></div>';
      return;
    }

    listEl.innerHTML = history.map(h => {
      const time = new Date(h.ts).toLocaleString('zh-TW', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      });
      return `<div class="history-item">
        <div class="history-time">${esc(time)}</div>
        <div class="history-info">v${h.version} · 🏰 <b>${h.cityCount}</b> 城 / 🤝 <b>${h.allianceCount}</b> 盟${h.updatedByName ? ` · 👤 ${esc(h.updatedByName)}` : ''}</div>
        <div class="history-actions">
          <button class="btn btn-primary btn-sm" data-shared-history-restore="${h.ts}">↩️ 還原</button>
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('[data-shared-history-restore]').forEach(btn => {
      btn.addEventListener('click', async function(){
        const ts = parseInt(this.dataset.sharedHistoryRestore, 10);
        if(!ts) return;
        try{
          const ok = await SharedSandboxManager().restoreFromHistory(sid, ts);
          if(ok){
            alert('✅ 已還原');
            document.getElementById('sharedHistoryModal').classList.remove('show');
            if(window.SLG.renderAll) window.SLG.renderAll();
            if(window.SLG.CityManager) window.SLG.CityManager.render();
            if(window.SLG.GameMap){
              if(window.SLG.GameMap.invalidateLayout) window.SLG.GameMap.invalidateLayout();
              window.SLG.GameMap.render();
            }
          }
        }catch(e){ alert('❌ 還原失敗：' + e.message); }
      });
    });
  }catch(e){
    console.warn('[SharedHistory] 讀取失敗', e);
    listEl.innerHTML = '<div class="history-empty">讀取失敗：' + esc(e.message || e) + '</div>';
  }
}

/* 下拉選單開關 */
function showSandboxDropdown(){
  const dd = document.getElementById('sharedSandboxDropdown');
  if(dd) dd.classList.remove('hidden');
}
function hideSandboxDropdown(){
  const dd = document.getElementById('sharedSandboxDropdown');
  if(dd) dd.classList.add('hidden');
}
function toggleSandboxDropdown(){
  const dd = document.getElementById('sharedSandboxDropdown');
  if(!dd) return;
  if(dd.classList.contains('hidden')) showSandboxDropdown();
  else hideSandboxDropdown();
}

/* ============================================================
   地圖子檢視切換
   ============================================================ */
let currentMapView = 'route';

function switchMapView(view){
  currentMapView = view;
  document.querySelectorAll('.map-view-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mapView === view);
  });
  const routeWrap = document.getElementById('mapRouteWrap');
  const dynamicWrap = document.getElementById('mapDynamicWrap');
  if(routeWrap) routeWrap.style.display = (view === 'route') ? '' : 'none';
  if(dynamicWrap) dynamicWrap.style.display = (view === 'dynamic') ? '' : 'none';

  if(view === 'route'){
    if(window.SLG.GameMap) window.SLG.GameMap.activate();
    if(MapLibrary()) MapLibrary().applyViewMode();
  } else {
    if(window.SLG.viz) viz().activate();
  }
}

/* ============================================================
   清單偏好初始化
   ============================================================ */
function initListPrefs(){
  const state = getState();
  try{
    const ws = localStorage.getItem('slg_war_sort_v856');
    if(ws) state.listPrefs.warSort = ws;
    const wg = localStorage.getItem('slg_war_group_v856');
    if(wg) state.listPrefs.warGroup = wg;
    const ds = localStorage.getItem('slg_deploy_sort_v856');
    if(ds) state.listPrefs.deploySort = ds;
    const dg = localStorage.getItem('slg_deploy_group_v856');
    if(dg) state.listPrefs.deployGroup = dg;
  }catch(e){}

  const ws = document.getElementById('warSortSelect');
  if(ws) ws.value = state.listPrefs.warSort || 'time';
  const wg = document.getElementById('warGroupSelect');
  if(wg) wg.value = state.listPrefs.warGroup || 'none';
  const ds = document.getElementById('deploySortSelect');
  if(ds) ds.value = state.listPrefs.deploySort || 'alliance';
  const dg = document.getElementById('deployGroupSelect');
  if(dg) dg.value = state.listPrefs.deployGroup || 'none';
}

/* ============================================================
   地圖庫事件綁定
   ============================================================ */
function bindMapLibraryUI(){
  if(typeof window.SLG.detectFullMap !== 'function'){
    console.warn('[v9.0.0] geminiOcr.js 未載入，AI 辨識功能無法使用');
  } else {
    console.log(
      '%c[Gemini OCR] 已就緒（端點：' + (window.SLG.GEMINI_OCR_ENDPOINT || '/api/ocr') + '）',
      'color:#22ff88;font-size:11px'
    );
  }
  if(typeof window.SLG.detectFromImage !== 'function'){
    console.warn('[v9.0.0] circleDetect.js 未載入（此為選用，不影響 AI 辨識）');
  }
  if(typeof window.SLG.WarQuickPanel !== 'object'){
    console.warn('[v9.0.0] WarQuickPanel 未載入，地圖宣戰模式將無法使用');
  } else {
    console.log('%c[宣戰模式] WarQuickPanel 已就緒', 'color:#22ff88;font-size:11px');
  }

  if(MapLibrary()) MapLibrary().init();

  const state = getState();
  if(state.auth.signedIn && window.SLG.startMapLibraryIndexWatcher){
    try{ window.SLG.startMapLibraryIndexWatcher(); }
    catch(e){ console.warn('啟動地圖庫索引監聽失敗', e); }
  }
}

/* ★ v9.0.1 新增：地名後綴設定 UI 綁定 */
function bindCitySuffixUI(){
  /* 新增後綴按鈕 */
  const btnAdd = document.getElementById('btnAddSuffix');
  if(btnAdd && !btnAdd.dataset.bound){
    btnAdd.dataset.bound = '1';
    btnAdd.addEventListener('click', () => {
      const input = document.getElementById('suffixNewInput');
      const val = (input?.value || '').trim();
      if(!val){ alert('請輸入後綴'); return; }
      const result = window.SLG.addCitySuffix(val);
      if(!result.ok){ alert('❌ ' + result.msg); return; }
      if(input) input.value = '';
      input?.focus();
    });
  }

  /* Enter 快速新增 */
  const input = document.getElementById('suffixNewInput');
  if(input && !input.dataset.bound){
    input.dataset.bound = '1';
    input.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){ e.preventDefault(); btnAdd?.click(); }
    });
  }

  /* 恢復預設 */
  const btnReset = document.getElementById('btnResetSuffixes');
  if(btnReset && !btnReset.dataset.bound){
    btnReset.dataset.bound = '1';
    btnReset.addEventListener('click', () => {
      if(!confirm('確定要恢復預設後綴清單嗎？\n（現有自訂後綴會全部清除）')) return;
      window.SLG.resetCitySuffixes();
      renderCitySuffixTags();
    });
  }

  /* 事件：後綴清單變更 → 重繪 */
  if(!window.__suffixEventBound){
    window.__suffixEventBound = true;
    getOn()(EVT().CITY_SUFFIXES_CHANGED, () => renderCitySuffixTags());
  }

  /* 初次渲染 */
  renderCitySuffixTags();
}

/* ★ v9.0.1 新增：渲染後綴標籤 */
function renderCitySuffixTags(){
  const list = document.getElementById('suffixTagList');
  if(!list) return;
  const suffixes = window.SLG.getCitySuffixes();
  if(suffixes.length === 0){
    list.innerHTML = '<div class="text-dim">尚無後綴，請新增</div>';
    return;
  }
  list.innerHTML = suffixes.map(s => `
    <span class="suffix-tag" data-suffix="${esc(s)}">
      ${esc(s)}
      <button class="suffix-remove" data-remove="${esc(s)}" title="刪除">✕</button>
    </span>
  `).join('');

  list.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const suffix = btn.dataset.remove;
      if(!confirm(`確定刪除後綴「${suffix}」？`)) return;
      window.SLG.removeCitySuffix(suffix);
    });
  });
}
/* ============================================================
   路線刪除確認 Modal 綁定
   ============================================================ */
function bindRouteDeleteModal(){
  const modal = document.getElementById('routeDeleteConfirmModal');
  if(!modal || modal.dataset.bound) return;
  modal.dataset.bound = '1';
  modal.addEventListener('click', (e) => {
    if(e.target === modal){
      modal.classList.remove('show');
    }
  });
}

/* ============================================================
   手動建立備份按鈕綁定
   ============================================================ */
function bindBackupNowButton(){
  const btn = document.getElementById('btnCreateBackupNow');
  if(!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async () => {
    if(typeof window.SLG.createManualBackup !== 'function'){
      alert('❌ 備份功能未載入');
      return;
    }
    await window.SLG.createManualBackup();
  });
}

/* ============================================================
   地圖關聯規則 UI 綁定
   ============================================================ */
function bindMapRelationUI(){
  const state = getState();
  const routeEl = document.getElementById('globalRouteRequireSameMap');
  const warEl = document.getElementById('globalWarRequireSameMap');

  if(routeEl) routeEl.checked = !!state.settings.routeRequireSameMap;
  if(warEl) warEl.checked = !!state.settings.warRequireSameMap;

  if(routeEl && !routeEl.dataset.bound){
    routeEl.dataset.bound = '1';
    routeEl.addEventListener('change', function(){
      if(!requirePerm(() => Auth() && Auth().canEditSettings(), '修改地圖關聯規則')){
        this.checked = !!getState().settings.routeRequireSameMap;
        return;
      }
      window.SLG.updateSettings({ routeRequireSameMap: !!this.checked });
      saveState();
      logSystem(`🗺️ 路線限制同地圖：${this.checked ? '開' : '關'}`);
      if(window.SLG.RouteManager) window.SLG.RouteManager.render();
    });
  }

  if(warEl && !warEl.dataset.bound){
    warEl.dataset.bound = '1';
    warEl.addEventListener('change', function(){
      if(!requirePerm(() => Auth() && Auth().canEditSettings(), '修改地圖關聯規則')){
        this.checked = !!getState().settings.warRequireSameMap;
        return;
      }
      window.SLG.updateSettings({ warRequireSameMap: !!this.checked });
      saveState();
      logSystem(`🗺️ 宣戰限制同地圖：${this.checked ? '開' : '關'}`);
      if(window.SLG.WarManager) window.SLG.WarManager.render();
      if(window.SLG.WarManager && window.SLG.WarManager.updateAddTargetOptions){
        window.SLG.WarManager.updateAddTargetOptions();
      }
    });
  }
}

/* ============================================================
   ★ v9.0.0：沙盤切換器 UI 綁定
   ============================================================ */
function bindSandboxSwitcherUI(){
  const state = getState();

  /* Sidebar 展開 / 收起 */
  const group = document.getElementById('sharedSandboxGroup');
  const header = document.getElementById('sharedSandboxHeader');
  if(header && !header.dataset.bound){
    header.dataset.bound = '1';
    header.addEventListener('click', () => {
      if(group) group.classList.toggle('open');
    });
  }

  /* 個人沙盤按鈕（sidebar） */
  const personalBtn = document.getElementById('personalSandboxBtn');
  if(personalBtn && !personalBtn.dataset.bound){
    personalBtn.dataset.bound = '1';
    personalBtn.addEventListener('click', async () => {
      await switchToPersonalSandbox();
    });
  }

  /* mode-bar 切換器：共享按鈕 */
  const sharedSwitch = document.getElementById('btnSharedSandboxSwitch');
  if(sharedSwitch && !sharedSwitch.dataset.bound){
    sharedSwitch.dataset.bound = '1';
    sharedSwitch.addEventListener('click', (e) => {
      e.stopPropagation();
      /* 若當前不是共享模式但有 activeSharedSandboxId → 切到該共享 */
      if(state.sandboxMode === 'shared'){
        toggleSandboxDropdown();
      } else {
        if(state.activeSharedSandboxId){
          switchToSharedSandbox(state.activeSharedSandboxId);
        } else {
          showSandboxDropdown();
        }
      }
    });
  }

  /* mode-bar 切換器：個人按鈕 */
  const personalSwitch = document.getElementById('btnPersonalSandboxSwitch');
  if(personalSwitch && !personalSwitch.dataset.bound){
    personalSwitch.dataset.bound = '1';
    personalSwitch.addEventListener('click', (e) => {
      e.stopPropagation();
      hideSandboxDropdown();
      switchToPersonalSandbox();
    });
  }

  /* 下拉清單：新增按鈕 */
  const addBtn = document.getElementById('btnAddSharedSandboxFromDropdown');
  if(addBtn && !addBtn.dataset.bound){
    addBtn.dataset.bound = '1';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideSandboxDropdown();
      openAddSharedSandboxModal();
    });
  }

  /* 點擊外部關閉下拉 */
  if(!document.__sandboxDropdownBound){
    document.__sandboxDropdownBound = true;
    document.addEventListener('click', (e) => {
      const dd = document.getElementById('sharedSandboxDropdown');
      if(!dd || dd.classList.contains('hidden')) return;
      const switcher = document.getElementById('sandboxSwitcher');
      if(switcher && switcher.contains(e.target)) return;
      hideSandboxDropdown();
    });
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape'){
        hideSandboxDropdown();
      }
    });
  }

  /* 沙盤數據頁：新增按鈕 */
  const addFromList = document.getElementById('btnAddSharedSandboxFromList');
  if(addFromList && !addFromList.dataset.bound){
    addFromList.dataset.bound = '1';
    addFromList.addEventListener('click', openAddSharedSandboxModal);
  }

  /* 新增共享沙盤 Modal */
  const cancelBtn = document.getElementById('addSs_cancel');
  if(cancelBtn && !cancelBtn.dataset.bound){
    cancelBtn.dataset.bound = '1';
    cancelBtn.addEventListener('click', closeAddSharedSandboxModal);
  }
  const submitBtn = document.getElementById('addSs_submit');
  if(submitBtn && !submitBtn.dataset.bound){
    submitBtn.dataset.bound = '1';
    submitBtn.addEventListener('click', submitAddSharedSandbox);
  }
  const nameInput = document.getElementById('addSs_name');
  if(nameInput && !nameInput.dataset.bound){
    nameInput.dataset.bound = '1';
    nameInput.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){ e.preventDefault(); submitAddSharedSandbox(); }
    });
  }

  /* 共享歷史 Modal */
  const sharedHistoryClose = document.getElementById('sharedHistoryClose');
  if(sharedHistoryClose && !sharedHistoryClose.dataset.bound){
    sharedHistoryClose.dataset.bound = '1';
    sharedHistoryClose.addEventListener('click', () => {
      document.getElementById('sharedHistoryModal').classList.remove('show');
    });
  }
}

/* ★ v9.0.1 新增：盟色對照表 UI 綁定 */
function bindAllianceColorUI(){
  const btn = document.getElementById('btnAllianceColorList');
  if(btn && !btn.dataset.bound){
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      openAllianceColorModal();
    });
  }

  const closeBtn = document.getElementById('allianceColorClose');
  if(closeBtn && !closeBtn.dataset.bound){
    closeBtn.dataset.bound = '1';
    closeBtn.addEventListener('click', () => {
      document.getElementById('allianceColorModal')?.classList.remove('show');
    });
  }

  if(!window.__allianceColorEventBound){
    window.__allianceColorEventBound = true;
    getOn()(EVT().ALLIANCE_COLOR_CHANGED, () => {
      if(document.getElementById('allianceColorModal')?.classList.contains('show')){
        renderAllianceColorList();
      }
    });
  }
}

/* ★ v9.0.1 新增：開啟盟色對照表 Modal */
function openAllianceColorModal(){
  const modal = document.getElementById('allianceColorModal');
  if(!modal) return;
  modal.classList.add('show');
  renderAllianceColorList();
}

/* ★ v9.0.1 新增：渲染盟色對照表 */
function renderAllianceColorList(){
  const list = document.getElementById('allianceColorList');
  if(!list) return;
  const state = getState();
  const alliances = window.SLG.getAlliancesSorted();
  if(alliances.length === 0){
    list.innerHTML = '<div class="text-dim" style="padding:20px;text-align:center;">尚無同盟</div>';
    return;
  }
  const colorMap = window.SLG.getAllianceColorMap();
  list.innerHTML = alliances.map(a => {
    const color = colorMap.get(a.id) || a.color || '#64748b';
    const sideCls = a.side === 'self' ? 'self'
      : a.side === 'ally' ? 'ally'
      : a.side === 'npc' ? 'npc' : 'enemy';
    const isSelf = a.side === 'self';
    return `<div class="alliance-color-row ${isSelf ? 'row-self' : ''}">
      <span class="alliance-color-dot" style="background:${color}; color:${color};"></span>
      <span class="alliance-color-name">${a.icon ? a.icon + ' ' : ''}${esc(a.name)}</span>
      <span class="alliance-color-chip ${sideCls}">${window.SLG.allianceSideLabel(a.side)}</span>
      <span class="alliance-color-hex">${color}</span>
    </div>`;
  }).join('');
}

/* ★ v9.0.1 新增：建立盟色選擇器（給盟編輯 Modal 用） */
function buildAllianceColorPicker(containerEl, allianceId, currentColor){
  if(!containerEl) return;
  const template = document.getElementById('allianceColorPickerTemplate');
  if(!template) return;

  const clone = template.content.cloneNode(true);
  containerEl.innerHTML = '';
  containerEl.appendChild(clone);

  const alliance = getState().alliances.find(a => a.id === allianceId);
  const sideLocked = alliance && (alliance.side === 'self' || alliance.side === 'ally' || alliance.side === 'npc');
  const lockedColor = alliance ? window.SLG.SIDE_PRIORITY_COLOR[alliance.side] : null;

  const grid = containerEl.querySelector('#allianceColorPickerGrid');
  const currentDot = containerEl.querySelector('#allianceColorCurrentDot');
  const currentText = containerEl.querySelector('#allianceColorCurrentText');

  const updateCurrent = (color) => {
    if(currentDot){ currentDot.style.background = color; currentDot.style.color = color; }
    if(currentText){ currentText.textContent = color; }
  };
  updateCurrent(currentColor);

  const usedColors = new Set(
    getState().alliances
      .filter(a => a.id !== allianceId && a.color)
      .map(a => a.color)
  );

  const palette = window.SLG.ALLIANCE_COLOR_PALETTE;
  grid.innerHTML = palette.map(color => {
    const isCurrent = (color === currentColor);
    const isLocked = sideLocked && (color !== lockedColor);
    const isUsed = usedColors.has(color);
    const disabled = isLocked || isUsed;
    const cls = [
      'alliance-color-picker-dot',
      isCurrent ? 'selected' : '',
      isLocked ? 'locked' : '',
    ].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}"
      data-color="${color}"
      style="background:${color}; color:${color};"
      ${disabled ? 'disabled' : ''}
      title="${color}${isLocked ? '（鎖定）' : isUsed ? '（已使用）' : ''}"></button>`;
  }).join('');

  grid.querySelectorAll('.alliance-color-picker-dot:not([disabled])').forEach(dot => {
    dot.addEventListener('click', () => {
      const color = dot.dataset.color;
      updateCurrent(color);
      grid.querySelectorAll('.alliance-color-picker-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      containerEl.dataset.selectedColor = color;
    });
  });

  containerEl.dataset.selectedColor = currentColor;
}

/* ============================================================
   事件綁定
   ============================================================ */
function bindUI(){
  document.querySelectorAll('.top-nav button').forEach(btn => {
    btn.addEventListener('click', function(){
      document.querySelectorAll('.top-nav button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      const tabId = this.dataset.tab;
      const tabEl = document.getElementById(tabId);
      if(tabEl) tabEl.classList.add('active');

      if(window.innerWidth <= 768){
        const sidebar = document.getElementById('sidebar');
        if(sidebar) sidebar.classList.remove('open');
      }
      if(tabId === 'tab-cities'){
        if(R() && R().renderCities) R().renderCities();
        if(window.SLG.CityManager) window.SLG.CityManager.render();
        if(window.SLG.RouteManager) window.SLG.RouteManager.render();
        if(window.SLG.renderOverview) window.SLG.renderOverview();
      }
      if(tabId === 'tab-alliances'){
        if(R() && R().renderAlliances) R().renderAlliances();
        if(R() && R().renderMatrix) R().renderMatrix();
      }
      if(tabId === 'tab-dyn'){
        DYN().setRows(getState().dynRows);
        DYN().populateCityFilters();
      }
      if(tabId === 'tab-narrative'){ R().renderNarrative(getState().narrativeLines); }
      if(tabId === 'tab-map'){ switchMapView(currentMapView); }
      if(tabId === 'tab-params'){
        syncAIParamsToUI();
        syncTroopTiersToUI();
        const routeEl = document.getElementById('globalRouteRequireSameMap');
        if(routeEl) routeEl.checked = !!getState().settings.routeRequireSameMap;
        const warEl = document.getElementById('globalWarRequireSameMap');
        if(warEl) warEl.checked = !!getState().settings.warRequireSameMap;
      }
      if(tabId === 'tab-summary'){
        if(window.SLG.Summary) window.SLG.Summary.render(window.SLG.Summary.getLast());
      }
      if(tabId === 'tab-sandbox'){ refreshSandboxList(); renderSharedSandboxList(); }
      if(tabId === 'tab-accounts'){
        if(Auth() && (Auth().isSuperAdmin() || Auth().isAdmin())){ window.SLG.Accounts.refresh(); }
      }
      if(tabId === 'tab-chat'){
        getState().unreadChat = 0;
        R().renderChatBadge();
        R().renderChat();
        const el = document.getElementById('chatMessages');
        if(el) el.scrollTop = el.scrollHeight;
      }
    });
  });

  const hamburger = document.getElementById('hamburger');
  if(hamburger){
    hamburger.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if(sidebar) sidebar.classList.toggle('open');
    });
  }
  const sidebarClose = document.getElementById('sidebarClose');
  if(sidebarClose){
    sidebarClose.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if(sidebar) sidebar.classList.remove('open');
    });
  }
  document.addEventListener('click', (e) => {
    if(window.innerWidth > 768) return;
    const sidebar = document.getElementById('sidebar');
    const hamburgerEl = document.getElementById('hamburger');
    if(!sidebar || !sidebar.classList.contains('open')) return;
    if(sidebar.contains(e.target)) return;
    if(hamburgerEl && hamburgerEl.contains(e.target)) return;
    sidebar.classList.remove('open');
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape'){
      const sidebar = document.getElementById('sidebar');
      if(sidebar) sidebar.classList.remove('open');
    }
  });

  document.querySelectorAll('.map-view-tab').forEach(tab => {
    tab.addEventListener('click', function(){ switchMapView(this.dataset.mapView); });
  });

  if(window.SLG.initCitySubtabs) window.SLG.initCitySubtabs();
  initListPrefs();
  if(window.SLG.DistanceTool) window.SLG.DistanceTool.init();

  const mapZoneSel = document.getElementById('mapZoneSelect');
  if(mapZoneSel && !mapZoneSel.dataset.bound){
    mapZoneSel.dataset.bound = '1';
    mapZoneSel.addEventListener('change', function(){
      if(window.SLG.GameMap && window.SLG.GameMap.setZoneFilter){
        window.SLG.GameMap.setZoneFilter(this.value);
      }
    });
  }
  const cityMatrixZoneSel = document.getElementById('cityMatrixZone');
  if(cityMatrixZoneSel) cityMatrixZoneSel.addEventListener('change', () => {
    if(R() && R().renderCityMatrix) R().renderCityMatrix();
  });
  const cityMatrixFilterSel = document.getElementById('cityMatrixFilter');
  if(cityMatrixFilterSel) cityMatrixFilterSel.addEventListener('change', () => {
    if(R() && R().renderCityMatrix) R().renderCityMatrix();
  });

  const btnResetOrder = document.getElementById('btnResetAllianceOrder');
  if(btnResetOrder){
    btnResetOrder.addEventListener('click', () => {
      if(!requirePerm(() => effectiveCanEditData(), '重置盟排序')) return;
      showConfirm('重置盟排序', '確定要依「陣營 + 建立時間」重新排序嗎？', () => {
        if(window.SLG.resetAllianceOrder) window.SLG.resetAllianceOrder();
        R().renderAlliances();
        if(R() && R().renderMatrix) R().renderMatrix();
        if(window.SLG.renderOverview) window.SLG.renderOverview();
        logSystem('🔄 盟排序已重置');
      });
    });
  }

  const btnSwitchMode = document.getElementById('btnSwitchMode');
  if(btnSwitchMode) btnSwitchMode.addEventListener('click', () => window.SLG.requestSwitchMode());

  if(window.SLG.bindAuthUI) window.SLG.bindAuthUI();

  bindSyncSettingsUI();
bindTroopTierUI();
bindMapLibraryUI();
bindRouteDeleteModal();
bindBackupNowButton();
bindMapRelationUI();
bindSandboxSwitcherUI();  /* ★ v9.0.0 */
bindCitySuffixUI();       /* ★ v9.0.1 */
bindAllianceColorUI();    /* ★ v9.0.1 */

  const btnLogout = document.getElementById('btnLogout');
  if(btnLogout && !btnLogout.dataset.bound){
    btnLogout.dataset.bound = '1';
    btnLogout.addEventListener('click', async () => {
      if(!isOnline()){ alert('離線中，無法登出。請先恢復網路連線。'); return; }
      const modal = document.getElementById('logoutConfirmModal');
      if(modal) modal.classList.add('show');
    });
  }
  const logoutConfirm = document.getElementById('logoutConfirm');
  if(logoutConfirm && !logoutConfirm.dataset.bound){
    logoutConfirm.dataset.bound = '1';
    logoutConfirm.addEventListener('click', async () => {
      try{ await Auth().performLogout(); }
      catch(e){ console.warn('登出失敗', e); alert('登出失敗：' + e.message); }
    });
  }
  const logoutCancel = document.getElementById('logoutCancel');
  if(logoutCancel && !logoutCancel.dataset.bound){
    logoutCancel.dataset.bound = '1';
    logoutCancel.addEventListener('click', () => {
      document.getElementById('logoutConfirmModal').classList.remove('show');
    });
  }

  const nameInput = document.getElementById('commanderName');
  if(nameInput) nameInput.addEventListener('input', function(){
    getState().commanderName = this.value.trim();
    saveState();
  });

  const btnCreateRoom = document.getElementById('btnCreateRoom');
  if(btnCreateRoom) btnCreateRoom.addEventListener('click', async () => {
    if(!requirePerm(() => Auth() && Auth().canCreateRoom(), '建立房間')) return;
    if(!isOnline()){ alert('離線中，無法建立房間'); return; }
    const name = nameInput.value.trim();
    if(!name){ alert('請先填寫指揮官名稱'); return; }
    const db = window.SLG.getDb();
    if(!db){ alert('Firebase 尚未初始化'); return; }
    getState().commanderName = name;

    let code = null;
    for(let i = 0; i < 10; i++){
      const candidate = String(Math.floor(100000 + Math.random()*900000));
      try{
        const snap = await db.ref(`rooms/${candidate}/presence`).once('value');
        if(!snap.exists()){ code = candidate; break; }
      }catch(e){ code = candidate; break; }
    }
    if(!code){ alert('無法生成房間碼'); return; }
    document.getElementById('roomCode').value = code;
    window.SLG.connectFirebase(code, true);
    saveState();
  });

  const btnJoinRoom = document.getElementById('btnJoinRoom');
  if(btnJoinRoom) btnJoinRoom.addEventListener('click', () => {
    if(!requirePerm(() => getState().auth.signedIn, '請先登入才能加入房間')) return;
    if(!isOnline()){ alert('離線中，無法加入房間'); return; }
    const name = nameInput.value.trim();
    if(!name){ alert('請先填寫指揮官名稱'); return; }
    const code = document.getElementById('roomCode').value.trim();
    if(code.length !== 6){ alert('請輸入6位數房間碼'); return; }
    getState().commanderName = name;
    window.SLG.connectFirebase(code, false);
    saveState();
  });

  const btnDisconnect = document.getElementById('btnDisconnect');
  if(btnDisconnect) btnDisconnect.addEventListener('click', () => window.SLG.requestDisconnect());

  document.querySelectorAll('[data-exit-choice]').forEach(btn => {
    if(!btn.dataset.bound){
      btn.dataset.bound = '1';
      btn.addEventListener('click', function(){
        if(typeof window.SLG.confirmExit === 'function'){
          window.SLG.confirmExit(this.dataset.exitChoice);
        }
      });
    }
  });
  const exitRoomCancel = document.getElementById('exitRoomCancel');
  if(exitRoomCancel && !exitRoomCancel.dataset.bound){
    exitRoomCancel.dataset.bound = '1';
    exitRoomCancel.addEventListener('click', () => {
      document.getElementById('exitRoomModal').classList.remove('show');
    });
  }

  const btnUploadSandbox = document.getElementById('btnUploadSandboxToRoom');
  if(btnUploadSandbox) btnUploadSandbox.addEventListener('click', uploadMySandboxToRoom);
  const btnDownloadRoomSandbox = document.getElementById('btnDownloadRoomSandbox');
  if(btnDownloadRoomSandbox) btnDownloadRoomSandbox.addEventListener('click', downloadRoomSandbox);

  const btnRequestRoomEdit = document.getElementById('btnRequestRoomEdit');
  if(btnRequestRoomEdit) btnRequestRoomEdit.addEventListener('click', () => window.SLG.requestRoomEditAccess());

  const btnReviewClose = document.getElementById('editRequestReviewClose');
  if(btnReviewClose) btnReviewClose.addEventListener('click', () => {
    document.getElementById('editRequestReviewModal').classList.remove('show');
  });

  document.querySelectorAll('[data-room-action]').forEach(btn => {
    btn.addEventListener('click', function(){
      const action = this.dataset.roomAction;
      if(action === 'uploadMine'){ uploadMySandboxToRoom(); }
      else if(action === 'pickFromList'){ hideRoomEmptyPrompt(); openSandboxPicker(); }
      else if(action === 'stayEmpty'){ hideRoomEmptyPrompt(); }
    });
  });
  const roomEmptyCancel = document.getElementById('roomEmptyCancel');
  if(roomEmptyCancel) roomEmptyCancel.addEventListener('click', hideRoomEmptyPrompt);

  const sandboxPickerCancel = document.getElementById('sandboxPickerCancel');
  if(sandboxPickerCancel) sandboxPickerCancel.addEventListener('click', () => {
    document.getElementById('sandboxPickerModal').classList.remove('show');
  });

  const btnSandboxRefresh = document.getElementById('btnSandboxesRefresh');
  if(btnSandboxRefresh) btnSandboxRefresh.addEventListener('click', refreshSandboxList);

  const btnSandboxHistory = document.getElementById('btnSandboxHistory');
  if(btnSandboxHistory){
    btnSandboxHistory.addEventListener('click', async () => {
      const state = getState();
      if(!state.auth.signedIn){ alert('請先登入'); return; }
      if(!isOnline()){ alert('離線中，無法讀取歷史'); return; }

      /* 共享模式 → 共享歷史 */
      if(state.sandboxMode === 'shared' && state.activeSharedSandboxId){
        const modal = document.getElementById('sharedHistoryModal');
        if(modal) modal.classList.add('show');
        await renderSharedHistoryList();
        return;
      }

      const modal = document.getElementById('historyModal');
      if(modal) modal.classList.add('show');
      if(window.SLG.renderHistoryList) await window.SLG.renderHistoryList();
    });
  }
  const historyClose = document.getElementById('historyClose');
  if(historyClose){
    historyClose.addEventListener('click', () => {
      document.getElementById('historyModal').classList.remove('show');
    });
  }

  const btnSandboxForceSync = document.getElementById('btnSandboxForceSync');
  if(btnSandboxForceSync){
    btnSandboxForceSync.addEventListener('click', async () => {
      const state = getState();
      if(!state.auth.signedIn){ alert('請先登入'); return; }
      if(!isOnline()){ alert('離線中，無法上傳'); return; }
      try{
        if(state.sandboxMode === 'shared' && SharedSandboxManager()){
          await SharedSandboxManager().save(state.activeSharedSandboxId, { silent: true });
          alert('✅ 已上傳共享沙盤到雲端');
        } else {
          await performCloudUpload('manual-button');
          alert('✅ 已上傳到雲端');
        }
        if(window.SLG.renderSandboxData) window.SLG.renderSandboxData();
      }catch(e){ alert('❌ 上傳失敗：' + e.message); }
    });
  }

  const btnRescue = document.getElementById('btnRescueRoom');
  if(btnRescue){
    btnRescue.addEventListener('click', async () => {
      if(!isOnline()){ alert('離線中，無法救援'); return; }
      const roomCode = document.getElementById('rescueRoomCode').value.trim();
      const statusEl = document.getElementById('rescueStatus');
      if(!roomCode || roomCode.length !== 6){ alert('請輸入 6 位數房間碼'); return; }
      if(!confirm(`確定要重建房間 ${roomCode} 的沙盤嗎？\n\n⚠️ 這會覆蓋該房間目前的 latestSnapshot！`)) return;

      statusEl.textContent = '⏳ 正在重播事件流...';
      btnRescue.disabled = true;
      try{
        const result = await window.SLG.rescueRoomSnapshot(roomCode);
        statusEl.innerHTML = `✅ 重建完成：${result.eventsCount} 個事件 / ${result.patchesCount} 個補丁<br>` +
          `→ 城池 ${result.citiesCount} 座 / 同盟 ${result.alliancesCount} 個`;
        alert('✅ 救援成功！');
      }catch(e){
        statusEl.textContent = '❌ 失敗：' + e.message;
        alert('❌ 救援失敗：' + e.message);
      }finally{ btnRescue.disabled = false; }
    });
  }

  const btnSaveSettings = document.getElementById('btnSaveSettings');
  if(btnSaveSettings) btnSaveSettings.addEventListener('click', () => {
    if(!requirePerm(() => Auth() && Auth().canEditSettings(), '修改戰鬥參數')) return;
    const attackRequireRouteEl = document.getElementById('globalAttackRequireRoute');
    const crossZoneWarEl = document.getElementById('globalCrossZoneWar');
    const routeReqMapEl = document.getElementById('globalRouteRequireSameMap');
    const warReqMapEl = document.getElementById('globalWarRequireSameMap');

    window.SLG.updateSettings({
      timeLimitMin: parseInt(document.getElementById('globalTimeLimit').value) || 120,
      consumeMinPerMin: parseFloat(document.getElementById('globalConsumeMinPerMin').value) || 10,
      consumeMaxPerMin: parseFloat(document.getElementById('globalConsumeMaxPerMin').value) || 30,
      siegeEfficiency: parseFloat(document.getElementById('globalSiegeEfficiency').value) || 1,
      marchTimeSec: parseInt(document.getElementById('globalMarchTimeSec').value) || 0,
      maxLossRatio: (parseFloat(document.getElementById('globalMaxLossRatio').value) || 90) / 100,
      minLossRatio: (parseFloat(document.getElementById('globalMinLossRatio').value) || 10) / 100,
      attackRequireRoute: attackRequireRouteEl ? !!attackRequireRouteEl.checked : false,
      crossZoneWarAllowed: crossZoneWarEl ? !!crossZoneWarEl.checked : false,
      routeRequireSameMap: routeReqMapEl ? !!routeReqMapEl.checked : true,
      warRequireSameMap: warReqMapEl ? !!warReqMapEl.checked : true,
    });
    if(R() && R().renderMatrix) R().renderMatrix();
    if(R() && R().renderCityMatrix) R().renderCityMatrix();
    if(window.SLG.WarManager) window.SLG.WarManager.render();
    if(window.SLG.RouteManager) window.SLG.RouteManager.render();
    if(window.SLG.GameMap && window.SLG.GameMap.refreshZoneSelector){
      window.SLG.GameMap.refreshZoneSelector();
    }
    alert('戰鬥參數已儲存');
  });

  const btnResetAll = document.getElementById('btnResetAll');
  if(btnResetAll) btnResetAll.addEventListener('click', () => {
    if(!requirePerm(() => Auth() && Auth().canEditSettings(), '重置資料')) return;
    showConfirm('重置所有數據', '⚠️ 這將清除本機所有資料，並重置雲端沙盤！確定嗎？', async () => {
      localStorage.removeItem(window.SLG.LS_PREFIX + 'state');
      localStorage.removeItem(window.SLG.AI_LS_KEY);
      try{
        const state = getState();
        const db = window.SLG.getDb();
        if(db && state.auth.accountUid && isOnline()){
          state.settings = {
            timeLimitMin:120, consumeMinPerMin:10, consumeMaxPerMin:30,
            siegeEfficiency:1, marchTimeSec:0, maxLossRatio:0.9, minLossRatio:0.1,
            attackRequireRoute: false, crossZoneWarAllowed: false,
            routeRequireSameMap: true, warRequireSameMap: true,
          };
          state.alliances = []; state.zones = []; state.cities = []; state.routes = [];
          await window.SLG.saveMySandbox();
        }
      }catch(e){}
      location.reload();
    });
  });

  const btnAISave = document.getElementById('btnAISave');
  if(btnAISave) btnAISave.addEventListener('click', function(){
    if(!requirePerm(() => Auth() && Auth().canEditSettings(), '修改 AI 參數')) return;
    window.SLG.AI.setParams(readAIParamsFromUI());
    window.SLG.AI.saveParams();
    alert('AI 參數已儲存');
  });
  const btnAIReset = document.getElementById('btnAIReset');
  if(btnAIReset) btnAIReset.addEventListener('click', function(){
    if(!requirePerm(() => Auth() && Auth().canEditSettings(), '恢復 AI 預設')) return;
    showConfirm('恢復 AI 預設參數', '這會將所有 AI 參數恢復為預設值，確定嗎？', () => {
      window.SLG.AI.resetParams();
      syncAIParamsToUI();
      logSystem('🔄 AI 參數已恢復預設');
    });
  });
  ['aiR25','aiR20','aiR15','aiR12','aiR10','aiR08','aiR06','aiR00',
   'aiTeamFactor','aiWallFactor1','aiWallFactor2','aiDefendFactor','aiMinPct'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', () => window.SLG.AI.setParams(readAIParamsFromUI()));
  });

  const allyMC = document.getElementById('allyMemberCount');
  const allyTP = document.getElementById('allyTotalPower');
  if(allyMC) allyMC.addEventListener('input', window.SLG.updateAllianceAvgPowerPreview);
  if(allyTP) allyTP.addEventListener('input', window.SLG.updateAllianceAvgPowerPreview);

  const btnSaveAlliance = document.getElementById('btnSaveAlliance');
  if(btnSaveAlliance) btnSaveAlliance.addEventListener('click', () => {
    if(!requirePerm(() => effectiveCanEditData(), '編輯同盟')) return;
    const state = getState();
    const name = document.getElementById('allyName').value.trim();
    if(!name){ alert('請輸入同盟名稱'); return; }
    const icon = document.getElementById('allyIcon').value.trim();
    const side = document.getElementById('allySide').value;
    const memberCount = parseFloat(document.getElementById('allyMemberCount').value) || 0;
    const pInput = parseFloat(document.getElementById('allyTotalPower').value) || 0;
    const totalPower = Math.round(pInput * 1e8);
    if(memberCount <= 0){ alert('總人數必須大於 0'); return; }

    const isEditingId = state.editingAllianceId || null;
    if(icon && window.SLG.isAllianceIconUsed && window.SLG.isAllianceIconUsed(icon, isEditingId)){
      alert('❌ 此盟徽已被其他盟使用，請更換'); return;
    }
    const avgPower = totalPower / memberCount;

    if(side === 'self'){
      state.alliances.forEach(a => {
        if(a.side === 'self' && a.id !== state.editingAllianceId){
          a.side = 'enemy';
          state.entityRev.alliance[a.id] = (state.entityRev.alliance[a.id] || 0) + 1;
          window.SLG.markDirty('alliance', a.id);
        }
      });
    }

    const id = state.editingAllianceId || uid();
    const existing = state.alliances.find(a => a.id === id);
    let order = existing ? existing.order : null;
    if(typeof order !== 'number'){
      const maxOrder = state.alliances.reduce((m, a) =>
        Math.max(m, typeof a.order === 'number' ? a.order : -1), -1);
      order = maxOrder + 1;
    }

    window.SLG.upsertEntity('alliance', {
      id, name, icon, side, memberCount, totalPower, avgPower, power: totalPower,
      order, createdAt: existing ? existing.createdAt : Date.now(),
    });

    window.SLG.resetAllianceForm();
    R().renderAlliances();
    if(R() && R().renderMatrix) R().renderMatrix();
    if(window.SLG.CityManager) window.SLG.CityManager.render();
    if(window.SLG.GameMap) window.SLG.GameMap.render();
    if(window.SLG.renderOverview) window.SLG.renderOverview();
    saveState();
  });
  const btnCancelAllianceEdit = document.getElementById('btnCancelAllianceEdit');
  if(btnCancelAllianceEdit) btnCancelAllianceEdit.addEventListener('click', window.SLG.resetAllianceForm);

  const allianceTbody = document.getElementById('allianceTableBody');
  if(allianceTbody) allianceTbody.addEventListener('click', e => {
    const saveInline = e.target.closest('[data-action="save-alliance-inline"]');
    if(saveInline){
      if(!requirePerm(() => effectiveCanEditData(), '編輯同盟')) return;
      if(window.SLG.saveInlineEditAlliance) window.SLG.saveInlineEditAlliance(saveInline.dataset.id);
      return;
    }
    const cancelInline = e.target.closest('[data-action="cancel-alliance-inline"]');
    if(cancelInline){
      if(window.SLG.cancelInlineEditAlliance) window.SLG.cancelInlineEditAlliance();
      return;
    }
    const editBtn = e.target.closest('[data-action="edit-alliance"]');
    if(editBtn){
      if(!requirePerm(() => effectiveCanEditData(), '編輯同盟')) return;
      if(window.SLG.startInlineEditAlliance) window.SLG.startInlineEditAlliance(editBtn.dataset.id);
      return;
    }
    const delBtn = e.target.closest('[data-action="del-alliance"]');
    if(delBtn){
      if(!requirePerm(() => effectiveCanEditData(), '刪除同盟')) return;
      const state = getState();
      const a = state.alliances.find(x => x.id === delBtn.dataset.id);
      if(!a) return;
      showConfirm('刪除同盟', `確定刪除「${a.name}」？`, () => {
        if(state.editingAllianceId === a.id) window.SLG.resetAllianceForm();
        window.SLG.deleteEntity('alliance', a.id);
        R().renderAlliances();
        if(R() && R().renderMatrix) R().renderMatrix();
        if(window.SLG.renderOverview) window.SLG.renderOverview();
        saveState();
      });
    }
  });

  const btnAddZone = document.getElementById('btnAddZone');
  if(btnAddZone) btnAddZone.addEventListener('click', () => {
    if(!requirePerm(() => effectiveCanEditData(), '新增戰區')) return;
    const state = getState();
    const name = document.getElementById('newZoneName').value.trim();
    if(!name){ alert('請輸入戰區名稱'); return; }
    const mapSel = document.getElementById('newZoneMap');
    const mapId = mapSel ? mapSel.value : '';
    if(!mapId){ alert('⚠️ 請先選擇所屬地圖'); return; }
    if(state.zones.some(z => z.name === name && z.mapId === mapId)){
      alert('⚠️ 該地圖已有同名戰區，請改用其他名稱');
      return;
    }
    window.SLG.upsertEntity('zone', { id: uid(), name, mapId });
    document.getElementById('newZoneName').value = '';
    R().renderZones(); R().renderCities();
    if(R() && R().populateCityMatrixFilters) R().populateCityMatrixFilters();
    if(R() && R().renderCityMatrix) R().renderCityMatrix();
    if(window.SLG.renderOverview) window.SLG.renderOverview();
    if(window.SLG.GameMap && window.SLG.GameMap.refreshZoneSelector){
      window.SLG.GameMap.refreshZoneSelector();
    }
    saveState();
    logSystem(`✅ 已新增戰區：${name}（地圖 ${mapId.slice(0,10)}）`);
  });

  const zoneListEl = document.getElementById('zoneList');
  if(zoneListEl) zoneListEl.addEventListener('click', e => {
    const editBtn = e.target.closest('[data-action="edit-zone"]');
    if(editBtn){
      if(!requirePerm(() => effectiveCanEditData(), '編輯戰區名稱')) return;
      const state = getState();
      const zone = state.zones.find(z => z.id === editBtn.dataset.id);
      if(!zone) return;
      const newName = prompt('編輯戰區名稱：', zone.name);
      if(newName === null) return;
      const trimmed = String(newName).trim();
      if(!trimmed){ alert('戰區名稱不能為空'); return; }
      if(trimmed.length > 20){ alert('戰區名稱最多 20 字'); return; }
      if(trimmed === zone.name) return;
      if(state.zones.some(z => z.name === trimmed && z.id !== zone.id && z.mapId === zone.mapId)){
        alert('⚠️ 該地圖已有同名戰區，請改用其他名稱'); return;
      }
      const oldName = zone.name;
      zone.name = trimmed;
      window.SLG.upsertEntity('zone', zone);
      R().renderZones();
      R().renderCities();
      if(window.SLG.CityManager) window.SLG.CityManager.render();
      if(R() && R().populateCityMatrixFilters) R().populateCityMatrixFilters();
      if(R() && R().renderCityMatrix) R().renderCityMatrix();
      if(window.SLG.renderOverview) window.SLG.renderOverview();
      if(window.SLG.GameMap && window.SLG.GameMap.refreshZoneSelector){
        window.SLG.GameMap.refreshZoneSelector();
      }
      saveState();
      logSystem(`✏️ 戰區已更名：${oldName} → ${trimmed}`);
      return;
    }
    const btn = e.target.closest('[data-action="del-zone"]');
    if(!btn) return;
    if(!requirePerm(() => effectiveCanEditData(), '刪除戰區')) return;
    showConfirm('刪除戰區', '確定刪除？', () => {
      window.SLG.deleteEntity('zone', btn.dataset.id);
      R().renderZones(); R().renderCities();
      if(window.SLG.CityManager) window.SLG.CityManager.render();
      if(R() && R().populateCityMatrixFilters) R().populateCityMatrixFilters();
      if(R() && R().renderCityMatrix) R().renderCityMatrix();
      if(window.SLG.renderOverview) window.SLG.renderOverview();
      if(window.SLG.GameMap && window.SLG.GameMap.refreshZoneSelector){
        window.SLG.GameMap.refreshZoneSelector();
      }
      saveState();
    });
  });

  const btnOpenNewCity = document.getElementById('btnOpenNewCity');
  if(btnOpenNewCity) btnOpenNewCity.addEventListener('click', () => {
    if(!requirePerm(() => effectiveCanEditData(), '新增城池')) return;
    window.SLG.openCityModal(null);
  });

  const cityListEl = document.getElementById('cityList');
  if(cityListEl) cityListEl.addEventListener('click', e => {
    const editBtn = e.target.closest('[data-action="edit-city"]');
    const delBtn = e.target.closest('[data-action="del-city"]');
    if(editBtn){
      if(!requirePerm(() => effectiveCanEditData(), '編輯城池')) return;
      window.SLG.openCityModal(editBtn.dataset.id);
      return;
    }
    if(delBtn){
      if(!requirePerm(() => effectiveCanEditData(), '刪除城池')) return;
      const id = delBtn.dataset.id;
      const state = getState();
      const c = state.cities.find(x => x.id === id);
      if(!c) return;
      showConfirm(
        '刪除城池',
        `確定刪除「${c.name}」？\n\n將連動刪除：節點、相關路線、宣戰指示。`,
        async () => {
          if(window.SLG.DataSyncManager){
            await window.SLG.DataSyncManager.deleteCityCascade(id);
          } else {
            window.SLG.deleteEntity('city', id);
          }
          if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(state.cities);
          R().renderCities();
          if(window.SLG.CityManager) window.SLG.CityManager.render();
          if(R() && R().renderCityMatrix) R().renderCityMatrix();
          if(window.SLG.renderOverview) window.SLG.renderOverview();
          if(window.SLG.RouteManager) window.SLG.RouteManager.render();
          if(window.SLG.WarManager) window.SLG.WarManager.render();
          if(window.SLG.GameMap && window.SLG.GameMap.invalidateLayout){
            window.SLG.GameMap.invalidateLayout();
          }
          if(window.SLG.GameMap) window.SLG.GameMap.render();
          saveState();
        }
      );
    }
  });

  const cityModalCancel = document.getElementById('cityModalCancel');
  if(cityModalCancel) cityModalCancel.addEventListener('click', window.SLG.closeCityModal);
  const cityModalSave = document.getElementById('cityModalSave');
  if(cityModalSave) cityModalSave.addEventListener('click', () => {
    if(!requirePerm(() => effectiveCanEditData(), '儲存城池')) return;
    window.SLG.saveCityFromModal();
  });

  ['cm_totalPower'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', () => window.SLG.updateAutoCalcFields());
  });

  if(window.SLG.RouteManager) window.SLG.RouteManager.init();
  if(window.SLG.WarManager) window.SLG.WarManager.init();
  if(window.SLG.DeployInstr) window.SLG.DeployInstr.init();
  if(window.SLG.GameMap) window.SLG.GameMap.init();

  const btnExportMapRoutes = document.getElementById('btnExportMapRoutesCSV');
  if(btnExportMapRoutes) btnExportMapRoutes.addEventListener('click', window.SLG.exportMapRoutesCSV);
  const btnExportAlliances = document.getElementById('btnExportAlliancesCSV');
  if(btnExportAlliances) btnExportAlliances.addEventListener('click', window.SLG.exportAlliancesCSV);

  const btnSimulate = document.getElementById('btnSimulate');
  if(btnSimulate) btnSimulate.addEventListener('click', () => {
    if(!requirePerm(() => Auth() && Auth().canRunSim(), '請先登入')) return;
    const zoneId = document.getElementById('simZoneSelect').value;
    if(!window.SLG.isConnected()){
      logSystem('⚠️ 未連線，僅本地推演');
      executeSimulation(zoneId);
      return;
    }
    const state = getState();
    window.SLG.publish({
      type:'trigger_simulate', zoneId,
      clientId:state.myClientId, name:state.commanderName
    });
    logSystem(`⚡ ${state.commanderName} 啟動推演`);
    if(state.isHost) executeSimulation(zoneId);
  });

  const modalCancel = document.getElementById('modalCancel');
  if(modalCancel) modalCancel.addEventListener('click', () => {
    document.getElementById('confirmModal').classList.remove('show');
    confirmCb = null;
  });
  const modalConfirm = document.getElementById('modalConfirm');
  if(modalConfirm) modalConfirm.addEventListener('click', () => {
    document.getElementById('confirmModal').classList.remove('show');
    if(confirmCb) confirmCb();
    confirmCb = null;
  });

  const btnOpenExcel = document.getElementById('btnOpenExcelImport');
  if(btnOpenExcel) btnOpenExcel.addEventListener('click', () => {
    if(!requirePerm(() => effectiveCanImportExcel(), 'Excel 匯入')) return;
    window.SLG.openExcelImportModal();
  });
  const btnExportCities = document.getElementById('btnExportCitiesCSV');
  if(btnExportCities) btnExportCities.addEventListener('click', window.SLG.exportCitiesCSV);
  const btnExportRoutes = document.getElementById('btnExportRoutesCSV');
  if(btnExportRoutes) btnExportRoutes.addEventListener('click', window.SLG.exportRoutesCSV);
  const btnTemplate = document.getElementById('btnDownloadTemplate');
  if(btnTemplate) btnTemplate.addEventListener('click', window.SLG.downloadExcelTemplate);
  const excelCancel = document.getElementById('excelImportCancel');
  if(excelCancel) excelCancel.addEventListener('click', window.SLG.closeExcelImportModal);
  const btnImpAll = document.getElementById('excelImportAlliancesBtn');
  if(btnImpAll) btnImpAll.addEventListener('click', window.SLG.doImportAlliances);
  const btnImpCities = document.getElementById('excelImportCitiesBtn');
  if(btnImpCities) btnImpCities.addEventListener('click', window.SLG.doImportCities);
  const btnImpMapRoutes = document.getElementById('excelImportMapRoutesBtn');
  if(btnImpMapRoutes) btnImpMapRoutes.addEventListener('click', window.SLG.doImportMapRoutes);
  const btnImpRoutes = document.getElementById('excelImportRoutesBtn');
  if(btnImpRoutes) btnImpRoutes.addEventListener('click', window.SLG.doImportRoutes);

  ['excelAlliancesText','excelCitiesText','excelMapRoutesText','excelRoutesText'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', window.SLG.updateExcelPreview);
  });

  document.querySelectorAll('[data-excel-upload]').forEach(btn => {
    btn.addEventListener('click', () => {
      const which = btn.dataset.excelUpload;
      const fileInput = document.getElementById(
        which === 'cities' ? 'excelCitiesFile' :
        which === 'routes' ? 'excelRoutesFile' :
        which === 'alliances' ? 'excelAlliancesFile' :
        which === 'mapRoutes' ? 'excelMapRoutesFile' : null
      );
      if(fileInput) fileInput.click();
    });
  });
  document.querySelectorAll('[data-excel-clear]').forEach(btn => {
    btn.addEventListener('click', () => {
      const which = btn.dataset.excelClear;
      const textarea = document.getElementById(
        which === 'cities' ? 'excelCitiesText' :
        which === 'routes' ? 'excelRoutesText' :
        which === 'alliances' ? 'excelAlliancesText' :
        which === 'mapRoutes' ? 'excelMapRoutesText' : null
      );
      if(textarea){ textarea.value = ''; window.SLG.updateExcelPreview(); }
    });
  });

  const fileMap = {
    excelCitiesFile: 'excelCitiesText',
    excelRoutesFile: 'excelRoutesText',
    excelAlliancesFile: 'excelAlliancesText',
    excelMapRoutesFile: 'excelMapRoutesText',
  };
  Object.keys(fileMap).forEach(fileId => {
    const fileEl = document.getElementById(fileId);
    if(!fileEl) return;
    fileEl.addEventListener('change', function(){
      if(!this.files || !this.files[0]) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const textareaId = fileMap[fileId];
        const ta = document.getElementById(textareaId);
        if(ta) ta.value = e.target.result;
        window.SLG.updateExcelPreview();
      };
      reader.readAsText(this.files[0], 'UTF-8');
      this.value = '';
    });
  });

  const chatInput = document.getElementById('chatInput');
  const btnSendChat = document.getElementById('btnSendChat');
  function doSendChat(){
    if(!requirePerm(() => getState().auth.signedIn, '請先登入才能聊天')) return;
    const text = chatInput.value.trim();
    if(!text) return;
    window.SLG.sendChatMessage(text);
    chatInput.value = '';
    chatInput.focus();
  }
  if(btnSendChat) btnSendChat.addEventListener('click', doSendChat);
  if(chatInput) chatInput.addEventListener('keydown', e => {
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); doSendChat(); }
  });
  const btnClearChat = document.getElementById('btnClearChat');
  if(btnClearChat){
    btnClearChat.addEventListener('click', () => {
      showConfirm('清空聊天室', '確定要清空本機的聊天記錄嗎？（不影響其他人）', () => {
        const state = getState();
        state.chatMessages = [];
        state.unreadChat = 0;
        R().renderChat();
        R().renderChatBadge();
        saveState();
      });
    });
  }

  window.addEventListener('beforeunload', () => {
    saveState();
    try{ releaseWorker(); }catch(e){}
    try{
      if(typeof window.SLG.releaseCdWorker === 'function') window.SLG.releaseCdWorker();
    }catch(e){}
  });

  DEPLOY().init();
  if(window.SLG.Accounts) window.SLG.Accounts.init();
}

/* ============================================================
   非同步載入沙盤清單
   ============================================================ */
async function refreshSandboxList(){
  const state = getState();
  if(!state.auth.signedIn) return;
  if(!isOnline()) return;
  try{
    const all = await window.SLG.fetchAllSandboxes();
    state.sandboxesList = all || {};
    getEmit()(EVT().SANDBOXES_LIST_UPDATED);
    if(window.SLG.renderSandboxData) window.SLG.renderSandboxData();
    logSystem(`📊 已載入 ${Object.keys(state.sandboxesList).length} 個沙盤`);
  }catch(e){ console.warn('載入沙盤清單失敗', e); }
}

/* ============================================================
   事件監聽
   ============================================================ */
function bindEvents(){
  getOn()(EVT().DEBUG, (p) => R().renderDebug(p));

  getOn()(EVT().AUTH, () => {
    if(window.SLG.renderAuthUI) window.SLG.renderAuthUI();
    applyPermissions();
    updateModeBar();
    if(window.SLG.renderSyncStatus) window.SLG.renderSyncStatus();

    const state = getState();
    if(state.auth.signedIn){
      if(window.SLG.startMapLibraryIndexWatcher){
        try{ window.SLG.startMapLibraryIndexWatcher(); }catch(e){}
      }
      if(window.SLG.startSharedIndexWatcher){
        try{ window.SLG.startSharedIndexWatcher(); }catch(e){}
      }
      if(MapLibrary()){
        MapLibrary().renderSelect();
        MapLibrary().renderGallery();
      }
      /* 載入共享沙盤索引 */
      if(SharedSandboxManager()){
        SharedSandboxManager().fetchIndex()
          .then(() => renderSharedSandboxList())
          .catch(e => console.warn('[SharedSB] 載入索引失敗', e));
      }
    } else {
      if(window.SLG.stopAllMapLibraryWatchers){
        try{ window.SLG.stopAllMapLibraryWatchers(); }catch(e){}
      }
      if(window.SLG.stopAllSharedWatchers){
        try{ window.SLG.stopAllSharedWatchers(); }catch(e){}
      }
      state.mapLibrary.index = {};
      state.mapLibrary.loaded = {};
      state.mapLibrary.activeMapId = '';
      state.sharedSandboxesIndex = {};
      if(MapLibrary()){ MapLibrary().renderSelect(); MapLibrary().renderGallery(); }
      if(window.SLG.GameMap) window.SLG.GameMap.onMapLibraryChanged();
      renderSharedSandboxList();
    }

    if(!state.auth.signedIn){ hideAllTabContent(); }
    else {
      const roomBtn = document.querySelector('.top-nav button[data-tab="tab-room"]');
      if(roomBtn && roomBtn.style.display !== 'none'){ roomBtn.click(); }
    }
    if(state.auth.signedIn && Auth() && (Auth().isSuperAdmin() || Auth().isAdmin())){
      const accTab = document.getElementById('tab-accounts');
      if(accTab && accTab.classList.contains('active')){ window.SLG.Accounts.refresh(); }
    }
  });

  getOn()(EVT().CONN, () => {
    R().renderHealth(); R().renderHost();
    updateModeBar();
    applyPermissions();
    const state = getState();
    if(window.SLG.isConnected() && !state.roomHasSnapshot){
      setTimeout(() => {
        if(window.SLG.isInRoom() && !getState().roomHasSnapshot){ showRoomEmptyPrompt(); }
      }, 1500);
    }
  });

  getOn()(EVT().MEMBERS, () => R().renderMembers());
  getOn()(EVT().HOST, () => { R().renderHost(); updateModeBar(); applyPermissions(); });
  getOn()(EVT().MODE, () => { updateModeBar(); applyPermissions(); });

  getOn()(EVT().LOCKS, () => {
    R().renderCities();
    if(window.SLG.CityManager) window.SLG.CityManager.render();
    if(document.getElementById('tab-deploy').classList.contains('active')){
      DEPLOY().render();
    }
  });

  getOn()(EVT().NETWORK, handleNetworkChange);
  getOn()(EVT().SYNC_STATE, () => { if(window.SLG.renderSyncStatus) window.SLG.renderSyncStatus(); });

  getOn()(EVT().TROOP_TIERS, () => {
    syncTroopTiersToUI();
    R().renderCities();
    if(window.SLG.CityManager) window.SLG.CityManager.render();
  });

  getOn()(EVT().DATA, () => {
    const state = getState();
    if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(state.cities);
    R().renderAlliances();
    R().renderZones();
    R().renderCities();
    if(window.SLG.CityManager) window.SLG.CityManager.render();
    if(window.SLG.WarManager){
      window.SLG.WarManager.render();
      if(window.SLG.WarManager.renderAddForm) window.SLG.WarManager.renderAddForm();
    }
    if(window.SLG.DeployInstr) window.SLG.DeployInstr.render();
    if(window.SLG.RouteManager) window.SLG.RouteManager.render();
    if(R() && R().renderMatrix) R().renderMatrix();
    if(R() && R().populateCityMatrixFilters) R().populateCityMatrixFilters();
    if(R() && R().renderCityMatrix) R().renderCityMatrix();
    if(window.SLG.renderOverview) window.SLG.renderOverview();
    if(window.SLG.GameMap){
      if(window.SLG.GameMap.invalidateLayout) window.SLG.GameMap.invalidateLayout();
      if(window.SLG.GameMap.refreshZoneSelector) window.SLG.GameMap.refreshZoneSelector();
      const mapTab = document.getElementById('tab-map');
      if(mapTab && mapTab.classList.contains('active')){ window.SLG.GameMap.activate(); }
      else { window.SLG.GameMap.render(); }
    }
    if(window.SLG.DistanceTool && state.distanceResult){
      window.SLG.DistanceTool.renderResult();
    }

    const gt = document.getElementById('globalTimeLimit');
    if(gt) gt.value = state.settings.timeLimitMin;
    const gc1 = document.getElementById('globalConsumeMinPerMin');
    if(gc1) gc1.value = state.settings.consumeMinPerMin;
    const gc2 = document.getElementById('globalConsumeMaxPerMin');
    if(gc2) gc2.value = state.settings.consumeMaxPerMin;
    const gse = document.getElementById('globalSiegeEfficiency');
    if(gse) gse.value = state.settings.siegeEfficiency;
    const gmt = document.getElementById('globalMarchTimeSec');
    if(gmt) gmt.value = state.settings.marchTimeSec;
    const gml = document.getElementById('globalMaxLossRatio');
    if(gml) gml.value = Math.round(state.settings.maxLossRatio * 100);
    const gmn = document.getElementById('globalMinLossRatio');
    if(gmn) gmn.value = Math.round(state.settings.minLossRatio * 100);
    const garr = document.getElementById('globalAttackRequireRoute');
    if(garr) garr.checked = !!state.settings.attackRequireRoute;
    const gczwEv = document.getElementById('globalCrossZoneWar');
    if(gczwEv) gczwEv.checked = !!state.settings.crossZoneWarAllowed;
    const grr = document.getElementById('globalRouteRequireSameMap');
    if(grr) grr.checked = !!state.settings.routeRequireSameMap;
    const gwr = document.getElementById('globalWarRequireSameMap');
    if(gwr) gwr.checked = !!state.settings.warRequireSameMap;

    if(document.getElementById('tab-deploy').classList.contains('active')) DEPLOY().render();
    if(window.SLG.renderSandboxData) window.SLG.renderSandboxData();
  });

  getOn()(EVT().DYN_RESULT, () => {
    DYN().setRows(getState().dynRows);
    DYN().populateCityFilters();
  });

  getOn()(EVT().ROUTES_UPDATED, () => {
    if(window.SLG.RouteManager) window.SLG.RouteManager.render();
    if(window.SLG.GameMap) window.SLG.GameMap.render();
    if(window.SLG.renderOverview) window.SLG.renderOverview();
    if(window.SLG.WarManager){
      window.SLG.WarManager.render();
      if(window.SLG.WarManager.renderAddForm) window.SLG.WarManager.renderAddForm();
    }
    if(window.SLG.DistanceTool && getState().distanceResult){
      window.SLG.DistanceTool.renderResult();
    }
  });

  getOn()(EVT().SIM_TRIGGER, payload => {
    const state = getState();
    if(payload.name && payload.clientId !== state.myClientId){
      logSystem(`⚡ ${payload.name} 啟動推演`);
    }
    if(state.isHost){
      const sel = document.getElementById('simZoneSelect');
      if(sel) sel.value = payload.zoneId || 'all';
      executeSimulation(payload.zoneId || 'all');
    }
  });

  getOn()(EVT().ROOM_GRANTS, () => {
    if(window.SLG.updateRoomEditButton) window.SLG.updateRoomEditButton();
    applyPermissions();
    R().renderCities(); R().renderAlliances(); R().renderZones();
    if(window.SLG.CityManager) window.SLG.CityManager.render();
    if(window.SLG.renderOverview) window.SLG.renderOverview();
  });

  getOn()(EVT().ROOM_PENDING, () => { renderEditRequestReview(); });

  getOn()(EVT().ROOM_SNAPSHOT_UPDATED, () => {
    if(window.SLG.updateRoomSandboxActions) window.SLG.updateRoomSandboxActions();
    if(window.SLG.renderSandboxData) window.SLG.renderSandboxData();
    if(getState().roomHasSnapshot) hideRoomEmptyPrompt();
  });

  getOn()(EVT().MY_SANDBOX_UPDATED, () => {
    if(window.SLG.renderSandboxData) window.SLG.renderSandboxData();
    if(window.SLG.renderSyncStatus) window.SLG.renderSyncStatus();
  });

  getOn()(EVT().SANDBOXES_LIST_UPDATED, () => {
    if(window.SLG.renderSandboxData) window.SLG.renderSandboxData();
  });

  getOn()(EVT().MAP_LIBRARY_UPDATED, () => {
    applyPermissions();
  });

  /* ★ v9.0.0：共享沙盤事件 */
  getOn()(EVT().SHARED_SANDBOXES_UPDATED, () => {
    renderSharedSandboxList();
  });

  getOn()(EVT().SANDBOX_MODE_CHANGED, () => {
    updateSandboxSwitcherUI();
    if(window.SLG.renderSyncStatus) window.SLG.renderSyncStatus();
    updateModeBar();
  });

  /* ★ v9.0.1 新增：地名後綴變更 → 重繪節點 */
  getOn()(EVT().CITY_SUFFIXES_CHANGED, () => {
    if(window.SLG.GameMap && window.SLG.GameMap.render){
      window.SLG.GameMap.render();
    }
  });

  /* ★ v9.0.1 新增：盟色變更 → 重繪地圖 */
  getOn()(EVT().ALLIANCE_COLOR_CHANGED, () => {
    if(window.SLG.GameMap && window.SLG.GameMap.render){
      window.SLG.GameMap.render();
    }
  });
}

function hideAllTabContent(){
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.top-nav button').forEach(b => b.classList.remove('active'));
}

/* ============================================================
   啟動
   ============================================================ */
function boot(){
  initNetworkWatcher();
  if(!isOnline()) showNetworkOverlay();

  loadState();

  const state = getState();

  /* 初始化沙盤模式 UI */
  document.body.classList.remove('sandbox-shared', 'sandbox-personal');
  document.body.classList.add(state.sandboxMode === 'shared' ? 'sandbox-shared' : 'sandbox-personal');

  const cn = document.getElementById('commanderName');
  if(cn) cn.value = state.commanderName || '';
  const rc = document.getElementById('roomCode');
  if(rc) rc.value = state.roomCode || '';
  const gt = document.getElementById('globalTimeLimit');
  if(gt) gt.value = state.settings.timeLimitMin;
  const gc1 = document.getElementById('globalConsumeMinPerMin');
  if(gc1) gc1.value = state.settings.consumeMinPerMin;
  const gc2 = document.getElementById('globalConsumeMaxPerMin');
  if(gc2) gc2.value = state.settings.consumeMaxPerMin;
  const gse = document.getElementById('globalSiegeEfficiency');
  if(gse) gse.value = state.settings.siegeEfficiency;
  const gmt = document.getElementById('globalMarchTimeSec');
  if(gmt) gmt.value = state.settings.marchTimeSec;
  const gml = document.getElementById('globalMaxLossRatio');
  if(gml) gml.value = Math.round(state.settings.maxLossRatio * 100);
  const gmn = document.getElementById('globalMinLossRatio');
  if(gmn) gmn.value = Math.round(state.settings.minLossRatio * 100);
  const garr = document.getElementById('globalAttackRequireRoute');
  if(garr) garr.checked = !!state.settings.attackRequireRoute;
  const gczw = document.getElementById('globalCrossZoneWar');
  if(gczw) gczw.checked = !!state.settings.crossZoneWarAllowed;
  const grr = document.getElementById('globalRouteRequireSameMap');
  if(grr) grr.checked = !!state.settings.routeRequireSameMap;
  const gwr = document.getElementById('globalWarRequireSameMap');
  if(gwr) gwr.checked = !!state.settings.warRequireSameMap;

  syncAIParamsToUI();
  syncTroopTiersToUI();

  window.SLG.initFirebase();

  if(window.SLG.EntryGate){
    window.SLG.EntryGate.init();
    window.SLG.EntryGate.show();
  }

  window.SLG.registerCloudSync(() => {
    const s = getState();
    if(s.auth.signedIn && s.sandboxMode === 'personal'){
      window.SLG.saveMySandbox().catch(e => console.warn('雲端同步失敗', e));
    }
  });

  window.SLG.registerRoomSnapshotSync(() => {
    if(getState().isHost){
      window.SLG.publishRoomSnapshot().catch(e => console.warn('房間快照同步失敗', e));
    }
  });

  window.SLG.registerSender(patches => {
    const s = getState();
    if(!s.connected) return;
    window.SLG.publish({
      type:'sync_patch', clientId:s.myClientId,
      lamport:s.lamport, patches
    });
  });

  bindUI();
  bindEvents();
  bindSyncWatchers();

  viz().init();
  DYN().init();
  window.SLG.resetAllianceForm();
  if(window.SLG.Summary) window.SLG.Summary.init();
  if(window.SLG.CityManager) window.SLG.CityManager.init();

  /* 初始化共享沙盤管理器 UI */
  renderSharedSandboxList();
  updateSandboxSwitcherUI();

  if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(state.cities);
  R().renderAll();
  DYN().setRows(state.dynRows);
  DYN().populateCityFilters();
  R().renderNarrative(state.narrativeLines);
  R().renderChat();
  R().renderChatBadge();
  R().renderProgress(0);
  if(window.SLG.renderSyncStatus) window.SLG.renderSyncStatus();
  DEPLOY().populateZoneFilter();
  updateModeBar();
  if(window.SLG.renderAuthUI) window.SLG.renderAuthUI();
  if(window.SLG.RouteManager) window.SLG.RouteManager.render();
  if(window.SLG.WarManager){
    window.SLG.WarManager.render();
    if(window.SLG.WarManager.renderAddForm) window.SLG.WarManager.renderAddForm();
  }
  if(window.SLG.DeployInstr) window.SLG.DeployInstr.render();
  if(R() && R().renderMatrix) R().renderMatrix();
  if(R() && R().populateCityMatrixFilters) R().populateCityMatrixFilters();
  if(R() && R().renderCityMatrix) R().renderCityMatrix();
  if(window.SLG.DistanceTool) window.SLG.DistanceTool.render();
  if(window.SLG.renderOverview) window.SLG.renderOverview();
  if(window.SLG.GameMap && window.SLG.GameMap.refreshZoneSelector){
    window.SLG.GameMap.refreshZoneSelector();
  }
  if(MapLibrary()) MapLibrary().renderSelect();
  if(MapLibrary()) MapLibrary().renderGallery();
  applyPermissions();

  (async () => {
    let ok = false;
    if(window.SLG.Auth && isOnline()){ ok = await window.SLG.Auth.initFirebaseAuth(); }
    let loggedIn = false;
    if(ok){ loggedIn = await window.SLG.Auth.restoreSession(); }

    if(loggedIn){
      if(window.SLG.EntryGate) window.SLG.EntryGate.hide();
      if(window.SLG.renderAuthUI) window.SLG.renderAuthUI();
      applyPermissions();
      R().renderAll();
      if(window.SLG.WarManager){
        window.SLG.WarManager.render();
        if(window.SLG.WarManager.renderAddForm) window.SLG.WarManager.renderAddForm();
      }
      if(window.SLG.DeployInstr) window.SLG.DeployInstr.render();
      if(R() && R().renderMatrix) R().renderMatrix();
      if(R() && R().renderCityMatrix) R().renderCityMatrix();
      if(window.SLG.DistanceTool) window.SLG.DistanceTool.render();
      if(window.SLG.renderOverview) window.SLG.renderOverview();
      if(window.SLG.GameMap && window.SLG.GameMap.refreshZoneSelector){
        window.SLG.GameMap.refreshZoneSelector();
      }
      if(window.SLG.renderSyncStatus) window.SLG.renderSyncStatus();

      try{
        if(window.SLG.startMapLibraryIndexWatcher){
          window.SLG.startMapLibraryIndexWatcher();
        }
        if(window.SLG.startSharedIndexWatcher){
          window.SLG.startSharedIndexWatcher();
        }
        await refreshMapLibraryIndex();
        if(SharedSandboxManager()){
          await SharedSandboxManager().fetchIndex();
          renderSharedSandboxList();

          /* v9.0.0：若為共享模式，啟動定時同步 + 監聽當前沙盤 */
          if(getState().sandboxMode === 'shared' && getState().activeSharedSandboxId){
            SharedSandboxManager().startSyncTimer();
            if(window.SLG.startSharedSandboxWatcher){
              window.SLG.startSharedSandboxWatcher(getState().activeSharedSandboxId);
            }
          } else {
            /* v9.0.0：個人模式啟動個人定時同步 */
            startSyncTimer();
          }
        }
      }catch(e){ console.warn('地圖庫 / 共享沙盤初始化失敗', e); }
      if(window.SLG.MapLibrary){
        window.SLG.MapLibrary.renderSelect();
        window.SLG.MapLibrary.renderGallery();
      }

      logSystem('🚪 已自動登入，跳過入口');
      if(document.getElementById('tab-sandbox')?.classList.contains('active')){
        refreshSandboxList();
        renderSharedSandboxList();
      }
    } else {
      hideAllTabContent();
      if(window.SLG.EntryGate) window.SLG.EntryGate.showForm();
      if(window.SLG.renderAuthUI) window.SLG.renderAuthUI();
      applyPermissions();
    }
  })();

  /* v9.0.0：啟動訊息 */
  console.log(
    '%c[沙盤 v9.0.0] 共享沙盤 + 個人沙盤雙模式就緒',
    'color:#22ff88;font-weight:bold;font-size:14px'
  );
  console.log(
    '%c  · 沙盤模式：' + (typeof window.SLG.SharedSandboxManager === 'object' ? '✅' : '❌'),
    'color:#94a3b8;font-size:12px'
  );
  console.log(
    '%c  · 資料版本：' + (window.SLG.DATA_VERSION || 0),
    'color:#94a3b8;font-size:12px'
  );
  console.log(
    '%c  · 側邊欄切換器：' + (document.getElementById('sharedSandboxGroup') ? '✅' : '❌'),
    'color:#94a3b8;font-size:12px'
  );
  console.log(
    '%c  · mode-bar 切換器：' + (document.getElementById('sandboxSwitcher') ? '✅' : '❌'),
    'color:#94a3b8;font-size:12px'
  );
  console.log(
    '%c  · 頂部彩色條：' + (document.body.classList.contains('sandbox-shared') ? '藍(共享)' : '黃(個人)'),
    'color:#94a3b8;font-size:12px'
  );
}

/* ============================================================
   地圖庫索引載入
   ============================================================ */
async function refreshMapLibraryIndex(){
  const state = getState();
  if(!state.auth.signedIn) return;
  if(!isOnline()) return;
  try{
    const idx = await window.SLG.fetchMapLibraryIndex();
    state.mapLibrary.index = idx || {};
    getEmit()(EVT().MAP_LIBRARY_UPDATED, { type: 'index-loaded' });
    logSystem(`🗺️ 已載入地圖庫索引（${Object.keys(idx || {}).length} 張地圖）`);
  }catch(e){
    console.warn('載入地圖庫索引失敗', e);
  }
}

/* ============================================================
   暴露
   ============================================================ */
Object.assign(window.SLG, {
  showConfirm, applyPermissions, requirePerm, togglePerm,
  effectiveCanEditData, effectiveCanImportExcel, effectiveCanEditMapLibrary,
  loadSandboxFromList, uploadMySandboxToRoom, openSandboxPicker,
  downloadRoomSandbox, refreshSandboxList, backupCurrentSandbox,
  showRoomEmptyPrompt, hideRoomEmptyPrompt,
  switchMapView, executeSimulation, renderEditRequestReview,
  showNetworkOverlay, hideNetworkOverlay, handleNetworkChange,
  showSyncOverlay, hideSyncOverlay,
  bindSyncWatchers, bindSyncSettingsUI, bindTroopTierUI,
  bindMapLibraryUI,
  bindRouteDeleteModal,
  bindBackupNowButton,
  bindMapRelationUI,
  refreshMapLibraryIndex,

  /* ★ v9.0.0：共享沙盤 UI */
  renderSharedSandboxList,
  updateSandboxSwitcherUI,
  switchToSharedSandbox,
  switchToPersonalSandbox,
  openAddSharedSandboxModal,
  closeAddSharedSandboxModal,
  submitAddSharedSandbox,
  downloadSharedToPersonal,
  uploadPersonalToShared,
  renameSharedSandbox,
  deleteSharedSandbox,
  renderSharedHistoryList,
  showSandboxDropdown,
  hideSandboxDropdown,
  toggleSandboxDropdown,
  bindSandboxSwitcherUI,

  /* ★ v9.0.1 新增 */
  bindCitySuffixUI,
  renderCitySuffixTags,
  bindAllianceColorUI,
  openAllianceColorModal,
  renderAllianceColorList,
  buildAllianceColorPicker,
});
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();
/* ============================================================================
 * main.js 結束（v9.0.0）
 * ========================================================================== */