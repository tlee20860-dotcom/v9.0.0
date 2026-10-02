/* ============================================================================
 * js/ui/ui-dyn-deploy.js — v9.0.0（拆分自 ui.js 6-2 段前半）
 * 內容：
 *   ① DYN     — 動態戰報（路線級）
 *   ② DEPLOY  — 佈兵總覽（出兵 / 受擊 / 矩陣 / 連線圖）
 *
 * 依賴：window.SLG（core.js）+ DOM
 * ========================================================================== */
(function(){
'use strict';

window.SLG = window.SLG || {};

/* ── 從全域取得 ── */
const getState = () => window.SLG.state;
const getOn = () => window.SLG.on;
const EVT = () => window.SLG.EVT;
const getAuth = () => window.SLG.Auth;
const esc = (s) => window.SLG.esc(s);
const logSystem = (t) => window.SLG.logSystem(t);
const sideLabel = (s) => window.SLG.sideLabel(s);
const sideClass = (s) => window.SLG.sideClass(s);
const minutesToHHMM = (m) => window.SLG.minutesToHHMM(m);
const computeAllocation = (c) => window.SLG.computeAllocation(c);

/* ============================================================
   ① DYN — 動態戰報
   ============================================================ */
const DYN = (() => {
  let allRows = [];

function setRows(rows){
  allRows = rows || [];
  renderSummary();
  renderTable();

  /* ★ v9.1.0：即使資料為空，也套用 ColumnManager 偏好（保持欄位設定）*/
  const CM = window.SLG.ColumnManager;
  if(CM) {
    setTimeout(() => CM.applyPrefs('dyn'), 0);
  }
}

  function renderSummary(){
    const el = document.getElementById('dynSummary');
    if(!el) return;
    if(allRows.length === 0){ el.textContent = '尚未推演'; return; }
    const routes = new Set();
    allRows.forEach(r => routes.add(`${r.srcId}→${r.tgtId}`));
    el.innerHTML = `共 <b>${allRows.length}</b> 筆 · <b>${routes.size}</b> 條路線`;
  }

  function getFilters(){
    return {
      granularity: parseFloat(document.getElementById('dynGranularity')?.value) || 5,
      action: document.getElementById('dynAction')?.value || 'all',
      srcCity: document.getElementById('dynSrcCity')?.value || 'all',
      tgtCity: document.getElementById('dynTgtCity')?.value || 'all',
    };
  }

  function formatFullTime(sec){
    const state = getState();
    const totalSec = ((state.simBaseMin || 0) * 60) + sec;
    const h = Math.floor(totalSec / 3600) % 24;
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function renderTable(){
    const tbody = document.getElementById('dynTableBody');
    if(!tbody) return;
    const state = getState();

    if(allRows.length === 0){
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-dim);padding:20px;">尚未推演</td></tr>';
      return;
    }

    const f = getFilters();
    const granSec = Math.round(f.granularity * 60);

    const thConsume = document.querySelector('#dynTable thead tr th:nth-child(5)');
    if(thConsume) thConsume.textContent = (granSec === 30) ? '本30秒消耗' : '本分鐘消耗(速率)';

    const filtered = allRows.filter(r => {
      if(f.action === 'attack' && !r.isAttack) return false;
      if(f.action === 'defend' && r.isAttack) return false;
      if(f.srcCity !== 'all' && r.srcId !== f.srcCity) return false;
      if(f.tgtCity !== 'all' && r.tgtId !== f.tgtCity) return false;
      return true;
    });

    /* 依粒度分組（每組取一筆代表） */
    const grouped = new Map();
    for(const r of filtered){
      const roundedSec = Math.round(r.sec / granSec) * granSec;
      const key = `${roundedSec}|${r.srcId}|${r.tgtId}|${r.isAttack?1:0}`;
      if(!grouped.has(key)) grouped.set(key, r);
    }

    const rows = [...grouped.values()].sort((a,b) => a.sec - b.sec || a.srcCity.localeCompare(b.srcCity));

    if(rows.length === 0){
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-dim);padding:20px;">無資料</td></tr>';
      return;
    }

  tbody.innerHTML = rows.map(r => {
    const timeStr = (granSec === 30)
      ? formatFullTime(r.sec)
      : minutesToHHMM((state.simBaseMin || 0) + Math.floor(r.sec / 60));
    const actTxt = r.isAttack ? '⚔️ 進攻' : '🛡️ 協防';
    const wallDisplay = r.tgtFallen ? '🏳️ 城已破' : (r.wallSec / 60).toFixed(1) + ' 分';
    const consumeDisplay = ((r.consumeThisMin||0) * (granSec === 30 ? 0.5 : 1)).toFixed(1);
    return `<tr>
      <td class="time-cell" data-col-key="time">${esc(timeStr)}</td>
      <td class="atk-cell" data-col-key="src">${esc(r.srcCity)}城(${sideLabel(r.srcSide)})</td>
      <td class="${r.isAttack ? 'atk' : 'def'}" data-col-key="action">${actTxt}</td>
      <td class="def-cell" data-col-key="tgt">${esc(r.tgtCity)}城(${sideLabel(r.tgtSide)})</td>
      <td class="consumed" data-col-key="consume">${consumeDisplay}</td>
      <td class="num-stay" data-col-key="srcRemain">${r.ownRemain}</td>
      <td class="num-cd" data-col-key="srcCd">${r.ownCd} + ${r.ownMarch}</td>
      <td class="num-stay" data-col-key="tgtRemain">${r.tgtRemain}</td>
      <td class="num-cd" data-col-key="tgtCd">${r.tgtCd} + ${r.tgtMarch}</td>
      <td data-col-key="wall">${wallDisplay}</td>
    </tr>`;
  }).join('');

  /* ★ v9.1.0：套用 ColumnManager 偏好 */
  const CM = window.SLG.ColumnManager;
  if(CM) CM.applyPrefs('dyn');
}

  function populateCityFilters(){
    const state = getState();
    const cities = state.cities;
    const srcSel = document.getElementById('dynSrcCity');
    const tgtSel = document.getElementById('dynTgtCity');
    if(srcSel){
      const cur = srcSel.value;
      srcSel.innerHTML = '<option value="all">全部</option>' +
        cities.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
      srcSel.value = cur && cities.find(c => c.id === cur) ? cur : 'all';
    }
    if(tgtSel){
      const cur = tgtSel.value;
      tgtSel.innerHTML = '<option value="all">全部</option>' +
        cities.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
      tgtSel.value = cur && cities.find(c => c.id === cur) ? cur : 'all';
    }
  }

  function copyAsTSV(){
    const tbody = document.getElementById('dynTableBody');
    if(!tbody) return;
    const headers = ['時間點','進攻方','行動','防守方','本時段消耗','進攻方剩餘','進攻方待復活','防守方剩餘','防守方待復活','城牆剩餘'];
    const lines = [headers.join('\t')];
    tbody.querySelectorAll('tr').forEach(tr => {
      const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
      if(cells.length === 10) lines.push(cells.join('\t'));
    });
    navigator.clipboard.writeText(lines.join('\n')).then(() => alert('已複製')).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = lines.join('\n');
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('已複製');
    });
  }

  function init(){
    ['dynGranularity','dynAction','dynSrcCity','dynTgtCity'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.addEventListener('change', renderTable);
    });
    const btn = document.getElementById('btnDynCopy');
    if(btn) btn.addEventListener('click', copyAsTSV);
    getOn()(EVT().DYN_RESULT, () => {
      setRows(getState().dynRows);
      populateCityFilters();
    });
  }

  return { init, setRows, renderTable, populateCityFilters };
})();

