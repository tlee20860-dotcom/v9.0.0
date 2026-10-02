/* ============================================================================
 * js/ui/ui-core.js — v9.1.0
 * 內容：
 *   ① renderSyncStatus — 同步狀態渲染
 *   ② viz            — 態勢圖 / 動態圖 / Canvas 快照
 *   ③ ColumnManager  — 表格欄位摺疊管理器（★ v9.1.0 新增）
 *   ④ R              — 渲染模組（健康 / 房主 / 成員 / 盟 / 矩陣 / 戰區 / 城池 / …）
 *   ⑤ 盟色選擇器
 *   ⑥ 盟色對照表 Modal
 *
 * ★ v9.1.0 新增：
 *   - ColumnManager 模組（5 個表格的欄位顯示/隱藏管理）
 *
 * 依賴：window.SLG（core.js）+ DOM
 * ========================================================================== */
(function(){
'use strict';

window.SLG = window.SLG || {};

/* ── 從全域取得 ── */
const getState = () => window.SLG.state;
const getEmit = () => window.SLG.emit;
const getOn = () => window.SLG.on;
const EVT = () => window.SLG.EVT;
const getAuth = () => window.SLG.Auth;
const uid = () => window.SLG.uid();
const esc = (s) => window.SLG.esc(s);
const logSystem = (t) => window.SLG.logSystem(t);
const timeAgo = (ts) => window.SLG.timeAgo(ts);
const sideLabel = (s) => window.SLG.sideLabel(s);
const allianceSideLabel = (s) => window.SLG.allianceSideLabel(s);
const sideClass = (s) => window.SLG.sideClass(s);
const minutesToHHMM = (m) => window.SLG.minutesToHHMM(m);
const hhmmToMinutes = (h) => window.SLG.hhmmToMinutes(h);
const computeAllocation = (c) => window.SLG.computeAllocation(c);
const formatPower = (n) => window.SLG.formatPower(n);
const formatAvgPower = (n) => window.SLG.formatAvgPower(n);
const getAlliancesSorted = () => window.SLG.getAlliancesSorted();
const reorderAlliances = (ids) => window.SLG.reorderAlliances(ids);
const isAllianceIconUsed = (icon, ex) => window.SLG.isAllianceIconUsed(icon, ex);
const getAllianceIcons = () => window.SLG.getAllianceIcons();
const VIZ_SNAPSHOT_INTERVAL = 5;

/* ============================================================
   ① renderSyncStatus — 同步狀態渲染
   ============================================================ */
let syncCountdownInterval = null;

function renderSyncStatus(){
  const el = document.getElementById('syncStatus');
  const dotEl = document.getElementById('syncDot');
  const textEl = document.getElementById('syncText');
  if(!el || !dotEl || !textEl) return;

  if(syncCountdownInterval){ clearInterval(syncCountdownInterval); syncCountdownInterval = null; }

  const s = getState().sync;
  const auth = getState().auth;
  const sandboxMode = getState().sandboxMode || 'personal';

  el.classList.remove('state-idle','state-synced','state-pending','state-uploading','state-error');

  if(!auth.signedIn){
    dotEl.textContent = '⚪';
    textEl.textContent = '未登入';
    el.classList.add('state-idle');
    el.title = '請先登入';
    return;
  }

  if(sandboxMode === 'shared'){
    const sharedName = getState().activeSharedSandboxName || '共享沙盤';
    const sharedVer = getState().sharedSandboxVersion || 0;
    dotEl.textContent = '📡';
    textEl.textContent = `共享 · v${sharedVer}`;
    el.classList.add('state-synced');
    el.title = `當前模式：共享沙盤「${sharedName}」\n每 5 分鐘自動同步\n點擊查看詳情`;
    return;
  }

  if(s.uploading){
    dotEl.textContent = '⏳';
    textEl.textContent = '同步中...';
    el.classList.add('state-uploading');
    el.title = '正在上傳至雲端' + (s.lastUploadReason ? `（${s.lastUploadReason}）` : '');
    return;
  }

  if(s.lastError){
    dotEl.textContent = '🔴';
    textEl.textContent = '同步失敗';
    el.classList.add('state-error');
    el.title = '同步失敗：' + s.lastError + '\n點擊查看雲端歷史版本';
    return;
  }

  if(s.dirty){
    el.classList.add('state-pending');
    dotEl.textContent = '🟡';
    el.title = `有 ${s.dirtyCount} 筆未上傳變更\n點擊查看雲端歷史版本`;

    const updateCountdown = () => {
      if(!getState().sync.dirty){ renderSyncStatus(); return; }
      if(getState().sync.uploading){ renderSyncStatus(); return; }
      const remain = getState().sync.nextUploadAt - Date.now();
      if(remain <= 0){
        textEl.textContent = `待上傳(${getState().sync.dirtyCount})`;
        return;
      }
      const min = Math.floor(remain / 60000);
      const sec = Math.floor((remain % 60000) / 1000);
      textEl.textContent = `待上傳(${getState().sync.dirtyCount}) ${min}:${String(sec).padStart(2,'0')}`;
    };
    updateCountdown();
    syncCountdownInterval = setInterval(updateCountdown, 1000);
    return;
  }

  dotEl.textContent = '🟢';
  if(s.lastUploadAt){
    const ago = timeAgo(s.lastUploadAt);
    textEl.textContent = `已同步 · ${ago}`;
    el.title = `上次同步：${new Date(s.lastUploadAt).toLocaleString()}\n` +
      (s.lastUploadReason ? `原因：${s.lastUploadReason}\n` : '') +
      `點擊查看雲端歷史版本`;
  } else {
    textEl.textContent = '已同步';
    el.title = '已同步\n點擊查看雲端歷史版本';
  }
  el.classList.add('state-synced');
}

/* ============================================================
   ② viz — 態勢圖（動態圖）
   ============================================================ */
const viz = (() => {
  const NODE_RADIUS = 14;
  let cvStatic, ctxStatic, cvLive, ctxLive, containerEl;
  let layout = { nodes:new Map(), zones:[], bounds:{w:0, h:0} };
  let snapshots = new Map();
  let snapshotSecs = [];
  let currentSec = 0;
  let vizScale = 1;
  let vizPinchStartDist = 0;
  let vizPinchStartScale = 1;
  let baseCanvasW = 0;
  let baseCanvasH = 0;

  function init(){
    containerEl = document.getElementById('vizContainer');
    if(!containerEl) return;
    cvStatic = document.getElementById('vizStatic');
    cvLive = document.getElementById('vizLive');
    if(!cvStatic || !cvLive) return;
    ctxStatic = cvStatic.getContext('2d');
    ctxLive = cvLive.getContext('2d');
    const slider = document.getElementById('vizSlider');
    const timeLabel = document.getElementById('vizTimeLabel');
    if(slider){
      slider.addEventListener('input', () => {
        currentSec = parseInt(slider.value, 10) || 0;
        renderLive(currentSec);
        renderClearPanel(currentSec);
        if(timeLabel) timeLabel.textContent = formatAbsTime(currentSec);
      });
    }
    window.addEventListener('resize', () => {
      if(!containerEl.clientWidth) return;
      computeLayout(); resizeCanvases(); renderStatic(); renderLive(currentSec);
    });
    containerEl.addEventListener('touchstart', (e) => {
      if(e.touches.length === 2){
        vizPinchStartDist = touchDist(e.touches[0], e.touches[1]);
        vizPinchStartScale = vizScale;
      }
    }, { passive: true });
    containerEl.addEventListener('touchmove', (e) => {
      if(e.touches.length === 2 && vizPinchStartDist > 0){
        e.preventDefault();
        const dist = touchDist(e.touches[0], e.touches[1]);
        const newScale = Math.max(0.5, Math.min(4, vizPinchStartScale * dist / vizPinchStartDist));
        if(Math.abs(newScale - vizScale) > 0.02){ vizScale = newScale; applyVizScale(); }
      }
    }, { passive: false });
    containerEl.addEventListener('touchend', (e) => {
      if(e.touches.length < 2){ vizPinchStartDist = 0; }
    }, { passive: true });
    getOn()(EVT().DATA, () => { computeLayout(); resizeCanvases(); renderStatic(); renderLive(currentSec); });
    getOn()(EVT().VIZ_SNAPSHOTS, ({snapshots:s, secs}) => {
      snapshots = s; snapshotSecs = secs;
      if(secs.length > 0){
        if(slider){
          slider.min = secs[0]; slider.max = secs[secs.length-1];
          slider.value = secs[secs.length-1];
        }
        currentSec = secs[secs.length-1];
        if(slider) slider.disabled = false;
        computeLayout(); resizeCanvases();
        renderStatic(); renderLive(currentSec); renderClearPanel(currentSec);
        if(timeLabel) timeLabel.textContent = formatAbsTime(currentSec);
      }
    });
    getOn()(EVT().VIZ_RESET, () => {
      snapshots = new Map(); snapshotSecs = []; currentSec = 0;
      if(slider){ slider.disabled = true; slider.value = 0; }
      if(cvLive) ctxLive.clearRect(0,0,cvLive.width, cvLive.height);
      if(timeLabel) timeLabel.textContent = '尚未推演';
      const panel = document.getElementById('clearPanel');
      if(panel) panel.innerHTML = '<div class="text-dim">尚未推演</div>';
    });
  }

  function touchDist(t1, t2){ return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY); }

  function applyVizScale(){
    if(!cvStatic || !cvLive) return;
    cvStatic.style.width = (baseCanvasW * vizScale) + 'px';
    cvStatic.style.height = (baseCanvasH * vizScale) + 'px';
    cvLive.style.width = (baseCanvasW * vizScale) + 'px';
    cvLive.style.height = (baseCanvasH * vizScale) + 'px';
  }

  function activate(){
    if(!containerEl) return;
    computeLayout(); resizeCanvases();
    renderStatic(); renderLive(currentSec); renderClearPanel(currentSec);
  }

  function formatAbsTime(sec){
    return minutesToHHMM((getState().simBaseMin || 0) + Math.floor(sec/60));
  }

  function getSchedule(maxSec){
    const set = new Set();
    for(let s = 0; s <= maxSec; s += VIZ_SNAPSHOT_INTERVAL) set.add(s);
    set.add(maxSec);
    return [...set];
  }

  function ingestSnapshot(sec, snap){
    snapshots.set(sec, snap);
    if(!snapshotSecs.includes(sec)){ snapshotSecs.push(sec); snapshotSecs.sort((a,b) => a-b); }
  }

  function finalize(){ getEmit()(EVT().VIZ_SNAPSHOTS, {snapshots, secs:snapshotSecs}); }

  function reset(){
    getEmit()(EVT().VIZ_RESET);
    snapshots = new Map(); snapshotSecs = []; currentSec = 0;
  }

  function getAllSnapshots(){
    return { snapEntries:[...snapshots.entries()], secs:snapshotSecs, baseMin: getState().simBaseMin };
  }

  function computeLayout(){
    layout.nodes.clear(); layout.zones = [];
    const state = getState();
    const zonesById = new Map(state.zones.map(z => [z.id, z]));
    const groups = new Map();
    for(const c of state.cities){
      const key = c.zoneId || '__unassigned__';
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    const groupArr = [...groups.entries()];
    const cols = Math.max(1, Math.ceil(Math.sqrt(groupArr.length)));
    const cellW = 340, cellH = 340;
    groupArr.forEach(([zoneId, cities], gi) => {
      const col = gi % cols, row = Math.floor(gi / cols);
      const cx = col * cellW + cellW/2, cy = row * cellH + cellH/2;
      layout.zones.push({ zoneId, name: zonesById.get(zoneId)?.name || '未分配', cx, cy });
      const n = cities.length;
      const R = n === 1 ? 0 : Math.min(cellW, cellH) * 0.32;
      cities.forEach((c, i) => {
        const ang = (i/n) * Math.PI * 2 - Math.PI/2;
        layout.nodes.set(c.id, {
          x: cx + Math.cos(ang)*R, y: cy + Math.sin(ang)*R,
          zoneId, name:c.name, side:c.side, isCapital:!!c.isCapital
        });
      });
    });
    layout.bounds.w = cols * cellW;
    layout.bounds.h = Math.ceil(groupArr.length / cols) * cellH;
  }

  function resizeCanvases(){
    if(!containerEl) return;
    const w = containerEl.clientWidth;
    if(!w || w <= 0){
      [cvStatic, cvLive].forEach(cv => { cv.width = 320; cv.height = 240; });
      baseCanvasW = 320; baseCanvasH = 240;
      return;
    }
    const scale = Math.min(1, w / Math.max(layout.bounds.w, 320));
    const wS = Math.max(320, layout.bounds.w * scale);
    const hS = Math.max(240, layout.bounds.h * scale);
    baseCanvasW = wS; baseCanvasH = hS;
    [cvStatic, cvLive].forEach(cv => {
      cv.width = wS; cv.height = hS;
      cv.style.width = (wS * vizScale) + 'px';
      cv.style.height = (hS * vizScale) + 'px';
    });
    ctxStatic.setTransform(scale, 0, 0, scale, 0, 0);
    ctxLive.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function renderStatic(){
    if(!ctxStatic) return;
    const state = getState();
    ctxStatic.clearRect(0, 0, cvStatic.width, cvStatic.height);
    for(const z of layout.zones){
      const r = 160;
      ctxStatic.beginPath(); ctxStatic.arc(z.cx, z.cy, r, 0, Math.PI*2);
      ctxStatic.strokeStyle = 'rgba(59,130,246,0.2)'; ctxStatic.lineWidth = 1;
      ctxStatic.setLineDash([4,6]); ctxStatic.stroke(); ctxStatic.setLineDash([]);
      ctxStatic.font = '11px sans-serif'; ctxStatic.fillStyle = 'rgba(148,163,184,0.7)';
      ctxStatic.textAlign = 'center';
      ctxStatic.fillText(z.name, z.cx, z.cy - r - 6);
    }
    for(const c of state.cities){
      const from = layout.nodes.get(c.id);
      if(!from) continue;
      for(const t of (c.attackTargets || [])){
        if((t.preWarPercent||0)<=0 || !t.cityId) continue;
        const to = layout.nodes.get(t.cityId); if(!to) continue;
        drawArrow(ctxStatic, from, to, 'rgba(255,68,102,0.35)', t.preWarPercent);
      }
      for(const t of (c.defendTargets || [])){
        if((t.preWarPercent||0)<=0 || !t.cityId) continue;
        const to = layout.nodes.get(t.cityId); if(!to) continue;
        drawArrow(ctxStatic, from, to, 'rgba(34,255,136,0.28)', t.preWarPercent);
      }
    }
    for(const c of state.cities){
      const p = layout.nodes.get(c.id); if(!p) continue;
      drawNode(ctxStatic, p, c.side, false);
    }
  }

  function drawNode(ctx, p, side, fallen){
    const color = side==='self' ? '#3b82f6' : side==='ally' ? '#10b981'
                : side==='enemy' ? '#ef4444' : side==='common_enemy' ? '#f59e0b'
                : side==='npc' ? '#a855f7' : '#64748b';
    ctx.beginPath(); ctx.arc(p.x, p.y, NODE_RADIUS, 0, Math.PI*2);
    ctx.fillStyle = fallen ? '#1a1a1a' : color; ctx.fill();
    ctx.strokeStyle = fallen ? '#7f1d1d' : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2; ctx.stroke();
    if(p.isCapital){
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffcc00';
      ctx.fillText('👑', p.x, p.y - NODE_RADIUS - 10);
    }
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    const label = p.name.length > 6 ? p.name.slice(0,6)+'…' : p.name;
    ctx.fillText(label, p.x, p.y + NODE_RADIUS + 12);
  }

  function drawArrow(ctx, from, to, color, pct){
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if(dist < 1) return;
    const ux = dx/dist, uy = dy/dist;
    const sx = from.x + ux*NODE_RADIUS, sy = from.y + uy*NODE_RADIUS;
    const ex = to.x - ux*NODE_RADIUS, ey = to.y - uy*NODE_RADIUS;
    const mx = (sx+ex)/2, my = (sy+ey)/2;
    const co = dist * 0.12;
    const cx = mx - uy*co, cy = my + ux*co;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, ex, ey);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, Math.min(4, pct/25));
    ctx.stroke();
    const ang = Math.atan2(ey-cy, ex-cx);
    ctx.beginPath(); ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(ang-0.4)*8, ey - Math.sin(ang-0.4)*8);
    ctx.lineTo(ex - Math.cos(ang+0.4)*8, ey - Math.sin(ang+0.4)*8);
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }

  function renderLive(sec){
    if(!ctxLive) return;
    const state = getState();
    ctxLive.clearRect(0, 0, cvLive.width, cvLive.height);
    const snap = lookupSnapshot(sec);
    if(!snap) return;
    const snapById = new Map(snap.map(s => [s.id, s]));
    for(const c of state.cities){
      const p = layout.nodes.get(c.id); if(!p) continue;
      const s = snapById.get(c.id); if(!s) continue;
      if(!s.f && s.si > 0){
        ctxLive.beginPath();
        ctxLive.arc(p.x, p.y, NODE_RADIUS + 7, 0, Math.PI*2);
        ctxLive.strokeStyle = 'rgba(255,68,102,0.7)';
        ctxLive.lineWidth = 2;
        ctxLive.setLineDash([3,3]); ctxLive.stroke(); ctxLive.setLineDash([]);
      }
      let ringColor = null, ringW = 2;
      if(s.f){ ringColor = '#ef4444'; ringW = 3; }
      else if(s.w < (c.wallMin*60)*0.3){ ringColor = '#f59e0b'; ringW = 2.5; }
      else if(s.r > 0){ ringColor = '#22ff88'; ringW = 1.5; }
      if(ringColor){
        ctxLive.beginPath();
        ctxLive.arc(p.x, p.y, NODE_RADIUS+4, 0, Math.PI*2);
        ctxLive.strokeStyle = ringColor;
        ctxLive.lineWidth = ringW;
        ctxLive.stroke();
      }
      if(!s.f){
        ctxLive.font = 'bold 9px sans-serif';
        ctxLive.textAlign = 'center'; ctxLive.textBaseline = 'middle';
        ctxLive.fillStyle = '#e2e8f0';
        ctxLive.fillText(`${Math.round(s.r)}/${Math.round(s.r + s.o + s.c)}`, p.x, p.y - NODE_RADIUS - 8);
        if(s.si > 0){
          ctxLive.font = 'bold 9px sans-serif';
          ctxLive.fillStyle = '#ff4466';
          ctxLive.fillText(`⚡${Math.round(s.si)}`, p.x, p.y + NODE_RADIUS + 24);
        }
      } else {
        ctxLive.font = 'bold 10px sans-serif';
        ctxLive.textAlign = 'center'; ctxLive.textBaseline = 'middle';
        ctxLive.fillStyle = '#ef4444';
        ctxLive.fillText('✕', p.x, p.y);
      }
    }
  }

  function lookupSnapshot(sec){
    if(snapshotSecs.length === 0) return null;
    if(snapshots.has(sec)) return snapshots.get(sec);
    let lo = 0, hi = snapshotSecs.length-1, best = 0;
    while(lo <= hi){
      const mid = (lo+hi) >> 1;
      if(snapshotSecs[mid] <= sec){ best = snapshotSecs[mid]; lo = mid+1; }
      else hi = mid-1;
    }
    return snapshots.get(best);
  }

  function renderClearPanel(sec){
    const panel = document.getElementById('clearPanel');
    if(!panel) return;
    const state = getState();
    const snap = lookupSnapshot(sec);
    if(!snap){ panel.innerHTML = '<div class="text-dim">尚未推演</div>'; return; }
    const absTime = formatAbsTime(sec);
    const snapById = new Map(snap.map(s => [s.id, s]));
    let html = `<div class="clear-panel-title"><span>📊 瞬間清算</span><span class="time">${esc(absTime)}</span></div>`;
    for(const c of state.cities){
      const s = snapById.get(c.id);
      if(!s) continue;
      const fallenCls = s.f ? 'fallen' : '';
      const a = state.alliances.find(al => al.id === c.allianceId);
      const icon = (a && a.icon) ? a.icon + ' ' : '';
      html += `<div class="clear-city ${fallenCls}">
        <div class="name"><span>${c.isCapital ? '👑 ' : ''}${esc(c.name)} <span class="chip ${sideClass(c.side)}" style="font-size:9px;">${esc(icon)}${sideLabel(c.side)}</span></span>${s.f ? '<span style="color:var(--neon-red);font-size:10px;">✕ 已淪陷</span>' : ''}</div>
        <div class="stat-grid">
          <div class="stat-item"><span class="lbl">🛡️ 剩餘可戰</span><span class="val" style="color:#22ff88;">${Math.round(s.r)}</span></div>
          <div class="stat-item"><span class="lbl">⚔️ 外出</span><span class="val" style="color:#44aaff;">${Math.round(s.o)}</span></div>
          <div class="stat-item"><span class="lbl">💤 冷卻</span><span class="val" style="color:#94a3b8;">${Math.round(s.c)}</span></div>
          <div class="stat-item"><span class="lbl">🏰 城牆</span><span class="val" style="color:#ffcc00;">${(s.w/60).toFixed(1)} 分</span></div>
        </div>
      </div>`;
    }
    panel.innerHTML = html;
  }

  return {
    init, activate, getSchedule, ingestSnapshot, finalize, reset,
    getAllSnapshots, renderLive, renderClearPanel
  };
})();

