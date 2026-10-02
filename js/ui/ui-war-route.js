/* ============================================================================
 * js/ui/ui-war-route.js — v9.1.0
 * 內容：
 *   ① WarManager   — 宣戰清單
 *   ② DeployInstr  — 出兵清單
 *   ③ RouteManager — 地圖路線管理
 *
 * ★ v9.1.0 變更：
 *   - 宣戰 / 出兵清單：所有 <th> / <td> 加 data-col-key
 *   - render() 呼叫 ColumnManager.applyPrefs('war' / 'deploy')
 *
 * 依賴：window.SLG（core.js + ui-core.js）+ DOM
 * ========================================================================== */
(function(){
'use strict';

window.SLG = window.SLG || {};

/* ── 從全域取得 ── */
const getState = () => window.SLG.state;
const esc = (s) => window.SLG.esc(s);
const logSystem = (t) => window.SLG.logSystem(t);
const minutesToHHMM = (m) => window.SLG.minutesToHHMM(m);
const hhmmToMinutes = (h) => window.SLG.hhmmToMinutes(h);
const getCityMapId = (c) => window.SLG.getCityMapId(c);
const ATTACK_RULES = () => window.SLG.ATTACK_RULES;
const PERCENT_OPTIONS = () => window.SLG.PERCENT_OPTIONS;
const getColumnManager = () => window.SLG.ColumnManager;

/* ============================================================
   ① WarManager — 宣戰清單
   ============================================================ */
const WarManager = (() => {
  const LS_SORT_KEY = 'slg_war_sort_v856';
  const LS_GROUP_KEY = 'slg_war_group_v856';
  const DEFAULT_SORT = 'time';
  const DEFAULT_GROUP = 'none';

  function init(){
    const btn = document.getElementById('btnAddWarLine');
    if(btn && !btn.dataset.bound){
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => addLine());
    }

    const btnManual = document.getElementById('btnWarAddManual');
    if(btnManual && !btnManual.dataset.bound){
      btnManual.dataset.bound = '1';
      btnManual.addEventListener('click', doAddManual);
    }

    const srcSel = document.getElementById('warAddSrc');
    if(srcSel && !srcSel.dataset.bound){
      srcSel.dataset.bound = '1';
      srcSel.addEventListener('change', () => updateAddTargetOptions());
    }

    const typeSel = document.getElementById('warAddType');
    if(typeSel && !typeSel.dataset.bound){
      typeSel.dataset.bound = '1';
      typeSel.addEventListener('change', () => updateAddTargetOptions());
    }

    const tgtSel = document.getElementById('warAddTgt');
    [srcSel, typeSel, tgtSel].forEach(sel => {
      if(sel && !sel.dataset.enterBound){
        sel.dataset.enterBound = '1';
        sel.addEventListener('keydown', e => {
          if(e.key === 'Enter'){ e.preventDefault(); doAddManual(); }
        });
      }
    });

    const sortSel = document.getElementById('warSortSelect');
    if(sortSel && !sortSel.dataset.bound){
      sortSel.dataset.bound = '1';
      sortSel.addEventListener('change', function(){
        getState().listPrefs.warSort = this.value;
        try{ localStorage.setItem(LS_SORT_KEY, this.value); }catch(e){}
        if(window.SLG.saveState) window.SLG.saveState();
        render();
      });
    }

    const groupSel = document.getElementById('warGroupSelect');
    if(groupSel && !groupSel.dataset.bound){
      groupSel.dataset.bound = '1';
      groupSel.addEventListener('change', function(){
        getState().listPrefs.warGroup = this.value;
        try{ localStorage.setItem(LS_GROUP_KEY, this.value); }catch(e){}
        if(window.SLG.saveState) window.SLG.saveState();
        render();
      });
    }
  }

  function getAllWarLines(){
    const state = getState();
    const lines = [];
    for(const src of state.cities){
      for(const t of (src.attackTargets || [])){
        lines.push({
          srcId: src.id, tgtId: t.cityId, type: 'attack',
          preWarPercent: t.preWarPercent, postRevivePercent: t.postRevivePercent,
          priority: t.priority, attackStartTime: t.attackStartTime || '19:00'
        });
      }
      for(const t of (src.defendTargets || [])){
        lines.push({
          srcId: src.id, tgtId: t.cityId, type: 'assist',
          preWarPercent: t.preWarPercent, postRevivePercent: t.postRevivePercent,
          priority: t.priority, attackStartTime: ''
        });
      }
    }
    return lines;
  }

  function isSameZoneAsSource(srcCity, tgtCity){
    if(getState().settings.crossZoneWarAllowed) return true;
    return (srcCity.zoneId || '') === (tgtCity.zoneId || '');
  }

  function isSameMapAsSource(srcCity, tgtCity){
    if(!getState().settings.warRequireSameMap) return true;
    const ma = getCityMapId ? getCityMapId(srcCity) : '';
    const mb = getCityMapId ? getCityMapId(tgtCity) : '';
    if(!ma || !mb) return true;
    return ma === mb;
  }

  function getTargetsForType(srcCityId, type){
    const state = getState();
    if(type === 'attack'){
      const src = state.cities.find(c => c.id === srcCityId);
      if(!src) return [];
      const rules = ATTACK_RULES();
      const allowedSides = rules[src.side || 'npc'] || ['self','ally','enemy','common_enemy','npc'];
      let targets = state.cities.filter(c => {
        if(c.id === srcCityId) return false;
        if(!allowedSides.includes(c.side)) return false;
        if(!isSameZoneAsSource(src, c)) return false;
        if(!isSameMapAsSource(src, c)) return false;
        return true;
      });
      if(state.settings.attackRequireRoute){
        targets = targets.filter(c => window.SLG.findRoute(srcCityId, c.id));
      }
      return targets;
    }
    if(type === 'assist'){
      const src = state.cities.find(c => c.id === srcCityId);
      if(!src) return [];
      const srcAllianceId = src.allianceId || '';
      if(!srcAllianceId) return [];
      /* ★ v9.0.6：讀取「協防需要路線接觸」開關 */
      const requireRoute = state.settings.assistRequireRoute !== false;
      return state.cities.filter(c => {
        if(c.id === srcCityId) return false;
        if((c.allianceId || '') !== srcAllianceId) return false;
        const alliance = state.alliances.find(a => a.id === srcAllianceId);
        if(alliance && alliance.name === 'NPC') return false;
        if(!isSameZoneAsSource(src, c)) return false;
        if(!isSameMapAsSource(src, c)) return false;
        if(requireRoute && !window.SLG.findRoute(srcCityId, c.id)) return false;
        return true;
      });
    }
    return [];
  }

  function findWarLine(srcId, tgtId){
    if(!tgtId) return null;
    const state = getState();
    const src = state.cities.find(c => c.id === srcId);
    if(!src) return null;
    for(const t of (src.attackTargets || [])){
      if(t.cityId === tgtId) return { type:'attack', route:t };
    }
    for(const t of (src.defendTargets || [])){
      if(t.cityId === tgtId) return { type:'assist', route:t };
    }
    return null;
  }

  function addLine(){
    const state = getState();
    if(state.cities.length < 2){ alert('至少需要 2 座城池'); return; }
    for(const src of state.cities){
      const targets = getTargetsForType(src.id, 'attack');
      for(const tgt of targets){
        if(findWarLine(src.id, tgt.id)) continue;
        if(!src.attackTargets) src.attackTargets = [];
        src.attackTargets.push({
          cityId: tgt.id, preWarPercent: 50, postRevivePercent: 50,
          priority: 1, attackStartTime: '19:00',
        });
        if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(state.cities);
        markDirty(src.id);
        render();
        if(window.SLG.DeployInstr) window.SLG.DeployInstr.render();
        return;
      }
    }
    alert('已無新的宣戰組合可新增');
  }

  function renderAddForm(){
    const state = getState();
    const srcSel = document.getElementById('warAddSrc');
    if(!srcSel) return;
    const curSrc = srcSel.value;
    srcSel.innerHTML = '<option value="">選擇出兵城...</option>' +
      state.cities.map(c => {
        const a = state.alliances.find(al => al.id === c.allianceId);
        const icon = (a && a.icon) ? a.icon + ' ' : '';
        const codeStr = c.code ? ` [${c.code}]` : '';
        return `<option value="${c.id}" ${c.id === curSrc ? 'selected' : ''}>${icon}${esc(c.name)}${codeStr}</option>`;
      }).join('');
    updateAddTargetOptions();
  }

  function updateAddTargetOptions(){
    const state = getState();
    const srcSel = document.getElementById('warAddSrc');
    const typeSel = document.getElementById('warAddType');
    const tgtSel = document.getElementById('warAddTgt');
    const hintEl = document.getElementById('warAddHint');
    if(!srcSel || !typeSel || !tgtSel) return;

    const srcId = srcSel.value, type = typeSel.value;
    if(!srcId){
      tgtSel.innerHTML = '<option value="">請先選擇出兵城...</option>';
      if(hintEl) hintEl.textContent = '＊「自動新增」會依序找下一個未建立的組合（含所有方向）。';
      return;
    }

    const targets = getTargetsForType(srcId, type);
    if(targets.length === 0){
      tgtSel.innerHTML = '<option value="">（無可用目標城）</option>';
      if(hintEl){
        const src = state.cities.find(c => c.id === srcId);
        let hint = '';
        if(type === 'attack'){
          hint = state.settings.crossZoneWarAllowed ? '⚠️ 無可進攻目標城' : '⚠️ 無可進攻目標城（限同戰區）';
          if(state.settings.warRequireSameMap) hint += '（限同地圖）';
          if(state.settings.attackRequireRoute) hint += '（需路線接觸）';
        } else {
          const srcAllianceId = src?.allianceId || '';
          const sameAllianceCities = state.cities.filter(c =>
            c.id !== srcId && (c.allianceId || '') === srcAllianceId
          );
          const sameZoneCities = sameAllianceCities.filter(c =>
            state.settings.crossZoneWarAllowed || ((src?.zoneId || '') === (c.zoneId || ''))
          );

          if(!srcAllianceId){
            hint = '⚠️ 出兵城無所屬盟，無法協防';
          } else if(sameAllianceCities.length === 0){
            hint = '⚠️ 此盟沒有其他城池可以協防';
          } else if(sameZoneCities.length === 0){
            hint = '⚠️ 無同戰區的同盟城池（可至參數設定開啟「允許跨戰區宣戰」）';
          } else {
            const requireRoute = state.settings.assistRequireRoute !== false;
            if(requireRoute){
              const withRoute = sameZoneCities.filter(c => window.SLG.findRoute(srcId, c.id));
              if(withRoute.length === 0){
                hint = '⚠️ 同戰區同盟城池都無路線接觸\n（可至參數設定關閉「協防需要路線接觸」）';
              } else {
                hint = '⚠️ 無可協防目標城（限同地圖）';
              }
            } else {
              hint = '⚠️ 無可協防目標城（可能限制同地圖）';
            }
          }
        }
        hintEl.textContent = hint;
      }
      return;
    }

    const curTgt = tgtSel.value;
    const availableTargets = targets.filter(c => !findWarLine(srcId, c.id));
    if(availableTargets.length === 0){
      tgtSel.innerHTML = '<option value="">（所有目標都已建立宣戰）</option>';
      if(hintEl) hintEl.textContent = '⚠️ 此出兵城的所有可能方向都已建立宣戰';
      return;
    }

    tgtSel.innerHTML = '<option value="">選擇目標城...</option>' +
      availableTargets.map(c => {
        const a = state.alliances.find(al => al.id === c.allianceId);
        const icon = (a && a.icon) ? a.icon + ' ' : '';
        const codeStr = c.code ? ` [${c.code}]` : '';
        return `<option value="${c.id}" ${c.id === curTgt ? 'selected' : ''}>${icon}${esc(c.name)}${codeStr}</option>`;
      }).join('');

    if(hintEl){
      const zoneHint = state.settings.crossZoneWarAllowed ? '' : '（限同戰區）';
      const mapHint = state.settings.warRequireSameMap ? '（限同地圖）' : '';
      hintEl.textContent = `＊可選 ${availableTargets.length} 個目標城${zoneHint}${mapHint}`;
    }
  }

  function doAddManual(){
    const state = getState();
    const srcSel = document.getElementById('warAddSrc');
    const typeSel = document.getElementById('warAddType');
    const tgtSel = document.getElementById('warAddTgt');
    if(!srcSel || !typeSel || !tgtSel) return;

    const srcId = srcSel.value, type = typeSel.value, tgtId = tgtSel.value;
    if(!srcId){ alert('請選擇出兵城'); return; }
    if(!tgtId){ alert('請選擇目標城'); return; }

    const src = state.cities.find(c => c.id === srcId);
    const tgt = state.cities.find(c => c.id === tgtId);
    if(!src || !tgt){ alert('找不到城池'); return; }

    const validTargets = getTargetsForType(srcId, type);
    if(!validTargets.find(c => c.id === tgtId)){
      alert(type === 'attack' ? '無法進攻該目標城' : '無法協防該目標城');
      return;
    }
    if(findWarLine(srcId, tgtId)){
      alert(`「${src.name}」→「${tgt.name}」已有宣戰指示`);
      return;
    }

    const isAttack = (type === 'attack');
    const arr = isAttack ? 'attackTargets' : 'defendTargets';
    if(!src[arr]) src[arr] = [];
    src[arr].push({
      cityId: tgtId, preWarPercent: 50, postRevivePercent: 50,
      priority: 1, attackStartTime: isAttack ? '19:00' : '',
    });
    if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(state.cities);
    markDirty(src.id);
    render();
    renderAddForm();
    if(window.SLG.DeployInstr) window.SLG.DeployInstr.render();
    logSystem(`✅ 已新增宣戰：${src.name} → ${tgt.name}`);
  }

  function computeEndTime(startTime, limitMin){
    if(!startTime) return '待設定';
    const m = hhmmToMinutes(startTime);
    if(!m && m !== 0) return '待設定';
    return minutesToHHMM(m + (parseInt(limitMin) || 120));
  }

  function getSortPref(){ return getState().listPrefs.warSort || DEFAULT_SORT; }
  function getGroupPref(){ return getState().listPrefs.warGroup || DEFAULT_GROUP; }

  function sortLines(lines, sortBy){
    const state = getState();
    const copy = lines.slice();
    if(sortBy === 'time'){
      copy.sort((a, b) => {
        const ta = a.attackStartTime || '', tb = b.attackStartTime || '';
        if(ta !== tb) return ta < tb ? -1 : 1;
        return (a.srcId || '').localeCompare(b.srcId || '');
      });
    } else if(sortBy === 'alliance'){
      copy.sort((a, b) => {
        const sa = state.cities.find(c => c.id === a.srcId);
        const sb = state.cities.find(c => c.id === b.srcId);
        const aa = sa ? (state.alliances.find(al => al.id === sa.allianceId)?.name || '') : '';
        const ab = sb ? (state.alliances.find(al => al.id === sb.allianceId)?.name || '') : '';
        if(aa !== ab) return aa.localeCompare(ab, 'zh-Hant');
        return (sa?.name || '').localeCompare(sb?.name || '', 'zh-Hant');
      });
    } else if(sortBy === 'type'){
      copy.sort((a, b) => {
        const oa = a.type === 'attack' ? 0 : 1, ob = b.type === 'attack' ? 0 : 1;
        if(oa !== ob) return oa - ob;
        const ta = a.attackStartTime || '', tb = b.attackStartTime || '';
        return ta < tb ? -1 : 1;
      });
    }
    return copy;
  }

  function groupLines(lines, groupBy){
    const state = getState();
    if(groupBy === 'none') return [{ key: '__all__', title: '', items: lines }];
    const groups = new Map();
    for(const l of lines){
      let key = '', title = '';
      const src = state.cities.find(c => c.id === l.srcId);
      if(groupBy === 'map'){
        const mid = src && src.mapNode && src.mapNode.mapId ? src.mapNode.mapId : '';
        const name = mid ? (state.mapLibrary.index?.[mid]?.name || '（未知地圖）') : '（無地圖）';
        key = mid || '__none__';
        title = '🗺️ ' + name;
      } else if(groupBy === 'city'){
        key = l.srcId || '__empty__';
        title = '🏰 ' + (src ? src.name : '（無效）');
      } else if(groupBy === 'type'){
        key = l.type;
        title = l.type === 'attack' ? '⚔️ 進攻' : '🤝 協防';
      } else if(groupBy === 'alliance'){
        const a = src ? state.alliances.find(al => al.id === src.allianceId) : null;
        key = a ? a.id : '__none__';
        title = '🤝 ' + (a ? ((a.icon ? a.icon + ' ' : '') + a.name) : '（無盟）');
      } else if(groupBy === 'time'){
        const t = l.attackStartTime || '00:00';
        key = t.slice(0, 2) + ':00';
        title = '⏰ ' + key + ' 時段';
      }
      if(!groups.has(key)) groups.set(key, { key, title, items: [] });
      groups.get(key).items.push(l);
    }
    const arr = [...groups.values()];
    if(groupBy === 'type'){
      arr.sort((a, b) => (a.key === 'attack' ? 0 : 1) - (b.key === 'attack' ? 0 : 1));
    } else {
      arr.sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hant'));
    }
    return arr;
  }

  /* ★ v9.1.0：thead 加 data-col-key */
  function getTheadHtml(){
    return `<thead><tr>
      <th style="width:80px;" data-col-key="startTime">開始時間</th>
      <th style="width:80px;" data-col-key="endTime">結束時間</th>
      <th data-col-key="src">出兵城</th>
      <th style="width:100px;" data-col-key="type">類型</th>
      <th data-col-key="tgt">目標城</th>
      <th style="width:50px;" data-col-key="actions">操作</th>
    </tr></thead>`;
  }

  function render(){
    const state = getState();
    const container = document.getElementById('warListContainer');
    if(!container) return;

    const sortSel = document.getElementById('warSortSelect');
    if(sortSel) sortSel.value = getSortPref();
    const groupSel = document.getElementById('warGroupSelect');
    if(groupSel) groupSel.value = getGroupPref();

    const lines = getAllWarLines();
    if(lines.length === 0){
      container.innerHTML = '<div class="list-container-empty">尚無宣戰指示。點下方「➕ 新增」或「⚡ 自動新增」開始。</div>';
    } else {
      const sorted = sortLines(lines, getSortPref());
      const grouped = groupLines(sorted, getGroupPref());
      const limitMin = state.settings.timeLimitMin || 120;
      const theadHtml = getTheadHtml();

      const renderRow = (l, idx) => {
        const src = state.cities.find(c => c.id === l.srcId);
        const tgt = state.cities.find(c => c.id === l.tgtId);
        const isAttack = l.type === 'attack';
        const timeVal = isAttack ? (l.attackStartTime || '19:00') : '';

        const endTime = isAttack
          ? computeEndTime(timeVal, limitMin)
          : computeEndTime((() => {
              if(!tgt) return '';
              const incomingTimes = [];
              for(const o of state.cities){
                for(const t of (o.attackTargets || [])){
                  if(t.cityId === tgt.id && t.attackStartTime) incomingTimes.push(t.attackStartTime);
                }
              }
              if(incomingTimes.length === 0) return '';
              incomingTimes.sort();
              return incomingTimes[0];
            })(), limitMin);

        const rowPending = !l.tgtId;

        const srcOpts = state.cities.map(c =>
          `<option value="${c.id}" ${c.id === l.srcId ? 'selected' : ''}>${esc(c.name)}${c.code ? ' [' + esc(c.code) + ']' : ''}</option>`
        ).join('');

        const srcIcon = src ? (() => {
          const a = state.alliances.find(al => al.id === src.allianceId);
          return (a && a.icon) ? a.icon + ' ' : '';
        })() : '';

        const typeOpts = `
          <option value="attack" ${isAttack ? 'selected' : ''}>⚔️ 進攻</option>
          <option value="assist" ${!isAttack ? 'selected' : ''}>🤝 協防</option>
        `;

        const validTargets = getTargetsForType(l.srcId, l.type);
        let tgtOpts = '';
        if(!l.tgtId){
          tgtOpts = `<option value="">（待設定）</option>`;
        } else if(validTargets.length === 0){
          tgtOpts = `<option value="">（無可用目標）</option>`;
        } else {
          if(!validTargets.find(c => c.id === l.tgtId) && tgt){
            tgtOpts += `<option value="${tgt.id}" selected>${esc(tgt.name)}（不符）</option>`;
          }
          tgtOpts += validTargets.map(c =>
            `<option value="${c.id}" ${c.id === l.tgtId ? 'selected' : ''}>${esc(c.name)}${c.code ? ' [' + esc(c.code) + ']' : ''}</option>`
          ).join('');
        }

        const timeCell = isAttack
          ? `<input type="time" class="inline-time" value="${timeVal}" data-war-time="1" data-idx="${idx}">`
          : `<span class="col-time end">—</span>`;
        const endCell = `<span class="col-time end">${esc(endTime)}</span>`;

        const srcCell = `<div style="display:flex;align-items:center;gap:4px;">
          ${srcIcon ? `<span class="alliance-icon">${srcIcon}</span>` : ''}
          <select class="inline-select" data-war-src="1" data-idx="${idx}" style="flex:1;">${srcOpts}</select>
        </div>`;

        const tgtCell = `<select class="inline-select" data-war-tgt="1" data-idx="${idx}">${tgtOpts}</select>`;

        return `<tr class="${rowPending ? 'row-pending' : ''}" data-war-row="${idx}">
          <td data-col-key="startTime">${timeCell}</td>
          <td data-col-key="endTime">${endCell}</td>
          <td data-col-key="src">${srcCell}</td>
          <td data-col-key="type"><select class="inline-select col-type ${isAttack ? 'attack' : 'assist'}" data-war-type="1" data-idx="${idx}">${typeOpts}</select></td>
          <td data-col-key="tgt">${tgtCell}</td>
          <td class="col-del" data-col-key="actions"><button class="btn btn-danger btn-sm" data-war-del="1" data-idx="${idx}">🗑️</button></td>
        </tr>`;
      };

      let html = '';
      if(getGroupPref() === 'none'){
        html = `<table class="list-table" data-col-table="war">${theadHtml}<tbody>${sorted.map((l, i) => renderRow(l, i)).join('')}</tbody></table>`;
      } else {
        let idxCounter = 0;
        html = grouped.map(g => {
          const rows = g.items.map(l => renderRow(l, idxCounter++)).join('');
          return `<div class="list-group open">
            <div class="list-group-header">
              <span class="toggle-icon">▶</span>
              <span class="group-title">${esc(g.title)}</span>
              <span class="group-count">${g.items.length} 條</span>
            </div>
            <div class="list-group-body">
              <table class="list-table" data-col-table="war">${theadHtml}<tbody>${rows}</tbody></table>
            </div>
          </div>`;
        }).join('');
      }
      container.innerHTML = html;

      container.querySelectorAll('.list-group-header').forEach(h => {
        h.addEventListener('click', () => {
          const group = h.closest('.list-group');
          if(group) group.classList.toggle('open');
        });
      });

      bindWarRowEvents(container, sorted);
    }

    renderAddForm();

    /* ★ v9.1.0：套用 ColumnManager 偏好 */
    const CM = getColumnManager();
    if(CM) CM.applyPrefs('war');
  }

  function bindWarRowEvents(container, sortedLines){
    container.querySelectorAll('[data-war-time]').forEach(inp => {
      inp.addEventListener('change', function(){
        const idx = parseInt(this.dataset.idx, 10);
        const line = sortedLines[idx];
        if(!line) return;
        updateWarLineTime(line, this.value || '19:00');
      });
    });

    container.querySelectorAll('[data-war-src]').forEach(sel => {
      sel.addEventListener('change', function(){
        const idx = parseInt(this.dataset.idx, 10);
        const line = sortedLines[idx];
        if(!line) return;
        changeWarLine(line, this.value, line.tgtId, line.type, line.attackStartTime);
      });
    });

    container.querySelectorAll('[data-war-type]').forEach(sel => {
      sel.addEventListener('change', function(){
        const idx = parseInt(this.dataset.idx, 10);
        const line = sortedLines[idx];
        if(!line) return;
        const newType = this.value;
        const validTargets = getTargetsForType(line.srcId, newType);
        let newTgtId = line.tgtId;
        if(!validTargets.find(c => c.id === newTgtId)){
          newTgtId = validTargets.length > 0 ? validTargets[0].id : '';
        }
        let newTime = line.attackStartTime;
        if(newType === 'assist'){ newTime = ''; }
        else if(!newTime){ newTime = '19:00'; }
        if(!newTgtId){
          changeWarLineAllowEmpty(line, line.srcId, newType, newTime);
          return;
        }
        changeWarLine(line, line.srcId, newTgtId, newType, newTime);
      });
    });

    container.querySelectorAll('[data-war-tgt]').forEach(sel => {
      sel.addEventListener('change', function(){
        const idx = parseInt(this.dataset.idx, 10);
        const line = sortedLines[idx];
        if(!line) return;
        const newTgtId = this.value;
        if(!newTgtId) return;
        changeWarLine(line, line.srcId, newTgtId, line.type, line.attackStartTime);
      });
    });

    container.querySelectorAll('[data-war-del]').forEach(btn => {
      btn.addEventListener('click', function(){
        const idx = parseInt(this.dataset.idx, 10);
        const line = sortedLines[idx];
        if(!line) return;
        deleteWarLine(line);
      });
    });
  }

  function updateWarLineTime(line, newTime){
    const state = getState();
    const src = state.cities.find(c => c.id === line.srcId);
    if(!src) return;
    const arr = line.type === 'attack' ? 'attackTargets' : 'defendTargets';
    const route = (src[arr] || []).find(t => t.cityId === line.tgtId);
    if(!route) return;
    route.attackStartTime = newTime;
    if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(state.cities);
    markDirty(src.id);
    render();
    if(window.SLG.DeployInstr) window.SLG.DeployInstr.render();
  }

  function changeWarLineAllowEmpty(oldLine, newSrcId, newType, newTime){
    const state = getState();
    deleteLineSilent(oldLine);
    const src = state.cities.find(c => c.id === newSrcId);
    if(!src) return;
    const isAttack = (newType === 'attack');
    const arr = isAttack ? 'attackTargets' : 'defendTargets';
    if(!src[arr]) src[arr] = [];
    src[arr].push({
      cityId: '', preWarPercent: oldLine.preWarPercent || 50,
      postRevivePercent: oldLine.postRevivePercent || 50,
      priority: oldLine.priority || 1,
      attackStartTime: isAttack ? (newTime || '19:00') : '',
    });
    if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(state.cities);
    markDirty(src.id);
    render();
    if(window.SLG.DeployInstr) window.SLG.DeployInstr.render();
  }

  function changeWarLine(oldLine, newSrcId, newTgtId, newType, newTime){
    const state = getState();
    const validTargets = getTargetsForType(newSrcId, newType);
    if(!validTargets.find(c => c.id === newTgtId)){
      alert(state.settings.warRequireSameMap
        ? '此類型不能選擇該目標城（或跨圖/跨戰區被禁止）'
        : (state.settings.crossZoneWarAllowed
            ? '此類型不能選擇該目標城'
            : '此類型不能選擇該目標城（或跨戰區被禁止）'));
      render();
      return;
    }

    const isSelf = (oldLine.srcId === newSrcId && oldLine.tgtId === newTgtId);
    if(!isSelf){
      const existing = findWarLine(newSrcId, newTgtId);
      if(existing){
        alert(`「${cityName(newSrcId)}」→「${cityName(newTgtId)}」已有宣戰指示`);
        render();
        return;
      }
    }

    deleteLineSilent(oldLine);
    const src = state.cities.find(c => c.id === newSrcId);
    if(!src) return;
    const isAttack = (newType === 'attack');
    const arr = isAttack ? 'attackTargets' : 'defendTargets';
    if(!src[arr]) src[arr] = [];
    src[arr].push({
      cityId: newTgtId, preWarPercent: oldLine.preWarPercent || 50,
      postRevivePercent: oldLine.postRevivePercent || 50,
      priority: oldLine.priority || 1,
      attackStartTime: isAttack ? (newTime || '19:00') : '',
    });
    if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(state.cities);
    markDirty(src.id);
    render();
    if(window.SLG.DeployInstr) window.SLG.DeployInstr.render();
  }

  function deleteWarLine(line){
    deleteLineSilent(line);
    if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(getState().cities);
    if(window.SLG.saveState) window.SLG.saveState();
    render();
    if(window.SLG.DeployInstr) window.SLG.DeployInstr.render();
  }

  function deleteLineSilent(line){
    const state = getState();
    const src = state.cities.find(c => c.id === line.srcId);
    if(!src) return;
    if(line.type === 'attack'){
      if(src.attackTargets) src.attackTargets = src.attackTargets.filter(t => t.cityId !== line.tgtId);
    } else {
      if(src.defendTargets) src.defendTargets = src.defendTargets.filter(t => t.cityId !== line.tgtId);
    }
    state.entityRev.city[src.id] = (state.entityRev.city[src.id] || 0) + 1;
    if(window.SLG.markDirty) window.SLG.markDirty('city', src.id);
  }

  function cityName(id){
    const c = getState().cities.find(x => x.id === id);
    return c ? c.name : id;
  }

  function markDirty(cityId){
    const state = getState();
    state.entityRev.city[cityId] = (state.entityRev.city[cityId] || 0) + 1;
    if(window.SLG.markDirty) window.SLG.markDirty('city', cityId);
    if(window.SLG.tickLamport) window.SLG.tickLamport();
    if(window.SLG.flushPatches) window.SLG.flushPatches();
    if(window.SLG.saveState) window.SLG.saveState();
  }

  return {
    init, render, findWarLine,
    renderAddForm, updateAddTargetOptions,
  };
})();

/* ============================================================
   ② DeployInstr — 出兵清單
   ============================================================ */
const DeployInstr = (() => {
  const LS_SORT_KEY = 'slg_deploy_sort_v856';
  const LS_GROUP_KEY = 'slg_deploy_group_v856';
  const DEFAULT_SORT = 'alliance';
  const DEFAULT_GROUP = 'none';

  function init(){
    const el = document.getElementById('deployListContainer');
    if(!el) return;

    const sortSel = document.getElementById('deploySortSelect');
    if(sortSel && !sortSel.dataset.bound){
      sortSel.dataset.bound = '1';
      sortSel.addEventListener('change', function(){
        getState().listPrefs.deploySort = this.value;
        try{ localStorage.setItem(LS_SORT_KEY, this.value); }catch(e){}
        if(window.SLG.saveState) window.SLG.saveState();
        render();
      });
    }

    const groupSel = document.getElementById('deployGroupSelect');
    if(groupSel && !groupSel.dataset.bound){
      groupSel.dataset.bound = '1';
      groupSel.addEventListener('change', function(){
        getState().listPrefs.deployGroup = this.value;
        try{ localStorage.setItem(LS_GROUP_KEY, this.value); }catch(e){}
        if(window.SLG.saveState) window.SLG.saveState();
        render();
      });
    }
  }

  function getAllDeployLines(){
    const state = getState();
    const lines = [];
    for(const src of state.cities){
      for(const t of (src.attackTargets || [])){
        if(!t.cityId) continue;
        lines.push({
          srcId: src.id, tgtId: t.cityId, type: 'attack',
          preWarPercent: t.preWarPercent, postRevivePercent: t.postRevivePercent,
          priority: t.priority, attackStartTime: t.attackStartTime || '19:00'
        });
      }
      for(const t of (src.defendTargets || [])){
        if(!t.cityId) continue;
        lines.push({
          srcId: src.id, tgtId: t.cityId, type: 'assist',
          preWarPercent: t.preWarPercent, postRevivePercent: t.postRevivePercent,
          priority: t.priority, attackStartTime: ''
        });
      }
    }
    return lines;
  }

  function getSortPref(){ return getState().listPrefs.deploySort || DEFAULT_SORT; }
  function getGroupPref(){ return getState().listPrefs.deployGroup || DEFAULT_GROUP; }

  function computeEndTime(startTime, limitMin){
    if(!startTime) return '待設定';
    return minutesToHHMM(hhmmToMinutes(startTime) + (parseInt(limitMin) || 120));
  }

  function getCityDefStart(cityId){
    const city = getState().cities.find(c => c.id === cityId);
    return city ? (city.defStartTime || '') : '';
  }

  function sortLines(lines, sortBy){
    const state = getState();
    const copy = lines.slice();
    if(sortBy === 'alliance'){
      copy.sort((a, b) => {
        const sa = state.cities.find(c => c.id === a.srcId);
        const sb = state.cities.find(c => c.id === b.srcId);
        const aa = sa ? (state.alliances.find(al => al.id === sa.allianceId)?.name || '') : '';
        const ab = sb ? (state.alliances.find(al => al.id === sb.allianceId)?.name || '') : '';
        if(aa !== ab) return aa.localeCompare(ab, 'zh-Hant');
        return (sa?.name || '').localeCompare(sb?.name || '', 'zh-Hant');
      });
    } else if(sortBy === 'type'){
      copy.sort((a, b) => {
        const oa = a.type === 'attack' ? 0 : 1, ob = b.type === 'attack' ? 0 : 1;
        if(oa !== ob) return oa - ob;
        return (a.srcId || '').localeCompare(b.srcId || '');
      });
    }
    return copy;
  }

  function groupLines(lines, groupBy){
    const state = getState();
    if(groupBy === 'none') return [{ key: '__all__', title: '', items: lines }];
    const groups = new Map();
    for(const l of lines){
      let key = '', title = '';
      const src = state.cities.find(c => c.id === l.srcId);
      if(groupBy === 'map'){
        const mid = src && src.mapNode && src.mapNode.mapId ? src.mapNode.mapId : '';
        const name = mid ? (state.mapLibrary.index?.[mid]?.name || '（未知地圖）') : '（無地圖）';
        key = mid || '__none__';
        title = '🗺️ ' + name;
      } else if(groupBy === 'city'){
        key = l.srcId;
        title = '🏰 ' + (src ? src.name : '（無效）');
      } else if(groupBy === 'type'){
        key = l.type;
        title = l.type === 'attack' ? '⚔️ 進攻' : '🤝 協防';
      } else if(groupBy === 'alliance'){
        const a = src ? state.alliances.find(al => al.id === src.allianceId) : null;
        key = a ? a.id : '__none__';
        title = '🤝 ' + (a ? ((a.icon ? a.icon + ' ' : '') + a.name) : '（無盟）');
      }
      if(!groups.has(key)) groups.set(key, { key, title, items: [] });
      groups.get(key).items.push(l);
    }
    const arr = [...groups.values()];
    if(groupBy === 'type'){
      arr.sort((a, b) => (a.key === 'attack' ? 0 : 1) - (b.key === 'attack' ? 0 : 1));
    } else {
      arr.sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hant'));
    }
    return arr;
  }

  /* ★ v9.1.0：thead 加 data-col-key */
  function getTheadHtml(){
    return `<thead><tr>
      <th style="width:80px;" data-col-key="startTime">開始時間</th>
      <th style="width:80px;" data-col-key="endTime">結束時間</th>
      <th data-col-key="src">出兵城</th>
      <th style="width:90px;" data-col-key="type">行動</th>
      <th data-col-key="tgt">目標城</th>
      <th style="width:70px;" data-col-key="pre">戰前%</th>
      <th style="width:70px;" data-col-key="post">復活%</th>
      <th style="width:60px;" data-col-key="priority">順序</th>
    </tr></thead>`;
  }

  function render(){
    const state = getState();
    const container = document.getElementById('deployListContainer');
    if(!container) return;

    const sortSel = document.getElementById('deploySortSelect');
    if(sortSel) sortSel.value = getSortPref();
    const groupSel = document.getElementById('deployGroupSelect');
    if(groupSel) groupSel.value = getGroupPref();

    const lines = getAllDeployLines();
    if(lines.length === 0){
      container.innerHTML = '<div class="list-container-empty">尚無出兵指示。請先在「⚔️ 宣戰」建立宣戰路線。</div>';
      /* 仍要套用偏好（表頭可能由 UI 動態產生） */
      const CM = getColumnManager();
      if(CM) CM.applyPrefs('deploy');
      return;
    }

    const sorted = sortLines(lines, getSortPref());
    const grouped = groupLines(sorted, getGroupPref());
    const limitMin = state.settings.timeLimitMin || 120;
    const theadHtml = getTheadHtml();

    const renderRow = (l, idx) => {
      const src = state.cities.find(c => c.id === l.srcId);
      const tgt = state.cities.find(c => c.id === l.tgtId);
      const isAttack = l.type === 'attack';

      let startTime = '', endTime = '';
      if(isAttack){
        startTime = l.attackStartTime || '19:00';
        endTime = computeEndTime(startTime, limitMin);
      } else {
        const defStart = getCityDefStart(l.tgtId);
        startTime = defStart || '待設定';
        endTime = defStart ? computeEndTime(defStart, limitMin) : '待設定';
      }

      const srcIcon = src ? (() => {
        const a = state.alliances.find(al => al.id === src.allianceId);
        return (a && a.icon) ? a.icon + ' ' : '';
      })() : '';
      const tgtIcon = tgt ? (() => {
        const a = state.alliances.find(al => al.id === tgt.allianceId);
        return (a && a.icon) ? a.icon + ' ' : '';
      })() : '';

      const preOpts = PERCENT_OPTIONS().map(p =>
        `<option value="${p}" ${p === l.preWarPercent ? 'selected' : ''}>${p}%</option>`
      ).join('');
      const postOpts = PERCENT_OPTIONS().map(p =>
        `<option value="${p}" ${p === l.postRevivePercent ? 'selected' : ''}>${p}%</option>`
      ).join('');

      const srcCodeStr = src && src.code ? ` [${src.code}]` : '';
      const tgtCodeStr = tgt && tgt.code ? ` [${tgt.code}]` : '';

      return `<tr data-deploy-row="${idx}">
        <td data-col-key="startTime"><span class="col-time start">${esc(startTime)}</span></td>
        <td data-col-key="endTime"><span class="col-time end">${esc(endTime)}</span></td>
        <td class="col-city" data-col-key="src">${srcIcon}${src ? esc(src.name) + srcCodeStr : '—'}</td>
        <td data-col-key="type"><span class="col-type ${isAttack ? 'attack' : 'assist'}">${isAttack ? '⚔️ 進攻' : '🤝 協防'}</span></td>
        <td class="col-city" data-col-key="tgt">${tgtIcon}${tgt ? esc(tgt.name) + tgtCodeStr : '—'}</td>
        <td data-col-key="pre"><select class="inline-select col-num" data-deploy-field="preWarPercent" data-idx="${idx}">${preOpts}</select></td>
        <td data-col-key="post"><select class="inline-select col-num" data-deploy-field="postRevivePercent" data-idx="${idx}">${postOpts}</select></td>
        <td data-col-key="priority"><input type="number" class="inline-number" data-deploy-field="priority" data-idx="${idx}" value="${l.priority || 1}" min="1" max="99" step="1"></td>
      </tr>`;
    };

    let html = '';
    if(getGroupPref() === 'none'){
      html = `<table class="list-table" data-col-table="deploy">${theadHtml}<tbody>${sorted.map((l, i) => renderRow(l, i)).join('')}</tbody></table>`;
    } else {
      let idxCounter = 0;
      html = grouped.map(g => {
        const rows = g.items.map(l => renderRow(l, idxCounter++)).join('');
        return `<div class="list-group open">
          <div class="list-group-header">
            <span class="toggle-icon">▶</span>
            <span class="group-title">${esc(g.title)}</span>
            <span class="group-count">${g.items.length} 條</span>
          </div>
          <div class="list-group-body">
            <table class="list-table" data-col-table="deploy">${theadHtml}<tbody>${rows}</tbody></table>
          </div>
        </div>`;
      }).join('');
    }
    container.innerHTML = html;

    container.querySelectorAll('.list-group-header').forEach(h => {
      h.addEventListener('click', () => {
        const group = h.closest('.list-group');
        if(group) group.classList.toggle('open');
      });
    });

    bindDeployRowEvents(container, sorted);

    /* ★ v9.1.0：套用 ColumnManager 偏好 */
    const CM = getColumnManager();
    if(CM) CM.applyPrefs('deploy');
  }

  function bindDeployRowEvents(container, sortedLines){
    container.querySelectorAll('[data-deploy-field]').forEach(inp => {
      inp.addEventListener('change', function(){
        const idx = parseInt(this.dataset.idx, 10);
        const field = this.dataset.deployField;
        const line = sortedLines[idx];
        if(!line) return;
        updateDeployField(line, field, this.value);
      });
    });
  }

  function updateDeployField(line, field, value){
    const state = getState();
    const src = state.cities.find(c => c.id === line.srcId);
    if(!src) return;
    const arr = line.type === 'attack' ? 'attackTargets' : 'defendTargets';
    const route = (src[arr] || []).find(t => t.cityId === line.tgtId);
    if(!route) return;
    route[field] = parseFloat(value) || 0;
    state.entityRev.city[src.id] = (state.entityRev.city[src.id] || 0) + 1;
    if(window.SLG.markDirty) window.SLG.markDirty('city', src.id);
    if(window.SLG.tickLamport) window.SLG.tickLamport();
    if(window.SLG.flushPatches) window.SLG.flushPatches();
    if(window.SLG.saveState) window.SLG.saveState();
    render();
  }

  return { init, render };
})();

/* ============================================================
   ③ RouteManager — 地圖路線管理
   ============================================================ */
const RouteManager = (() => {
  let editingRouteId = null;

  function canAddRoute(aId, bId){
    const state = getState();
    if(!state.settings.routeRequireSameMap) return { ok: true };
    const a = state.cities.find(c => c.id === aId);
    const b = state.cities.find(c => c.id === bId);
    const ma = getCityMapId ? getCityMapId(a) : '';
    const mb = getCityMapId ? getCityMapId(b) : '';
    if(ma && mb && ma !== mb){
      return {
        ok: false,
        msg: '「路線限制同地圖」已開啟：只能在地圖內建立兩城之間的路線。\n\n若要跨圖建立，請至 ⚙️ 參數設定關閉此規則。'
      };
    }
    return { ok: true };
  }

  function init(){
    const btnQuick = document.getElementById('btnQuickAddRoute');
    if(btnQuick && !btnQuick.dataset.bound){
      btnQuick.dataset.bound = '1';
      btnQuick.addEventListener('click', doQuickAdd);
    }

    const selA = document.getElementById('quickRouteCityA');
    const selB = document.getElementById('quickRouteCityB');
    [selA, selB].forEach(sel => {
      if(sel && !sel.dataset.bound){
        sel.dataset.bound = '1';
        sel.addEventListener('keydown', e => {
          if(e.key === 'Enter'){ e.preventDefault(); doQuickAdd(); }
        });
      }
    });

    const btnAdd = document.getElementById('btnAddRouteLine');
    if(btnAdd && !btnAdd.dataset.bound){
      btnAdd.dataset.bound = '1';
      btnAdd.addEventListener('click', addEmptyLine);
    }

    const btnExpand = document.getElementById('btnExpandAllRouteGroups');
    if(btnExpand && !btnExpand.dataset.bound){
      btnExpand.dataset.bound = '1';
      btnExpand.addEventListener('click', () => {
        document.querySelectorAll('.route-group').forEach(g => g.classList.add('open'));
      });
    }

    const btnCollapse = document.getElementById('btnCollapseAllRouteGroups');
    if(btnCollapse && !btnCollapse.dataset.bound){
      btnCollapse.dataset.bound = '1';
      btnCollapse.addEventListener('click', () => {
        document.querySelectorAll('.route-group').forEach(g => g.classList.remove('open'));
      });
    }

    const groups = document.getElementById('routeGroups');
    if(groups && !groups.dataset.bound){
      groups.dataset.bound = '1';

      groups.addEventListener('click', e => {
        const header = e.target.closest('.route-group-header');
        if(header){
          const group = header.closest('.route-group');
          if(group) group.classList.toggle('open');
          return;
        }

        const delBtn = e.target.closest('[data-route-del]');
        if(delBtn){
          e.stopPropagation();
          const id = delBtn.dataset.routeId;
          if(window.SLG.removeRoute(id)){
            if(window.SLG.saveState) window.SLG.saveState('important');
            render();
            if(window.SLG.GameMap) window.SLG.GameMap.render();
            if(window.SLG.WarManager) window.SLG.WarManager.render();
          }
          return;
        }

        const modalBtn = e.target.closest('[data-route-modal]');
        if(modalBtn){
          e.stopPropagation();
          openRouteEditModal(modalBtn.dataset.routeId);
          return;
        }
      });

      groups.addEventListener('change', e => {
        const sel = e.target.closest('[data-route-src],[data-route-tgt]');
        if(!sel) return;
        const line = sel.closest('.route-line');
        if(!line) return;
        const oldId = line.dataset.routeId;
        const srcId = line.querySelector('[data-route-src]').value;
        const tgtId = line.querySelector('[data-route-tgt]').value;

        if(!srcId || !tgtId || srcId === tgtId){
          if(oldId){ window.SLG.removeRoute(oldId); }
          if(window.SLG.saveState) window.SLG.saveState('important');
          render();
          if(window.SLG.GameMap) window.SLG.GameMap.render();
          if(window.SLG.WarManager) window.SLG.WarManager.render();
          return;
        }

        const check = canAddRoute(srcId, tgtId);
        if(!check.ok){
          alert('⚠️ ' + check.msg);
          render();
          return;
        }

        if(oldId){ window.SLG.removeRoute(oldId); }
        window.SLG.addRoute(srcId, tgtId);
        if(window.SLG.saveState) window.SLG.saveState('important');
        render();
        if(window.SLG.GameMap) window.SLG.GameMap.render();
        if(window.SLG.WarManager) window.SLG.WarManager.render();
      });
    }

    const mCancel = document.getElementById('routeEditCancel');
    if(mCancel && !mCancel.dataset.bound){
      mCancel.dataset.bound = '1';
      mCancel.addEventListener('click', closeRouteEditModal);
    }

    const mSave = document.getElementById('routeEditSave');
    if(mSave && !mSave.dataset.bound){
      mSave.dataset.bound = '1';
      mSave.addEventListener('click', saveRouteEditModal);
    }

    const mDelete = document.getElementById('routeEditDelete');
    if(mDelete && !mDelete.dataset.bound){
      mDelete.dataset.bound = '1';
      mDelete.addEventListener('click', deleteRouteFromModal);
    }
  }

  function doQuickAdd(){
    const selA = document.getElementById('quickRouteCityA');
    const selB = document.getElementById('quickRouteCityB');
    if(!selA || !selB) return;
    const aId = selA.value, bId = selB.value;
    if(!aId || !bId){ alert('請選擇城池 A 與城池 B'); return; }
    if(aId === bId){ alert('兩城池不可相同'); return; }
    if(window.SLG.findRoute(aId, bId)){ alert('此路線已存在'); return; }

    const check = canAddRoute(aId, bId);
    if(!check.ok){ alert('⚠️ ' + check.msg); return; }

    const r = window.SLG.addRoute(aId, bId);
    if(r){
      if(window.SLG.saveState) window.SLG.saveState('important');
      render();
      if(window.SLG.GameMap) window.SLG.GameMap.render();
      if(window.SLG.WarManager) window.SLG.WarManager.render();
      logSystem('🛣️ 已新增路線');
    }
  }

  function addEmptyLine(){
    const state = getState();
    if(state.cities.length < 2){ alert('至少需要 2 座城池'); return; }
    const cities = state.cities;
    for(let i = 0; i < cities.length; i++){
      for(let j = i + 1; j < cities.length; j++){
        const a = cities[i], b = cities[j];
        if(!window.SLG.findRoute(a.id, b.id)){
          const check = canAddRoute(a.id, b.id);
          if(!check.ok) continue;
          const r = window.SLG.addRoute(a.id, b.id);
          if(r){
            if(window.SLG.saveState) window.SLG.saveState('important');
            render();
            if(window.SLG.GameMap) window.SLG.GameMap.render();
            if(window.SLG.WarManager) window.SLG.WarManager.render();
            return;
          }
        }
      }
    }
    alert('所有城池組合都已有路線（或皆被跨圖限制擋下）');
  }

  function getCityZoneName(cityId){
    const state = getState();
    const city = state.cities.find(c => c.id === cityId);
    if(!city) return '（無效城池）';
    if(!city.zoneId) return '未分配戰區';
    const zone = state.zones.find(z => z.id === city.zoneId);
    return zone ? zone.name : '未分配戰區';
  }

  function groupRoutes(){
    const state = getState();
    const groups = new Map();
    for(const r of (state.routes || [])){
      const zoneName = getCityZoneName(r.cityAId);
      if(!groups.has(zoneName)) groups.set(zoneName, []);
      groups.get(zoneName).push(r);
    }
    const arr = [...groups.entries()];
    arr.sort((a, b) => {
      if(a[0] === '未分配戰區') return 1;
      if(b[0] === '未分配戰區') return -1;
      return a[0].localeCompare(b[0], 'zh-Hant');
    });
    return arr;
  }

  function render(){
    const state = getState();
    populateQuickSelects();

    const el = document.getElementById('routeGroups');
    if(!el) return;

    const routes = state.routes || [];
    if(routes.length === 0){
      el.innerHTML = '<div class="route-groups-empty">尚無地圖路線。使用上方快速新增建立第一條路線。</div>';
      return;
    }

    const cityOpts = (selectedId) => state.cities.map(c =>
      `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}${c.code ? ' [' + esc(c.code) + ']' : ''}</option>`
    ).join('');

    const groups = groupRoutes();
    el.innerHTML = groups.map(([zoneName, list], gi) => {
      const groupId = 'route-group-' + gi;
      const bodyHtml = list.map(r => {
        return `<div class="route-line" data-route-id="${r.id}">
          <select data-route-src>${cityOpts(r.cityAId)}</select>
          <span class="route-arrow">—</span>
          <select data-route-tgt>${cityOpts(r.cityBId)}</select>
          <button class="btn btn-sm route-modal-btn" data-route-modal="1" data-route-id="${r.id}" title="開啟 Modal 編輯">✏️</button>
          <button class="btn btn-danger btn-sm" data-route-del="1" data-route-id="${r.id}" title="刪除">🗑️</button>
        </div>`;
      }).join('');
      const openCls = gi === 0 ? 'open' : '';
      return `<div class="route-group ${openCls}" id="${groupId}">
        <div class="route-group-header">
          <span class="toggle-icon">▶</span>
          <span class="group-name">🗺️ ${esc(zoneName)}</span>
          <span class="group-count">${list.length} 條</span>
        </div>
        <div class="route-group-body">${bodyHtml}</div>
      </div>`;
    }).join('');
  }

  function populateQuickSelects(){
    const state = getState();
    const selA = document.getElementById('quickRouteCityA');
    const selB = document.getElementById('quickRouteCityB');
    if(!selA || !selB) return;
    const curA = selA.value, curB = selB.value;
    const opts = '<option value="">選擇城池...</option>' +
      state.cities.map(c =>
        `<option value="${c.id}">${esc(c.name)}${c.code ? ' [' + esc(c.code) + ']' : ''}</option>`
      ).join('');
    selA.innerHTML = opts;
    selB.innerHTML = opts;
    if(curA && state.cities.find(c => c.id === curA)) selA.value = curA;
    if(curB && state.cities.find(c => c.id === curB)) selB.value = curB;
  }

  function openRouteEditModal(routeId){
    const state = getState();
    const r = (state.routes || []).find(x => x.id === routeId);
    if(!r){ alert('找不到此路線'); return; }
    editingRouteId = routeId;

    const selA = document.getElementById('re_cityA');
    const selB = document.getElementById('re_cityB');
    const hint = document.getElementById('routeEditHint');

    if(selA){
      selA.innerHTML = state.cities.map(c =>
        `<option value="${c.id}" ${c.id === r.cityAId ? 'selected' : ''}>${esc(c.name)}${c.code ? ' [' + esc(c.code) + ']' : ''}</option>`
      ).join('');
    }
    if(selB){
      selB.innerHTML = state.cities.map(c =>
        `<option value="${c.id}" ${c.id === r.cityBId ? 'selected' : ''}>${esc(c.name)}${c.code ? ' [' + esc(c.code) + ']' : ''}</option>`
      ).join('');
    }
    if(hint){
      hint.textContent = '＊兩城池不可相同，且路線不可重複（A-B 等同 B-A）。' +
        (state.settings.routeRequireSameMap ? '\n＊路線限制同地圖已開啟。' : '');
    }

    const modal = document.getElementById('routeEditModal');
    if(modal) modal.classList.add('show');
  }

  function closeRouteEditModal(){
    editingRouteId = null;
    const modal = document.getElementById('routeEditModal');
    if(modal) modal.classList.remove('show');
  }

  function saveRouteEditModal(){
    if(!editingRouteId) return;
    const state = getState();
    const selA = document.getElementById('re_cityA');
    const selB = document.getElementById('re_cityB');
    if(!selA || !selB) return;

    const aId = selA.value, bId = selB.value;
    if(!aId || !bId){ alert('請選擇兩座城池'); return; }
    if(aId === bId){ alert('兩城池不可相同'); return; }

    const existing = window.SLG.findRoute(aId, bId);
    if(existing && existing.id !== editingRouteId){ alert('此路線已存在'); return; }

    const check = canAddRoute(aId, bId);
    if(!check.ok){ alert('⚠️ ' + check.msg); return; }

    const r = (state.routes || []).find(x => x.id === editingRouteId);
    if(!r){ closeRouteEditModal(); return; }
    r.cityAId = aId;
    r.cityBId = bId;

    if(window.SLG.saveState) window.SLG.saveState('important');
    closeRouteEditModal();
    render();
    if(window.SLG.GameMap) window.SLG.GameMap.render();
    if(window.SLG.WarManager) window.SLG.WarManager.render();
    logSystem('🛣️ 已更新路線');
  }

  function deleteRouteFromModal(){
    if(!editingRouteId) return;
    const state = getState();
    const r = (state.routes || []).find(x => x.id === editingRouteId);
    if(!r){ closeRouteEditModal(); return; }
    if(!confirm('確定要刪除此路線嗎？')) return;
    window.SLG.removeRoute(editingRouteId);
    if(window.SLG.saveState) window.SLG.saveState('important');
    closeRouteEditModal();
    render();
    if(window.SLG.GameMap) window.SLG.GameMap.render();
    if(window.SLG.WarManager) window.SLG.WarManager.render();
    logSystem('🛣️ 已刪除路線');
  }

  return {
    init, render,
    openRouteEditModal, closeRouteEditModal,
  };
})();

/* ============================================================
   暴露
   ============================================================ */
Object.assign(window.SLG, {
  WarManager,
  DeployInstr,
  RouteManager,
});

})();
/* ============================================================================
 * ui-war-route.js 結束（v9.1.0）
 * ★ v9.1.0 變更摘要：
 *   1. 宣戰清單：<th> / <td> 加 data-col-key
 *   2. 出兵清單：<th> / <td> 加 data-col-key
 *   3. render() 呼叫 ColumnManager.applyPrefs('war' / 'deploy')
 *   4. 保留 v9.0.6 協防路線開關功能
 * ========================================================================== */