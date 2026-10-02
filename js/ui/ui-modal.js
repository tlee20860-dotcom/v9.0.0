/* ============================================================================
 * js/ui/ui-modal.js — v9.0.2
 * 內容：
 *   ① WarQuickPanel   — 宣戰快速建立面板
 *   ② MapLibrary      — 地圖庫管理
 *   ③ NodeCalibration — 節點校準（AI 辨識 / 定點 / 手動補點）
 *   ④ FuzzyMatch      — 模糊匹配候選 Modal
 *   ⑤ AllianceEditModal — 盟編輯 Modal（★ v9.0.2 新增）
 *   ⑥ 輔助函式        — renderOverview / DistanceTool / 城池 Modal 等
 *   ⑦ 全域暴露
 *
 * ★ v9.0.2 變更：
 *   - 新增 AllianceEditModal（盟編輯 Modal）
 *   - 刪除重複的 renderAll / renderChat / ... 別名（保留在 ui-core.js）
 *
 * 依賴：window.SLG（core.js + firebase.js + dataSync.js + ui-core.js）+ DOM
 * ========================================================================== */
(function(){
'use strict';

window.SLG = window.SLG || {};

/* ── 從全域取得 ── */
const getState = () => window.SLG.state;
const getEmit = () => window.SLG.emit;
const getOn = () => window.SLG.on;
const EVT = () => window.SLG.EVT;
const esc = (s) => window.SLG.esc(s);
const logSystem = (t) => window.SLG.logSystem(t);
const uid = () => window.SLG.uid();
const timeAgo = (ts) => window.SLG.timeAgo(ts);
const buildSandboxFileName = (n, t) => window.SLG.buildSandboxFileName(n, t);
const sideLabel = (s) => window.SLG.sideLabel(s);
const sideClass = (s) => window.SLG.sideClass(s);
const allianceSideLabel = (s) => window.SLG.allianceSideLabel(s);
const formatPower = (n) => window.SLG.formatPower(n);
const formatAvgPower = (n) => window.SLG.formatAvgPower(n);
const calcTeamsFromTiers = (t) => window.SLG.calcTeamsFromTiers(t);
const getCityMapId = (c) => window.SLG.getCityMapId(c);
const computeCityDistance = (a, b) => window.SLG.computeCityDistance(a, b);
const setDistanceHighlight = (r) => window.SLG.setDistanceHighlight(r);
const clearDistanceHighlight = () => window.SLG.clearDistanceHighlight();
const getActiveMap = () => window.SLG.getActiveMap();
const getLoadedMap = (id) => window.SLG.getLoadedMap(id);
const getMapMeta = (id) => window.SLG.getMapMeta(id);
const setActiveMap = (id) => window.SLG.setActiveMap(id);
const setMapViewMode = (m) => window.SLG.setMapViewMode(m);
const isOnline = () => window.SLG.isOnline();
const ATTACK_RULES = () => window.SLG.ATTACK_RULES;
const getAuth = () => window.SLG.Auth;
const getAllianceIcons = () => window.SLG.getAllianceIcons();
const isAllianceIconUsed = (icon, ex) => window.SLG.isAllianceIconUsed(icon, ex);
const ensureNpcAlliance = () => window.SLG.ensureNpcAlliance();

/* ============================================================
   ① WarQuickPanel — 宣戰快速建立面板
   ============================================================ */
const WarQuickPanel = (() => {
  let fromCity = null;
  let toCity = null;
  let selectedType = 'attack';
  let selectedPre = 50;
  let selectedPost = 50;
  let onCreated = null;
  let eventsBound = false;

  function open(from, to, onCreatedCb){
    if(!from || !to || from.id === to.id) return;

    const type = 'attack';
    const validation = validateWar(from, to, type);
    if(!validation.ok){
      alert('⚠️ ' + validation.msg);
      return;
    }

    fromCity = from;
    toCity = to;
    selectedType = type;
    selectedPre = 50;
    selectedPost = 50;
    onCreated = onCreatedCb || null;

    const modal = document.getElementById('warQuickModal');
    if(!modal) return;

    document.getElementById('warQuickFromName').textContent =
      `${from.name}${from.code ? ' [' + from.code + ']' : ''}`;
    document.getElementById('warQuickToName').textContent =
      `${to.name}${to.code ? ' [' + to.code + ']' : ''}`;

    document.querySelectorAll('.war-quick-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.warType === 'attack');
    });

    document.querySelectorAll('.war-quick-pct-btn').forEach(btn => {
      btn.classList.toggle('active',
        parseInt(btn.dataset.pre, 10) === 50 && parseInt(btn.dataset.post, 10) === 50
      );
    });

    const timeField = document.getElementById('warQuickTimeField');
    const timeInput = document.getElementById('warQuickStartTime');
    if(timeField) timeField.classList.remove('hidden');
    if(timeInput) timeInput.value = '19:00';

    bindEvents();
    modal.classList.add('show');
  }

  function close(){
    const modal = document.getElementById('warQuickModal');
    if(modal) modal.classList.remove('show');
    fromCity = null;
    toCity = null;
  }

  function bindEvents(){
    if(eventsBound) return;
    eventsBound = true;

    const closeBtn = document.getElementById('warQuickClose');
    if(closeBtn) closeBtn.addEventListener('click', close);
    const cancelBtn = document.getElementById('warQuickCancel');
    if(cancelBtn) cancelBtn.addEventListener('click', close);

    document.querySelectorAll('.war-quick-type-btn').forEach(btn => {
      btn.addEventListener('click', function(){
        selectedType = this.dataset.warType;
        document.querySelectorAll('.war-quick-type-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const timeField = document.getElementById('warQuickTimeField');
        if(timeField){
          if(selectedType === 'assist') timeField.classList.add('hidden');
          else timeField.classList.remove('hidden');
        }
      });
    });

    document.querySelectorAll('.war-quick-pct-btn').forEach(btn => {
      btn.addEventListener('click', function(){
        selectedPre = parseInt(this.dataset.pre, 10);
        selectedPost = parseInt(this.dataset.post, 10);
        document.querySelectorAll('.war-quick-pct-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
      });
    });

    const detailBtn = document.getElementById('warQuickDetail');
    if(detailBtn){
      detailBtn.addEventListener('click', () => {
        if(!fromCity || !toCity) return;
        const fromId = fromCity.id;
        const fromName = fromCity.name;
        close();
        if(typeof window.SLG.openCityModal === 'function'){
          window.SLG.openCityModal(fromId);
        }
        setTimeout(() => {
          alert('已為您開啟「' + fromName + '」的編輯視窗。\n\n請於「城池數據 → 宣戰」中設定此宣戰指示。');
        }, 200);
      });
    }

    const confirmBtn = document.getElementById('warQuickConfirm');
    if(confirmBtn){
      confirmBtn.addEventListener('click', () => {
        if(!fromCity || !toCity) return;
        doCreate();
      });
    }
  }

  function doCreate(){
    const state = getState();
    const validation = validateWar(fromCity, toCity, selectedType);
    if(!validation.ok){ alert('⚠️ ' + validation.msg); return; }

    const arr = selectedType === 'attack' ? 'attackTargets' : 'defendTargets';
    if(!fromCity[arr]) fromCity[arr] = [];

    const timeInput = document.getElementById('warQuickStartTime');
    const startTime = (selectedType === 'attack')
      ? (timeInput ? timeInput.value : '19:00') || '19:00'
      : '';

    const existingIdx = fromCity[arr].findIndex(t => t.cityId === toCity.id);
    if(existingIdx >= 0){
      const route = fromCity[arr][existingIdx];
      route.preWarPercent = selectedPre;
      route.postRevivePercent = selectedPost;
      route.attackStartTime = startTime;
    } else {
      fromCity[arr].push({
        cityId: toCity.id,
        preWarPercent: selectedPre,
        postRevivePercent: selectedPost,
        priority: 1,
        attackStartTime: startTime,
      });
    }

    state.entityRev.city[fromCity.id] = (state.entityRev.city[fromCity.id] || 0) + 1;
    if(window.SLG.markDirty) window.SLG.markDirty('city', fromCity.id);
    if(window.SLG.tickLamport) window.SLG.tickLamport();
    if(window.SLG.flushPatches) window.SLG.flushPatches();

    if(window.SLG.GameMap && window.SLG.GameMap.accumulateWarChange){
      window.SLG.GameMap.accumulateWarChange();
    }
    if(window.SLG.WarManager) window.SLG.WarManager.render();

    logSystem(`⚔️ 已建立：${fromCity.name} → ${toCity.name}（${selectedType === 'attack' ? '進攻' : '協防'}）`);

    const cb = onCreated;
    close();
    if(cb) cb();
  }

  function validateWar(from, to, type){
    const state = getState();
    if(!from || !to) return { ok: false, msg: '缺少城池' };
    if(from.id === to.id) return { ok: false, msg: '出兵城與目標城不能相同' };

    const arr = type === 'attack' ? 'attackTargets' : 'defendTargets';
    if((from[arr] || []).some(t => t.cityId === to.id)){
      return { ok: false, msg: `「${from.name}」→「${to.name}」已有${type === 'attack' ? '進攻' : '協防'}指示` };
    }

    if(type === 'attack'){
      const allowed = ATTACK_RULES()[from.side || 'npc'] || [];
      if(!allowed.includes(to.side)){
        return { ok: false, msg: `規則不允許「${from.name}」進攻「${to.name}」` };
      }
    } else if(type === 'assist'){
      if(!from.allianceId || from.allianceId !== to.allianceId){
        return { ok: false, msg: '協防需要出兵城與目標城同屬一個盟' };
      }
      const alliance = state.alliances.find(a => a.id === from.allianceId);
      if(alliance && alliance.name === 'NPC'){
        return { ok: false, msg: 'NPC 盟不能協防' };
      }
    }

    if(!state.settings.crossZoneWarAllowed){
      const zFrom = from.zoneId || '__none__';
      const zTo = to.zoneId || '__none__';
      if(zFrom !== zTo){
        return { ok: false, msg: '跨戰區宣戰已被禁止（可於參數設定開啟）' };
      }
    }

    if(state.settings.warRequireSameMap){
      const ma = getCityMapId ? getCityMapId(from) : '';
      const mb = getCityMapId ? getCityMapId(to) : '';
      if(ma && mb && ma !== mb){
        return {
          ok: false,
          msg: '「宣戰限制同地圖」已開啟：只能對同地圖的城池宣戰。\n\n若要跨圖宣戰，請至 ⚙️ 參數設定關閉此規則。'
        };
      }
    }

    if(type === 'attack' && state.settings.attackRequireRoute){
      if(!window.SLG.findRoute(from.id, to.id)){
        return { ok: false, msg: '此規則要求進攻需有路線接觸' };
      }
    }
    if(type === 'assist'){
      if(!window.SLG.findRoute(from.id, to.id)){
        return { ok: false, msg: '協防需要路線上必須有接觸' };
      }
    }

    return { ok: true };
  }

  return { open, close };
})();

/* ============================================================
   ② MapLibrary — 地圖庫
   ============================================================ */
const MapLibrary = (() => {
  let uploading = false;

  function init(){
    const viewModeSel = document.getElementById('mapLibraryViewMode');
    if(viewModeSel && !viewModeSel.dataset.bound){
      viewModeSel.dataset.bound = '1';
      viewModeSel.value = getState().mapLibrary.viewMode || 'single';
      viewModeSel.addEventListener('change', function(){
        setMapViewMode(this.value);
      });
    }

    const mapSel = document.getElementById('mapLibrarySelect');
    if(mapSel && !mapSel.dataset.bound){
      mapSel.dataset.bound = '1';
      mapSel.addEventListener('change', async function(){
        const id = this.value;
        if(!id){ setActiveMap(''); return; }
        setActiveMap(id);
        try{
          await window.SLG.ensureMapLoaded(id);
          window.SLG.startMapLibraryMapWatcher(id);
        }catch(e){
          console.warn('載入地圖失敗', e);
          alert('❌ 載入地圖失敗：' + e.message);
        }
      });
    }

    const btnUpload = document.getElementById('btnMapUpload');
    if(btnUpload && !btnUpload.dataset.bound){
      btnUpload.dataset.bound = '1';
      btnUpload.addEventListener('click', openUploadModal);
    }

    const btnCalibrate = document.getElementById('btnMapCalibrate');
    if(btnCalibrate && !btnCalibrate.dataset.bound){
      btnCalibrate.dataset.bound = '1';
      btnCalibrate.addEventListener('click', () => {
        const state = getState();
        if(!state.auth.signedIn){ alert('請先登入'); return; }
        if(!state.mapLibrary.activeMapId){ alert('請先選擇一張地圖'); return; }
        NodeCalibration.open(state.mapLibrary.activeMapId);
      });
    }

    const btnExportCoords = document.getElementById('btnMapExportCoords');
    if(btnExportCoords && !btnExportCoords.dataset.bound){
      btnExportCoords.dataset.bound = '1';
      btnExportCoords.addEventListener('click', exportActiveMapCoords);
    }

    const muFile = document.getElementById('mu_file');
    if(muFile && !muFile.dataset.bound){
      muFile.dataset.bound = '1';
      muFile.addEventListener('change', function(){
        const f = this.files && this.files[0];
        if(!f) return;
        const img = new Image();
        const url = URL.createObjectURL(f);
        img.onload = () => {
          const wEl = document.getElementById('mu_width');
          const hEl = document.getElementById('mu_height');
          if(wEl) wEl.value = img.naturalWidth;
          if(hEl) hEl.value = img.naturalHeight;
          URL.revokeObjectURL(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
      });
    }

    const muCancel = document.getElementById('mu_cancel');
    if(muCancel && !muCancel.dataset.bound){
      muCancel.dataset.bound = '1';
      muCancel.addEventListener('click', closeUploadModal);
    }
    const muSubmit = document.getElementById('mu_submit');
    if(muSubmit && !muSubmit.dataset.bound){
      muSubmit.dataset.bound = '1';
      muSubmit.addEventListener('click', doUpload);
    }

    getOn()(EVT().MAP_LIBRARY_UPDATED, (e) => {
      renderSelect();
      renderGallery();
      const vm = getState().mapLibrary.viewMode || 'single';
      const viewModeSel2 = document.getElementById('mapLibraryViewMode');
      if(viewModeSel2 && viewModeSel2.value !== vm) viewModeSel2.value = vm;
      applyViewMode();
    });
  }

  function applyViewMode(){
    const mode = getState().mapLibrary.viewMode || 'single';
    const single = document.getElementById('mapSingleView');
    const gallery = document.getElementById('mapGalleryView');
    const dynamic = document.getElementById('mapDynamicWrap');
    if(!single || !gallery) return;

    if(mode === 'gallery'){
      single.style.display = 'none';
      if(gallery) gallery.style.display = '';
      if(dynamic) dynamic.style.display = 'none';
      renderGallery();
    } else {
      single.style.display = '';
      if(gallery) gallery.style.display = 'none';
    }
  }

  function renderSelect(){
    const sel = document.getElementById('mapLibrarySelect');
    if(!sel) return;
    const state = getState();
    const idx = state.mapLibrary.index || {};
    const ids = Object.keys(idx).sort((a, b) => (idx[b].updatedAt || 0) - (idx[a].updatedAt || 0));

    let html = '<option value="">（尚未選擇地圖）</option>';
    for(const id of ids){
      const m = idx[id];
      const selected = state.mapLibrary.activeMapId === id ? 'selected' : '';
      html += `<option value="${esc(id)}" ${selected}>${esc(m.name || '未命名')}（${m.nodeCount || 0} 節點）</option>`;
    }
    sel.innerHTML = html;

    if(state.mapLibrary.activeMapId && !idx[state.mapLibrary.activeMapId]){
      state.mapLibrary.activeMapId = '';
      if(window.SLG.saveMapLibraryPrefs) window.SLG.saveMapLibraryPrefs();
    }
    sel.value = state.mapLibrary.activeMapId || '';
  }

  function renderGallery(){
    const grid = document.getElementById('mapGalleryGrid');
    if(!grid) return;
    const state = getState();
    const idx = state.mapLibrary.index || {};
    const ids = Object.keys(idx).sort((a, b) => (idx[b].updatedAt || 0) - (idx[a].updatedAt || 0));

    if(ids.length === 0){
      grid.innerHTML = `<div class="map-gallery-empty">
        <div class="icon">🗺️</div>
        <div class="text">尚無地圖<br>點上方「📤 上傳新地圖」建立第一張</div>
      </div>`;
      return;
    }

    const canEdit = !!state.auth.signedIn;
    const isSuper = window.SLG.Auth && window.SLG.Auth.isSuperAdmin();
    const activeId = state.mapLibrary.activeMapId || '';

    grid.innerHTML = ids.map(id => {
      const m = idx[id];
      const isActive = (id === activeId);
      const name = m.name || '未命名';
      const nodeCount = m.nodeCount || 0;
      const timeStr = m.updatedAt ? timeAgo(m.updatedAt) : '—';
      const thumbHtml = m.imageUrl
        ? `<img src="${esc(m.imageUrl)}" alt="${esc(name)}" loading="lazy">`
        : `<div class="map-gallery-thumb-placeholder">🗺️</div>`;
      const activeMark = isActive ? '<span class="active-mark">● 使用中</span>' : '';

      return `<div class="map-gallery-card ${isActive ? 'active' : ''}" data-map-id="${esc(id)}">
        <div class="map-gallery-thumb">
          ${thumbHtml}
          <span class="map-gallery-thumb-badge${nodeCount === 0 ? ' warn' : ''}">${nodeCount} 節點</span>
        </div>
        <div class="map-gallery-body">
          <div class="map-gallery-name" title="${esc(name)}">${esc(name)} ${activeMark}</div>
          <div class="map-gallery-meta">
            <span class="item">📐 <b>${m.imageWidth || 0}×${m.imageHeight || 0}</b></span>
            <span class="item">🕒 <b>${esc(timeStr)}</b></span>
            ${m.updatedByName ? `<span class="item">👤 <b>${esc(m.updatedByName)}</b></span>` : ''}
          </div>
          <div class="map-gallery-actions">
            <button class="btn btn-primary btn-sm" data-action="use">▶️ 使用</button>
            <button class="btn btn-warning btn-sm" data-action="calibrate" ${canEdit?'':'disabled'}>🎯 校準</button>
            <button class="btn btn-ghost btn-sm" data-action="edit" ${canEdit?'':'disabled'}>✏️ 改名</button>
            ${isSuper ? `<button class="btn btn-danger btn-sm" data-action="del">🗑️</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('.map-gallery-card').forEach(card => {
      const id = card.dataset.mapId;
      card.addEventListener('click', async (e) => {
        if(e.target.closest('button')) return;
        await useMap(id);
      });
      const btnUse = card.querySelector('[data-action="use"]');
      if(btnUse) btnUse.addEventListener('click', (e) => { e.stopPropagation(); useMap(id); });
      const btnCal = card.querySelector('[data-action="calibrate"]');
      if(btnCal && canEdit) btnCal.addEventListener('click', (e) => {
        e.stopPropagation();
        NodeCalibration.open(id);
      });
      const btnEdit = card.querySelector('[data-action="edit"]');
      if(btnEdit && canEdit) btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        editMapName(id);
      });
      const btnDel = card.querySelector('[data-action="del"]');
      if(btnDel) btnDel.addEventListener('click', async (e) => {
        e.stopPropagation();
        const m = idx[id];
        if(!confirm(`確定刪除地圖「${m.name}」嗎？\n\n⚠️ 此操作無法復原。`)) return;
        try{
          await window.SLG.deleteMapLibraryMap(id);
          alert('✅ 已刪除');
        }catch(err){ alert('❌ 刪除失敗：' + err.message); }
      });
    });
  }

  async function useMap(id){
    const state = getState();
    if(state.mapLibrary.activeMapId === id) return;
    setActiveMap(id);
    try{
      await window.SLG.ensureMapLoaded(id);
      window.SLG.startMapLibraryMapWatcher(id);
    }catch(e){
      console.warn('載入地圖失敗', e);
      alert('❌ 載入地圖失敗：' + e.message);
    }
  }

  async function editMapName(id){
    const m = getMapMeta(id);
    if(!m) return;
    const newName = prompt('輸入新的地圖名稱：', m.name || '');
    if(newName === null) return;
    const trimmed = String(newName).trim();
    if(!trimmed){ alert('名稱不能為空'); return; }
    if(trimmed === m.name) return;
    try{
      const data = await window.SLG.fetchMapLibraryMap(id);
      await window.SLG.saveMapLibraryMap(id, Object.assign({}, data, { name: trimmed }));
      alert('✅ 已更新名稱');
    }catch(e){ alert('❌ 更新失敗：' + e.message); }
  }

  function openUploadModal(){
    const state = getState();
    if(!state.auth.signedIn){ alert('請先登入'); return; }
    uploading = false;
    const modal = document.getElementById('mapUploadModal');
    if(!modal) return;

    document.getElementById('mu_name').value = '';
    document.getElementById('mu_file').value = '';
    document.getElementById('mu_width').value = '';
    document.getElementById('mu_height').value = '';
    const prog = document.getElementById('mu_progress');
    if(prog) prog.style.display = 'none';
    const bar = document.getElementById('mu_progressBar');
    if(bar) bar.style.width = '0';
    document.getElementById('mu_status').textContent = '';
    const btn = document.getElementById('mu_submit');
    btn.disabled = false;
    btn.textContent = '📤 上傳';
    modal.classList.add('show');
  }

  function closeUploadModal(){
    if(uploading) return;
    const modal = document.getElementById('mapUploadModal');
    if(modal) modal.classList.remove('show');
  }

  async function doUpload(){
    if(uploading){
      console.warn('[MapUpload] 已有上傳進行中，忽略此次點擊');
      return;
    }
    const name = (document.getElementById('mu_name').value || '').trim();
    const fileEl = document.getElementById('mu_file');
    const file = fileEl && fileEl.files ? fileEl.files[0] : null;
    const statusEl = document.getElementById('mu_status');
    const btn = document.getElementById('mu_submit');

    if(!name){ alert('請輸入地圖名稱'); return; }
    if(!file){ alert('請選擇圖片檔案'); return; }
    if(!isOnline()){ alert('離線中，無法上傳'); return; }

    uploading = true;
    btn.disabled = true;
    btn.textContent = '⏳ 上傳中...';
    const prog = document.getElementById('mu_progress');
    if(prog) prog.style.display = '';
    const bar = document.getElementById('mu_progressBar');
    if(statusEl) statusEl.textContent = '上傳至 Cloudinary...';

    try{
      const result = await window.SLG.uploadMapImageToCloudinary(file, (percent) => {
        if(bar) bar.style.width = percent + '%';
        if(statusEl) statusEl.textContent = `上傳至 Cloudinary ${percent}%`;
      });
      if(statusEl) statusEl.textContent = '寫入資料庫...';

      const newId = await window.SLG.saveMapLibraryMap('', {
        name,
        imageUrl: result.secureUrl,
        imageWidth: result.width,
        imageHeight: result.height,
        nodes: {},
      });
      if(statusEl) statusEl.textContent = '✅ 完成！';
      setActiveMap(newId);
      await window.SLG.ensureMapLoaded(newId);
      window.SLG.startMapLibraryMapWatcher(newId);

      setTimeout(() => {
        uploading = false;
        closeUploadModal();
        logSystem(`📤 已上傳新地圖：${name}`);
        const state = getState();
        if(state.cities.length > 0){
          const goCal = confirm(`地圖「${name}」已上傳！\n\n目前有 ${state.cities.length} 座城池，要現在去校準節點嗎？`);
          if(goCal){ NodeCalibration.open(newId); }
        }
      }, 400);
    }catch(e){
      uploading = false;
      btn.disabled = false;
      btn.textContent = '📤 上傳';
      if(statusEl) statusEl.textContent = '❌ ' + (e.message || e);
      console.error(e);
    }
  }

  function exportActiveMapCoords(){
    const state = getState();
    const id = state.mapLibrary.activeMapId;
    if(!id){ alert('請先選擇一張地圖'); return; }
    const map = getLoadedMap(id);
    if(!map){ alert('地圖尚未載入'); return; }

    const nodes = map.nodes || {};
    const count = Object.keys(nodes).length;
    if(count === 0){ alert('此圖尚無節點座標'); return; }

    const payload = {
      mapId: id,
      mapName: map.name || '',
      imageWidth: map.imageWidth || 0,
      imageHeight: map.imageHeight || 0,
      nodeCount: count,
      exportedAt: new Date().toISOString(),
      nodes,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(map.name || 'map').replace(/[\\/:*?"<>|]/g, '_')}_coords.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logSystem(`💾 已匯出 ${count} 個節點座標`);
  }

  return { init, renderSelect, renderGallery, applyViewMode };
})();

/* ============================================================
   ③ NodeCalibration — 節點校準
   ============================================================ */
const NodeCalibration = (() => {
  let mapId = '';
  let mapData = null;
  let imageEl = null;
  let nodes = {};
  let routes = [];
  let activeCityId = '';
  let activeRouteIdx = -1;
  let canvas, ctx, wrapEl;
  let natW = 0, natH = 0;
  let zoom = 1;
  let offsetX = 0, offsetY = 0;
  let isDragging = false;
  let dragStart = null;
  let isManualMode = false;
  let isFixedPointMode = false;
  let fixedPointCityId = '';
  let isAiScanning = false;
  let aiAborted = false;
  let displayW = 0, displayH = 0;
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let pinchStartCenter = null;
  let clickPopupTarget = null;

  let draggingNodeId = null;
  let nodeDragOffset = { x: 0, y: 0 };
  let nodeDragMoved = false;

  async function open(id){
    const state = getState();
    if(!state.auth.signedIn){ alert('請先登入'); return; }
    if(!id){ alert('缺少 mapId'); return; }
    mapId = id;

    const modal = document.getElementById('nodeCalibrationModal');
    if(!modal) return;
    modal.classList.add('show');

    const nameEl = document.getElementById('nc_mapName');
    if(nameEl) nameEl.textContent = '載入中...';

    resetState();

    try{
      const m = await window.SLG.ensureMapLoaded(id);
      mapData = m;
      imageEl = m.imageEl;
      if(!imageEl){ throw new Error('底圖載入失敗'); }
      nodes = JSON.parse(JSON.stringify(m.nodes || {}));
      /* ★ v9.0.3：自動 key 標準化（修復舊資料） */
      nodes = normalizeNodeKeys(nodes, state.cities);
      /* ★ v9.0.3：合併 city.mapNode 到 nodes（同步大地圖新增的節點） */
      nodes = mergeCityMapNodes(nodes, state.cities, mapId);
      natW = imageEl.naturalWidth || mapData.imageWidth || 0;
      if(natW === 0 || natH === 0) throw new Error('圖片尺寸為 0');
      if(nameEl) nameEl.textContent = m.name || '未命名';

      setupCanvas();
      bindEvents();
      fitToWindow();
      renderAll();
      updateProgress();
      updateModeUI();
    }catch(e){
      console.error('校準開啟失敗', e);
      alert('❌ 開啟校準失敗：' + e.message);
      close();
    }
  }

  /* ══════════════════════════════════════════════════════
     ★ v9.0.3：節點 key 標準化
     把所有節點的 key 統一為「城池編號（code）」
     若無 code → 用 'n_' + city.id
     ══════════════════════════════════════════════════════ */
  function normalizeNodeKeys(rawNodes, cities){
    if(!rawNodes || typeof rawNodes !== 'object') return {};
    const result = {};
    const cityByCode = new Map();
    const cityByName = new Map();
    const cityById = new Map();

    for(const c of cities){
      if(c.code) cityByCode.set(c.code, c);
      if(c.name) cityByName.set(c.name, c);
      cityById.set(c.id, c);
    }

    /* ── 第一輪：key 已是城池編號 → 直接保留 ── */
    const pending = [];
    for(const [key, node] of Object.entries(rawNodes)){
      if(!node) continue;
      if(cityByCode.has(key)){
        result[key] = node;
      } else {
        pending.push([key, node]);
      }
    }

    /* ── 第二輪：用 node.code / namedCityId / name 反查 ── */
    let remappedCount = 0;
    let orphanCount = 0;
    for(const [key, node] of pending){
      let targetCity = null;

      /* 用 node.code 反查 */
      if(!targetCity && node.code && cityByCode.has(node.code)){
        targetCity = cityByCode.get(node.code);
      }
      /* 用 node.namedCityId 反查 */
      if(!targetCity && node.namedCityId && cityById.has(node.namedCityId)){
        targetCity = cityById.get(node.namedCityId);
      }
      /* 用 node.name 反查 */
      if(!targetCity && node.name && cityByName.has(node.name)){
        targetCity = cityByName.get(node.name);
      }

      if(targetCity){
        const newKey = targetCity.code || ('n_' + targetCity.id);
        /* 若該城池已存在節點 → 不覆蓋（保留第一輪的） */
        if(!result[newKey]){
          result[newKey] = Object.assign({}, node, {
            name: targetCity.name,
            code: targetCity.code || '',
            namedCityId: targetCity.id,
          });
          remappedCount++;
        }
      } else {
        /* 孤兒節點 → 保留原 key */
        result[key] = node;
        orphanCount++;
      }
    }

    if(remappedCount > 0 || orphanCount > 0){
      console.log(
        `%c[Normalize] 節點 key 標準化：轉換 ${remappedCount} 個，孤兒 ${orphanCount} 個`,
        'color:#22ff88;font-weight:bold'
      );
    }

    return result;
  }

     /* ══════════════════════════════════════════════════════
     ★ v9.0.3：合併 city.mapNode 到 nodes
     用途：大地圖新增/拖曳的節點，寫入 city.mapNode 但未寫回
          地圖庫 nodes。此函式把兩者合併，讓節點校準能看見。
     ══════════════════════════════════════════════════════ */
  function mergeCityMapNodes(nodes, cities, mapId){
    if(!nodes) nodes = {};
    if(!Array.isArray(cities)) return nodes;

    let mergedCount = 0;
    for(const c of cities){
      if(!c.mapNode) continue;
      if(typeof c.mapNode.x !== 'number' || typeof c.mapNode.y !== 'number') continue;
      if(c.mapNode.mapId && c.mapNode.mapId !== mapId) continue;

      const key = c.code || ('n_' + c.id);
      if(nodes[key]) continue;

      nodes[key] = {
        name: c.name,
        code: c.code || '',
        x: Math.round(c.mapNode.x),
        y: Math.round(c.mapNode.y),
        namedCityId: c.id,
        source: c.mapNode.method || 'manual',
      };
      mergedCount++;
    }

    if(mergedCount > 0){
      console.log(
        `%c[Merge] 從 city.mapNode 補進 ${mergedCount} 個節點到節點校準`,
        'color:#22ff88;font-weight:bold'
      );
    }
    return nodes;
  }
   
  function resetState(){
    nodes = {};
    routes = [];
    activeCityId = '';
    activeRouteIdx = -1;
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    isDragging = false;
    dragStart = null;
    isManualMode = false;
    isFixedPointMode = false;
    fixedPointCityId = '';
    isAiScanning = false;
    aiAborted = false;
    clickPopupTarget = null;
    draggingNodeId = null;
    nodeDragOffset = { x: 0, y: 0 };
    nodeDragMoved = false;
  }

  function close(){
    const modal = document.getElementById('nodeCalibrationModal');
    if(modal) modal.classList.remove('show');
    closeClickPopup();
    mapId = '';
    mapData = null;
    imageEl = null;
    resetState();
  }

  function setupCanvas(){
    wrapEl = document.getElementById('nc_canvasWrap');
    canvas = document.getElementById('nc_canvas');
    if(!canvas || !wrapEl) return;
    ctx = canvas.getContext('2d');
    resizeCanvasToZoom();
  }

  function resizeCanvasToZoom(){
    displayW = Math.round(natW * zoom);
    displayH = Math.round(natH * zoom);
    canvas.width = displayW;
    canvas.height = displayH;
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';
  }

  function fitToWindow(){
    if(!wrapEl || natW === 0) return;
    const availW = wrapEl.clientWidth - 4 || 800;
    const availH = wrapEl.clientHeight - 4 || 600;
    const scaleW = availW / natW;
    const scaleH = availH / natH;
    zoom = Math.min(scaleW, scaleH, 2);
    offsetX = 0;
    offsetY = 0;
    resizeCanvasToZoom();
    updateZoomDisplay();
    if(wrapEl){ wrapEl.scrollLeft = 0; wrapEl.scrollTop = 0; }
  }

  function setZoom(newZoom, centerClientX, centerClientY){
    newZoom = Math.max(0.2, Math.min(6, newZoom));
    if(Math.abs(newZoom - zoom) < 0.001) return;

    if(centerClientX !== undefined && wrapEl){
      const rect = wrapEl.getBoundingClientRect();
      const mouseX = centerClientX - rect.left + wrapEl.scrollLeft;
      const mouseY = centerClientY - rect.top + wrapEl.scrollTop;
      const imgX = mouseX / zoom;
      const imgY = mouseY / zoom;

      zoom = newZoom;
      resizeCanvasToZoom();

      const newMouseX = imgX * zoom;
      const newMouseY = imgY * zoom;
      wrapEl.scrollLeft = newMouseX - (centerClientX - rect.left);
      wrapEl.scrollTop = newMouseY - (centerClientY - rect.top);
    } else {
      zoom = newZoom;
      resizeCanvasToZoom();
    }
    updateZoomDisplay();
    renderAll();
  }

  function updateZoomDisplay(){
    const el = document.getElementById('nc_zoomLevel');
    if(el) el.textContent = Math.round(zoom * 100) + '%';
  }

  function clientToImage(clientX, clientY){
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / zoom;
    const y = (clientY - rect.top) / zoom;
    return { x, y };
  }

  function bindEvents(){
    const btnZoomIn = document.getElementById('nc_btnZoomIn');
    if(btnZoomIn && !btnZoomIn.dataset.bound){
      btnZoomIn.dataset.bound = '1';
      btnZoomIn.addEventListener('click', () => setZoom(zoom * 1.25));
    }
    const btnZoomOut = document.getElementById('nc_btnZoomOut');
    if(btnZoomOut && !btnZoomOut.dataset.bound){
      btnZoomOut.dataset.bound = '1';
      btnZoomOut.addEventListener('click', () => setZoom(zoom / 1.25));
    }
    const btnZoomReset = document.getElementById('nc_btnZoomReset');
    if(btnZoomReset && !btnZoomReset.dataset.bound){
      btnZoomReset.dataset.bound = '1';
      btnZoomReset.addEventListener('click', () => {
        setZoom(1);
        if(wrapEl){ wrapEl.scrollLeft = 0; wrapEl.scrollTop = 0; }
      });
    }
    const btnZoomFit = document.getElementById('nc_btnZoomFit');
    if(btnZoomFit && !btnZoomFit.dataset.bound){
      btnZoomFit.dataset.bound = '1';
      btnZoomFit.addEventListener('click', () => { fitToWindow(); renderAll(); });
    }
    const btnAiScan = document.getElementById('nc_btnAiScan');
    if(btnAiScan && !btnAiScan.dataset.bound){
      btnAiScan.dataset.bound = '1';
      btnAiScan.addEventListener('click', startAiScan);
    }
    const btnManual = document.getElementById('nc_btnManualAdd');
    if(btnManual && !btnManual.dataset.bound){
      btnManual.dataset.bound = '1';
      btnManual.addEventListener('click', toggleManualMode);
    }
    const btnFixed = document.getElementById('nc_btnFixedPoint');
    if(btnFixed && !btnFixed.dataset.bound){
      btnFixed.dataset.bound = '1';
      btnFixed.addEventListener('click', toggleFixedPointMode);
    }
    const btnClearAll = document.getElementById('nc_btnClearAll');
    if(btnClearAll && !btnClearAll.dataset.bound){
      btnClearAll.dataset.bound = '1';
      btnClearAll.addEventListener('click', () => {
        if(!confirm('確定要清空所有標記嗎？')) return;
        nodes = {};
        routes = [];
        activeCityId = '';
        activeRouteIdx = -1;
        fixedPointCityId = '';
        renderAll();
        updateProgress();
      });
    }

    document.querySelectorAll('[data-nc-tab]').forEach(btn => {
      if(btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-nc-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.ncTab;
        const cityList = document.getElementById('nc_cityList');
        const routeList = document.getElementById('nc_routeList');
        if(cityList) cityList.style.display = (tab === 'cities') ? '' : 'none';
        if(routeList) routeList.style.display = (tab === 'routes') ? '' : 'none';
      });
    });

    const btnCancel = document.getElementById('nc_cancel');
    if(btnCancel && !btnCancel.dataset.bound){
      btnCancel.dataset.bound = '1';
      btnCancel.addEventListener('click', () => {
        if(Object.keys(nodes).length > 0){
          if(!confirm('有尚未儲存的標記，確定要放棄嗎？')) return;
        }
        close();
      });
    }
    const btnSave = document.getElementById('nc_save');
    if(btnSave && !btnSave.dataset.bound){
      btnSave.dataset.bound = '1';
      btnSave.addEventListener('click', doSave);
    }

    const clickClose = document.getElementById('nc_clickPopupClose');
    if(clickClose && !clickClose.dataset.bound){
      clickClose.dataset.bound = '1';
      clickClose.addEventListener('click', closeClickPopup);
    }

    if(canvas && !canvas.dataset.bound){
      canvas.dataset.bound = '1';
      canvas.addEventListener('click', onClickCanvas);
      canvas.addEventListener('pointerdown', onCanvasPointerDown);
      canvas.addEventListener('pointermove', onCanvasPointerMove);
      canvas.addEventListener('pointerup', onCanvasPointerUp);
      canvas.addEventListener('pointercancel', onCanvasPointerUp);
    }

    if(wrapEl && !wrapEl.dataset.wheelBound){
      wrapEl.dataset.wheelBound = '1';
      wrapEl.addEventListener('wheel', (e) => {
        if(e.ctrlKey || e.metaKey || e.deltaMode === 0){
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
          setZoom(zoom * factor, e.clientX, e.clientY);
        }
      }, { passive: false });

      wrapEl.addEventListener('mousedown', (e) => {
        if(e.target !== canvas && e.target !== wrapEl) return;
        if(draggingNodeId) return;
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY, sx: wrapEl.scrollLeft, sy: wrapEl.scrollTop };
        wrapEl.classList.add('dragging');
      });
      wrapEl.addEventListener('mousemove', (e) => {
        if(!isDragging) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        wrapEl.scrollLeft = dragStart.sx - dx;
        wrapEl.scrollTop = dragStart.sy - dy;
      });
      wrapEl.addEventListener('mouseup', () => {
        isDragging = false;
        wrapEl.classList.remove('dragging');
      });
      wrapEl.addEventListener('mouseleave', () => {
        isDragging = false;
        wrapEl.classList.remove('dragging');
      });

      wrapEl.addEventListener('touchstart', (e) => {
        if(e.touches.length === 2){
          e.preventDefault();
          pinchStartDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          pinchStartZoom = zoom;
          pinchStartCenter = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
          };
        } else if(e.touches.length === 1 && e.target === canvas){
          isDragging = true;
          dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, sx: wrapEl.scrollLeft, sy: wrapEl.scrollTop };
        }
      }, { passive: false });

      wrapEl.addEventListener('touchmove', (e) => {
        if(e.touches.length === 2 && pinchStartDist > 0){
          e.preventDefault();
          const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          const factor = dist / pinchStartDist;
          setZoom(pinchStartZoom * factor, pinchStartCenter.x, pinchStartCenter.y);
        } else if(isDragging && e.touches.length === 1){
          e.preventDefault();
          const dx = e.touches[0].clientX - dragStart.x;
          const dy = e.touches[0].clientY - dragStart.y;
          wrapEl.scrollLeft = dragStart.sx - dx;
          wrapEl.scrollTop = dragStart.sy - dy;
        }
      }, { passive: false });

      wrapEl.addEventListener('touchend', (e) => {
        if(e.touches.length < 2){ pinchStartDist = 0; }
        if(e.touches.length === 0){ isDragging = false; }
      });
    }

    if(!window.__ncResizeBound){
      window.__ncResizeBound = true;
      window.addEventListener('resize', () => {
        const modal = document.getElementById('nodeCalibrationModal');
        if(modal && modal.classList.contains('show') && imageEl){
          renderAll();
        }
      });
    }
  }

  function toggleManualMode(){
    isManualMode = !isManualMode;
    if(isManualMode){ isFixedPointMode = false; fixedPointCityId = ''; }
    updateModeUI();
  }

  function toggleFixedPointMode(){
    isFixedPointMode = !isFixedPointMode;
    if(isFixedPointMode){
      isManualMode = false;
      const next = findNextUnmarkedCity();
      fixedPointCityId = next ? next.id : '';
      activeCityId = fixedPointCityId;
    } else {
      fixedPointCityId = '';
    }
    updateModeUI();
    renderCityList();
    renderAll();
  }

  function updateModeUI(){
    if(wrapEl){
      wrapEl.classList.toggle('manual-mode', isManualMode);
      wrapEl.classList.toggle('fixed-point-mode', isFixedPointMode);
    }
    const btnManual = document.getElementById('nc_btnManualAdd');
    if(btnManual){
      btnManual.textContent = isManualMode ? '✖️ 取消 AI 補點' : '🤖 AI 補點';
      btnManual.classList.toggle('btn-warning', !isManualMode);
    }
    const btnFixed = document.getElementById('nc_btnFixedPoint');
    if(btnFixed){
      btnFixed.textContent = isFixedPointMode ? '✖️ 取消定點' : '🎯 定點模式';
      btnFixed.classList.toggle('active', isFixedPointMode);
    }
    const hint = document.getElementById('nc_canvasHint');
    if(hint){
      if(isFixedPointMode){
        const city = getState().cities.find(c => c.id === fixedPointCityId);
        hint.textContent = city
          ? `🎯 請點圖上「${city.name}」的正確位置`
          : '🎯 請從左側選擇城池，再點圖上位置';
      } else if(isManualMode){
        hint.textContent = '🎯 點圖上位置，AI 將辨識該區域';
      } else {
        hint.textContent = '🖱️ 滾輪縮放、拖曳平移、點擊位置辨識';
      }
    }
  }

  function findNextUnmarkedCity(){
    const state = getState();
    for(const city of state.cities){
      const nid = cityNodeId(city);
      if(!nodes[nid]) return city;
    }
    return null;
  }

  function onCanvasPointerDown(e){
    if(e.pointerType === 'touch') return;
    if(isFixedPointMode || isManualMode) return;
    const imgPos = clientToImage(e.clientX, e.clientY);
    const hit = findNodeAt(imgPos.x, imgPos.y);
    if(hit){
      draggingNodeId = hit.nodeId;
      nodeDragOffset = { x: imgPos.x - hit.node.x, y: imgPos.y - hit.node.y };
      nodeDragMoved = false;
      try{ canvas.setPointerCapture(e.pointerId); }catch(_){}
      e.stopPropagation();
      e.preventDefault();
    }
  }

  function onCanvasPointerMove(e){
    if(!draggingNodeId) return;
    const imgPos = clientToImage(e.clientX, e.clientY);
    const node = nodes[draggingNodeId];
    if(node){
      node.x = Math.round(imgPos.x - nodeDragOffset.x);
      node.y = Math.round(imgPos.y - nodeDragOffset.y);
      nodeDragMoved = true;
      redrawCanvas();
    }
  }

  function onCanvasPointerUp(e){
    if(!draggingNodeId) return;
    const node = nodes[draggingNodeId];
    if(node && nodeDragMoved){
      node.source = 'manual';
    }
    draggingNodeId = null;
    nodeDragMoved = false;
    renderAll();
    updateProgress();
    try{ canvas.releasePointerCapture(e.pointerId); }catch(_){}
    e.stopPropagation();
  }

  async function startAiScan(){
    if(isAiScanning) return;
    if(!window.SLG.detectFullMap){
      alert('❌ AI 辨識模組未載入，請重新整理頁面');
      return;
    }
    if(!confirm('確定要執行 AI 全圖辨識嗎？\n\n這會花 30~90 秒，並消耗智譜 API 額度。')){
      return;
    }

    isAiScanning = true;
    aiAborted = false;

    const progressEl = document.getElementById('nc_aiProgress');
    const progressFill = document.getElementById('nc_aiProgressFill');
    const progressText = document.getElementById('nc_aiProgressText');
    if(progressEl) progressEl.style.display = '';

    const onProgress = (p, text) => {
      if(progressFill) progressFill.style.width = Math.round(p * 100) + '%';
      if(progressText) progressText.textContent = text || '';
    };

    try{
      const result = await window.SLG.detectFullMap(imageEl, onProgress, () => aiAborted);

      let addedCount = 0;
      let mergedCount = 0;

      for(const c of result.cities || []){
        if(!c || !c.name) continue;
        const city = findCityByNameOrCode(c.name, c.code);
        if(!city) continue;
        const nid = cityNodeId(city);
        const existing = nodes[nid];
        if(existing && existing.source === 'manual'){
          mergedCount++;
          continue;
        }
        nodes[nid] = {
          name: city.name,
          code: city.code || '',
          x: c.x,
          y: c.y,
          namedCityId: city.id,
          source: 'ai',
          confidence: c.confidence || 0.8,
        };
        addedCount++;
      }

      routes = (result.routes || []).map(r => ({
        fromName: r.fromName,
        toName: r.toName,
        type: r.type || 'land',
        color: r.color || 'blue',
        source: 'ai',
      }));

      renderAll();
      updateProgress();
      updateRouteCount();

      if(progressText) progressText.textContent = `完成！新增 ${addedCount} 城 / ${routes.length} 路線`;

      setTimeout(() => {
        if(progressEl) progressEl.style.display = 'none';
        isAiScanning = false;
        alert(
          `✅ AI 辨識完成！\n\n` +
          `新增：${addedCount} 座城池\n` +
          `保留手動：${mergedCount} 座\n` +
          `路線：${routes.length} 條\n\n` +
          `請檢查並補正後儲存。`
        );
      }, 500);

    }catch(e){
      console.error('AI 辨識失敗', e);
      if(progressEl) progressEl.style.display = 'none';
      isAiScanning = false;
      alert('❌ AI 辨識失敗：' + e.message);
    }
  }

  async function onClickCanvas(e){
    if(draggingNodeId) return;

    const imgPos = clientToImage(e.clientX, e.clientY);
    const hit = findNodeAt(imgPos.x, imgPos.y);

    if(hit){
      activeCityId = hit.cityId;
      activeRouteIdx = -1;
      renderCityList();
      renderRouteList();
      renderAll();
      return;
    }

    if(isFixedPointMode){
      if(!fixedPointCityId){
        alert('請先從左側選擇一座城池');
        return;
      }
      const city = getState().cities.find(c => c.id === fixedPointCityId);
      if(!city) return;
      applyNodeForCity(fixedPointCityId, imgPos.x, imgPos.y, 'manual');
      const next = findNextUnmarkedCity();
      if(next){
        fixedPointCityId = next.id;
        activeCityId = next.id;
        renderCityList();
        updateModeUI();
        setTimeout(() => {
          const items = document.querySelectorAll('#nc_cityList .nc-item-v3');
          for(const item of items){
            if(item.dataset.cityId === next.id){
              item.scrollIntoView({ behavior: 'smooth', block: 'center' });
              break;
            }
          }
        }, 50);
      } else {
        fixedPointCityId = '';
        activeCityId = '';
        updateModeUI();
        alert('🎉 所有城池都已標記完成！');
      }
      renderAll();
      return;
    }

    if(isManualMode){
      await handleClickDetect(imgPos.x, imgPos.y, e.clientX, e.clientY);
      return;
    }
  }

  async function handleClickDetect(imgX, imgY, clientX, clientY){
    if(!window.SLG.detectAtPoint){
      alert('❌ AI 辨識模組未載入');
      return;
    }
    clickPopupTarget = { x: imgX, y: imgY };
    openClickPopup(clientX, clientY);
    setClickPopupContent('<div class="text-dim">🤖 AI 辨識中...</div>');

    try{
      const radius = Math.round(Math.min(natW, natH) * 0.06);
      const result = await window.SLG.detectAtPoint(imageEl, imgX, imgY, radius);

      if(!result || !result.name){
        renderClickPopupFallback(imgX, imgY);
        return;
      }
      renderClickPopupResult(result, imgX, imgY);
    }catch(e){
      console.error('點擊辨識失敗', e);
      renderClickPopupFallback(imgX, imgY, e.message);
    }
  }

  function openClickPopup(clientX, clientY){
    const popup = document.getElementById('nc_clickPopup');
    if(!popup || !wrapEl) return;

    const wrapRect = wrapEl.getBoundingClientRect();
    let left = clientX - wrapRect.left + wrapEl.scrollLeft + 20;
    let top = clientY - wrapRect.top + wrapEl.scrollTop - 20;
    const popupW = 280;
    const popupH = 400;

    if(left + popupW > displayW - 10){
      left = clientX - wrapRect.left + wrapEl.scrollLeft - popupW - 20;
    }
    if(left < 10) left = 10;
    if(top + popupH > displayH - 10) top = displayH - popupH - 10;
    if(top < 10) top = 10;

    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    popup.classList.remove('hidden');
  }

  function closeClickPopup(){
    const popup = document.getElementById('nc_clickPopup');
    if(popup) popup.classList.add('hidden');
    clickPopupTarget = null;
  }

  function setClickPopupContent(html){
    const body = document.getElementById('nc_clickPopupBody');
    if(body) body.innerHTML = html;
  }

  function renderClickPopupResult(result, imgX, imgY){
    const city = findCityByNameOrCode(result.name, result.code);
    const confPct = Math.round((result.confidence || 0) * 100);

    let html = `<div class="nc-ai-result">
      <div class="nc-ai-result-title">
        <span>${city ? '✅ 匹配成功' : '⚠️ 系統無此城'}</span>
      </div>
      <div class="nc-ai-result-name">
        ${esc(result.name)}
        ${result.code ? `<span class="nc-ai-result-code">${esc(result.code)}</span>` : ''}
      </div>
      <div class="nc-ai-result-conf">信心度：${confPct}%</div>`;

    if(city){
      html += `<div class="nc-ai-result-actions">
        <button class="btn btn-primary btn-sm" data-nc-action="confirm-city" data-city-id="${esc(city.id)}" data-x="${Math.round(imgX)}" data-y="${Math.round(imgY)}">✅ 確認標記</button>
      </div>`;
    } else {
      html += `<div class="text-dim" style="font-size:10px;margin-top:4px;">找不到對應城池，請從下方選擇：</div>
      <div class="nc-fallback-list" id="nc_fallbackList"></div>`;
    }
    html += `</div>`;
    setClickPopupContent(html);

    if(city){
      const btn = document.querySelector('[data-nc-action="confirm-city"]');
      if(btn){
        btn.addEventListener('click', () => {
          const cityId = btn.dataset.cityId;
          const x = parseFloat(btn.dataset.x);
          const y = parseFloat(btn.dataset.y);
          applyNodeForCity(cityId, x, y, 'ai-click');
          closeClickPopup();
        });
      }
    } else {
      renderFallbackList(imgX, imgY, document.getElementById('nc_fallbackList'));
    }
  }

  function renderClickPopupFallback(imgX, imgY, errorMsg){
    let html = `<div class="nc-ai-result" style="border-color:rgba(255,204,0,.4);">
      <div class="nc-ai-result-title" style="color:var(--neon-yellow);">
        <span>⚠️ ${errorMsg ? '辨識失敗' : '無明確結果'}</span>
      </div>
      <div class="text-dim" style="font-size:10px;">請從下方選擇最近的城池：</div>
      <div class="nc-fallback-list" id="nc_fallbackList"></div>
    </div>`;
    setClickPopupContent(html);
    renderFallbackList(imgX, imgY, document.getElementById('nc_fallbackList'));
  }

  function renderFallbackList(imgX, imgY, container){
    if(!container) return;
    const state = getState();

    const sorted = state.cities.map(c => {
      const nid = cityNodeId(c);
      const existing = nodes[nid];
      const dist = existing
        ? Math.hypot(existing.x - imgX, existing.y - imgY)
        : Infinity;
      return { city: c, dist, existing };
    }).sort((a, b) => {
      if(a.existing && !b.existing) return 1;
      if(!a.existing && b.existing) return -1;
      return a.dist - b.dist;
    });

    const top = sorted.slice(0, 15);

    if(top.length === 0){
      container.innerHTML = '<div class="text-dim" style="padding:8px;text-align:center;">無城池資料</div>';
      return;
    }

    container.innerHTML = top.map(item => {
      const isUsed = !!item.existing;
      const distText = isFinite(item.dist) ? `${Math.round(item.dist)}px` : '';
      const codeStr = item.city.code ? ` <span class="nc-item-code">[${esc(item.city.code)}]</span>` : '';
      return `<div class="nc-fallback-item" data-city-id="${esc(item.city.id)}" data-used="${isUsed ? '1' : '0'}">
        <span class="nc-fallback-name">${esc(item.city.name)}${codeStr}${isUsed ? ' <span style="color:var(--neon-green);font-size:9px;">✓</span>' : ''}</span>
        <span class="nc-fallback-dist">${distText}</span>
      </div>`;
    }).join('');

    container.querySelectorAll('.nc-fallback-item').forEach(el => {
      el.addEventListener('click', () => {
        const cityId = el.dataset.cityId;
        applyNodeForCity(cityId, imgX, imgY, 'manual');
        closeClickPopup();
      });
    });
  }

  function applyNodeForCity(cityId, x, y, source){
    const state = getState();
    const city = state.cities.find(c => c.id === cityId);
    if(!city) return;
    const nid = cityNodeId(city);
    nodes[nid] = {
      name: city.name,
      code: city.code || '',
      x: Math.round(x),
      y: Math.round(y),
      namedCityId: city.id,
      source: source || 'manual',
    };
    renderAll();
    updateProgress();
    logSystem(`✅ 已標記：${city.name}${city.code ? ' (' + city.code + ')' : ''}`);
  }

  function findNodeAt(imgX, imgY){
    const threshold = 20 / zoom;
    for(const nid in nodes){
      const n = nodes[nid];
      if(!n || typeof n.x !== 'number') continue;
      const dist = Math.hypot(n.x - imgX, n.y - imgY);
      if(dist < threshold){
        return { nodeId: nid, node: n, cityId: n.namedCityId || '' };
      }
    }
    return null;
  }

  function renderAll(){
    redrawCanvas();
    renderCityList();
    renderRouteList();
    updateRouteCount();
  }

  function redrawCanvas(){
    if(!ctx || !imageEl) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageEl, 0, 0, displayW, displayH);

    /* 路線 */
    for(let i = 0; i < routes.length; i++){
      const r = routes[i];
      const fromCity = findCityByNameOrCode(r.fromName, '');
      const toCity = findCityByNameOrCode(r.toName, '');
      if(!fromCity || !toCity) continue;
      const fromNode = nodes[cityNodeId(fromCity)];
      const toNode = nodes[cityNodeId(toCity)];
      if(!fromNode || !toNode) continue;

      const isActive = (activeRouteIdx === i);
      const dx1 = fromNode.x * zoom, dy1 = fromNode.y * zoom;
      const dx2 = toNode.x * zoom, dy2 = toNode.y * zoom;

      ctx.beginPath();
      ctx.moveTo(dx1, dy1);
      ctx.lineTo(dx2, dy2);
      const color = r.color === 'yellow' ? 'rgba(255,204,0,.7)'
                  : r.color === 'white' ? 'rgba(255,255,255,.7)'
                  : r.color === 'red' ? 'rgba(255,68,102,.7)'
                  : 'rgba(68,170,255,.7)';
      ctx.strokeStyle = isActive ? 'rgba(170,102,255,1)' : color;
      ctx.lineWidth = isActive ? 4 : 2;
      if(r.color === 'yellow' || r.type === 'dashed'){
        ctx.setLineDash([6, 4]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* 未標記城池的灰色占位點 */
    const state = getState();
    for(const c of state.cities){
      const nid = cityNodeId(c);
      if(nodes[nid]) continue;
      let px = null, py = null;
      if(c.mapNode && c.mapNode.mapId === mapId && typeof c.mapNode.x === 'number'){
        px = c.mapNode.x;
        py = c.mapNode.y;
      }
      if(px === null) continue;
      const dx = px * zoom;
      const dy = py * zoom;
      const radius = Math.max(6, Math.min(10, 10 * Math.min(1, zoom)));
      ctx.beginPath();
      ctx.arc(dx, dy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(148,163,184,0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* 節點 */
    for(const nid in nodes){
      const n = nodes[nid];
      if(!n || typeof n.x !== 'number') continue;
      const dx = n.x * zoom;
      const dy = n.y * zoom;
      const isSelected = (n.namedCityId === activeCityId) || (n.namedCityId === fixedPointCityId);
      const isManual = (n.source === 'manual');
      const isDraggingThis = (draggingNodeId === nid);

      let color = '#ffcc00';
      if(isManual) color = '#3b82f6';

      const radius = Math.max(8, Math.min(14, 14 * Math.min(1, zoom)));
      ctx.beginPath();
      ctx.arc(dx, dy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color + 'cc';
      ctx.fill();
      ctx.strokeStyle = isDraggingThis ? '#22ff88' : (isSelected ? '#ffffff' : 'rgba(0,0,0,.7)');
      ctx.lineWidth = isDraggingThis ? 4 : (isSelected ? 3 : 1.5);
      ctx.stroke();

      if(isDraggingThis){
        ctx.beginPath();
        ctx.arc(dx, dy, radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(68,170,255,0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.arc(dx, dy, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();

      if(isSelected && zoom > 0.5 && !draggingNodeId){
        const label = n.code ? `${n.name} (${n.code})` : n.name;
        ctx.font = `bold ${Math.max(11, Math.min(16, 14 * zoom))}px "Noto Sans TC",sans-serif`;
        const tw = ctx.measureText(label).width;
        const bw = tw + 12;
        const bh = 20;
        const lx = dx - bw / 2;
        const ly = dy - radius - bh - 4;

        ctx.fillStyle = 'rgba(255,204,0,.95)';
        if(ctx.roundRect){
          ctx.beginPath();
          ctx.roundRect(lx, ly, bw, bh, 4);
          ctx.fill();
        } else {
          ctx.fillRect(lx, ly, bw, bh);
        }
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, dx, ly + bh / 2);
      }
    }
  }

  function renderCityList(){
    const el = document.getElementById('nc_cityList');
    if(!el) return;
    const state = getState();

    const list = state.cities.map(c => {
      const nid = cityNodeId(c);
      const n = nodes[nid];
      return { city: c, node: n || null, isOrphan: false, nid: nid };
    });

    for(const nid in nodes){
      const n = nodes[nid];
      if(!n) continue;
      let matched = false;
      if(n.namedCityId){
        matched = state.cities.some(c => c.id === n.namedCityId);
      }
      if(!matched){
        list.push({
          city: { id: 'orphan_' + nid, name: n.name || '未匹配節點', code: '' },
          node: n,
          isOrphan: true,
          nid: nid
        });
      }
    }

    if(list.length === 0){
      el.innerHTML = '<div class="text-dim" style="padding:20px;text-align:center;">無城池資料</div>';
      return;
    }

    el.innerHTML = list.map(({ city, node, isOrphan, nid }) => {
      const isNamed = !!node;
      const isSelected = (activeCityId === city.id) || (fixedPointCityId === city.id);
      const isManual = node && node.source === 'manual';
      const isAiClick = node && node.source === 'ai-click';
      const isFixedSel = (fixedPointCityId === city.id);
      const cls = 'nc-item-v3'
        + (isNamed ? ' named' : ' unnamed')
        + (isManual || isAiClick ? ' manual' : '')
        + (isOrphan ? ' orphan' : '')
        + (isFixedSel ? ' fixed-selected' : '')
        + (isSelected ? ' selected' : '');
      const icon = isOrphan ? '⚠️' : (isNamed ? '✅' : '⭕');
      const codeStr = city.code ? `<span class="nc-item-code">${esc(city.code)}</span>` : '';
      const coordStr = node ? `(${node.x}, ${node.y})` : '';
      const sourceStr = node
        ? (node.source === 'ai' ? 'AI' : node.source === 'ai-click' ? 'AI點擊' : '手動')
        : '';
      const deleteBtn = node
        ? `<button class="nc-item-delete" data-delete-id="${esc(isOrphan ? nid : city.id)}" data-is-orphan="${isOrphan}" title="刪除標記">🗑️</button>`
        : '';
      return `<div class="${cls}" data-city-id="${esc(city.id)}">
        <span class="nc-item-icon">${icon}</span>
        <div class="nc-item-body">
          <div class="nc-item-name${isNamed ? '' : ' unnamed'}">${esc(city.name)}${codeStr}</div>
          <div class="nc-item-meta">
            ${coordStr ? `<span class="nc-item-dist">${coordStr}</span>` : ''}
            ${sourceStr ? `<span>${sourceStr}</span>` : ''}
          </div>
        </div>
        ${deleteBtn}
      </div>`;
    }).join('');

    /* 項目點擊 */
    el.querySelectorAll('.nc-item-v3').forEach(item => {
      item.addEventListener('click', (e) => {
        if(e.target.closest('.nc-item-delete')) return;
        const cityId = item.dataset.cityId;
        if(cityId.startsWith('orphan_')) return;

        activeCityId = cityId;
        if(isFixedPointMode){
          fixedPointCityId = cityId;
          updateModeUI();
        }
        activeRouteIdx = -1;
        renderCityList();
        renderRouteList();
        renderAll();

        const city = state.cities.find(c => c.id === cityId);
        if(city){
          const n = nodes[cityNodeId(city)];
          if(n && wrapEl){
            const px = n.x * zoom;
            const py = n.y * zoom;
            wrapEl.scrollTo({
              left: Math.max(0, px - wrapEl.clientWidth / 2),
              top: Math.max(0, py - wrapEl.clientHeight / 2),
              behavior: 'smooth',
            });
          }
        }
      });
    });

    /* 刪除按鈕 */
    el.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const delId = btn.dataset.deleteId;
        const isOrphan = btn.dataset.isOrphan === 'true';

        if(isOrphan){
          if(!nodes[delId]) return;
          if(!confirm(`確定刪除「${nodes[delId].name || '未匹配節點'}」的標記嗎？`)) return;
          delete nodes[delId];
          if(window.SLG.DataSyncManager){
            try{
              if(getState().mapLibrary.activeMapId && window.SLG.removeNodeFromMapLibrary){
                await window.SLG.removeNodeFromMapLibrary(getState().mapLibrary.activeMapId, delId);
              }
            }catch(err){
              console.warn('刪除 Firebase 失敗', err);
            }
            const amn = window.SLG.GameMap?.getActiveMapNodes?.();
            if(amn && amn[delId]) delete amn[delId];
          }
          logSystem(`🗑️ 已刪除孤兒節點：${delId}`);
        } else {
          const city = getState().cities.find(c => c.id === delId);
          if(!city) return;
          const nid = cityNodeId(city);
          if(!nodes[nid]) return;
          if(!confirm(`確定刪除「${city.name}」的標記嗎？\n\n（城池資料保留）`)) return;
          delete nodes[nid];

          if(window.SLG.DataSyncManager){
            try{
              await window.SLG.DataSyncManager.deleteNode(delId, { silent: false });
            }catch(err){
              console.warn('刪除節點失敗', err);
            }
          } else {
            if(city.mapNode){
              delete city.mapNode;
              getState().entityRev.city[city.id] = (getState().entityRev.city[city.id] || 0) + 1;
              if(window.SLG.markDirty) window.SLG.markDirty('city', city.id);
            }
            if(getState().mapLibrary.activeMapId && window.SLG.removeNodeFromMapLibrary){
              window.SLG.removeNodeFromMapLibrary(getState().mapLibrary.activeMapId, nid)
                .catch(err => console.warn('刪除 Firebase 失敗', err));
            }
            const amn = window.SLG.GameMap?.getActiveMapNodes?.();
            if(amn && amn[nid]) delete amn[nid];
          }

          if(fixedPointCityId === delId){ fixedPointCityId = ''; }
          logSystem(`🗑️ 已刪除標記：${city.name}`);
        }

        if(window.SLG.tickLamport) window.SLG.tickLamport();
        if(window.SLG.flushPatches) window.SLG.flushPatches();
        if(window.SLG.saveState) window.SLG.saveState('important');

        if(window.SLG.GameMap && window.SLG.GameMap.invalidateLayout){
          window.SLG.GameMap.invalidateLayout();
        }
        if(window.SLG.GameMap) window.SLG.GameMap.render();

        renderAll();
        updateProgress();
      });
    });
  }

  function renderRouteList(){
    const el = document.getElementById('nc_routeList');
    if(!el) return;
    if(routes.length === 0){
      el.innerHTML = '<div class="text-dim" style="padding:20px;text-align:center;">尚無路線<br><span style="font-size:10px;">執行「AI 辨識全圖」後顯示</span></div>';
      return;
    }
    el.innerHTML = routes.map((r, idx) => {
      const isActive = (activeRouteIdx === idx);
      const colorStr = r.color === 'yellow' ? '🟡' : r.color === 'white' ? '⚪' : r.color === 'red' ? '🔴' : '🔵';
      return `<div class="nc-item-v3${isActive ? ' selected' : ''}" data-route-idx="${idx}">
        <span class="nc-item-icon">${colorStr}</span>
        <div class="nc-item-body">
          <div class="nc-item-name">${esc(r.fromName)} → ${esc(r.toName)}</div>
          <div class="nc-item-meta">
            <span>${r.type === 'land' ? '陸路' : r.type}</span>
          </div>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('[data-route-idx]').forEach(item => {
      item.addEventListener('click', () => {
        activeRouteIdx = parseInt(item.dataset.routeIdx, 10);
        activeCityId = '';
        renderCityList();
        renderRouteList();
        renderAll();
      });
    });
  }

  function updateRouteCount(){
    const el = document.getElementById('nc_routeCount');
    if(el) el.textContent = routes.length;
  }

  function updateProgress(){
    const state = getState();
    const total = state.cities.length;
    const done = Object.keys(nodes).length;
    const doneEl = document.getElementById('nc_doneCount');
    if(doneEl) doneEl.textContent = done;
    const totalEl = document.getElementById('nc_totalCount');
    if(totalEl) totalEl.textContent = total;
    const cityCount = document.getElementById('nc_cityCount');
    if(cityCount) cityCount.textContent = done;
  }

  function findCityByNameOrCode(name, code){
    const state = getState();
    if(!name && !code) return null;
    if(code){
      const byCode = state.cities.find(c => c.code && c.code === code);
      if(byCode) return byCode;
    }
    if(name){
      const byName = state.cities.find(c => c.name === name);
      if(byName) return byName;
      const norm = window.SLG.normalizeCityName ? window.SLG.normalizeCityName(name) : name.toLowerCase();
      const byNorm = state.cities.find(c => {
        const n = window.SLG.normalizeCityName ? window.SLG.normalizeCityName(c.name) : c.name.toLowerCase();
        return n === norm;
      });
      if(byNorm) return byNorm;
    }
    return null;
  }

  function cityNodeId(city){
    if(!city) return '';
    if(city.code) return city.code;
    return 'n_' + city.id;
  }

  async function doSave(){
    if(!mapId) return;
    const state = getState();
    if(!state.auth.signedIn){ alert('請先登入'); return; }

    const nodeCount = Object.keys(nodes).length;
    const routeCount = routes.length;

    if(nodeCount === 0 && routeCount === 0){
      if(!confirm('目前沒有任何標記，確定要儲存（清空）嗎？')) return;
    }

    const msg = `確定要儲存嗎？\n\n` +
      `城池節點：${nodeCount} 個\n` +
      `路線：${routeCount} 條\n\n` +
      `（會覆蓋此圖原有的節點與路線資料）`;

    if(!confirm(msg)) return;

    try{
      await window.SLG.updateMapNodes(mapId, nodes);
      if(routeCount > 0 && window.SLG.saveMapRoutes){
        try{
          await window.SLG.saveMapRoutes(mapId, routes);
        }catch(e){
          console.warn('路線儲存失敗（不影響節點）', e);
        }
      }

      let syncCount = 0;
      let syncFailed = 0;
      for(const nid in nodes){
        const node = nodes[nid];
        if(!node) continue;

        let city = null;
        if(node.namedCityId){
          city = state.cities.find(c => c.id === node.namedCityId);
        }
        if(!city && node.code){
          city = state.cities.find(c => c.code && c.code === node.code);
        }
        if(!city && node.name){
          city = state.cities.find(c => c.name === node.name);
        }
        if(!city){ syncFailed++; continue; }

        if(window.SLG.DataSyncManager){
          window.SLG.DataSyncManager.setNode(city.id, node.x, node.y, {
            source: node.source || 'manual',
            mapId: mapId,
          });
        } else {
          city.mapNode = {
            mapId: mapId,
            nodeId: nid,
            x: node.x,
            y: node.y,
            method: node.source || 'manual',
          };
          state.entityRev.city[city.id] = (state.entityRev.city[city.id] || 0) + 1;
          window.SLG.markDirty('city', city.id);
        }
        syncCount++;
      }

      if(syncCount > 0){
        window.SLG.tickLamport();
        window.SLG.flushPatches();
        window.SLG.saveState('important');
        if(window.SLG.GameMap){
          if(window.SLG.GameMap.invalidateLayout) window.SLG.GameMap.invalidateLayout();
          window.SLG.GameMap.render();
        }
        logSystem(`📍 已同步 ${syncCount} 個節點座標到城池${syncFailed > 0 ? `（${syncFailed} 個找不到對應城池）` : ''}`);
      }

      logSystem(`💾 已儲存 ${nodeCount} 節點 / ${routeCount} 路線${syncCount > 0 ? ` / 同步 ${syncCount} 城` : ''}`);
      alert(`✅ 已儲存 ${nodeCount} 個節點${routeCount > 0 ? ` / ${routeCount} 條路線` : ''}${syncCount > 0 ? `\n📍 已同步 ${syncCount} 個城池座標` : ''}`);
      close();
    }catch(e){
      console.error('儲存失敗', e);
      alert('❌ 儲存失敗：' + e.message);
    }
  }

  return {
    open,
    close,
    rescan: startAiScan,
    getNodes: () => ({ ...nodes }),
    getRoutes: () => routes.slice(),
  };
})();

/* ============================================================
   ④ FuzzyMatch — 模糊匹配候選 Modal
   ============================================================ */
const FuzzyMatch = (() => {
  let queue = [];
  let currentIndex = 0;
  let decisions = {};

  function open(items){
    if(!Array.isArray(items) || items.length === 0) return;
    queue = items.slice();
    currentIndex = 0;
    decisions = {};
    const modal = document.getElementById('fuzzyMatchModal');
    if(!modal) return;
    modal.classList.add('show');
    bindEvents();
    renderCurrent();
  }

  function close(){
    const modal = document.getElementById('fuzzyMatchModal');
    if(modal) modal.classList.remove('show');
    queue = []; currentIndex = 0; decisions = {};
  }

  function bindEvents(){
    const btnConfirm = document.getElementById('fm_confirm');
    if(btnConfirm && !btnConfirm.dataset.bound){
      btnConfirm.dataset.bound = '1';
      btnConfirm.addEventListener('click', () => {
        const selected = document.querySelector('input[name="fm_choice"]:checked');
        if(!selected){ alert('請選擇一個選項'); return; }
        const val = selected.value;
        const item = queue[currentIndex];
        if(!item) return;
        decisions[item.cityId] = (val === '__skip__') ? null : val;
        currentIndex++;
        if(currentIndex >= queue.length){ applyAndClose(); }
        else { renderCurrent(); }
      });
    }

    const btnSkipAll = document.getElementById('fm_skipAll');
    if(btnSkipAll && !btnSkipAll.dataset.bound){
      btnSkipAll.dataset.bound = '1';
      btnSkipAll.addEventListener('click', () => {
        for(let i = currentIndex; i < queue.length; i++) decisions[queue[i].cityId] = null;
        applyAndClose();
      });
    }
  }

  function renderCurrent(){
    const item = queue[currentIndex];
    if(!item){ applyAndClose(); return; }
    const nameEl = document.getElementById('fm_originName');
    if(nameEl){
      const codeStr = item.cityCode ? ` [${item.cityCode}]` : '';
      nameEl.textContent = item.cityName + codeStr;
    }
    const listEl = document.getElementById('fm_candidates');
    if(!listEl) return;
    const candidates = item.candidates || [];
    let html = '';
    let firstChecked = true;
    for(const c of candidates){
      const score = Math.round((c.score || 0) * 100);
      const scoreCls = score >= 80 ? 'high' : (score >= 60 ? '' : 'low');
      const codeStr = c.node.code ? `<span class="fm-candidate-code">[${esc(c.node.code)}]</span>` : '';
      const coordsStr = (typeof c.node.x === 'number') ? `座標 (${c.node.x}, ${c.node.y})` : '';
      html += `<label class="fm-candidate">
        <input type="radio" name="fm_choice" value="${esc(c.nodeId)}" ${firstChecked ? 'checked' : ''}>
        <div class="fm-candidate-body">
          <div class="fm-candidate-name">${esc(c.node.name || '')}${codeStr}</div>
          <div class="fm-candidate-meta">${coordsStr}</div>
        </div>
        <span class="fm-score ${scoreCls}">${score}%</span>
      </label>`;
      firstChecked = false;
    }
    html += `<label class="fm-candidate skip">
      <input type="radio" name="fm_choice" value="__skip__">
      <div class="fm-candidate-body">
        <div class="fm-candidate-name">跳過此城池</div>
        <div class="fm-candidate-meta">稍後可手動指定座標</div>
      </div>
      <span class="fm-score low">—</span>
    </label>`;
    listEl.innerHTML = html;
  }

  function applyAndClose(){
    const state = getState();
    let applied = 0;
    const currentMapId = state.mapLibrary.activeMapId || '';
    for(const cityId in decisions){
      const nodeId = decisions[cityId];
      if(!nodeId) continue;
      const city = state.cities.find(c => c.id === cityId);
      if(!city) continue;
      const map = getLoadedMap(currentMapId);
      if(!map || !map.nodes || !map.nodes[nodeId]) continue;
      const node = map.nodes[nodeId];

      if(window.SLG.DataSyncManager){
        window.SLG.DataSyncManager.setNode(cityId, node.x, node.y, {
          source: 'fuzzy-manual',
          mapId: currentMapId,
        });
      } else {
        city.mapNode = {
          mapId: currentMapId,
          nodeId,
          x: node.x,
          y: node.y,
          method: 'fuzzy-manual',
        };
        state.entityRev.city[cityId] = (state.entityRev.city[cityId] || 0) + 1;
        window.SLG.markDirty('city', cityId);
      }
      applied++;
    }
    if(applied > 0){
      window.SLG.tickLamport();
      window.SLG.flushPatches();
      window.SLG.saveState('important');
      if(window.SLG.GameMap) window.SLG.GameMap.render();
    }
    close();
    if(applied > 0) logSystem(`🔀 已套用 ${applied} 個模糊匹配結果`);
  }

  return { open, close };
})();

/* ============================================================
   ⑤ ★ v9.0.2 新增：AllianceEditModal — 盟編輯 Modal
   ============================================================ */
const AllianceEditModal = (() => {
  let editingId = null;
  let pendingColor = '';
  let eventsBound = false;

  /* ── 開啟 Modal ── */
  function open(allianceId){
    const state = getState();
    const isNew = !allianceId;
    const a = isNew ? null : state.alliances.find(x => x.id === allianceId);

    editingId = allianceId || null;
    pendingColor = a ? (a.color || '') : '';

    /* 標題 */
    document.getElementById('allianceEditTitle').textContent =
      isNew ? '➕ 新增同盟' : `✏️ 編輯同盟：${a ? a.name : ''}`;

    /* 填入表單 */
    document.getElementById('aem_icon').value = a ? (a.icon || '') : '';
    document.getElementById('aem_name').value = a ? a.name : '';
    document.getElementById('aem_side').value = a ? (a.side || 'ally') : 'ally';
    document.getElementById('aem_memberCount').value = a ? (a.memberCount || 100) : 100;
    const yi = a ? (Number(a.totalPower) || 0) / 1e8 : 2;
    document.getElementById('aem_totalPower').value = yi.toFixed(2);

    updateAvgPreview();
    renderIconQuickRow();
    renderColorPicker();

    /* 提示 */
    const hint = document.getElementById('aem_hint');
    if(hint){
      hint.textContent = isNew
        ? '＊新同盟會自動分配顏色（本方=藍、同盟=綠、NPC=灰、敵方從色池取）'
        : '＊本方/同盟/NPC 顏色鎖定，僅敵方可改';
    }

    /* 刪除按鈕 */
    const delBtn = document.getElementById('aem_delete');
    if(delBtn) delBtn.style.display = isNew ? 'none' : '';

    bindEvents();
    document.getElementById('allianceEditModal').classList.add('show');
    setTimeout(() => {
      const nameInput = document.getElementById('aem_name');
      if(nameInput && !isNew) nameInput.focus();
    }, 100);
  }

  /* ── 關閉 Modal ── */
  function close(){
    document.getElementById('allianceEditModal').classList.remove('show');
    editingId = null;
    pendingColor = '';
  }

  /* ── 平均戰力預覽 ── */
  function updateAvgPreview(){
    const mc = parseFloat(document.getElementById('aem_memberCount').value) || 0;
    const yi = parseFloat(document.getElementById('aem_totalPower').value) || 0;
    const total = Math.round(yi * 1e8);
    const avg = mc > 0 ? total / mc : 0;
    const el = document.getElementById('aem_avgPower');
    if(el) el.value = formatAvgPower(avg);
  }

  /* ── 快速選盟徽 ── */
  function renderIconQuickRow(){
    const row = document.getElementById('aem_iconQuickRow');
    if(!row) return;
    const icons = getAllianceIcons() || [];
    const curIcon = document.getElementById('aem_icon').value.trim();
    let html = '';
    for(const icon of icons){
      const used = isAllianceIconUsed(icon, editingId);
      const cls = 'icon-quick' + (used ? ' icon-used' : '') + (icon === curIcon ? ' icon-current' : '');
      html += `<button type="button" class="${cls}" data-icon="${icon}"${used ? ' disabled' : ''}>${icon}</button>`;
    }
    row.innerHTML = html;
  }

  /* ── 顏色選擇器（呼叫 ui-core.js 的 buildAllianceColorPicker） ── */
  function renderColorPicker(){
    const container = document.getElementById('aem_colorPickerContainer');
    if(!container) return;

    const state = getState();
    const alliance = editingId ? state.alliances.find(x => x.id === editingId) : null;
    const side = document.getElementById('aem_side').value;
    const sideLocked = (side === 'self' || side === 'ally' || side === 'npc');
    const lockedColor = window.SLG.SIDE_PRIORITY_COLOR[side];

    /* 若鎖定 → 強制使用鎖定色 */
    if(sideLocked){
      pendingColor = lockedColor;
    } else if(!pendingColor){
      /* 敵方 → 從色池取未使用 */
      const usedColors = new Set(
        state.alliances
          .filter(a => a.id !== editingId && a.color)
          .map(a => a.color)
      );
      for(const c of window.SLG.ALLIANCE_COLOR_PALETTE){
        if(!usedColors.has(c)){ pendingColor = c; break; }
      }
      if(!pendingColor) pendingColor = window.SLG.ALLIANCE_COLOR_PALETTE[0];
    }

    /* 呼叫 ui-core.js 的 buildAllianceColorPicker */
    if(window.SLG.buildAllianceColorPicker){
      window.SLG.buildAllianceColorPicker(container, editingId, pendingColor);
    }
  }

  /* ── 事件綁定（只綁一次） ── */
  function bindEvents(){
    if(eventsBound) return;
    eventsBound = true;

    document.getElementById('aem_cancel')?.addEventListener('click', close);

    document.getElementById('aem_save')?.addEventListener('click', save);

    document.getElementById('aem_delete')?.addEventListener('click', () => {
      if(!editingId) return;
      const state = getState();
      const a = state.alliances.find(x => x.id === editingId);
      if(!a) return;
      window.SLG.showConfirm('刪除同盟', `確定刪除「${a.name}」？\n\n相關城池會變成 NPC。`, () => {
        /* 城池的 allianceId 改為 NPC */
        const npc = ensureNpcAlliance();
        for(const c of state.cities){
          if(c.allianceId === editingId){
            c.allianceId = npc.id;
            c.side = 'npc';
            state.entityRev.city[c.id] = (state.entityRev.city[c.id] || 0) + 1;
            window.SLG.markDirty('city', c.id);
          }
        }
        window.SLG.deleteEntity('alliance', editingId);
        close();
        if(window.SLG.R){
          window.SLG.R.renderAlliances();
          window.SLG.R.renderCities();
          window.SLG.R.renderMatrix();
        }
        if(window.SLG.CityManager) window.SLG.CityManager.render();
        if(window.SLG.GameMap) window.SLG.GameMap.render();
        window.SLG.saveState('important');
      });
    });

    document.getElementById('aem_memberCount')?.addEventListener('input', updateAvgPreview);
    document.getElementById('aem_totalPower')?.addEventListener('input', updateAvgPreview);

    /* 陣營變更 → 重繪顏色選擇器 */
    document.getElementById('aem_side')?.addEventListener('change', () => {
      pendingColor = '';
      renderColorPicker();
    });

    /* 盟徽快速選擇 */
    document.getElementById('aem_iconQuickRow')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.icon-quick');
      if(!btn || btn.disabled) return;
      document.getElementById('aem_icon').value = btn.dataset.icon || '';
      renderIconQuickRow();
    });

    /* 盟徽手動輸入 → 重繪快速選擇 */
    document.getElementById('aem_icon')?.addEventListener('input', renderIconQuickRow);

    /* Enter 儲存 */
    ['aem_name','aem_memberCount','aem_totalPower'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){ e.preventDefault(); save(); }
      });
    });
  }

  /* ── 儲存 ── */
  function save(){
    const state = getState();
    const name = document.getElementById('aem_name').value.trim();
    if(!name){ alert('請輸入盟名稱'); return; }
    if(name.length > 20){ alert('盟名稱最多 20 字'); return; }

    const icon = document.getElementById('aem_icon').value.trim();
    const side = document.getElementById('aem_side').value;
    const memberCount = parseFloat(document.getElementById('aem_memberCount').value) || 0;
    const yi = parseFloat(document.getElementById('aem_totalPower').value) || 0;
    const totalPower = Math.round(yi * 1e8);

    if(memberCount <= 0){ alert('總人數必須大於 0'); return; }

    /* 盟徽檢查 */
    if(icon && isAllianceIconUsed(icon, editingId)){
      alert('❌ 此盟徽已被其他盟使用，請更換');
      return;
    }

    /* 本方唯一性 */
    if(side === 'self'){
      state.alliances.forEach(a => {
        if(a.side === 'self' && a.id !== editingId){
          a.side = 'enemy';
          state.entityRev.alliance[a.id] = (state.entityRev.alliance[a.id] || 0) + 1;
          window.SLG.markDirty('alliance', a.id);
        }
      });
    }

    const id = editingId || uid();
    const existing = state.alliances.find(a => a.id === id);
    let order = existing ? existing.order : null;
    if(typeof order !== 'number'){
      const maxOrder = state.alliances.reduce((m, a) =>
        Math.max(m, typeof a.order === 'number' ? a.order : -1), -1);
      order = maxOrder + 1;
    }

    /* 顏色：從選擇器讀取（若有） */
    const picker = document.getElementById('aem_colorPickerContainer');
    const selectedColor = picker?.dataset.selectedColor || pendingColor;

    const entity = {
      id, name, icon, side, memberCount, totalPower,
      avgPower: totalPower / memberCount,
      power: totalPower,
      order,
      createdAt: existing ? existing.createdAt : Date.now(),
      color: selectedColor,
    };

    window.SLG.upsertEntity('alliance', entity);

    close();

    if(window.SLG.R){
      window.SLG.R.renderAlliances();
      window.SLG.R.renderMatrix();
    }
    if(window.SLG.CityManager) window.SLG.CityManager.render();
    if(window.SLG.GameMap) window.SLG.GameMap.render();
    if(window.SLG.renderOverview) window.SLG.renderOverview();
    window.SLG.saveState('important');
    logSystem(`✅ 已${existing ? '更新' : '新增'}同盟：${name}`);
  }

  return { open, close };
})();

/* ============================================================
   ⑥ 輔助函式
   ============================================================ */

/* ── 匯入城池後的匹配處理 ── */
function onCityImportMatched({ touchedCities, matchResult, mode }){
  if(!matchResult) return;
  if(!matchResult.needChoice || matchResult.needChoice.length === 0) return;
  const items = matchResult.needChoice.map(item => ({
    cityId: item.cityId,
    cityName: item.cityName,
    cityCode: item.cityCode,
    candidates: item.candidates,
  }));
  FuzzyMatch.open(items);
}

/* ── 概覽面板渲染 ── */
function renderOverview(){
  const state = getState();
  const cityCount = state.cities.length;
  const allianceCount = state.alliances.length;
  const zoneCount = state.zones.length;
  const routeCount = (state.routes || []).length;
  let warCount = 0;
  for(const c of state.cities){
    warCount += (c.attackTargets || []).filter(t => t.cityId).length;
    warCount += (c.defendTargets || []).filter(t => t.cityId).length;
  }

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if(el) el.textContent = val;
  };
  setText('ovCityCount', cityCount);
  setText('ovAllianceCount', allianceCount);
  setText('ovZoneCount', zoneCount);
  setText('ovRouteCount', routeCount);
  setText('ovWarCount', warCount);

  const distEl = document.getElementById('overviewAllianceDist');
  if(distEl){
    if(state.alliances.length === 0){
      distEl.innerHTML = '<div class="text-dim">尚未建立同盟</div>';
    } else {
      distEl.innerHTML = state.alliances.map(a => {
        const myCities = state.cities.filter(c => c.allianceId === a.id);
        const allocatedPower = myCities.reduce((s, c) => s + (Number(c.totalPower) || 0), 0);
        const totalPower = Number(a.totalPower) || 0;
        const remain = totalPower - allocatedPower;
        const pct = totalPower > 0 ? Math.round(allocatedPower / totalPower * 100) : 0;
        const cls = pct > 100 ? 'warn' : '';
        const icon = a.icon ? a.icon + ' ' : '';
        const chipCls = a.side === 'self' ? 'self' : (a.side === 'ally' ? 'ally' : 'enemy');
        const remainStyle = remain < 0
          ? 'style="color:var(--neon-red);"'
          : 'style="color:var(--neon-green);"';
        return `<div class="alliance-dist-row">
          <span class="name">${icon}${esc(a.name)}</span>
          <span class="chip ${chipCls}" style="font-size:9px;">${allianceSideLabel(a.side)}</span>
          <span class="num">${formatPower(allocatedPower)} / ${formatPower(totalPower)}</span>
          <div class="bar"><div class="bar-fill ${cls}" style="width:${Math.min(100, pct)}%"></div></div>
          <span class="pct">${pct}%</span>
          <span class="num" ${remainStyle}>餘 ${formatPower(remain)}</span>
          <span class="num" style="color:var(--text-dim);">${myCities.length} 城</span>
        </div>`;
      }).join('');
    }
  }

  const sideEl = document.getElementById('overviewSideDist');
  if(sideEl){
    const sides = [
      { key:'self', label:'本方' }, { key:'ally', label:'同盟' }, { key:'enemy', label:'敵方' },
      { key:'common_enemy', label:'共同敵方' }, { key:'npc', label:'NPC' },
    ];
    const counts = {};
    for(const s of sides) counts[s.key] = 0;
    for(const c of state.cities) counts[c.side] = (counts[c.side] || 0) + 1;
    const total = state.cities.length || 1;
    sideEl.innerHTML = sides.map(s => {
      const n = counts[s.key] || 0;
      const pct = Math.round(n / total * 100);
      return `<div class="overview-side-row">
        <span class="name">${s.label}</span>
        <div class="bar"><div class="bar-fill ${s.key}" style="width:${pct}%"></div></div>
        <span class="num">${n} 城</span>
      </div>`;
    }).join('');
  }
}

/* ============================================================
   距離計算工具
   ============================================================ */
const DistanceTool = (() => {
  let currentResult = null;

  function init(){
    const btn = document.getElementById('btnCalcDistance');
    if(btn && !btn.dataset.bound){
      btn.dataset.bound = '1';
      btn.addEventListener('click', doCalculate);
    }

    const srcSel = document.getElementById('distSrcCity');
    const tgtSel = document.getElementById('distTgtCity');
    [srcSel, tgtSel].forEach(sel => {
      if(sel && !sel.dataset.bound){
        sel.dataset.bound = '1';
        sel.addEventListener('keydown', e => {
          if(e.key === 'Enter'){ e.preventDefault(); doCalculate(); }
        });
      }
    });

    document.querySelectorAll('.distance-view-tab').forEach(tab => {
      if(tab.dataset.bound) return;
      tab.dataset.bound = '1';
      tab.addEventListener('click', function(){
        const view = this.dataset.distView || 'number';
        getState().distanceView = view;
        document.querySelectorAll('.distance-view-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        renderResult();
        if(view === 'map'){
          if(currentResult) setDistanceHighlight(currentResult);
          const mapBtn = document.querySelector('.top-nav button[data-tab="tab-map"]');
          if(mapBtn) mapBtn.click();
          const routeTab = document.querySelector('.map-view-tab[data-map-view="route"]');
          if(routeTab) routeTab.click();
        }
      });
    });
  }

  function populateSelects(){
    const state = getState();
    const srcSel = document.getElementById('distSrcCity');
    const tgtSel = document.getElementById('distTgtCity');
    if(!srcSel || !tgtSel) return;
    const curSrc = srcSel.value, curTgt = tgtSel.value;
    const opts = '<option value="">選擇城池...</option>' +
      state.cities.map(c => {
        const a = state.alliances.find(al => al.id === c.allianceId);
        const icon = (a && a.icon) ? a.icon + ' ' : '';
        const codeStr = c.code ? ' [' + c.code + ']' : '';
        return `<option value="${c.id}">${icon}${esc(c.name)}${codeStr}</option>`;
      }).join('');
    srcSel.innerHTML = opts;
    tgtSel.innerHTML = opts;
    if(curSrc && state.cities.find(c => c.id === curSrc)) srcSel.value = curSrc;
    if(curTgt && state.cities.find(c => c.id === curTgt)) tgtSel.value = curTgt;
  }

  function doCalculate(){
    const state = getState();
    const srcSel = document.getElementById('distSrcCity');
    const tgtSel = document.getElementById('distTgtCity');
    if(!srcSel || !tgtSel) return;
    const srcId = srcSel.value, tgtId = tgtSel.value;
    if(!srcId || !tgtId){ alert('請選擇起點與終點'); return; }
    if(srcId === tgtId){ alert('起點與終點不可相同'); return; }
    const result = computeCityDistance(srcId, tgtId);
    currentResult = result;
    if(!result){ alert('計算失敗'); return; }
    if(state.distanceView === 'map'){ setDistanceHighlight(result); }
    renderResult();
  }

  function renderResult(){
    const el = document.getElementById('distanceResult');
    if(!el) return;
    if(!currentResult){
      el.innerHTML = '<div class="text-dim">請選擇起點與終點後點「計算」</div>';
      return;
    }
    const r = currentResult;
    const view = getState().distanceView || 'number';
    if(view === 'map'){
      el.innerHTML = '<div class="text-dim">已切換至地圖 Tab，並高亮顯示路徑。<br>點擊地圖工具列的「✖️ 清除高亮」可移除。</div>';
      return;
    }
    if(view === 'number') el.innerHTML = renderNumberView(r);
    else if(view === 'path') el.innerHTML = renderPathView(r);
  }

  function getCrossZoneWarning(path){
    if(!path || path.length < 2) return '';
    const state = getState();
    const zoneIds = new Set();
    for(const id of path){
      const c = state.cities.find(x => x.id === id);
      if(c) zoneIds.add(c.zoneId || '');
    }
    if(zoneIds.size <= 1) return '';
    return '<div class="dist-crosszone-warn">⚠️ 此路徑跨越其他戰區，請切到「🌐 全部」檢視（地圖工具列）</div>';
  }

  function renderNumberView(r){
    const srcInfo = `${esc(r.src.name)}（${esc(r.src.allianceName || r.src.side)}）`;
    const tgtInfo = `${esc(r.tgt.name)}（${esc(r.tgt.allianceName || r.tgt.side)}）`;
    let html = `<div style="margin-bottom:8px;font-size:11px;color:var(--text-secondary);">🏁 ${srcInfo} → 🎯 ${tgtInfo}</div>`;
    if(r.passable.found) html += getCrossZoneWarning(r.passable.path);

    if(r.passable.found){
      html += `<div class="dist-block passable">
        <div class="dist-title">✅ 可通行路徑</div>
        <div class="dist-steps">${r.passable.steps} 步</div>
        ${r.passable.conquerNodes.length > 0 ? `<div class="dist-note">⚠️ 需先佔領 ${r.passable.conquerNodes.length} 座 NPC 城</div>` : ''}
      </div>`;
    } else {
      html += `<div class="dist-block no-route">
        <div class="dist-title">❌ 無可通行路徑</div>
        <div class="dist-note">中間城必須是同盟城或 NPC 城</div>
      </div>`;
    }

    if(r.conquer.found){
      const passableSteps = r.passable.found ? r.passable.steps : Infinity;
      const isShorter = r.conquer.steps < passableSteps;
      html += `<div class="dist-block conquer">
        <div class="dist-title">⚡ 最短征服路徑${isShorter ? '（更短）' : ''}</div>
        <div class="dist-steps">${r.conquer.steps} 步</div>
        ${r.conquer.conquerNodes.length > 0 ? `<div class="dist-note warn">⚠️ 需打下 ${r.conquer.conquerNodes.length} 座敵方城</div>` : ''}
      </div>`;
    } else {
      html += `<div class="dist-block no-route">
        <div class="dist-title">❌ 無征服路徑</div>
        <div class="dist-note">兩城之間無任何連通路線</div>
      </div>`;
    }
    return html;
  }

  function renderPathView(r){
    let html = '';
    if(r.passable.found){
      html += `<div class="dist-block passable">
        <div class="dist-title">✅ 可通行路徑 <span class="dist-steps">${r.passable.steps} 步</span></div>
        ${renderPathNodes(r.passable)}
        ${r.passable.conquerNodes.length > 0 ? `<div class="dist-note">⚠️ 需先佔領：${r.passable.conquerNodes.map(id => {
          const c = getState().cities.find(x => x.id === id);
          return c ? c.name + '(NPC)' : '?';
        }).join('、')}</div>` : ''}
        ${getCrossZoneWarning(r.passable.path)}
      </div>`;
    } else {
      html += `<div class="dist-block no-route">
        <div class="dist-title">❌ 無可通行路徑</div>
        <div class="dist-note">中間城必須是同盟城或 NPC 城</div>
      </div>`;
    }

    if(r.conquer.found){
      const passableSteps = r.passable.found ? r.passable.steps : Infinity;
      const isShorter = r.conquer.steps < passableSteps;
      html += `<div class="dist-block conquer">
        <div class="dist-title">⚡ 最短征服路徑${isShorter ? '（更短）' : ''} <span class="dist-steps">${r.conquer.steps} 步</span></div>
        ${renderPathNodes(r.conquer)}
        ${r.conquer.conquerNodes.length > 0 ? `<div class="dist-note warn">⚠️ 需打下：${r.conquer.conquerNodes.map(id => {
          const c = getState().cities.find(x => x.id === id);
          return c ? c.name : '?';
        }).join('、')}</div>` : ''}
      </div>`;
    }
    return html;
  }

  function renderPathNodes(result){
    const nodes = result.nodes;
    const conquerSet = new Set(result.conquerNodes);
    const state = getState();
    let html = '<div class="dist-path">';
    nodes.forEach((n, i) => {
      if(i > 0) html += '<span class="dist-arrow">→</span>';
      let cls = 'dist-node';
      if(n.isSrc) cls += ' src';
      else if(n.isTgt) cls += ' tgt';
      else if(conquerSet.has(n.id)) cls += ' conquer';
      else if(n.isNpc) cls += ' npc';
      const allianceIcon = (() => {
        const a = state.alliances.find(al => al.id === n.allianceId);
        return (a && a.icon) ? a.icon + ' ' : '';
      })();
      const suffix = n.isNpc ? '(NPC)' : (n.allianceName ? `(${n.allianceName})` : '');
      html += `<span class="${cls}">${allianceIcon}${esc(n.name)}${suffix ? ' ' + esc(suffix) : ''}</span>`;
    });
    html += '</div>';
    return html;
  }

  function clear(){
    currentResult = null;
    clearDistanceHighlight();
    renderResult();
  }

  function render(){
    populateSelects();
    renderResult();
  }

  return { init, render, doCalculate, renderResult, clear };
})();

/* ============================================================
   城池數據子 Tab
   ============================================================ */
let currentCityView = 'overview';

function switchCityView(view){
  currentCityView = view;
  document.querySelectorAll('.city-subtab').forEach(t => {
    t.classList.toggle('active', t.dataset.cityView === view);
  });
  document.querySelectorAll('.city-subpanel').forEach(p => {
    p.classList.toggle('active', p.id === 'cityPanel-' + view);
  });

  const R = window.SLG.R;
  if(view === 'overview') renderOverview();
  else if(view === 'zones') { if(R && R.renderZones) R.renderZones(); }
  else if(view === 'cities') { if(window.SLG.CityManager) window.SLG.CityManager.render(); }
  else if(view === 'war') { if(window.SLG.WarManager) window.SLG.WarManager.render(); }
  else if(view === 'deploy') { if(window.SLG.DeployInstr) window.SLG.DeployInstr.render(); }
  else if(view === 'routes'){
    if(window.SLG.RouteManager) window.SLG.RouteManager.render();
    DistanceTool.render();
  }

  try{ localStorage.setItem('slg_city_view_v855', view); }catch(e){}
}

function initCitySubtabs(){
  document.querySelectorAll('.city-subtab').forEach(tab => {
    if(tab.dataset.bound) return;
    tab.dataset.bound = '1';
    tab.addEventListener('click', function(){ switchCityView(this.dataset.cityView); });
  });

  document.querySelectorAll('[data-goto-city-view]').forEach(btn => {
    if(btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function(){
      const view = this.dataset.gotoCityView;
      if(view) switchCityView(view);
    });
  });

  let saved = 'overview';
  try{
    const s = localStorage.getItem('slg_city_view_v855');
    if(s && ['overview','zones','cities','war','deploy','routes'].includes(s)) saved = s;
  }catch(e){}
  switchCityView(saved);
}

/* ============================================================
   房間 UI 更新
   ============================================================ */
function updateRoomEditButton(){
  const btn = document.getElementById('btnRequestRoomEdit');
  if(!btn) return;
  const state = getState();

  if(!window.SLG.isInRoom() || !state.auth.signedIn){ btn.style.display = 'none'; return; }
  if(window.SLG.canEditRoomData()){ btn.style.display = 'none'; return; }

  btn.style.display = '';
  if(state.myEditRequestStatus === 'pending'){
    btn.textContent = '⏳ 已申請，等待審核';
    btn.className = 'btn btn-sm pending';
    btn.disabled = true;
  } else {
    btn.textContent = '📝 申請編輯此房間資料';
    btn.className = 'btn btn-warning btn-sm';
    btn.disabled = false;
  }
}

function updateRoomSandboxActions(){
  const row = document.getElementById('roomSandboxActions');
  const btnUpload = document.getElementById('btnUploadSandboxToRoom');
  const btnDownload = document.getElementById('btnDownloadRoomSandbox');
  if(!row) return;

  if(!window.SLG.isInRoom()){ row.style.display = 'none'; return; }
  row.style.display = '';

  if(btnUpload){
    const canUpload = window.SLG.canUploadSandboxToRoom();
    btnUpload.style.display = canUpload ? '' : 'none';
    btnUpload.disabled = !canUpload;
  }
  if(btnDownload){
    const hasRoom = !!getState().roomHasSnapshot;
    btnDownload.style.display = hasRoom ? '' : 'none';
    btnDownload.disabled = !hasRoom;
  }
}

/* ============================================================
   沙盤數據頁渲染
   ============================================================ */
function renderSandboxData(){
  const state = getState();
  const meName = document.getElementById('sandboxMeName');
  const meTime = document.getElementById('sandboxMeTime');
  const meStats = document.getElementById('sandboxMeStats');

  if(meName){
    meName.textContent = state.auth.signedIn
      ? (state.auth.displayName || state.auth.username || '—')
      : '未登入';
  }
  if(meTime){
    const ts = state.mySandbox.updatedAt;
    meTime.textContent = ts ? `最後更新：${timeAgo(ts)}` : '尚未同步';
  }
  if(meStats){
    meStats.innerHTML = `🏰 城池 <b>${state.cities.length}</b> · 🤝 同盟 <b>${state.alliances.length}</b> · 🗺️ 戰區 <b>${state.zones.length}</b> · 🛣️ 路線 <b>${state.routes.length}</b>`;
  }

  const tbody = document.getElementById('sandboxTableBody');
  if(tbody){
    const list = Object.entries(state.sandboxesList || {})
      .map(([uid, sb]) => ({ uid, ...sb }))
      .filter(sb => {
        const isSelf = sb.uid === state.auth.accountUid;
        if(isSelf) return true;
        return window.SLG.canViewSandboxOf(sb.uid, sb.role || 'member');
      })
      .sort((a, b) => {
        if(a.uid === state.auth.accountUid) return -1;
        if(b.uid === state.auth.accountUid) return 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

    if(list.length === 0){
      tbody.innerHTML = '<tr><td colspan="7" class="sandbox-empty">尚無沙盤資料</td></tr>';
    } else {
      tbody.innerHTML = list.map(sb => {
        const isSelf = sb.uid === state.auth.accountUid;
        const fileName = buildSandboxFileName(sb.displayName, sb.updatedAt);
        const cityCount = sb.data?.cities?.length || 0;
        const allianceCount = sb.data?.alliances?.length || 0;
        const zoneCount = sb.data?.zones?.length || 0;
        return `<tr class="${isSelf ? 'row-self' : ''}">
          <td class="sandbox-name">${esc(fileName)}${isSelf ? ' <span class="chip" style="font-size:9px;color:var(--neon-yellow);">你</span>' : ''}</td>
          <td class="sandbox-owner">${esc(sb.displayName || sb.username || '—')}</td>
          <td class="col-num">${cityCount}</td>
          <td class="col-num">${allianceCount}</td>
          <td class="col-num">${zoneCount}</td>
          <td class="sandbox-time">${esc(timeAgo(sb.updatedAt))}</td>
          <td class="col-actions">
            <button class="btn btn-primary btn-sm" data-action="load-sandbox" data-uid="${sb.uid}" ${isSelf?'disabled':''}>📥 載入</button>
          </td>
        </tr>`;
      }).join('');
    }
  }

  const roomCard = document.getElementById('roomSandboxCard');
  if(roomCard){
    if(window.SLG.canViewRoomSandboxes()){ roomCard.style.display = ''; }
    else { roomCard.style.display = 'none'; }
  }

  const rescueCard = document.getElementById('rescueCard');
  if(rescueCard){
    rescueCard.style.display = window.SLG.canUseRescueTool() ? '' : 'none';
  }

  if(tbody){
    tbody.querySelectorAll('[data-action="load-sandbox"]').forEach(btn => {
      if(btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function(){
        const uid = this.dataset.uid;
        if(typeof window.SLG.loadSandboxFromList === 'function'){
          window.SLG.loadSandboxFromList(uid);
        }
      });
    });
  }

  if(window.SLG.renderSyncStatus) window.SLG.renderSyncStatus();
}

/* ============================================================
   雲端歷史版本
   ============================================================ */
async function renderHistoryList(){
  const listEl = document.getElementById('historyList');
  if(!listEl) return;
  listEl.innerHTML = '<div class="text-dim" style="padding:20px;text-align:center;">載入中...</div>';

  const state = getState();
  if(!state.auth.signedIn){ listEl.innerHTML = '<div class="history-empty">請先登入</div>'; return; }
  if(!isOnline()){
    listEl.innerHTML = '<div class="history-empty">離線中，無法讀取歷史</div>';
    return;
  }

  try{
    const history = await window.SLG.listSandboxHistory();
    if(!history || history.length === 0){
      listEl.innerHTML = '<div class="history-empty">尚無歷史版本<br><span style="font-size:10px;">每次上傳時會自動備份前一版</span><br><span style="font-size:10px;color:var(--neon-yellow);">或按下方「手動建立當前備份」</span></div>';
      return;
    }
    listEl.innerHTML = history.map(h => {
      const time = new Date(h.ts).toLocaleString('zh-TW', {
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      });
      return `<div class="history-item">
        <div class="history-time">${esc(time)}</div>
        <div class="history-info">🏰 <b>${h.citiesCount}</b> 城 / 🤝 <b>${h.alliancesCount}</b> 盟</div>
        <div class="history-actions">
          <button class="btn btn-primary btn-sm" data-history-restore="${h.ts}">↩️ 還原</button>
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('[data-history-restore]').forEach(btn => {
      btn.addEventListener('click', async function(){
        const ts = parseInt(this.dataset.historyRestore, 10);
        if(!ts) return;
        try{
          const ok = await window.SLG.restoreFromHistory(ts);
          if(ok){
            alert('✅ 已還原');
            if(typeof window.SLG.renderAll === 'function') window.SLG.renderAll();
            if(window.SLG.CityManager) window.SLG.CityManager.render();
            if(window.SLG.renderSandboxData) window.SLG.renderSandboxData();
          }
        }catch(e){ alert('❌ 還原失敗：' + e.message); }
      });
    });
  }catch(e){
    console.warn('[History] 讀取失敗', e);
    listEl.innerHTML = '<div class="history-empty">讀取失敗：' + esc(e.message || e) + '</div>';
  }
}

async function createManualBackup(){
  const state = getState();
  if(!state.auth.signedIn){ alert('請先登入'); return; }
  if(!isOnline()){ alert('離線中，無法備份'); return; }
  if(!window.SLG.createSandboxBackup){
    alert('❌ 備份功能未載入');
    return;
  }

  const btn = document.getElementById('btnCreateBackupNow');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ 建立中...'; }

  try{
    const result = await window.SLG.createSandboxBackup();
    alert(`✅ 已建立備份！\n\n時間：${new Date(result.ts).toLocaleString()}\n城池：${result.citiesCount} 座\n同盟：${result.alliancesCount} 個`);
    await renderHistoryList();
  }catch(e){
    alert('❌ 備份失敗：' + (e.message || e));
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '💾 手動建立當前備份'; }
  }
}

/* ============================================================
   盟表單輔助
   ============================================================ */
function updateAllianceAvgPowerPreview(){
  const mc = parseFloat(document.getElementById('allyMemberCount').value) || 0;
  const inputVal = document.getElementById('allyTotalPower').value;
  const totalPower = (() => {
    const n = parseFloat(inputVal);
    if(isNaN(n) || n < 0) return 0;
    return Math.round(n * 1e8);
  })();
  const avg = mc > 0 ? (totalPower / mc) : 0;
  const el = document.getElementById('allyAvgPower');
  if(el) el.value = formatAvgPower(avg);
}

function resetAllianceForm(){
  const state = getState();
  state.editingAllianceId = null;
  document.getElementById('allyFormTitle').textContent = '➕ 新增參戰盟';
  document.getElementById('allyName').value = '';
  document.getElementById('allyIcon').value = '';
  document.getElementById('allySide').value = 'ally';
  document.getElementById('allyMemberCount').value = 100;
  document.getElementById('allyTotalPower').value = '2';
  document.getElementById('btnCancelAllianceEdit').style.display = 'none';
  document.getElementById('btnSaveAlliance').textContent = '💾 儲存';
  updateAllianceAvgPowerPreview();

  const R = window.SLG.R;
  if(R && R.renderIconQuickRow) R.renderIconQuickRow();
  if(R && R.renderAlliances) R.renderAlliances();
}

function startEditAlliance(id){
  const state = getState();
  const a = state.alliances.find(x => x.id === id);
  if(!a) return;
  state.editingAllianceId = id;
  document.getElementById('allyFormTitle').textContent = `✏️ 編輯同盟：${esc(a.name)}`;
  document.getElementById('allyName').value = a.name || '';
  document.getElementById('allyIcon').value = a.icon || '';
  document.getElementById('allySide').value = a.side || 'ally';
  document.getElementById('allyMemberCount').value = a.memberCount || 100;
  const yi = (Number(a.totalPower) || 0) / 1e8;
  document.getElementById('allyTotalPower').value = yi.toFixed(2);
  document.getElementById('btnCancelAllianceEdit').style.display = 'inline-flex';
  document.getElementById('btnSaveAlliance').textContent = '💾 更新';
  updateAllianceAvgPowerPreview();

  const R = window.SLG.R;
  if(R && R.renderIconQuickRow) R.renderIconQuickRow();
  if(R && R.renderAlliances) R.renderAlliances();
}

/* ============================================================
   城池 Modal 分級輸入
   ============================================================ */
let editingCityId = null;
let cityModalTierInited = false;
let pendingMapNode = null;

function updateAutoCalcFields(){
  const t = updateCityModalTierPreview();
  const pInput = document.getElementById('cm_totalPower').value;
  const p = (() => {
    const n = parseFloat(pInput);
    if(isNaN(n) || n < 0) return 0;
    return Math.round(n * 1e8);
  })();
  const el = document.getElementById('cm_avgPower');
  if(!el) return;
  if(t > 0 && p > 0){ el.value = formatAvgPower(Math.floor(p/t)); }
  else { el.value = '—'; }
}

function updateCityModalTierPreview(){
  const state = getState();
  const t1 = parseFloat(document.getElementById('cm_tier1')?.value) || 0;
  const t2 = parseFloat(document.getElementById('cm_tier2')?.value) || 0;
  const t3 = parseFloat(document.getElementById('cm_tier3')?.value) || 0;
  const t4 = parseFloat(document.getElementById('cm_tier4')?.value) || 0;
  const tierCounts = { tier1: t1, tier2: t2, tier3: t3, tier4: t4 };
  const tiers = state.troopTiers.tiers;
  const calc = calcTeamsFromTiers(tierCounts);

  const setText = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  setText('cm_tier1Teams', Math.floor(t1 * (tiers[0].teamsPerPlayer || 0)));
  setText('cm_tier2Teams', Math.floor(t2 * (tiers[1].teamsPerPlayer || 0)));
  setText('cm_tier3Teams', Math.floor(t3 * (tiers[2].teamsPerPlayer || 0)));
  setText('cm_tier4Teams', Math.floor(t4 * (tiers[3].teamsPerPlayer || 0)));
  setText('cm_tierTotalMembers', calc.totalMembers);
  setText('cm_tierTotalTeams', calc.totalTeams);

  return calc.totalTeams;
}

function bindCityModalTierInputs(){
  if(cityModalTierInited) return;
  cityModalTierInited = true;
  ['cm_tier1','cm_tier2','cm_tier3','cm_tier4'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', () => {
      updateCityModalTierPreview();
      updateAutoCalcFields();
    });
  });
}

function openCityModal(cityId, options){
  const state = getState();
  editingCityId = cityId || null;
  const isNew = !editingCityId;
  const city = isNew ? null : state.cities.find(c => c.id === editingCityId);

  pendingMapNode = null;
  if(isNew && options && options.mapNode){
    pendingMapNode = {
      x: Math.round(options.mapNode.x),
      y: Math.round(options.mapNode.y),
    };
  }

  if(!isNew && window.SLG.isConnected && window.SLG.isConnected()){
    window.SLG.acquireEditLock(editingCityId);
  }

  document.getElementById('cityModalTitle').textContent =
    isNew ? '🏰 新增城池' : `✏️ 編輯城池：${city ? city.name : ''}`;

  /* 填地圖下拉 */
  const mapSel = document.getElementById('cm_map');
  if(mapSel){
    const mapIdx = state.mapLibrary.index || {};
    const mapIds = Object.keys(mapIdx).sort((a,b) => (mapIdx[b].updatedAt||0) - (mapIdx[a].updatedAt||0));
    mapSel.innerHTML = '<option value="">（不指定地圖）</option>' +
      mapIds.map(mid =>
        `<option value="${mid}">${esc(mapIdx[mid].name || '未命名')}</option>`
      ).join('');
  }

  const zoneSel = document.getElementById('cm_zone');

  function refreshZoneOptions(){
    const curMapId = mapSel ? mapSel.value : '';
    const zones = curMapId
      ? state.zones.filter(z => !z.mapId || z.mapId === curMapId)
      : state.zones;
    zoneSel.innerHTML = '<option value="">（不指定戰區）</option>' +
      zones.map(z => `<option value="${z.id}">${esc(z.name)}</option>`).join('');
  }
  if(mapSel && !mapSel.dataset.bound){
    mapSel.dataset.bound = '1';
    mapSel.addEventListener('change', refreshZoneOptions);
  }
  refreshZoneOptions();

  const allianceSel = document.getElementById('cm_alliance');
  allianceSel.innerHTML = '<option value="">（不指定 / NPC）</option>' +
    state.alliances.map(a =>
      `<option value="${a.id}">${a.icon ? a.icon + ' ' : ''}${esc(a.name)}（${allianceSideLabel(a.side)}）</option>`
    ).join('');

  if(isNew){
    document.getElementById('cm_name').value = '';
    document.getElementById('cm_code').value = '';
    document.getElementById('cm_side').value = 'self';
    document.getElementById('cm_level').value = 1;
    document.getElementById('cm_totalPower').value = '';
    document.getElementById('cm_cooldownMin').value = 5;
    document.getElementById('cm_wallMin').value = 30;
    document.getElementById('cm_isCapital').checked = false;

    if(mapSel && state.mapLibrary.activeMapId){
      mapSel.value = state.mapLibrary.activeMapId;
      refreshZoneOptions();
    }
    if(state.zones.length > 0) zoneSel.value = state.zones[0].id;

    document.getElementById('cm_tier1').value = 0;
    document.getElementById('cm_tier2').value = 0;
    document.getElementById('cm_tier3').value = 0;
    document.getElementById('cm_tier4').value = 0;
  } else {
    document.getElementById('cm_name').value = city.name;
    document.getElementById('cm_code').value = city.code || '';

    if(mapSel){
      const mapId = (city.mapNode && city.mapNode.mapId)
        || state.zones.find(z => z.id === city.zoneId)?.mapId
        || '';
      mapSel.value = mapId;
      refreshZoneOptions();
    }
    document.getElementById('cm_zone').value = city.zoneId || '';
    document.getElementById('cm_alliance').value = city.allianceId || '';
    document.getElementById('cm_side').value = city.side;
    document.getElementById('cm_level').value = city.level || 1;
    const yi = (Number(city.totalPower) || 0) / 1e8;
    document.getElementById('cm_totalPower').value = yi > 0 ? yi.toFixed(2) : '';
    document.getElementById('cm_cooldownMin').value = city.cooldownMin;
    document.getElementById('cm_wallMin').value = city.wallMin;
    document.getElementById('cm_isCapital').checked = !!city.isCapital;

    const tc = city.tierCounts || { tier1: 0, tier2: 0, tier3: 0, tier4: 0 };
    document.getElementById('cm_tier1').value = tc.tier1 || 0;
    document.getElementById('cm_tier2').value = tc.tier2 || 0;
    document.getElementById('cm_tier3').value = tc.tier3 || 0;
    document.getElementById('cm_tier4').value = tc.tier4 || 0;
  }

  /* 座標提示 */
  const coordsHint = document.getElementById('cm_coordsHint');
  if(coordsHint){
    if(pendingMapNode){
      coordsHint.style.display = '';
      coordsHint.textContent = `📍 座標：（${pendingMapNode.x}, ${pendingMapNode.y}）— 儲存後將固定在此位置`;
    } else {
      coordsHint.style.display = 'none';
    }
  }

  bindCityModalTierInputs();
  updateCityModalTierPreview();
  updateAutoCalcFields();
  document.getElementById('cityModal').classList.add('show');
}

function closeCityModal(){
  const state = getState();
  if(editingCityId && window.SLG.isConnected && window.SLG.isConnected()){
    window.SLG.releaseEditLock(editingCityId);
  }
  delete state.editLocks[editingCityId];
  document.getElementById('cityModal').classList.remove('show');
  editingCityId = null;
  pendingMapNode = null;

  const R = window.SLG.R;
  if(R && R.renderCities) R.renderCities();
  if(window.SLG.CityManager) window.SLG.CityManager.render();
  if(document.getElementById('tab-deploy').classList.contains('active')){
    if(window.SLG.DEPLOY) window.SLG.DEPLOY.render();
  }
}

async function saveCityFromModal(){
  const state = getState();
  const name = document.getElementById('cm_name').value.trim();
  if(!name){ alert('請輸入城池名稱'); return; }

  const code = (document.getElementById('cm_code')?.value || '').trim();
  const mapSel = document.getElementById('cm_map');
  let mapId = mapSel ? mapSel.value : '';
  const zoneId = document.getElementById('cm_zone').value;
  const allianceId = document.getElementById('cm_alliance').value;
  const side = document.getElementById('cm_side').value;
  const level = parseInt(document.getElementById('cm_level').value) || 1;
  const pInput = parseFloat(document.getElementById('cm_totalPower').value) || 0;
  const totalPower = Math.round(pInput * 1e8);
  const cooldownMin = parseFloat(document.getElementById('cm_cooldownMin').value) || 0;
  const wallMin = parseFloat(document.getElementById('cm_wallMin').value) || 0;
  const isCapital = document.getElementById('cm_isCapital').checked;

  if(!mapId && state.mapLibrary.activeMapId){
    const go = confirm(`未選擇所屬地圖。\n\n按「確定」：綁定當前使用中的地圖\n按「取消」：不綁定地圖`);
    if(go){ mapId = state.mapLibrary.activeMapId; }
  }

  const t1 = parseFloat(document.getElementById('cm_tier1').value) || 0;
  const t2 = parseFloat(document.getElementById('cm_tier2').value) || 0;
  const t3 = parseFloat(document.getElementById('cm_tier3').value) || 0;
  const t4 = parseFloat(document.getElementById('cm_tier4').value) || 0;
  const tierCounts = { tier1: t1, tier2: t2, tier3: t3, tier4: t4 };
  const hasAnyTier = (t1 + t2 + t3 + t4) > 0;
  const calc = calcTeamsFromTiers(tierCounts);
  const memberCount = calc.totalMembers;
  const totalTeams = calc.totalTeams;

  const existingCity = editingCityId ? state.cities.find(c => c.id === editingCityId) : null;
  const attackTargets = existingCity ? (existingCity.attackTargets || []) : [];
  const defendTargets = existingCity ? (existingCity.defendTargets || []) : [];
  const defStartTime = existingCity ? (existingCity.defStartTime || '19:00') : '19:00';
  const avgPower = totalTeams > 0 ? Math.floor(totalPower / totalTeams) : 0;
  const id = editingCityId || uid();

  if(isCapital && allianceId){
    state.cities.forEach(c => {
      if(c.allianceId === allianceId && c.isCapital && c.id !== id){
        c.isCapital = false;
        state.entityRev.city[c.id] = (state.entityRev.city[c.id] || 0) + 1;
        window.SLG.markDirty('city', c.id);
      }
    });
  }

  const entity = {
    id, name, code, zoneId, allianceId, side,
    level, memberCount, totalPower, totalTeams, avgPower,
    cooldownMin, wallMin, defStartTime, isCapital,
    attackTargets, defendTargets
  };
  if(hasAnyTier) entity.tierCounts = tierCounts;

  const oldMapId = (existingCity && existingCity.mapNode && existingCity.mapNode.mapId) || '';
  if(mapId !== oldMapId){
    /* 換圖 → 不保留 mapNode */
  } else if(existingCity && existingCity.mapNode){
    entity.mapNode = existingCity.mapNode;
  }

  if(mapId && !entity.mapNode){
    let x, y;
    if(pendingMapNode){
      x = pendingMapNode.x;
      y = pendingMapNode.y;
    } else {
      const hash = (str) => {
        let h = 0;
        for(let k = 0; k < str.length; k++) h = ((h << 5) - h) + str.charCodeAt(k);
        return Math.abs(h);
      };
      const h = hash(id);
      const ang = (h % 360) * Math.PI / 180;
      const r = 400 + (h % 300);
      x = 1000 + Math.cos(ang) * r;
      y = 1000 + Math.sin(ang) * r;
    }
    entity.mapNode = {
      mapId: mapId,
      nodeId: code || ('n_' + id),
      x: Math.round(x),
      y: Math.round(y),
      method: 'manual',
    };
  }

  window.SLG.upsertEntity('city', entity);
  if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(state.cities);

  if(entity.mapNode && mapId && window.SLG.DataSyncManager){
    window.SLG.DataSyncManager.setNode(id, entity.mapNode.x, entity.mapNode.y, {
      source: 'manual',
      mapId: mapId,
    });
  } else if(!mapId && existingCity && existingCity.mapNode && window.SLG.DataSyncManager){
    window.SLG.DataSyncManager.deleteNode(id, { silent: true });
  }

  closeCityModal();

  const R = window.SLG.R;
  if(R && R.renderCities) R.renderCities();
  if(window.SLG.CityManager) window.SLG.CityManager.render();
  if(window.SLG.WarManager) window.SLG.WarManager.render();
  if(window.SLG.DeployInstr) window.SLG.DeployInstr.render();
  if(window.SLG.RouteManager) window.SLG.RouteManager.render();
  if(window.SLG.GameMap){
    if(window.SLG.GameMap.invalidateLayout) window.SLG.GameMap.invalidateLayout();
    window.SLG.GameMap.render();
  }
  if(R && R.renderCityMatrix) R.renderCityMatrix();
  window.SLG.saveState('important');
}

function deployRender(){
  if(window.SLG.DEPLOY) window.SLG.DEPLOY.render();
}

/* ============================================================
   ⑦ 全域暴露
   ============================================================ */
Object.assign(window.SLG, {
  /* 模組 */
  WarQuickPanel,
  MapLibrary,
  NodeCalibration,
  FuzzyMatch,
  AllianceEditModal,   /* ★ v9.0.2 新增 */

  /* 房間 UI */
  updateRoomEditButton,
  updateRoomSandboxActions,

  /* 沙盤數據 */
  renderSandboxData,
  renderHistoryList,
  createManualBackup,

  /* 概覽 / 切換 */
  renderOverview,
  switchCityView,
  initCitySubtabs,

  /* 工具 */
  DistanceTool,
  deployRender,

  /* 盟表單 */
  updateAllianceAvgPowerPreview,
  resetAllianceForm,
  startEditAlliance,

  /* 城池 Modal */
  updateAutoCalcFields,
  updateCityModalTierPreview,
  openCityModal,
  closeCityModal,
  saveCityFromModal,

  /* 匯入匹配 */
  onCityImportMatched,

  /* 快捷別名（盟 inline 編輯，實際由 R 提供） */
  startInlineEditAlliance: (id) => {
    const R = window.SLG.R;
    if(R && R.startInlineEditAlliance) R.startInlineEditAlliance(id);
  },
  cancelInlineEditAlliance: () => {
    const R = window.SLG.R;
    if(R && R.cancelInlineEditAlliance) R.cancelInlineEditAlliance();
  },
  saveInlineEditAlliance: (id) => {
    const R = window.SLG.R;
    if(R && R.saveInlineEditAlliance) return R.saveInlineEditAlliance(id);
    return false;
  },
});

})();
/* ============================================================================
 * ui-modal.js 結束（v9.0.2）
 * ★ v9.0.2 變更摘要：
 *   1. 新增 AllianceEditModal（盟編輯 Modal）
 *      - open(id) / close()
 *      - 顏色選擇器呼叫 window.SLG.buildAllianceColorPicker（從 ui-core.js）
 *      - 刪除盟時：相關城池自動轉為 NPC
 *   2. 刪除重複的 renderAll / renderChat / ... 別名（保留在 ui-core.js）
 *   3. 保留所有原有模組（WarQuickPanel / MapLibrary / NodeCalibration / FuzzyMatch）
 *   4. 保留所有輔助函式（renderOverview / DistanceTool / 城池 Modal 等）
 * ========================================================================== */