/* ============================================================
   ③ ★ v9.1.0 新增：ColumnManager — 表格欄位摺疊管理器
   ============================================================ */
const ColumnManager = (() => {
  /* 已註冊的表格：{ tableId: { columns, prefs, panelEl, btnEl } } */
  const registry = new Map();

  /* 預設手機建議的欄位（每個表格不同） */
  const MOBILE_SUGGEST = {
    alliances: ['name', 'members', 'power', 'actions'],
    cities:    ['name', 'members', 'teams', 'location', 'actions'],
    war:       ['src', 'type', 'tgt', 'actions'],
    deploy:    ['src', 'tgt', 'pre', 'priority'],
    dyn:       ['time', 'src', 'tgt', 'wall'],
  };

  /* ══════════════════════════════════════════════════════
     儲存 / 載入偏好
     ══════════════════════════════════════════════════════ */
  function storageKey(tableId){
    return `slg_col_prefs_${tableId}`;
  }

  function loadPrefs(tableId, columns){
    try{
      const raw = localStorage.getItem(storageKey(tableId));
      if(raw){
        const parsed = JSON.parse(raw);
        if(parsed && parsed.version === 1 && parsed.visible){
          /* 合併：保留已存在的，移除已不存在的，加入新的（預設顯示）*/
          const result = {};
          for(const col of columns){
            if(col.fixed){
              result[col.key] = true;
            } else if(typeof parsed.visible[col.key] === 'boolean'){
              result[col.key] = parsed.visible[col.key];
            } else {
              result[col.key] = true;
            }
          }
          return result;
        }
      }
    }catch(e){ console.warn('[ColumnManager] 讀取偏好失敗', e); }

    /* 預設：全部顯示 */
    const result = {};
    for(const col of columns) result[col.key] = true;
    return result;
  }

  function savePrefs(tableId){
    const entry = registry.get(tableId);
    if(!entry) return;
    try{
      localStorage.setItem(storageKey(tableId), JSON.stringify({
        version: 1,
        visible: entry.prefs,
        updatedAt: Date.now(),
      }));
    }catch(e){ console.warn('[ColumnManager] 儲存偏好失敗', e); }
  }

  /* ══════════════════════════════════════════════════════
     註冊表格
     ══════════════════════════════════════════════════════ */
  function register(tableId, columns, opts = {}){
    /* 若已註冊 → 只更新 columns 與 prefs */
    let entry = registry.get(tableId);
    if(!entry){
      entry = {
        tableId,
        columns,
        prefs: loadPrefs(tableId, columns),
        btnEl: null,
        panelEl: null,
      };
      registry.set(tableId, entry);
    } else {
      entry.columns = columns;
      /* 保留已存的 prefs，補上新的欄位 */
      for(const col of columns){
        if(typeof entry.prefs[col.key] !== 'boolean'){
          entry.prefs[col.key] = true;
        }
      }
    }

    /* 若 opts.autoApply → 立即套用 */
    if(opts.autoApply !== false){
      setTimeout(() => applyPrefs(tableId), 0);
    }
    return entry;
  }

  /* ══════════════════════════════════════════════════════
     套用偏好到表格（顯示 / 隱藏欄位）
     ══════════════════════════════════════════════════════ */
  function applyPrefs(tableId){
    const entry = registry.get(tableId);
    if(!entry) return;

    const table = document.querySelector(`[data-col-table="${tableId}"]`);
    if(!table) return;

    /* 對每個 th / td 處理 */
const allCells = table.querySelectorAll('th[data-col-key], td[data-col-key]');
allCells.forEach(cell => {
  const key = cell.dataset.colKey;
  if(!key) return;
  const visible = entry.prefs[key] !== false;
  cell.classList.toggle('col-hidden', !visible);
  /* ★ v9.1.1：inline style 雙保險 */
  cell.style.display = visible ? '' : 'none';
});

    /* 更新按鈕計數 */
    updateBtnCount(tableId);

    /* 標記表格有隱藏欄位 */
    table.dataset.colHidden = Object.values(entry.prefs).some(v => !v) ? '1' : '';
  }

  /* ══════════════════════════════════════════════════════
     切換單一欄位
     ══════════════════════════════════════════════════════ */
  function toggle(tableId, colKey){
    const entry = registry.get(tableId);
    if(!entry) return;
    const col = entry.columns.find(c => c.key === colKey);
    if(!col || col.fixed) return;    /* 固定欄位不可切換 */

    entry.prefs[colKey] = !entry.prefs[colKey];
    savePrefs(tableId);
    applyPrefs(tableId);
    renderPanel(tableId);    /* 重繪面板（更新勾選狀態） */
  }

  /* ══════════════════════════════════════════════════════
     全部顯示 / 隱藏
     ══════════════════════════════════════════════════════ */
  function showAll(tableId){
    const entry = registry.get(tableId);
    if(!entry) return;
    for(const col of entry.columns){
      entry.prefs[col.key] = true;
    }
    savePrefs(tableId);
    applyPrefs(tableId);
    renderPanel(tableId);
  }

  function hideAll(tableId){
    const entry = registry.get(tableId);
    if(!entry) return;
    for(const col of entry.columns){
      if(!col.fixed) entry.prefs[col.key] = false;
    }
    savePrefs(tableId);
    applyPrefs(tableId);
    renderPanel(tableId);
  }

  /* ══════════════════════════════════════════════════════
     手機建議
     ══════════════════════════════════════════════════════ */
  function applyMobileSuggested(tableId){
    const entry = registry.get(tableId);
    if(!entry) return;
    const suggested = MOBILE_SUGGEST[tableId] || [];
    for(const col of entry.columns){
      if(col.fixed){
        entry.prefs[col.key] = true;
      } else {
        entry.prefs[col.key] = suggested.includes(col.key);
      }
    }
    savePrefs(tableId);
    applyPrefs(tableId);
    renderPanel(tableId);
    logSystem(`📱 已套用「${tableId}」手機建議欄位`);
  }

  /* ══════════════════════════════════════════════════════
     重置為預設（全部顯示）
     ══════════════════════════════════════════════════════ */
  function resetDefaults(tableId){
    const entry = registry.get(tableId);
    if(!entry) return;
    for(const col of entry.columns){
      entry.prefs[col.key] = true;
    }
    savePrefs(tableId);
    applyPrefs(tableId);
    renderPanel(tableId);
    logSystem(`🔄 已重置「${tableId}」欄位偏好`);
  }

  /* ══════════════════════════════════════════════════════
     渲染按鈕計數
     ══════════════════════════════════════════════════════ */
  function updateBtnCount(tableId){
    const entry = registry.get(tableId);
    if(!entry || !entry.btnEl) return;
    const total = entry.columns.length;
    const visible = Object.values(entry.prefs).filter(v => v).length;
    const countEl = entry.btnEl.querySelector('.col-count');
    if(countEl) countEl.textContent = `${visible}/${total}`;
    entry.btnEl.classList.toggle('has-hidden', visible < total);
  }

  /* ══════════════════════════════════════════════════════
     渲染面板（下拉選單）
     ══════════════════════════════════════════════════════ */
  function renderPanel(tableId){
    const entry = registry.get(tableId);
    if(!entry || !entry.panelEl) return;

    const listEl = entry.panelEl.querySelector('.col-mgr-list');
    if(!listEl) return;

    listEl.innerHTML = entry.columns.map(col => {
      const isFixed = !!col.fixed;
      const checked = entry.prefs[col.key] !== false;
      const label = col.label || '（無標題）';
      return `<label class="col-mgr-item ${isFixed ? 'locked' : ''}" data-col="${esc(col.key)}">
        <input type="checkbox" data-col-toggle="${esc(col.key)}" ${checked ? 'checked' : ''} ${isFixed ? 'disabled' : ''}>
        <span>${esc(label)}</span>
      </label>`;
    }).join('');

    /* 綁定 checkbox 事件 */
    listEl.querySelectorAll('input[data-col-toggle]').forEach(cb => {
      if(cb.dataset.bound) return;
      cb.dataset.bound = '1';
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const key = cb.dataset.colToggle;
        toggle(tableId, key);
      });
      /* 阻止 label 預設行為（避免雙重觸發）*/
      cb.addEventListener('click', (e) => e.stopPropagation());
    });

    /* 綁定 label 點擊（避免點 label 觸發 checkbox 兩次）*/
    listEl.querySelectorAll('.col-mgr-item.locked').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
  }

  /* ══════════════════════════════════════════════════════
     建立 UI（按鈕 + 面板）
     ══════════════════════════════════════════════════════ */
  function buildUI(tableId, containerEl){
    const entry = registry.get(tableId);
    if(!entry || !containerEl) return;

    /* 若已存在 → 不重建 */
    if(entry.btnEl && entry.btnEl.parentNode) return;

    const wrap = document.createElement('div');
    wrap.className = 'col-mgr-wrap';
    wrap.dataset.colWrap = tableId;

    /* 按鈕 */
    const btn = document.createElement('button');
    btn.className = 'col-mgr-btn';
    btn.dataset.table = tableId;
    btn.title = '顯示 / 隱藏表格欄位';
    btn.innerHTML = `⚙️ 欄位 <span class="col-count">0/0</span>`;
    wrap.appendChild(btn);

    /* 面板 */
    const panel = document.createElement('div');
    panel.className = 'col-mgr-panel hidden';
    panel.dataset.colPanel = tableId;
    panel.innerHTML = `
      <div class="col-mgr-header">
        <span>📋 顯示欄位</span>
        <button class="col-mgr-close" data-col-close="${esc(tableId)}">✕</button>
      </div>
      <div class="col-mgr-list"></div>
      <div class="col-mgr-actions">
        <button data-col-action="all" data-table="${esc(tableId)}">全部顯示</button>
        <button data-col-action="none" data-table="${esc(tableId)}">全部隱藏</button>
        <button class="mobile-suggest" data-col-action="mobile" data-table="${esc(tableId)}">📱 手機建議</button>
        <button data-col-action="reset" data-table="${esc(tableId)}">🔄 重置</button>
      </div>
    `;
    wrap.appendChild(panel);

    containerEl.appendChild(wrap);

    entry.btnEl = btn;
    entry.panelEl = panel;

    /* 綁定按鈕 */
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePanel(tableId);
    });

    /* 綁定關閉 */
    panel.querySelector('[data-col-close]').addEventListener('click', (e) => {
      e.stopPropagation();
      closePanel(tableId);
    });

    /* 綁定動作按鈕 */
    panel.querySelectorAll('[data-col-action]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = b.dataset.colAction;
        if(action === 'all') showAll(tableId);
        else if(action === 'none') hideAll(tableId);
        else if(action === 'mobile') applyMobileSuggested(tableId);
        else if(action === 'reset') resetDefaults(tableId);
      });
    });

    /* 面板內部點擊不關閉 */
    panel.addEventListener('click', (e) => e.stopPropagation());

    /* 渲染初始面板 */
    renderPanel(tableId);
    updateBtnCount(tableId);
  }

  /* ══════════════════════════════════════════════════════
     面板開關
     ══════════════════════════════════════════════════════ */
  function togglePanel(tableId){
    const entry = registry.get(tableId);
    if(!entry || !entry.panelEl) return;
    const isOpen = !entry.panelEl.classList.contains('hidden');

    /* 先關閉所有其他面板 */
    closeAllPanels();

    if(!isOpen){
      openPanel(tableId);
    }
  }

  function openPanel(tableId){
    const entry = registry.get(tableId);
    if(!entry || !entry.panelEl) return;
    renderPanel(tableId);
    entry.panelEl.classList.remove('hidden');
    if(entry.btnEl) entry.btnEl.classList.add('active');
  }

  function closePanel(tableId){
    const entry = registry.get(tableId);
    if(!entry || !entry.panelEl) return;
    entry.panelEl.classList.add('hidden');
    if(entry.btnEl) entry.btnEl.classList.remove('active');
  }

  function closeAllPanels(){
    for(const [tableId, entry] of registry.entries()){
      if(entry.panelEl) entry.panelEl.classList.add('hidden');
      if(entry.btnEl) entry.btnEl.classList.remove('active');
    }
  }

  /* 點擊外部 / Esc 關閉 */
  if(!window.__colMgrGlobalBound){
    window.__colMgrGlobalBound = true;
    document.addEventListener('click', (e) => {
      /* 若點擊不在任何面板或按鈕內 → 關閉所有面板 */
      const inPanel = e.target.closest('.col-mgr-panel');
      const inBtn = e.target.closest('.col-mgr-btn');
      if(inPanel || inBtn) return;
      closeAllPanels();
    });
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape') closeAllPanels();
    });
  }

  /* ══════════════════════════════════════════════════════
     對外 API
     ══════════════════════════════════════════════════════ */
  return {
    register,
    applyPrefs,
    toggle,
    showAll,
    hideAll,
    applyMobileSuggested,
    resetDefaults,
    buildUI,
    renderPanel,
    closeAllPanels,
    /* 查詢 */
    getPrefs: (tableId) => {
      const entry = registry.get(tableId);
      return entry ? { ...entry.prefs } : {};
    },
    isVisible: (tableId, colKey) => {
      const entry = registry.get(tableId);
      return entry ? entry.prefs[colKey] !== false : true;
    },
    MOBILE_SUGGEST,
  };
})();