/* ============================================================
   ② DEPLOY — 佈兵總覽
   ============================================================ */
const DEPLOY = (() => {
  let currentView = 'attack';

  function init(){
    document.querySelectorAll('.deploy-tab').forEach(tab => {
      tab.addEventListener('click', function(){
        document.querySelectorAll('.deploy-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        currentView = this.dataset.view;
        const ctrl = document.getElementById('deployLayoutCtrl');
        if(ctrl) ctrl.style.display = (currentView === 'graph') ? '' : 'none';
        render();
      });
    });

    ['deployZone','deploySide','deployFilter','deploySort','deployLayout'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.addEventListener('change', render);
    });

    const exportBtn = document.getElementById('btnDeployExport');
    if(exportBtn) exportBtn.addEventListener('click', exportCSV);
  }

  function populateZoneFilter(){
    const state = getState();
    const sel = document.getElementById('deployZone');
    if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="all">全部</option>' +
      state.zones.map(z => `<option value="${z.id}">${esc(z.name)}</option>`).join('');
    if(cur && state.zones.find(z => z.id === cur)) sel.value = cur;
  }

  /* ── 計算衝堂資訊（每城的「受兵量」與是否超載） ── */
  function getConflictInfo(){
    const state = getState();
    const map = new Map();
    for(const c of state.cities){
      let incoming = 0;
      for(const o of state.cities){
        (o.attackTargets||[]).forEach(t => {
          if(t.cityId === c.id && (t.preWarPercent||0) > 0)
            incoming += Math.floor((o.totalTeams||0) * t.preWarPercent / 100);
        });
        (o.defendTargets||[]).forEach(t => {
          if(t.cityId === c.id && (t.preWarPercent||0) > 0)
            incoming += Math.floor((o.totalTeams||0) * t.preWarPercent / 100);
        });
      }
      const own = c.totalTeams || 0;
      const conflict = own > 0 && incoming > own * 1.2;
      map.set(c.id, { incoming, own, conflict });
    }
    return map;
  }

  function getFilteredCities(conflictMap){
    const state = getState();
    const zoneId = document.getElementById('deployZone').value;
    const side = document.getElementById('deploySide').value;
    const filter = document.getElementById('deployFilter').value;

    let cities = state.cities.filter(c => {
      if(zoneId !== 'all' && c.zoneId !== zoneId) return false;
      if(side !== 'all' && c.side !== side) return false;

      if(filter === 'hasAction'){
        const hasAtk = (c.attackTargets || []).some(t => (t.preWarPercent||0) > 0);
        const hasDef = (c.defendTargets || []).some(t => (t.preWarPercent||0) > 0);
        const isAttacked = state.cities.some(o =>
          (o.attackTargets||[]).some(t => t.cityId === c.id && (t.preWarPercent||0) > 0));
        const isDefended = state.cities.some(o =>
          (o.defendTargets||[]).some(t => t.cityId === c.id && (t.preWarPercent||0) > 0));
        if(!hasAtk && !hasDef && !isAttacked && !isDefended) return false;
      }

      if(filter === 'overdraft'){
        const alloc = computeAllocation(c);
        if(!alloc.over) return false;
      }

      if(filter === 'conflict'){
        const info = conflictMap.get(c.id);
        if(!info || !info.conflict) return false;
      }

      return true;
    });

    const sortBy = document.getElementById('deploySort').value;
    if(sortBy === 'totalTeams'){
      cities.sort((a, b) => (b.totalTeams||0) - (a.totalTeams||0));
    } else if(sortBy === 'deployed'){
      cities.sort((a, b) => computeAllocation(b).allocated - computeAllocation(a).allocated);
    } else if(sortBy === 'reserve'){
      cities.sort((a, b) => computeAllocation(a).reserve - computeAllocation(b).reserve);
    } else if(sortBy === 'incoming'){
      cities.sort((a, b) =>
        (conflictMap.get(b.id)?.incoming||0) - (conflictMap.get(a.id)?.incoming||0));
    }

    return cities;
  }

  function allianceIconOf(city){
    const state = getState();
    const a = state.alliances.find(al => al.id === city.allianceId);
    return (a && a.icon) ? a.icon : '';
  }

  function cityNameWithCode(city){
    if(!city) return '';
    return city.code ? `${city.name} [${city.code}]` : city.name;
  }

  /* ── 出兵視角 ── */
  function renderAttackView(cities, conflictMap){
    let html = `<div class="deploy-table-wrap"><table class="deploy-table">
      <thead><tr>
        <th>出兵城</th><th>陣營</th><th>總隊數</th>
        <th>⚔️ 進攻指示</th><th>🛡️ 協防指示</th>
        <th>留守</th><th>受兵量</th><th>操作</th>
      </tr></thead><tbody>`;

    for(const c of cities){
      const state = getState();
      const alloc = computeAllocation(c);
      const sideCls = sideClass(c.side);
      const info = conflictMap.get(c.id) || { incoming: 0, conflict: false };
      const icon = allianceIconOf(c);

      const atkChips = (c.attackTargets || []).filter(t => (t.preWarPercent||0) > 0 && t.cityId).map(t => {
        const tgt = state.cities.find(cc => cc.id === t.cityId);
        if(!tgt) return '';
        const timeStr = t.attackStartTime ? ` @${t.attackStartTime}` : '';
        return `<span class="deploy-chip atk">→ ${esc(cityNameWithCode(tgt))} <span class="pct">${t.preWarPercent}%</span><span class="pr">#${t.priority}${timeStr}</span></span>`;
      }).join('');

      const defChips = (c.defendTargets || []).filter(t => (t.preWarPercent||0) > 0 && t.cityId).map(t => {
        const tgt = state.cities.find(cc => cc.id === t.cityId);
        if(!tgt) return '';
        return `<span class="deploy-chip def">→ ${esc(cityNameWithCode(tgt))} <span class="pct">${t.preWarPercent}%</span><span class="pr">#${t.priority}</span></span>`;
      }).join('');

      const reserve = alloc.reserve;
      const reserveCls = alloc.over ? 'warn' : 'ok';
      const reservePct = c.totalTeams > 0 ? Math.round(reserve / c.totalTeams * 100) : 0;
      const conflictIcon = info.conflict
        ? '<span class="conflict-icon" title="受兵量超過自身兵力">⚠️</span>'
        : '';

      html += `<tr class="${info.conflict ? 'conflict-row' : ''}">
        <td class="city-name ${c.side==='enemy'?'city-fallen':''}">${icon ? `<span class="alliance-icon">${icon}</span>` : ''}${c.isCapital ? '👑 ' : ''}${esc(cityNameWithCode(c))}${conflictIcon}</td>
        <td><span class="chip ${sideCls}">${sideLabel(c.side)}</span></td>
        <td>${c.totalTeams}</td>
        <td>${atkChips || '<span class="deploy-chip none">無</span>'}</td>
        <td>${defChips || '<span class="deploy-chip none">無</span>'}</td>
        <td><span class="deploy-reserve ${reserveCls}">${reserve} 隊 (${reservePct}%)</span></td>
        <td><b style="color:${info.conflict ? 'var(--neon-red)' : (info.incoming > 0 ? 'var(--neon-yellow)' : 'var(--text-dim)')};">${info.incoming} 隊</b></td>
        <td><button class="btn btn-primary btn-sm" data-deploy-edit="${c.id}">✏️</button></td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
    document.getElementById('deployTableWrap').innerHTML = html;
  }

  /* ── 受擊視角 ── */
  function renderDefendView(cities, conflictMap){
    let html = `<div class="deploy-table-wrap"><table class="deploy-table">
      <thead><tr>
        <th>目標城</th><th>陣營</th><th>總隊數</th>
        <th>⚔️ 被誰進攻</th><th>🛡️ 被誰協防</th>
        <th>總受兵</th><th>操作</th>
      </tr></thead><tbody>`;

    for(const c of cities){
      const state = getState();
      const attackerChips = state.cities.filter(o =>
        (o.attackTargets||[]).some(t => t.cityId === c.id && (t.preWarPercent||0) > 0)
      ).map(o => {
        const t = o.attackTargets.find(t => t.cityId === c.id);
        const timeStr = t.attackStartTime ? ` @${t.attackStartTime}` : '';
        return `<span class="deploy-chip atk">← ${esc(cityNameWithCode(o))} <span class="pct">${t.preWarPercent}%</span><span class="pr">#${t.priority}${timeStr}</span></span>`;
      }).join('');

      const defenderChips = state.cities.filter(o =>
        (o.defendTargets||[]).some(t => t.cityId === c.id && (t.preWarPercent||0) > 0)
      ).map(o => {
        const t = o.defendTargets.find(t => t.cityId === c.id);
        return `<span class="deploy-chip def">← ${esc(cityNameWithCode(o))} <span class="pct">${t.preWarPercent}%</span><span class="pr">#${t.priority}</span></span>`;
      }).join('');

      const info = conflictMap.get(c.id) || { incoming: 0, conflict: false };
      const sideCls = sideClass(c.side);
      const icon = allianceIconOf(c);
      const conflictIcon = info.conflict
        ? '<span class="conflict-icon" title="受兵量超過自身兵力">⚠️</span>'
        : '';

      html += `<tr class="${info.conflict ? 'conflict-row' : ''}">
        <td class="city-name ${c.side==='enemy'?'city-fallen':''}">${icon ? `<span class="alliance-icon">${icon}</span>` : ''}${c.isCapital ? '👑 ' : ''}${esc(cityNameWithCode(c))}${conflictIcon}</td>
        <td><span class="chip ${sideCls}">${sideLabel(c.side)}</span></td>
        <td>${c.totalTeams}</td>
        <td>${attackerChips || '<span class="deploy-chip none">無</span>'}</td>
        <td>${defenderChips || '<span class="deploy-chip none">無</span>'}</td>
        <td><b style="color:${info.conflict ? 'var(--neon-red)' : (info.incoming > 0 ? 'var(--neon-yellow)' : 'var(--text-dim)')};">${info.incoming} 隊</b></td>
        <td><button class="btn btn-primary btn-sm" data-deploy-edit="${c.id}">✏️</button></td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
    document.getElementById('deployTableWrap').innerHTML = html;
  }

  /* ── 矩陣視角 ── */
  function renderMatrixView(cities, conflictMap){
    const state = getState();
    const activeCities = cities.filter(c => {
      const hasOut = (c.attackTargets||[]).some(t => (t.preWarPercent||0)>0 && t.cityId) ||
                     (c.defendTargets||[]).some(t => (t.preWarPercent||0)>0 && t.cityId);
      const hasIn = state.cities.some(o =>
        (o.attackTargets||[]).some(t => t.cityId === c.id && (t.preWarPercent||0)>0) ||
        (o.defendTargets||[]).some(t => t.cityId === c.id && (t.preWarPercent||0)>0)
      );
      return hasOut || hasIn;
    });

    if(activeCities.length === 0){
      document.getElementById('deployTableWrap').innerHTML =
        '<div class="empty-hint">無任何派兵或受擊關係。</div>';
      return;
    }

    let html = '<div class="deploy-table-wrap"><table class="deploy-matrix"><thead><tr>';
    html += '<th class="row-header">出兵城 \\ 目標城</th>';

    for(const c of activeCities){
      const info = conflictMap.get(c.id) || { conflict: false };
      const conflictIcon = info.conflict ? '<span class="conflict-icon">⚠️</span>' : '';
      const icon = allianceIconOf(c);
      html += `<th>${icon ? `<span class="alliance-icon">${icon}</span>` : ''}${esc(cityNameWithCode(c))}${conflictIcon}</th>`;
    }
    html += '</tr></thead><tbody>';

    for(const src of activeCities){
      const srcIcon = allianceIconOf(src);
      html += `<tr><td class="row-header">${srcIcon ? `<span class="alliance-icon">${srcIcon}</span>` : ''}${src.isCapital ? '👑 ' : ''}${esc(cityNameWithCode(src))}</td>`;

      for(const tgt of activeCities){
        if(src.id === tgt.id){ html += '<td class="cell-self">—</td>'; continue; }
        const atk = (src.attackTargets||[]).find(t => t.cityId === tgt.id);
        const def = (src.defendTargets||[]).find(t => t.cityId === tgt.id);
        if(atk && (atk.preWarPercent||0) > 0){
          html += `<td class="cell-atk">⚔️ ${atk.preWarPercent}%<br><span style="font-size:9px;color:var(--text-dim);">#${atk.priority}</span></td>`;
        } else if(def && (def.preWarPercent||0) > 0){
          html += `<td class="cell-def">🛡️ ${def.preWarPercent}%<br><span style="font-size:9px;color:var(--text-dim);">#${def.priority}</span></td>`;
        } else {
          html += '<td class="cell-empty">·</td>';
        }
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    document.getElementById('deployTableWrap').innerHTML = html;
  }

  /* ── 連線圖（SVG 力導向式圓形佈局） ── */
  function renderGraphView(cities, conflictMap){
    const state = getState();
    const wrap = document.getElementById('deployTableWrap');
    const activeCities = cities.filter(c => {
      const hasOut = (c.attackTargets||[]).some(t => (t.preWarPercent||0)>0 && t.cityId) ||
                     (c.defendTargets||[]).some(t => (t.preWarPercent||0)>0 && t.cityId);
      const hasIn = state.cities.some(o =>
        (o.attackTargets||[]).some(t => t.cityId === c.id && (t.preWarPercent||0)>0) ||
        (o.defendTargets||[]).some(t => t.cityId === c.id && (t.preWarPercent||0)>0)
      );
      return hasOut || hasIn;
    });

    if(activeCities.length === 0){
      wrap.innerHTML = '<div class="empty-hint">無任何派兵或受擊關係。</div>';
      return;
    }

    const W = 1000, H = 1000, CX = 500, CY = 500;
    const R = Math.min(W, H) * 0.36;
    const N = activeCities.length;
    const positions = new Map();

    activeCities.forEach((c, i) => {
      const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
      positions.set(c.id, { x: CX + Math.cos(ang) * R, y: CY + Math.sin(ang) * R });
    });

    const maxTeams = Math.max(...activeCities.map(c => c.totalTeams || 1), 1);
    const nodeRadius = (c) => {
      const t = c.totalTeams || 0;
      return 14 + Math.sqrt(t / maxTeams) * 16;
    };

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const defs = document.createElementNS(ns, 'defs');
    const mkArrow = (id, color) => {
      const marker = document.createElementNS(ns, 'marker');
      marker.setAttribute('id', id);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '8');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '5');
      marker.setAttribute('markerHeight', '5');
      marker.setAttribute('orient', 'auto-start-reverse');
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
      path.setAttribute('fill', color);
      marker.appendChild(path);
      return marker;
    };
    defs.appendChild(mkArrow('arrow-atk', '#ff4466'));
    defs.appendChild(mkArrow('arrow-def', '#22ff88'));
    svg.appendChild(defs);

    const edgesG = document.createElementNS(ns, 'g');
    const radiusById = new Map();
    activeCities.forEach(c => radiusById.set(c.id, nodeRadius(c)));

    for(const src of activeCities){
      const fromPos = positions.get(src.id);
      if(!fromPos) continue;
      const fromR = radiusById.get(src.id) || 20;

      const addEdge = (targetId, pct, isAttack) => {
        if((pct||0) <= 0 || !targetId) return;
        const toPos = positions.get(targetId);
        if(!toPos) return;
        const toR = radiusById.get(targetId) || 20;

        const path = document.createElementNS(ns, 'path');
        path.setAttribute('class', 'graph-edge ' + (isAttack ? 'atk' : 'def'));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', isAttack ? 'rgba(255,68,102,.45)' : 'rgba(34,255,136,.45)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('marker-end', isAttack ? 'url(#arrow-atk)' : 'url(#arrow-def)');

        const dx = toPos.x - fromPos.x, dy = toPos.y - fromPos.y;
        const dist = Math.hypot(dx, dy);
        const ux = dx/dist, uy = dy/dist;
        const sx = fromPos.x + ux * (fromR + 3);
        const sy = fromPos.y + uy * (fromR + 3);
        const ex = toPos.x - ux * (toR + 5);
        const ey = toPos.y - uy * (toR + 5);
        path.setAttribute('d', `M ${sx} ${sy} L ${ex} ${ey}`);
        edgesG.appendChild(path);
      };

      for(const t of (src.attackTargets || [])) addEdge(t.cityId, t.preWarPercent, true);
      for(const t of (src.defendTargets || [])) addEdge(t.cityId, t.preWarPercent, false);
    }
    svg.appendChild(edgesG);

    const nodesG = document.createElementNS(ns, 'g');
    for(const c of activeCities){
      const pos = positions.get(c.id);
      if(!pos) continue;
      const r = nodeRadius(c);
      const sideColors = {
        self:'#3b82f6', ally:'#10b981', enemy:'#ef4444',
        common_enemy:'#f59e0b', npc:'#a855f7'
      };

      const g = document.createElementNS(ns, 'g');

      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', pos.x);
      circle.setAttribute('cy', pos.y);
      circle.setAttribute('r', r);
      circle.setAttribute('fill', sideColors[c.side] || '#64748b');
      circle.setAttribute('stroke', 'rgba(255,255,255,.3)');
      circle.setAttribute('stroke-width', '1.5');
      g.appendChild(circle);

      const a = state.alliances.find(al => al.id === c.allianceId);
      if(a && a.icon){
        const text = document.createElementNS(ns, 'text');
        text.setAttribute('x', pos.x);
        text.setAttribute('y', pos.y + 4);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', r * 1.1);
        text.setAttribute('pointer-events', 'none');
        text.textContent = a.icon;
        g.appendChild(text);
      }

      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', pos.x);
      label.setAttribute('y', pos.y + r + 14);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '11');
      label.setAttribute('font-weight', '700');
      label.setAttribute('fill', '#e2e8f0');
      label.setAttribute('pointer-events', 'none');
      label.textContent = c.code ? `${c.name} [${c.code}]` : c.name;
      g.appendChild(label);

      nodesG.appendChild(g);
    }
    svg.appendChild(nodesG);

    wrap.innerHTML = '';
    const gw = document.createElement('div');
    gw.className = 'deploy-graph-wrap';
    gw.appendChild(svg);
    wrap.appendChild(gw);
  }

  /* ── 摘要統計 ── */
  function renderSummary(cities, conflictMap){
    const totalCities = cities.length;
    const withAtk = cities.filter(c => (c.attackTargets||[]).some(t => (t.preWarPercent||0)>0)).length;
    const withDef = cities.filter(c => (c.defendTargets||[]).some(t => (t.preWarPercent||0)>0)).length;
    const overdraft = cities.filter(c => computeAllocation(c).over).length;
    const conflict = cities.filter(c => conflictMap.get(c.id)?.conflict).length;
    const totalDeployed = cities.reduce((sum, c) => sum + computeAllocation(c).allocated, 0);
    const totalTeams = cities.reduce((sum, c) => sum + (c.totalTeams || 0), 0);

    document.getElementById('deploySummary').innerHTML = `
      📊 共 <b>${totalCities}</b> 座城 · 
      ⚔️ 有進攻指示 <b>${withAtk}</b> 座 · 
      🛡️ 有協防指示 <b>${withDef}</b> 座 · 
      ⚠️ 超額派兵 <b>${overdraft}</b> 座 · 
      🚨 衝堂警示 <b style="color:var(--neon-red);">${conflict}</b> 座 · 
      總派兵 <b>${totalDeployed}</b> 隊 / 總兵力 <b>${totalTeams}</b> 隊
    `;
  }

  /* ── 主渲染 ── */
  function render(){
    const conflictMap = getConflictInfo();
    const cities = getFilteredCities(conflictMap);

    if(currentView === 'attack') renderAttackView(cities, conflictMap);
    else if(currentView === 'defend') renderDefendView(cities, conflictMap);
    else if(currentView === 'matrix') renderMatrixView(cities, conflictMap);
    else if(currentView === 'graph') renderGraphView(cities, conflictMap);

    renderSummary(cities, conflictMap);

    /* 綁定「編輯城池」按鈕 + 權限 */
    document.querySelectorAll('[data-deploy-edit]').forEach(btn => {
      btn.addEventListener('click', function(){
        if(window.SLG.isInRoom()){
          if(!window.SLG.canEditRoomData()) return;
        } else {
          const Auth = getAuth();
          if(Auth && !Auth.canEditData()) return;
        }
        if(typeof window.SLG.openCityModal === 'function'){
          window.SLG.openCityModal(this.dataset.deployEdit);
        }
      });

      if(typeof window.SLG.togglePerm === 'function'){
        const Auth = getAuth();
        if(Auth){
          const canEdit = window.SLG.isInRoom()
            ? window.SLG.canEditRoomData()
            : Auth.canEditData();
          window.SLG.togglePerm(btn, canEdit, '需要編輯資料權限');
        }
      }
    });
  }

  /* ── CSV 匯出 ── */
  function exportCSV(){
    const state = getState();
    const conflictMap = getConflictInfo();
    const cities = getFilteredCities(conflictMap);
    let headers, rows;

    if(currentView === 'attack'){
      headers = ['出兵城', '陣營', '總隊數', '進攻指示', '協防指示', '留守隊數', '留守%', '受兵量', '衝堂警示'];
      rows = cities.map(c => {
        const alloc = computeAllocation(c);
        const info = conflictMap.get(c.id) || { incoming: 0, conflict: false };
        const atkStr = (c.attackTargets||[]).filter(t => (t.preWarPercent||0)>0 && t.cityId).map(t => {
          const tgt = state.cities.find(cc => cc.id === t.cityId);
          if(!tgt) return '';
          const timeStr = t.attackStartTime ? ` @${t.attackStartTime}` : '';
          return `${tgt.name} ${t.preWarPercent}% #${t.priority}${timeStr}`;
        }).filter(Boolean).join(' | ');
        const defStr = (c.defendTargets||[]).filter(t => (t.preWarPercent||0)>0 && t.cityId).map(t => {
          const tgt = state.cities.find(cc => cc.id === t.cityId);
          return tgt ? `${tgt.name} ${t.preWarPercent}% #${t.priority}` : '';
        }).filter(Boolean).join(' | ');
        const reservePct = c.totalTeams > 0 ? Math.round(alloc.reserve / c.totalTeams * 100) : 0;
        return [c.name, sideLabel(c.side), c.totalTeams, atkStr || '-', defStr || '-',
                alloc.reserve, `${reservePct}%`, info.incoming, info.conflict ? '⚠️ 警示' : '正常'];
      });
    } else if(currentView === 'defend'){
      headers = ['目標城', '陣營', '總隊數', '被誰進攻', '被誰協防', '總受兵', '衝堂警示'];
      rows = cities.map(c => {
        const info = conflictMap.get(c.id) || { incoming: 0, conflict: false };
        const atkStr = state.cities
          .filter(o => (o.attackTargets||[]).some(t => t.cityId === c.id && (t.preWarPercent||0)>0))
          .map(o => {
            const t = o.attackTargets.find(t => t.cityId === c.id);
            const timeStr = t.attackStartTime ? ` @${t.attackStartTime}` : '';
            return `${o.name} ${t.preWarPercent}% #${t.priority}${timeStr}`;
          }).join(' | ');
        const defStr = state.cities
          .filter(o => (o.defendTargets||[]).some(t => t.cityId === c.id && (t.preWarPercent||0)>0))
          .map(o => {
            const t = o.defendTargets.find(t => t.cityId === c.id);
            return `${o.name} ${t.preWarPercent}% #${t.priority}`;
          }).join(' | ');
        return [c.name, sideLabel(c.side), c.totalTeams, atkStr || '-', defStr || '-',
                info.incoming, info.conflict ? '⚠️ 警示' : '正常'];
      });
    } else {
      headers = ['出兵城', '目標城', '行動', '派兵%', '優先順序'];
      rows = [];
      for(const src of cities){
        for(const t of (src.attackTargets||[])){
          if((t.preWarPercent||0) <= 0 || !t.cityId) continue;
          const tgt = state.cities.find(cc => cc.id === t.cityId);
          if(!tgt) continue;
          rows.push([src.name, tgt.name, '進攻', t.preWarPercent + '%', t.priority]);
        }
        for(const t of (src.defendTargets||[])){
          if((t.preWarPercent||0) <= 0 || !t.cityId) continue;
          const tgt = state.cities.find(cc => cc.id === t.cityId);
          if(!tgt) continue;
          rows.push([src.name, tgt.name, '協防', t.preWarPercent + '%', t.priority]);
        }
      }
    }

    const csv = [headers, ...rows].map(r =>
      r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
    ).join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const viewName = currentView === 'attack' ? '出兵'
                    : currentView === 'defend' ? '受擊'
                    : currentView === 'graph' ? '連線圖' : '矩陣';
    a.href = url;
    a.download = `佈兵總覽_${viewName}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logSystem('📥 已匯出 CSV');
  }

  return { init, render, populateZoneFilter };
})();

/* ============================================================
   暴露
   ============================================================ */
Object.assign(window.SLG, {
  DYN,
  DEPLOY,
  deployRender: () => DEPLOY.render(),
});

})();
/* ============================================================================
 * ui-dyn-deploy.js 結束（v9.0.0）
 * ========================================================================== */