/* ============================================================
   ④ R — 渲染模組
   ============================================================ */
const R = (() => {
  let editingAllianceRowId = null;

  /* ── 健康 / 房主 / 成員 ── */
  function renderHealth(){
    const state = getState();
    const dot = document.getElementById('healthDot');
    const text = document.getElementById('healthText');
    let cls, label;
    if(state.connected){ cls = 'green'; label = '連線成功'; }
    else if(state.connecting){ cls = 'yellow'; label = '連線中...'; }
    else { cls = 'red'; label = '未連線'; }
    if(dot) dot.className = 'health-dot ' + cls;
    if(text) text.textContent = label;
    const cdot = document.getElementById('chatHealthDot');
    const ctxt = document.getElementById('chatHealthText');
    if(cdot) cdot.className = 'health-dot ' + cls;
    if(ctxt) ctxt.textContent = label;
    const crd = document.getElementById('chatRoomDisplay');
    if(crd) crd.textContent = state.roomCode ? `房間 ${state.roomCode}` : '';
  }

  function renderHost(){
    const state = getState();
    const el = document.getElementById('hostDisplay');
    if(el) el.textContent = state.hostName
      ? `房主：${state.hostName}${state.isHost ? '（你）' : ''}`
      : '';
  }

  function renderDebug({msg, err} = {}){
    const el = document.getElementById('debugLog');
    if(!el || !msg) return;
    const line = document.createElement('div');
    line.className = err ? 'err' : (msg.includes('🟢') ? 'ok' : '');
    const ts = window.SLG.nowTime ? window.SLG.nowTime() : '';
    line.textContent = `[${ts}] ${msg}`;
    el.appendChild(line);
    while(el.children.length > 6) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }

  function renderMembers(){
    const el = document.getElementById('onlineMembers');
    if(!el) return;
    const list = Object.values(getState().members);
    if(list.length === 0){ el.innerHTML = '<span class="text-dim">尚未連線</span>'; return; }
    el.innerHTML = list.map(m =>
      `<span class="chip ${m.isHost ? 'host' : ''}">${m.isHost ? '👑 ' : ''}${esc(m.name)}</span>`
    ).join('');
  }

  /* ── 盟清單 ── */
  function renderAlliances(){
    const tbody = document.getElementById('allianceTableBody');
    if(!tbody) return;
    const state = getState();
    if(state.alliances.length === 0){
      tbody.innerHTML = '<tr><td colspan="7" class="ally-table-empty">尚無同盟資料</td></tr>';
      return;
    }
    const sorted = getAlliancesSorted() || [...state.alliances];
    const editingId = editingAllianceRowId;

    tbody.innerHTML = sorted.map((a, idx) => {
      const isEditing = (editingId === a.id);
      const cap = state.cities.find(c => c.allianceId === a.id && c.isCapital);
      const tagCls = a.side === 'self' ? 'tag-self' : (a.side === 'ally' ? 'tag-ally' : 'tag-enemy');
      const chipCls = a.side === 'self' ? 'self' : (a.side === 'ally' ? 'ally' : 'enemy');
      const icon = a.icon || '';
      const avgPower = a.memberCount > 0 ? (Number(a.totalPower) || 0) / a.memberCount : 0;
      const yi = (Number(a.totalPower) || 0) / 1e8;

      if(isEditing){
        const sideOpts = ['self','ally','enemy'].map(s =>
          `<option value="${s}" ${s === a.side ? 'selected' : ''}>${allianceSideLabel(s)}</option>`
        ).join('');
        return `<tr data-alliance-id="${a.id}" data-idx="${idx}" class="inline-editing">
          <td class="drag-handle" data-col-key="drag" title="拖曳排序">⠿</td>
          <td class="col-name" data-col-key="name">
            <div class="inline-icon-name">
              <input type="text" class="inline-icon-input" data-inline-field="icon" value="${esc(a.icon||'')}" maxlength="8" placeholder="⚔️">
              <input type="text" class="inline-name-input" data-inline-field="name" value="${esc(a.name)}" maxlength="20" placeholder="盟名稱">
            </div>
          </td>
          <td class="inline-select-td" data-col-key="side"><select data-inline-field="side">${sideOpts}</select></td>
          <td class="col-num" data-col-key="members"><input type="number" class="inline-num-input" data-inline-field="memberCount" value="${a.memberCount || 0}" min="1" step="1"></td>
          <td class="col-num" data-col-key="power">
            <div class="inline-power-wrap">
              <input type="number" class="inline-power-input" data-inline-field="totalPowerYi" value="${yi.toFixed(2)}" step="0.01" min="0">
              <span class="inline-unit">億</span>
            </div>
          </td>
          <td class="col-num inline-avg-preview" data-col-key="avgPower" data-inline-preview="avgPower">—</td>
          <td class="col-actions" data-col-key="actions">
            <button class="btn btn-success btn-sm" data-action="save-alliance-inline" data-id="${a.id}" title="儲存">💾</button>
            <button class="btn btn-ghost btn-sm" data-action="cancel-alliance-inline" data-id="${a.id}" title="取消">✕</button>
          </td>
        </tr>`;
      }

      return `<tr data-alliance-id="${a.id}" data-idx="${idx}" draggable="true">
        <td class="drag-handle" data-col-key="drag" title="拖曳排序">⠿</td>
        <td class="col-name" data-col-key="name"><span class="alliance-tag ${tagCls}"></span>${icon ? `<span class="alliance-icon">${icon}</span>` : ''}${esc(a.name)}${cap ? ` <span style="color:var(--neon-yellow);font-size:10px;">👑 ${esc(cap.name)}</span>` : ''}</td>
        <td data-col-key="side"><span class="chip ${chipCls}">${allianceSideLabel(a.side)}</span></td>
        <td class="col-num" data-col-key="members">${(a.memberCount||0).toLocaleString()}</td>
        <td class="col-num" data-col-key="power">${formatPower(a.totalPower)}</td>
        <td class="col-num" data-col-key="avgPower">${formatAvgPower(avgPower)}</td>
        <td class="col-actions" data-col-key="actions">
          <button class="btn btn-primary btn-sm" data-action="edit-alliance" data-id="${a.id}">✏️</button>
          <button class="btn btn-danger btn-sm" data-action="del-alliance" data-id="${a.id}">🗑️</button>
        </td>
      </tr>`;
    }).join('');

    bindAllianceDragDrop(tbody);
    bindAllianceInlineEdit(tbody);
    applyAlliancePerms();
    renderIconQuickRow();

  /* ★ v9.1.0：註冊 ColumnManager + 掛載 UI */
  ColumnManager.register('alliances', [
    { key: 'drag',     label: '拖曳把手',  fixed: true },
    { key: 'name',     label: '盟名稱',    fixed: true },
    { key: 'side',     label: '陣營' },
    { key: 'members',  label: '總人數' },
    { key: 'power',    label: '總戰力' },
    { key: 'avgPower', label: '平均戰力' },
    { key: 'actions',  label: '操作',      fixed: true },
  ]);
  ensureColumnManagerUI('alliances');
}

/* ★ v9.1.0：確保 ColumnManager UI 掛載到對應的 .col-mgr-anchor */
function ensureColumnManagerUI(tableId){
  /* 找對應的 anchor 容器 */
  const anchor = document.querySelector(`.col-mgr-anchor[data-col-table="${tableId}"]`);
  if(!anchor) return;

  /* 若尚未建 UI → 建立 */
  if(!anchor.querySelector('.col-mgr-wrap')){
    ColumnManager.buildUI(tableId, anchor);
  }

  /* 套用偏好（顯示/隱藏欄位） */
  setTimeout(() => ColumnManager.applyPrefs(tableId), 0);
}

  function applyAlliancePerms(){
    if(typeof window.SLG.togglePerm !== 'function') return;
    const Auth = getAuth();
    if(!Auth) return;
    const canEdit = window.SLG.isInRoom() ? window.SLG.canEditRoomData() : Auth.canEditData();
    document.querySelectorAll(
      '[data-action="edit-alliance"],[data-action="del-alliance"],' +
      '[data-action="save-alliance-inline"],[data-action="cancel-alliance-inline"]'
    ).forEach(b => {
      window.SLG.togglePerm(b, canEdit, '需要編輯資料權限');
    });
  }

  let dragSrcId = null;

  function bindAllianceDragDrop(tbody){
    const rows = tbody.querySelectorAll('tr[data-alliance-id]:not(.inline-editing)');
    rows.forEach(tr => {
      tr.addEventListener('dragstart', (e) => {
        if(editingAllianceRowId) return;
        dragSrcId = tr.dataset.allianceId;
        tr.classList.add('dragging');
        try{ e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragSrcId); }catch(_){}
      });
      tr.addEventListener('dragend', () => {
        tr.classList.remove('dragging');
        rows.forEach(r => { r.classList.remove('drag-over-top'); r.classList.remove('drag-over-bottom'); });
        dragSrcId = null;
      });
      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        if(!dragSrcId || tr.dataset.allianceId === dragSrcId) return;
        const rect = tr.getBoundingClientRect();
        const isTop = e.clientY < rect.top + rect.height/2;
        rows.forEach(r => { r.classList.remove('drag-over-top'); r.classList.remove('drag-over-bottom'); });
        tr.classList.add(isTop ? 'drag-over-top' : 'drag-over-bottom');
      });
      tr.addEventListener('drop', (e) => {
        e.preventDefault();
        if(!dragSrcId) return;
        const tgtId = tr.dataset.allianceId;
        if(tgtId === dragSrcId) return;
        const currentOrder = getAlliancesSorted().map(a => a.id);
        const srcIdx = currentOrder.indexOf(dragSrcId);
        let tgtIdx = currentOrder.indexOf(tgtId);
        if(srcIdx < 0 || tgtIdx < 0) return;
        const rect = tr.getBoundingClientRect();
        const insertBefore = e.clientY < rect.top + rect.height/2;
        currentOrder.splice(srcIdx, 1);
        if(srcIdx < tgtIdx) tgtIdx -= 1;
        const insertPos = insertBefore ? tgtIdx : tgtIdx + 1;
        currentOrder.splice(insertPos, 0, dragSrcId);
        if(reorderAlliances) reorderAlliances(currentOrder);
        renderAlliances();
        if(typeof renderMatrix === 'function') renderMatrix();
      });
    });
  }

  function bindAllianceInlineEdit(tbody){
    tbody.querySelectorAll('tr.inline-editing').forEach(tr => {
      const mcEl = tr.querySelector('[data-inline-field="memberCount"]');
      const tpEl = tr.querySelector('[data-inline-field="totalPowerYi"]');
      const preview = tr.querySelector('[data-inline-preview="avgPower"]');
      const updatePreview = () => {
        const mc = parseFloat(mcEl?.value) || 0;
        const yi = parseFloat(tpEl?.value) || 0;
        const total = Math.round(yi * 1e8);
        const avg = mc > 0 ? total / mc : 0;
        if(preview) preview.textContent = formatAvgPower(avg);
      };
      if(mcEl) mcEl.addEventListener('input', updatePreview);
      if(tpEl) tpEl.addEventListener('input', updatePreview);
      updatePreview();
    });
    tbody.querySelectorAll('tr.inline-editing input, tr.inline-editing select').forEach(el => {
      el.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){
          e.preventDefault();
          const tr = el.closest('tr');
          const saveBtn = tr?.querySelector('[data-action="save-alliance-inline"]');
          if(saveBtn) saveBtn.click();
        } else if(e.key === 'Escape'){
          e.preventDefault();
          const tr = el.closest('tr');
          const cancelBtn = tr?.querySelector('[data-action="cancel-alliance-inline"]');
          if(cancelBtn) cancelBtn.click();
        }
      });
    });
  }

  /* ── 盟徽快速選擇 ── */
  function renderIconQuickRow(){
    const row = document.getElementById('iconQuickRow');
    if(!row) return;
    const state = getState();
    const excludeId = state.editingAllianceId || editingAllianceRowId || null;
    const icons = getAllianceIcons() || [];
    let html = '<span class="icon-quick-label">快速選擇盟徽：</span>';
    for(const icon of icons){
      const used = isAllianceIconUsed ? isAllianceIconUsed(icon, excludeId) : false;
      const cls = 'icon-quick' + (used ? ' icon-used' : '');
      html += `<button type="button" class="${cls}" data-icon="${icon}" title="${used ? '此盟徽已被使用' : ''}"${used ? ' disabled' : ''}>${icon}</button>`;
    }
    row.innerHTML = html;
    if(!row.dataset.bound){
      row.dataset.bound = '1';
      row.addEventListener('click', (e) => {
        const btn = e.target.closest('.icon-quick');
        if(!btn || btn.classList.contains('icon-used') || btn.disabled) return;
        const icon = btn.dataset.icon || '';
        const inlineInput = document.querySelector('tr.inline-editing [data-inline-field="icon"]');
        if(inlineInput){
          inlineInput.value = icon;
          inlineInput.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        const input = document.getElementById('allyIcon');
        if(input){
          input.value = icon;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    }
  }

  /* ── 盟對盟矩陣 ── */
  function renderMatrix(){
    const wrap = document.getElementById('allianceMatrixWrap');
    if(!wrap) return;
    const state = getState();
    const alliances = getAlliancesSorted() || [...state.alliances];
    if(alliances.length < 2){
      wrap.innerHTML = '<div class="text-dim" style="padding:20px;text-align:center;">至少需要 2 個同盟才能生成矩陣</div>';
      return;
    }
    const consume = (state.settings.consumeMinPerMin + state.settings.consumeMaxPerMin) / 2;
    let html = '<table class="matrix-table"><thead><tr>';
    html += '<th>發起方 ↓ / 對手 →</th>';
    alliances.forEach(a => {
      const avg = a.memberCount > 0 ? (Number(a.totalPower) || 0) / a.memberCount : 0;
      const icon = a.icon ? a.icon + ' ' : '';
      html += `<th>${icon}${esc(a.name)}<br><span style="font-size:9px;color:var(--text-dim);">均戰 ${formatAvgPower(avg)}</span></th>`;
    });
    html += '</tr></thead><tbody>';
    alliances.forEach(y => {
      const yAvg = y.memberCount > 0 ? (Number(y.totalPower) || 0) / y.memberCount : 1;
      const yIcon = y.icon ? y.icon + ' ' : '';
      html += `<tr><td class="row-label">${yIcon}${esc(y.name)}</td>`;
      alliances.forEach(x => {
        if(y.id === x.id){ html += '<td style="color:#334155;">—</td>'; }
        else {
          const xAvg = x.memberCount > 0 ? (Number(x.totalPower) || 0) / x.memberCount : 1;
          const total = yAvg + xAvg;
          const val = total > 0 ? (xAvg / total) * consume : 0;
          html += `<td>${val.toFixed(2)}</td>`;
        }
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  /* ── 城對城矩陣 ── */
  function renderCityMatrix(){
    const wrap = document.getElementById('cityMatrixWrap');
    if(!wrap) return;
    const state = getState();
    const zoneSel = document.getElementById('cityMatrixZone');
    const filterSel = document.getElementById('cityMatrixFilter');
    const zoneId = zoneSel ? zoneSel.value : 'all';
    const filter = filterSel ? filterSel.value : 'warOnly';

    let cities = state.cities.slice();
    if(zoneId !== 'all'){ cities = cities.filter(c => c.zoneId === zoneId); }
    if(filter === 'warOnly'){
      const citySet = new Set();
      for(const c of state.cities){
        const hasOutAtk = (c.attackTargets || []).some(t => t.cityId);
        const hasOutDef = (c.defendTargets || []).some(t => t.cityId);
        if(hasOutAtk || hasOutDef) citySet.add(c.id);
        for(const o of state.cities){
          for(const t of (o.attackTargets || [])){ if(t.cityId === c.id) citySet.add(c.id); }
          for(const t of (o.defendTargets || [])){ if(t.cityId === c.id) citySet.add(c.id); }
        }
      }
      cities = cities.filter(c => citySet.has(c.id));
    }
    if(cities.length < 2){
      wrap.innerHTML = '<div class="text-dim" style="padding:20px;text-align:center;">' +
        (cities.length === 0 ? '無符合條件的城池' : '至少需要 2 座城池才能生成矩陣') + '</div>';
      return;
    }
    cities.sort((a, b) => {
      if(a.zoneId !== b.zoneId) return (a.zoneId || '').localeCompare(b.zoneId || '');
      return a.name.localeCompare(b.name, 'zh-Hant');
    });
    const consume = (state.settings.consumeMinPerMin + state.settings.consumeMaxPerMin) / 2;
    let html = '<table class="matrix-table"><thead><tr>';
    html += '<th>發起城 ↓ / 對手 →</th>';
    cities.forEach(c => {
      const a = state.alliances.find(al => al.id === c.allianceId);
      const icon = (a && a.icon) ? a.icon + ' ' : '';
      const avg = c.totalTeams > 0 ? (Number(c.totalPower) || 0) / c.totalTeams : 0;
      html += `<th>${icon}${esc(c.name)}<br><span style="font-size:9px;color:var(--text-dim);">均戰 ${formatAvgPower(avg)}（${c.totalTeams || 0} 隊）</span></th>`;
    });
    html += '</tr></thead><tbody>';
    cities.forEach(y => {
      const yAvg = y.totalTeams > 0 ? (Number(y.totalPower) || 0) / y.totalTeams : 1;
      const ya = state.alliances.find(al => al.id === y.allianceId);
      const yIcon = (ya && ya.icon) ? ya.icon + ' ' : '';
      html += `<tr><td class="row-label">${yIcon}${esc(y.name)}</td>`;
      cities.forEach(x => {
        if(y.id === x.id){ html += '<td style="color:#334155;">—</td>'; }
        else {
          const xAvg = x.totalTeams > 0 ? (Number(x.totalPower) || 0) / x.totalTeams : 1;
          const total = yAvg + xAvg;
          const val = total > 0 ? (xAvg / total) * consume : 0;
          html += `<td>${val.toFixed(2)}</td>`;
        }
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  function populateCityMatrixFilters(){
    const state = getState();
    const zoneSel = document.getElementById('cityMatrixZone');
    if(zoneSel){
      const cur = zoneSel.value;
      zoneSel.innerHTML = '<option value="all">全部</option>' +
        state.zones.map(z => `<option value="${z.id}">${esc(z.name)}</option>`).join('');
      zoneSel.value = cur && state.zones.find(z => z.id === cur) ? cur : 'all';
    }
  }

  /* ── 戰區清單（依地圖分組） ── */
  function renderZones(){
    const el = document.getElementById('zoneList');
    if(!el) return;
    const state = getState();
    if(state.zones.length === 0){
      el.innerHTML = '<span class="text-dim">尚無戰區</span>';
    } else {
      const byMap = new Map();
      for(const z of state.zones){
        const key = z.mapId || '__none__';
        if(!byMap.has(key)) byMap.set(key, []);
        byMap.get(key).push(z);
      }
      const arr = [...byMap.entries()];
      let html = '';
      for(const [mapId, zones] of arr){
        const mapName = mapId === '__none__'
          ? '（未綁定地圖）'
          : (state.mapLibrary.index?.[mapId]?.name || '（未知地圖）');
        html += `<div style="flex:1 1 100%;margin-top:4px;margin-bottom:2px;">`;
        html += `<span class="chip" style="font-size:10px;background:rgba(68,170,255,.08);border-color:rgba(68,170,255,.3);color:var(--neon-blue);">🗺️ ${esc(mapName)}</span>`;
        html += `<span style="margin-left:6px;">`;
        html += zones.map(z =>
          `<span class="chip" style="margin-right:4px;">${esc(z.name)} <button class="btn btn-primary btn-sm" style="padding:0 4px;margin-left:4px;" data-action="edit-zone" data-id="${z.id}" title="編輯名稱">✏️</button><button class="btn btn-danger btn-sm" style="padding:0 4px;margin-left:2px;" data-action="del-zone" data-id="${z.id}" title="刪除">✕</button></span>`
        ).join('');
        html += `</span></div>`;
      }
      el.innerHTML = html;
    }

    const zoneMapSel = document.getElementById('newZoneMap');
    if(zoneMapSel){
      const cur = zoneMapSel.value;
      const mapIdx = state.mapLibrary.index || {};
      const mapIds = Object.keys(mapIdx).sort((a,b) => (mapIdx[b].updatedAt||0) - (mapIdx[a].updatedAt||0));
      let optHtml = '<option value="">請選擇地圖...</option>';
      for(const mid of mapIds){
        const selected = (state.mapLibrary.activeMapId === mid) ? 'selected' : '';
        optHtml += `<option value="${mid}" ${selected}>${esc(mapIdx[mid].name || '未命名')}</option>`;
      }
      zoneMapSel.innerHTML = optHtml;
      if(cur && (cur === '' || mapIdx[cur])) zoneMapSel.value = cur;
      else if(state.mapLibrary.activeMapId) zoneMapSel.value = state.mapLibrary.activeMapId;
    }

    const sim = document.getElementById('simZoneSelect');
    if(sim){
      const cur = sim.value;
      sim.innerHTML = '<option value="all">🌐 全戰區同時推演</option>' +
        state.zones.map(z => `<option value="${z.id}">${esc(z.name)}</option>`).join('');
      sim.value = cur || 'all';
    }

    if(typeof window.SLG.togglePerm === 'function'){
      const Auth = getAuth();
      if(Auth){
        const canEdit = window.SLG.isInRoom() ? window.SLG.canEditRoomData() : Auth.canEditData();
        document.querySelectorAll('[data-action="del-zone"],[data-action="edit-zone"]').forEach(b => {
          window.SLG.togglePerm(b, canEdit, '需要編輯資料權限');
        });
      }
    }
  }

  /* ── 城池卡片清單 ── */
  function renderCities(){
    const el = document.getElementById('cityList');
    if(!el) return;
    const state = getState();
    if(state.cities.length === 0){
      el.innerHTML = '<div class="card"><div class="text-dim">尚無城池資料。</div></div>';
      return;
    }
    const grouped = {};
    for(const c of state.cities){
      const z = state.zones.find(z => z.id === c.zoneId);
      const key = z ? z.name : '未分配戰區';
      (grouped[key] ||= []).push(c);
    }
    let html = '';
    for(const zoneName in grouped){
      html += `<div class="card"><div class="card-title">🗺️ ${esc(zoneName)}</div>`;
      for(const c of grouped[zoneName]){
        const lock = state.editLocks[c.id];
        const locked = !!lock && lock.clientId !== state.myClientId;
        const alliance = state.alliances.find(a => a.id === c.allianceId);
        const alloc = computeAllocation(c);
        const overCls = alloc.over ? 'overdraft' : '';
        const capCls = c.isCapital ? 'capital' : '';
        const defStart = c.defStartTime || '19:00';
        const defEnd = minutesToHHMM(hhmmToMinutes(defStart) + state.settings.timeLimitMin);
        const allianceIcon = (alliance && alliance.icon) ? alliance.icon : '';
        html += `<div class="city-card ${locked ? 'locked' : ''} ${overCls} ${capCls}">`;
        html += `<div class="flex-row" style="justify-content:space-between;margin-bottom:6px;"><strong style="font-size:13px;">${c.isCapital ? '👑 ' : ''}${esc(c.name)} <span style="font-size:10px;color:var(--text-dim);">Lv.${c.level||1}</span>${c.code ? ` <span style="font-size:10px;color:var(--neon-blue);">[${esc(c.code)}]</span>` : ''}</strong><span class="chip ${sideClass(c.side)}">${allianceIcon ? `<span class="alliance-icon">${allianceIcon}</span>` : ''}${sideLabel(c.side)}</span></div>`;
        if(alliance){
          html += `<div class="text-dim" style="margin-bottom:4px;">同盟：${allianceIcon ? `<span class="alliance-icon">${allianceIcon}</span>` : ''}${esc(alliance.name)}</div>`;
        }
        html += `<div class="flex-row" style="margin-bottom:4px;"><span class="chip time">🕐 防守 ${esc(defStart)} – ${esc(defEnd)}</span></div>`;
        html += `<div class="flex-row" style="font-size:11px;color:var(--text-secondary);gap:12px;"><span>戰力 ${formatPower(c.totalPower)}</span><span>隊數 ${c.totalTeams}</span><span>均戰 ${formatAvgPower(c.avgPower)}</span></div>`;

        if(c.tierCounts){
          const tiers = state.troopTiers.tiers;
          const breakdown = [];
          if(c.tierCounts.tier1 > 0) breakdown.push(`≤${tiers[0].maxLevel}級: <b>${c.tierCounts.tier1}</b>人`);
          if(c.tierCounts.tier2 > 0) breakdown.push(`≤${tiers[1].maxLevel}級: <b>${c.tierCounts.tier2}</b>人`);
          if(c.tierCounts.tier3 > 0) breakdown.push(`≤${tiers[2].maxLevel}級: <b>${c.tierCounts.tier3}</b>人`);
          if(c.tierCounts.tier4 > 0) breakdown.push(`≥25級: <b>${c.tierCounts.tier4}</b>人`);
          if(breakdown.length > 0){
            html += `<div class="city-tier-detail">${breakdown.map(b => `<span>${b}</span>`).join('')}</div>`;
          }
        }

        if(alloc.over){
          html += `<div class="flex-row" style="font-size:11px;margin-top:4px;"><span class="text-warn">⚠️ 戰前派兵合計 ${alloc.allocated} 隊 ＞ 總隊數 ${alloc.totalTeams} 隊</span></div>`;
        } else {
          html += `<div class="flex-row" style="font-size:11px;gap:12px;margin-top:4px;"><span style="color:#ff8fa3;">⚔️ 戰前 ${alloc.atkSum} 隊</span><span style="color:#8fffb0;">🛡️ 協防 ${alloc.defSum} 隊</span><span style="color:#8ecbff;">🏰 留守 ${alloc.reserve} 隊</span></div>`;
        }
        html += `<div class="flex-row" style="font-size:11px;color:var(--text-dim);gap:12px;margin-top:4px;"><span>冷卻 ${c.cooldownMin}分</span><span>城牆 ${c.wallMin}分</span></div>`;

        if(c.attackTargets?.length){
          const list = c.attackTargets.filter(t => (t.preWarPercent||0)>0 && t.cityId).map(t => {
            const tgt = state.cities.find(cc => cc.id === t.cityId);
            return tgt ? `<span class="chip enemy">${esc(tgt.name)} 戰${t.preWarPercent}% 復${t.postRevivePercent}% #${t.priority}${t.attackStartTime ? ' @'+t.attackStartTime : ''}</span>` : null;
          }).filter(Boolean);
          if(list.length) html += `<div style="margin-top:4px;">⚔️ ${list.join(' ')}</div>`;
        }
        if(c.defendTargets?.length){
          const list = c.defendTargets.filter(t => (t.preWarPercent||0)>0 && t.cityId).map(t => {
            const tgt = state.cities.find(cc => cc.id === t.cityId);
            return tgt ? `<span class="chip ally">${esc(tgt.name)} 戰${t.preWarPercent}% 復${t.postRevivePercent}% #${t.priority}</span>` : null;
          }).filter(Boolean);
          if(list.length) html += `<div style="margin-top:4px;">🛡️ ${list.join(' ')}</div>`;
        }
        html += `<div class="flex-row mt-8"><button class="btn btn-primary btn-sm" data-action="edit-city" data-id="${c.id}">✏️ 編輯</button><button class="btn btn-danger btn-sm" data-action="del-city" data-id="${c.id}">🗑️ 刪除</button></div></div>`;
      }
      html += `</div>`;
    }
    el.innerHTML = html;

    if(typeof window.SLG.togglePerm === 'function'){
      const Auth = getAuth();
      if(Auth){
        const canEdit = window.SLG.isInRoom() ? window.SLG.canEditRoomData() : Auth.canEditData();
        document.querySelectorAll('[data-action="edit-city"],[data-action="del-city"]').forEach(b => {
          window.SLG.togglePerm(b, canEdit, '需要編輯資料權限');
        });
      }
    }
  }

  /* ── 戰報敘事 ── */
  function renderNarrative(lines){
    const el = document.getElementById('narrativeOutput');
    if(!el) return;
    if(!lines || lines.length === 0){
      el.innerHTML = '<span class="text-dim">尚未推演，或無關鍵事件。</span>';
      return;
    }
    el.innerHTML = lines.map(l => {
      const cls = l.type === 'warn' ? 'event-warn'
                : l.type === 'capture' ? 'event-capture'
                : l.type === 'revive' ? 'event-revive' : 'event-info';
      return `<div class="narrative-line ${cls}">${esc(l.text)}</div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  /* ── 聊天室 ── */
  function renderChat(){
    const el = document.getElementById('chatMessages');
    if(!el) return;
    const state = getState();
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    const frag = document.createDocumentFragment();
    for(const m of state.chatMessages){
      const div = document.createElement('div');
      div.className = 'msg ' + (m.isSystem ? 'system' : (m.isSelf ? 'self' : 'other'));
      if(m.isSystem){ div.textContent = m.text; }
      else {
        div.innerHTML = `<div class="sender">${esc(m.sender)}</div><div>${esc(m.text)}</div><div class="time">${esc(m.time || '')}</div>`;
      }
      frag.appendChild(div);
    }
    el.innerHTML = '';
    el.appendChild(frag);
    if(atBottom) el.scrollTop = el.scrollHeight;
  }

  function renderChatBadge(){
    const badge = document.getElementById('chatBadge');
    if(!badge) return;
    const unread = getState().unreadChat || 0;
    if(unread > 0){
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.classList.add('show');
    } else { badge.classList.remove('show'); }
  }

  function renderProgress(p){
    const bar = document.getElementById('simProgress');
    if(bar) bar.style.width = Math.round(p*100) + '%';
  }

  function renderAll(){
  renderHealth(); renderHost(); renderMembers();
  renderAlliances(); renderZones(); renderCities();
  renderChat(); renderChatBadge();
  renderMatrix();
  populateCityMatrixFilters();
  renderCityMatrix();
  renderSyncStatus();
  if(typeof window.SLG.renderOverview === 'function') window.SLG.renderOverview();

  /* ★ v9.1.0：其他表格的 ColumnManager 註冊（表格由各自的 render 產生）*/
  ensureCityColumnManager();
  ensureWarColumnManager();
  ensureDeployColumnManager();
  ensureDynColumnManager();
}

/* ★ v9.1.0：城池清單的 ColumnManager 註冊 */
function ensureCityColumnManager(){
  ColumnManager.register('cities', [
    { key: 'checkbox',  label: '選取框',   fixed: true },
    { key: 'map',       label: '🗺️ 地圖' },
    { key: 'zone',      label: '戰區' },
    { key: 'alliance',  label: '所屬盟' },
    { key: 'side',      label: '陣營' },
    { key: 'code',      label: '城池編號' },
    { key: 'name',      label: '城池名稱',  fixed: true },
    { key: 'level',     label: '等級' },
    { key: 'members',   label: '人數' },
    { key: 'power',     label: '總戰力' },
    { key: 'teams',     label: '總隊數' },
    { key: 'avgPower',  label: '均戰' },
    { key: 'location',  label: '📍 定位' },
    { key: 'actions',   label: '操作',      fixed: true },
  ]);
  ensureColumnManagerUI('cities');
}

/* ★ v9.1.0：宣戰清單的 ColumnManager 註冊 */
function ensureWarColumnManager(){
  ColumnManager.register('war', [
    { key: 'startTime', label: '開始時間' },
    { key: 'endTime',   label: '結束時間' },
    { key: 'src',       label: '出兵城',   fixed: true },
    { key: 'type',      label: '類型' },
    { key: 'tgt',       label: '目標城',   fixed: true },
    { key: 'actions',   label: '操作',     fixed: true },
  ]);
  ensureColumnManagerUI('war');
}

/* ★ v9.1.0：出兵清單的 ColumnManager 註冊 */
function ensureDeployColumnManager(){
  ColumnManager.register('deploy', [
    { key: 'startTime', label: '開始時間' },
    { key: 'endTime',   label: '結束時間' },
    { key: 'src',       label: '出兵城',   fixed: true },
    { key: 'type',      label: '行動' },
    { key: 'tgt',       label: '目標城',   fixed: true },
    { key: 'pre',       label: '戰前%' },
    { key: 'post',      label: '復活%' },
    { key: 'priority',  label: '順序' },
  ]);
  ensureColumnManagerUI('deploy');
}

/* ★ v9.1.0：動態戰報的 ColumnManager 註冊 */
function ensureDynColumnManager(){
  ColumnManager.register('dyn', [
    { key: 'time',      label: '時間點',      fixed: true },
    { key: 'src',       label: '進攻方' },
    { key: 'action',    label: '行動' },
    { key: 'tgt',       label: '防守方' },
    { key: 'consume',   label: '本分鐘消耗' },
    { key: 'srcRemain', label: '進攻方剩餘' },
    { key: 'srcCd',     label: '進攻方待復活' },
    { key: 'tgtRemain', label: '防守方剩餘' },
    { key: 'tgtCd',     label: '防守方待復活' },
    { key: 'wall',      label: '城牆剩餘' },
  ]);
  ensureColumnManagerUI('dyn');
}
  /* ── Inline 編輯 盟 ── */
  function startInlineEditAlliance(id){
    if(editingAllianceRowId === id) return;
    editingAllianceRowId = id;
    renderAlliances();
    setTimeout(() => {
      const tr = document.querySelector(`tr[data-alliance-id="${id}"]`);
      if(tr){
        const nameInput = tr.querySelector('[data-inline-field="name"]');
        if(nameInput){ nameInput.focus(); nameInput.select(); }
      }
    }, 0);
  }

  function cancelInlineEditAlliance(){
    editingAllianceRowId = null;
    renderAlliances();
  }

  function saveInlineEditAlliance(id){
    const tr = document.querySelector(`tr[data-alliance-id="${id}"]`);
    if(!tr) return false;
    const state = getState();
    const alliance = state.alliances.find(a => a.id === id);
    if(!alliance) return false;
    const getVal = (field) => {
      const el = tr.querySelector(`[data-inline-field="${field}"]`);
      return el ? el.value : '';
    };
    const icon = String(getVal('icon') || '').trim();
    const name = String(getVal('name') || '').trim();
    const side = String(getVal('side') || 'ally');
    const memberCount = parseFloat(getVal('memberCount')) || 0;
    const totalPowerYi = parseFloat(getVal('totalPowerYi')) || 0;
    const totalPower = Math.round(totalPowerYi * 1e8);

    if(!name){ alert('盟名稱不能為空'); return false; }
    if(name.length > 20){ alert('盟名稱最多 20 字'); return false; }
    if(memberCount <= 0){ alert('總人數必須大於 0'); return false; }
    if(icon && isAllianceIconUsed && isAllianceIconUsed(icon, id)){
      alert('❌ 此盟徽已被其他盟使用，請更換'); return false;
    }
    if(side === 'self'){
      state.alliances.forEach(a => {
        if(a.side === 'self' && a.id !== id){
          a.side = 'enemy';
          state.entityRev.alliance[a.id] = (state.entityRev.alliance[a.id] || 0) + 1;
          window.SLG.markDirty('alliance', a.id);
        }
      });
    }
    const avgPower = totalPower / memberCount;
    window.SLG.upsertEntity('alliance', {
      id, name, icon, side, memberCount, totalPower, avgPower, power: totalPower,
      order: typeof alliance.order === 'number' ? alliance.order : 9999,
      createdAt: alliance.createdAt || Date.now(),
      color: alliance.color || '',
    });
    editingAllianceRowId = null;
    renderAlliances();
    renderMatrix();
    if(window.SLG.CityManager) window.SLG.CityManager.render();
    if(window.SLG.GameMap) window.SLG.GameMap.render();
    if(typeof window.SLG.renderOverview === 'function') window.SLG.renderOverview();
    window.SLG.saveState();
    logSystem(`✅ 已儲存同盟：${name}`);
    return true;
  }

return {
  renderHealth, renderHost, renderDebug, renderMembers,
  renderAlliances, renderMatrix, renderCityMatrix, populateCityMatrixFilters,
  renderIconQuickRow, renderZones, renderCities,
  renderNarrative, renderChat, renderChatBadge, renderProgress,
  renderAll, renderSyncStatus,
  startInlineEditAlliance, cancelInlineEditAlliance, saveInlineEditAlliance,
  getEditingAllianceRowId: () => editingAllianceRowId,
  /* ★ v9.1.1：暴露 ColumnManager 註冊函式 */
  ensureCityColumnManager,
  ensureWarColumnManager,
  ensureDeployColumnManager,
  ensureDynColumnManager,
};
})();

/* ============================================================
   ⑤ ★ v9.0.2：盟色選擇器
   ============================================================ */

function buildAllianceColorPicker(containerEl, allianceId, currentColor){
  if(!containerEl) return;
  const template = document.getElementById('allianceColorPickerTemplate');
  if(!template) return;

  const clone = template.content.cloneNode(true);
  containerEl.innerHTML = '';
  containerEl.appendChild(clone);

  const alliance = getState().alliances.find(a => a.id === allianceId);
  const side = alliance ? alliance.side : 'enemy';
  const sideLocked = (side === 'self' || side === 'ally' || side === 'npc');
  const lockedColor = window.SLG.SIDE_PRIORITY_COLOR[side];

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
   ⑥ ★ v9.0.2：盟色對照表 Modal
   ============================================================ */

function openAllianceColorModal(){
  const modal = document.getElementById('allianceColorModal');
  if(!modal) return;
  modal.classList.add('show');
  renderAllianceColorList();
}

function renderAllianceColorList(){
  const list = document.getElementById('allianceColorList');
  if(!list) return;
  const state = getState();
  const alliances = getAlliancesSorted();
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
      <span class="alliance-color-chip ${sideCls}">${allianceSideLabel(a.side)}</span>
      <span class="alliance-color-hex">${color}</span>
    </div>`;
  }).join('');
}

/* ============================================================
   暴露
   ============================================================ */
Object.assign(window.SLG, {
  renderSyncStatus,
  viz,
  ColumnManager,   /* ★ v9.1.0 新增 */
  R,
  buildAllianceColorPicker,
  openAllianceColorModal,
  renderAllianceColorList,
  /* 快捷別名 */
  renderAll: () => R.renderAll(),
  renderChat: () => R.renderChat(),
  renderChatBadge: () => R.renderChatBadge(),
  renderCities: () => R.renderCities(),
  renderZones: () => R.renderZones(),
  renderAlliances: () => R.renderAlliances(),
  renderMatrix: () => R.renderMatrix(),
  renderCityMatrix: () => R.renderCityMatrix(),
  populateCityMatrixFilters: () => R.populateCityMatrixFilters(),
  renderIconQuickRow: () => R.renderIconQuickRow(),
  renderNarrative: (lines) => R.renderNarrative(lines),
  renderDebug: (p) => R.renderDebug(p),
  startInlineEditAlliance: (id) => R.startInlineEditAlliance(id),
  cancelInlineEditAlliance: () => R.cancelInlineEditAlliance(),
  saveInlineEditAlliance: (id) => R.saveInlineEditAlliance(id),
});

})();
/* ============================================================================
 * ui-core.js 結束（v9.1.0）
 * ★ v9.1.0 變更摘要：
 *   1. 新增 ColumnManager 模組（表格欄位摺疊管理器）
 *   2. R.renderAlliances() 加入 data-col-key + ColumnManager 註冊
 *   3. 保留原有功能
 * ★ v9.0.2 變更：
 *   1. 新增 buildAllianceColorPicker
 *   2. 新增 openAllianceColorModal / renderAllianceColorList
 * ========================================================================== */