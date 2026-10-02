/* ============================================================================
 * js/ui/ui-city.js — v9.0.4
 * 內容：
 *   CityManager — 城池清單表格
 *     • 表格 / 卡片檢視切換
 *     • 批次操作（戰區 / 盟 / 陣營 / 刪除）
 *     • 行內編輯（點 ✏️ 展開編輯）
 *     • 分級 inline 編輯（點人數欄展開面板）
 *     • 篩選器（地圖 / 戰區 / 盟 / 陣營 / 定位 / 排序 / 搜尋）
 *     • ★ v9.0.4：定位狀態顯示（表格 + 卡片）
 *     • 聯盟分佈摘要
 *
 * 依賴：window.SLG（core.js）+ DOM
 * ========================================================================== */
(function(){
'use strict';

window.SLG = window.SLG || {};

/* ── 從全域取得 ── */
const getState = () => window.SLG.state;
const esc = (s) => window.SLG.esc(s);
const logSystem = (t) => window.SLG.logSystem(t);
const sideLabel = (s) => window.SLG.sideLabel(s);
const allianceSideLabel = (s) => window.SLG.allianceSideLabel(s);
const sideClass = (s) => window.SLG.sideClass(s);
const formatPower = (n) => window.SLG.formatPower(n);
const formatAvgPower = (n) => window.SLG.formatAvgPower(n);
const calcTeamsFromTiers = (t) => window.SLG.calcTeamsFromTiers(t);
const getAuth = () => window.SLG.Auth;

/* ============================================================
   CityManager
   ============================================================ */
const CityManager = (() => {
  let currentView = 'table';
  let editingCityRowId = null;
  let editingCityTierId = null;

  /* ══════════════════════════════════════════════════════
     ★ v9.0.4：計算城池定位狀態
     回傳：{ status, mapId, mapName, x, y, nodeId, hasNodeInLib, cityMapNode }
     status 可能值：
       'unlocated'  — 完全沒定位
       'synced'     — city.mapNode + 地圖庫 nodes 都有
       'mismatch'   — 只有一邊有
       'crossmap'   — 定位在其他地圖
     ══════════════════════════════════════════════════════ */
  function getCityLocationStatus(city){
    const state = getState();
    const result = {
      status: 'unlocated',
      mapId: '',
      mapName: '',
      x: null,
      y: null,
      nodeId: '',
      hasNodeInLib: false,
      cityMapNode: false,
    };

    if(!city) return result;

    /* ① 檢查 city.mapNode */
    if(city.mapNode && typeof city.mapNode.x === 'number' && typeof city.mapNode.y === 'number'){
      result.cityMapNode = true;
      result.mapId = city.mapNode.mapId || '';
      result.x = Math.round(city.mapNode.x);
      result.y = Math.round(city.mapNode.y);
      result.nodeId = city.mapNode.nodeId || '';
    }

    /* ② 檢查地圖庫 nodes */
    if(result.mapId){
      const map = state.mapLibrary.loaded[result.mapId];
      if(map && map.nodes){
        const key = city.code || ('n_' + city.id);
        if(map.nodes[key]){
          result.hasNodeInLib = true;
          /* 若 city.mapNode 沒有，但有地圖庫 → 取地圖庫座標 */
          if(!result.cityMapNode){
            result.x = Math.round(map.nodes[key].x);
            result.y = Math.round(map.nodes[key].y);
            result.nodeId = key;
          }
        }
      }
    }

    /* ③ 取得地圖名稱 */
    if(result.mapId){
      const meta = state.mapLibrary.index[result.mapId];
      result.mapName = meta ? (meta.name || '未命名') : '（未知地圖）';
    }

    /* ④ 判定狀態 */
    const activeMapId = state.mapLibrary.activeMapId || '';

    if(!result.cityMapNode && !result.hasNodeInLib){
      result.status = 'unlocated';
    } else if(result.mapId && activeMapId && result.mapId !== activeMapId){
      result.status = 'crossmap';
    } else if(result.cityMapNode && result.hasNodeInLib){
      result.status = 'synced';
    } else {
      result.status = 'mismatch';
    }

    return result;
  }

  /* ══════════════════════════════════════════════════════
     ★ v9.0.4：渲染定位狀態徽章（HTML）
     ══════════════════════════════════════════════════════ */
  function renderLocationBadge(city){
    const loc = getCityLocationStatus(city);
    let cls = 'loc-badge loc-';
    let icon = '';
    let text = '';
    let title = '';

    switch(loc.status){
      case 'synced':
        cls += 'synced';
        icon = '📍';
        text = loc.mapName || '已定位';
        title = `✅ 完全同步\n地圖：${loc.mapName}\n座標：(${loc.x}, ${loc.y})`;
        break;
      case 'mismatch':
        cls += 'mismatch';
        icon = '⚠️';
        text = loc.mapName ? `${loc.mapName}` : '不同步';
        title = `⚠️ 部分同步\n` +
                (loc.cityMapNode ? `city.mapNode: ✅\n` : `city.mapNode: ❌\n`) +
                (loc.hasNodeInLib ? `地圖庫 nodes: ✅\n` : `地圖庫 nodes: ❌\n`) +
                (loc.x !== null ? `座標：(${loc.x}, ${loc.y})` : '');
        break;
      case 'crossmap':
        cls += 'crossmap';
        icon = '🔀';
        text = loc.mapName || '跨圖';
        title = `🔀 定位在其他地圖\n地圖：${loc.mapName}\n座標：(${loc.x}, ${loc.y})\n\n（可切換到該地圖查看）`;
        break;
      default:
        cls += 'unlocated';
        icon = '❌';
        text = '未定位';
        title = '❌ 尚未在地圖上定位\n\n請至「🗺️ 地圖」模式開啟「🏙️ 城池編輯」，點空白處新增';
        break;
    }

    return `<span class="${cls}" title="${esc(title)}">${icon} ${esc(text)}</span>`;
  }

  /* ══════════════════════════════════════════════════════
     初始化：綁定所有 UI 事件
     ══════════════════════════════════════════════════════ */
  function init(){
    /* ── 表格 / 卡片檢視切換 ── */
    const btn = document.getElementById('btnCityViewToggle');
    if(btn && !btn.dataset.bound){
      btn.dataset.bound = '1';
      btn.addEventListener('click', function(){
        currentView = currentView === 'table' ? 'card' : 'table';
        this.textContent = currentView === 'table' ? '🃏 卡片檢視' : '📋 表格檢視';
        const tv = document.getElementById('cityTableView');
        const cv = document.getElementById('cityCardView');
        if(tv) tv.style.display = currentView === 'table' ? '' : 'none';
        if(cv) cv.style.display = currentView === 'card' ? '' : 'none';
        render();
      });
    }

    /* ── 篩選器（含 ★ v9.0.4 新增 cityFilterLoc）── */
    ['cityFilterMap','cityFilterZone','cityFilterAlliance','cityFilterSide',
     'cityFilterLoc','citySortBy','citySearchInput'].forEach(id => {
      const el = document.getElementById(id);
      if(el && !el.dataset.bound){
        el.dataset.bound = '1';
        el.addEventListener('input', render);
        el.addEventListener('change', render);
      }
    });

    /* 地圖篩選變更 → 需重填戰區選項 */
    const mapFilterEl = document.getElementById('cityFilterMap');
    if(mapFilterEl && !mapFilterEl.dataset.mapBound){
      mapFilterEl.dataset.mapBound = '1';
      mapFilterEl.addEventListener('change', () => {
        populateFilters();
        render();
      });
    }

    /* ── 全選 checkbox ── */
    const selAll = document.getElementById('citySelectAll');
    if(selAll && !selAll.dataset.bound){
      selAll.dataset.bound = '1';
      selAll.addEventListener('change', function(){
        document.querySelectorAll('.city-table .city-cb').forEach(cb => {
          cb.checked = this.checked;
        });
        updateBatchBar();
      });
    }

    /* ── 批次套用：戰區 ── */
    const btnApplyZone = document.getElementById('btnCityBatchApplyZone');
    if(btnApplyZone && !btnApplyZone.dataset.bound){
      btnApplyZone.dataset.bound = '1';
      btnApplyZone.addEventListener('click', () => {
        const raw = document.getElementById('cityBatchZone').value;
        if(!raw){ alert('請選擇戰區'); return; }
        const zoneId = (raw === '__CLEAR__') ? '' : raw;
        applyBatch('zoneId', zoneId);
      });
    }

    /* ── 批次套用：盟 ── */
    const btnApplyAlliance = document.getElementById('btnCityBatchApplyAlliance');
    if(btnApplyAlliance && !btnApplyAlliance.dataset.bound){
      btnApplyAlliance.dataset.bound = '1';
      btnApplyAlliance.addEventListener('click', () => {
        const aid = document.getElementById('cityBatchAlliance').value;
        if(!aid){ alert('請選擇所屬盟'); return; }
        applyBatch('allianceId', aid);
      });
    }

    /* ── 批次套用：陣營 ── */
    const btnApplySide = document.getElementById('btnCityBatchApplySide');
    if(btnApplySide && !btnApplySide.dataset.bound){
      btnApplySide.dataset.bound = '1';
      btnApplySide.addEventListener('click', () => {
        const side = document.getElementById('cityBatchSide').value;
        if(!side){ alert('請選擇陣營'); return; }
        applyBatch('side', side);
      });
    }

    /* ── 批次刪除 ── */
    const btnBatchDel = document.getElementById('btnCityBatchDelete');
    if(btnBatchDel && !btnBatchDel.dataset.bound){
      btnBatchDel.dataset.bound = '1';
      btnBatchDel.addEventListener('click', () => {
        const ids = getCheckedIds();
        if(ids.length === 0){ alert('請先勾選城池'); return; }
        if(typeof window.SLG.showConfirm === 'function'){
          window.SLG.showConfirm(
            '批次刪除',
            `確定刪除 ${ids.length} 座城池？\n（含節點、路線、宣戰連動清理）`,
            async () => {
              for(const id of ids){
                if(window.SLG.DataSyncManager){
                  await window.SLG.DataSyncManager.deleteCityCascade(id);
                } else {
                  window.SLG.deleteEntity('city', id);
                }
              }
              if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(getState().cities);
              render();
              if(window.SLG.GameMap) window.SLG.GameMap.render();
              if(window.SLG.saveState) window.SLG.saveState('important');
            }
          );
        }
      });
    }

    /* ── tbody 委派事件 ── */
    const tbody = document.getElementById('cityTableBody');
    if(tbody && !tbody.dataset.bound){
      tbody.dataset.bound = '1';

      tbody.addEventListener('click', (e) => {
        /* 分級儲存 / 取消 */
        const tierSaveBtn = e.target.closest('[data-action="save-tier"]');
        if(tierSaveBtn){
          e.preventDefault();
          e.stopPropagation();
          saveTierEdit(tierSaveBtn.dataset.id);
          return;
        }
        const tierCancelBtn = e.target.closest('[data-action="cancel-tier"]');
        if(tierCancelBtn){
          e.preventDefault();
          e.stopPropagation();
          cancelTierEdit();
          return;
        }

        /* 分級編輯：點人數 cell */
        const memberCell = e.target.closest('.city-member-cell');
        if(memberCell){
          if(memberCell.classList.contains('disabled-cell')) return;
          if(memberCell.classList.contains('tier-editing')) return;
          e.preventDefault();
          e.stopPropagation();
          const cityId = memberCell.dataset.cityId;
          if(cityId) startTierEdit(cityId);
          return;
        }

        /* 行內編輯儲存 / 取消 */
        const saveBtn = e.target.closest('[data-action="save-city-inline"]');
        if(saveBtn){
          e.preventDefault();
          saveInlineEditCity(saveBtn.dataset.id);
          return;
        }
        const cancelBtn = e.target.closest('[data-action="cancel-city-inline"]');
        if(cancelBtn){
          e.preventDefault();
          cancelInlineEditCity();
          return;
        }

        /* 進入行內編輯 */
        const editBtn = e.target.closest('[data-action="edit-city"]');
        if(editBtn){
          e.preventDefault();
          startInlineEditCity(editBtn.dataset.id);
          return;
        }

        /* 刪除 */
        const delBtn = e.target.closest('[data-action="del-city"]');
        if(delBtn){
          e.preventDefault();
          const id = delBtn.dataset.id;
          const c = getState().cities.find(x => x.id === id);
          if(!c) return;
          if(typeof window.SLG.showConfirm === 'function'){
            window.SLG.showConfirm(
              '刪除城池',
              `確定刪除「${c.name}」？\n\n將連動刪除：節點、相關路線、宣戰指示。`,
              async () => {
                if(window.SLG.DataSyncManager){
                  await window.SLG.DataSyncManager.deleteCityCascade(id);
                } else {
                  window.SLG.deleteEntity('city', id);
                }
                if(window.SLG.computeDefStartTimes){
                  window.SLG.computeDefStartTimes(getState().cities);
                }
                render();
                if(window.SLG.GameMap){
                  if(window.SLG.GameMap.invalidateLayout) window.SLG.GameMap.invalidateLayout();
                  window.SLG.GameMap.render();
                }
                if(window.SLG.RouteManager) window.SLG.RouteManager.render();
                if(window.SLG.WarManager) window.SLG.WarManager.render();
                if(window.SLG.saveState) window.SLG.saveState('important');
              }
            );
          }
          return;
        }
      });

      tbody.addEventListener('change', e => {
        if(e.target.classList.contains('city-cb')) updateBatchBar();
      });

      tbody.addEventListener('input', (e) => {
        if(!e.target.matches('[data-tier-field]')) return;
        const tr = e.target.closest('tr.tier-edit-row');
        if(!tr) return;
        updateTierEditPreview(tr);
      });

      tbody.addEventListener('keydown', (e) => {
        const tierRow = e.target.closest('tr.tier-edit-row');
        if(tierRow){
          const parentId = tierRow.dataset.parentId;
          if(e.key === 'Enter'){
            e.preventDefault();
            saveTierEdit(parentId);
          } else if(e.key === 'Escape'){
            e.preventDefault();
            cancelTierEdit();
          }
          return;
        }

        if(!e.target.matches('input, select')) return;
        const tr = e.target.closest('tr.inline-editing');
        if(!tr) return;
        if(e.key === 'Enter'){
          e.preventDefault();
          const saveBtn = tr.querySelector('[data-action="save-city-inline"]');
          if(saveBtn) saveBtn.click();
        } else if(e.key === 'Escape'){
          e.preventDefault();
          const cancelBtn = tr.querySelector('[data-action="cancel-city-inline"]');
          if(cancelBtn) cancelBtn.click();
        }
      });
    }
  }

  /* ══════════════════════════════════════════════════════
     批次操作
     ══════════════════════════════════════════════════════ */
  function getCheckedIds(){
    return [...document.querySelectorAll('.city-table .city-cb:checked')].map(cb => cb.dataset.id);
  }

  function updateBatchBar(){
    const ids = getCheckedIds();
    const bar = document.getElementById('cityBatchBar');
    const cnt = document.getElementById('cityBatchCount');
    if(bar) bar.style.display = ids.length > 0 ? '' : 'none';
    if(cnt) cnt.textContent = ids.length;
  }

  function applyBatch(field, value){
    const state = getState();
    const ids = getCheckedIds();
    if(ids.length === 0){ alert('請先勾選城池'); return; }
    for(const id of ids){
      const city = state.cities.find(c => c.id === id);
      if(!city) continue;
      city[field] = value;
      state.entityRev.city[id] = (state.entityRev.city[id] || 0) + 1;
      if(window.SLG.markDirty) window.SLG.markDirty('city', id);
    }
    if(window.SLG.tickLamport) window.SLG.tickLamport();
    if(window.SLG.flushPatches) window.SLG.flushPatches();
    if(window.SLG.saveState) window.SLG.saveState('important');
    render();
    if(field === 'zoneId' && window.SLG.GameMap && window.SLG.GameMap.refreshZoneSelector){
      window.SLG.GameMap.refreshZoneSelector();
    }
    if(window.SLG.GameMap) window.SLG.GameMap.render();
    if(window.SLG.R && window.SLG.R.renderCities) window.SLG.R.renderCities();
    if(window.SLG.renderOverview) window.SLG.renderOverview();
    logSystem(`✅ 已批次修改 ${ids.length} 座城池`);
  }

  /* ══════════════════════════════════════════════════════
     篩選 / 排序
     ══════════════════════════════════════════════════════ */
  function getFilteredCities(){
    const state = getState();
    const mapFilter = document.getElementById('cityFilterMap')?.value || 'active';
    const zoneId = document.getElementById('cityFilterZone')?.value || 'all';
    const allianceId = document.getElementById('cityFilterAlliance')?.value || 'all';
    const side = document.getElementById('cityFilterSide')?.value || 'all';
    const locFilter = document.getElementById('cityFilterLoc')?.value || 'all';  /* ★ v9.0.4 */
    const sortBy = document.getElementById('citySortBy')?.value || 'default';
    const search = (document.getElementById('citySearchInput')?.value || '').trim().toLowerCase();

    const activeMapId = state.mapLibrary.activeMapId || '';
    const getMapIdOf = (c) => {
      if(c.mapNode && c.mapNode.mapId) return c.mapNode.mapId;
      const z = state.zones.find(z => z.id === c.zoneId);
      return (z && z.mapId) || '';
    };

    let cities = state.cities.filter(c => {
      /* 地圖篩選 */
      if(mapFilter === 'active' && activeMapId){
        const mapId = getMapIdOf(c);
        if(mapId && mapId !== activeMapId) return false;
      } else if(mapFilter !== 'active' && mapFilter !== 'all'){
        const mapId = getMapIdOf(c);
        if(mapId !== mapFilter) return false;
      }
      /* 其他篩選 */
      if(zoneId !== 'all' && c.zoneId !== zoneId) return false;
      if(allianceId !== 'all' && c.allianceId !== allianceId) return false;
      if(side !== 'all' && c.side !== side) return false;
      /* ★ v9.0.4：定位狀態篩選 */
      if(locFilter !== 'all'){
        const loc = getCityLocationStatus(c);
        if(loc.status !== locFilter) return false;
      }
      if(search){
        const hay = (c.name + ' ' + (c.code || '')).toLowerCase();
        if(!hay.includes(search)) return false;
      }
      return true;
    });

    /* 排序 */
    const mapName = id => state.mapLibrary.index?.[id]?.name || '（無地圖）';
    const zoneName = id => state.zones.find(z => z.id === id)?.name || '（未分配）';
    const allianceName = id => state.alliances.find(a => a.id === id)?.name || '';

    if(sortBy === 'map'){
      cities.sort((a, b) => mapName(getMapIdOf(a)).localeCompare(mapName(getMapIdOf(b)), 'zh-Hant'));
    } else if(sortBy === 'zone'){
      cities.sort((a, b) => zoneName(a.zoneId).localeCompare(zoneName(b.zoneId), 'zh-Hant'));
    } else if(sortBy === 'alliance'){
      cities.sort((a, b) => allianceName(a.allianceId).localeCompare(allianceName(b.allianceId), 'zh-Hant'));
    } else if(sortBy === 'name'){
      cities.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    } else if(sortBy === 'code'){
      cities.sort((a, b) => (a.code || '').localeCompare(b.code || '', 'zh-Hant'));
    } else if(sortBy === 'level'){
      cities.sort((a, b) => (b.level || 1) - (a.level || 1));
    } else if(sortBy === 'power'){
      cities.sort((a, b) => (Number(b.totalPower) || 0) - (Number(a.totalPower) || 0));
    }
    return cities;
  }

  /* ══════════════════════════════════════════════════════
     人數 cell（含懸停明細）
     ══════════════════════════════════════════════════════ */
  function renderMemberCell(c, isEditingInline){
    if(isEditingInline){
      return `<td class="col-num">—</td>`;
    }
    const isTierEditing = (editingCityTierId === c.id);
    const cls = `col-num city-member-cell${isTierEditing ? ' tier-editing' : ''}`;
    const title = isTierEditing ? '編輯中' : '點擊編輯分級人數';

    const hasTiers = c.tierCounts &&
      (c.tierCounts.tier1 || c.tierCounts.tier2 || c.tierCounts.tier3 || c.tierCounts.tier4);

    if(!hasTiers){
      return `<td class="${cls}" data-city-id="${c.id}" title="${title}">${c.memberCount || 0}</td>`;
    }

    const state = getState();
    const tiers = state.troopTiers.tiers;
    const tc = c.tierCounts;
    const detailRows = [];
    if(tc.tier1 > 0) detailRows.push(`<div class="row"><span>≤${tiers[0].maxLevel}級</span><b>${tc.tier1} 人</b></div>`);
    if(tc.tier2 > 0) detailRows.push(`<div class="row"><span>≤${tiers[1].maxLevel}級</span><b>${tc.tier2} 人</b></div>`);
    if(tc.tier3 > 0) detailRows.push(`<div class="row"><span>≤${tiers[2].maxLevel}級</span><b>${tc.tier3} 人</b></div>`);
    if(tc.tier4 > 0) detailRows.push(`<div class="row"><span>≥25級</span><b>${tc.tier4} 人</b></div>`);

    return `<td class="${cls}" data-city-id="${c.id}" title="${title}">
      ${c.memberCount || 0}
      <div class="member-detail">${detailRows.join('')}</div>
    </td>`;
  }

  /* ══════════════════════════════════════════════════════
     分級編輯行（展開面板）
     ══════════════════════════════════════════════════════ */
  function renderTierEditRow(c){
    const state = getState();
    const tiers = state.troopTiers.tiers;
    const tc = c.tierCounts || { tier1: 0, tier2: 0, tier3: 0, tier4: 0 };
    const t1 = tc.tier1 || 0;
    const t2 = tc.tier2 || 0;
    const t3 = tc.tier3 || 0;
    const t4 = tc.tier4 || 0;
    const calc = calcTeamsFromTiers({ tier1: t1, tier2: t2, tier3: t3, tier4: t4 });

    const t1Teams = Math.floor(t1 * (tiers[0].teamsPerPlayer || 0));
    const t2Teams = Math.floor(t2 * (tiers[1].teamsPerPlayer || 0));
    const t3Teams = Math.floor(t3 * (tiers[2].teamsPerPlayer || 0));
    const t4Teams = Math.floor(t4 * (tiers[3].teamsPerPlayer || 0));

    return `<tr class="tier-edit-row" data-parent-id="${c.id}">
      <td colspan="14">
        <div class="tier-edit-panel">
          <div class="tier-edit-panel-header">
            👥 分級人數編輯：<span style="color:var(--text-primary);">${esc(c.name)}</span>${c.code ? ` <span style="color:var(--neon-blue);font-size:10px;">[${esc(c.code)}]</span>` : ''}
          </div>
          <div class="tier-edit-panel-rows">
            <div class="tier-edit-panel-row">
              <span class="tier-name">≤${tiers[0].maxLevel} 級</span>
              <input type="number" data-tier-field="tier1" value="${t1}" min="0" step="1" placeholder="0">
              <span class="tier-calc">× ${tiers[0].teamsPerPlayer} = <b data-tier-teams="1">${t1Teams}</b> 隊</span>
            </div>
            <div class="tier-edit-panel-row">
              <span class="tier-name">≤${tiers[1].maxLevel} 級</span>
              <input type="number" data-tier-field="tier2" value="${t2}" min="0" step="1" placeholder="0">
              <span class="tier-calc">× ${tiers[1].teamsPerPlayer} = <b data-tier-teams="2">${t2Teams}</b> 隊</span>
            </div>
            <div class="tier-edit-panel-row">
              <span class="tier-name">≤${tiers[2].maxLevel} 級</span>
              <input type="number" data-tier-field="tier3" value="${t3}" min="0" step="1" placeholder="0">
              <span class="tier-calc">× ${tiers[2].teamsPerPlayer} = <b data-tier-teams="3">${t3Teams}</b> 隊</span>
            </div>
            <div class="tier-edit-panel-row">
              <span class="tier-name">≥25 級</span>
              <input type="number" data-tier-field="tier4" value="${t4}" min="0" step="1" placeholder="0">
              <span class="tier-calc">× ${tiers[3].teamsPerPlayer} = <b data-tier-teams="4">${t4Teams}</b> 隊</span>
            </div>
          </div>
          <div class="tier-edit-panel-total">
            <span>總人數：<b data-tier-total="members">${calc.totalMembers}</b> 人</span>
            <span>總隊數：<b data-tier-total="teams">${calc.totalTeams}</b> 隊</span>
          </div>
          <div class="tier-edit-panel-actions">
            <button class="btn btn-ghost btn-sm" data-action="cancel-tier" data-id="${c.id}">✕ 取消</button>
            <button class="btn btn-success btn-sm" data-action="save-tier" data-id="${c.id}">💾 儲存</button>
          </div>
        </div>
      </td>
    </tr>`;
  }

  function updateTierEditPreview(tr){
    if(!tr) return;
    const state = getState();
    const tiers = state.troopTiers.tiers;
    const v = (n) => parseFloat(tr.querySelector(`[data-tier-field="tier${n}"]`)?.value) || 0;
    const t1 = Math.max(0, v(1));
    const t2 = Math.max(0, v(2));
    const t3 = Math.max(0, v(3));
    const t4 = Math.max(0, v(4));

    const setText = (sel, val) => {
      const el = tr.querySelector(sel);
      if(el) el.textContent = val;
    };
    setText('[data-tier-teams="1"]', Math.floor(t1 * (tiers[0].teamsPerPlayer || 0)));
    setText('[data-tier-teams="2"]', Math.floor(t2 * (tiers[1].teamsPerPlayer || 0)));
    setText('[data-tier-teams="3"]', Math.floor(t3 * (tiers[2].teamsPerPlayer || 0)));
    setText('[data-tier-teams="4"]', Math.floor(t4 * (tiers[3].teamsPerPlayer || 0)));

    const calc = calcTeamsFromTiers({ tier1: t1, tier2: t2, tier3: t3, tier4: t4 });
    setText('[data-tier-total="members"]', calc.totalMembers);
    setText('[data-tier-total="teams"]', calc.totalTeams);
  }

  function startTierEdit(cityId){
    if(editingCityTierId === cityId) return;
    if(editingCityRowId){ editingCityRowId = null; }
    editingCityTierId = cityId;
    render();
    setTimeout(() => {
      const tr = document.querySelector(`tr.tier-edit-row[data-parent-id="${cityId}"]`);
      if(tr){
        const firstInput = tr.querySelector('input[data-tier-field="tier1"]');
        if(firstInput){ firstInput.focus(); firstInput.select(); }
      }
    }, 0);
  }

  function cancelTierEdit(){
    editingCityTierId = null;
    render();
  }

  function saveTierEdit(cityId){
    const state = getState();
    const tr = document.querySelector(`tr.tier-edit-row[data-parent-id="${cityId}"]`);
    if(!tr) return false;
    const city = state.cities.find(c => c.id === cityId);
    if(!city) return false;

    const v = (n) => parseFloat(tr.querySelector(`[data-tier-field="tier${n}"]`)?.value) || 0;
    const t1 = v(1);
    const t2 = v(2);
    const t3 = v(3);
    const t4 = v(4);

    if(t1 < 0 || t2 < 0 || t3 < 0 || t4 < 0){
      alert('⚠️ 人數不可為負數');
      return false;
    }

    const tierCounts = { tier1: t1, tier2: t2, tier3: t3, tier4: t4 };
    const calc = calcTeamsFromTiers(tierCounts);
    const hasAnyTier = (t1 + t2 + t3 + t4) > 0;

    const updated = { ...city };
    updated.memberCount = calc.totalMembers;
    updated.totalTeams = calc.totalTeams;
    updated.avgPower = calc.totalTeams > 0
      ? Math.floor((Number(city.totalPower) || 0) / calc.totalTeams)
      : 0;

    if(hasAnyTier){
      updated.tierCounts = tierCounts;
    } else {
      delete updated.tierCounts;
    }

    window.SLG.upsertEntity('city', updated);
    if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(state.cities);
    editingCityTierId = null;
    render();
    if(window.SLG.GameMap) window.SLG.GameMap.render();
    if(window.SLG.R && window.SLG.R.renderCities) window.SLG.R.renderCities();
    if(window.SLG.renderOverview) window.SLG.renderOverview();
    window.SLG.saveState('important');
    logSystem(`✅ 已更新「${city.name}」分級人數：${calc.totalMembers} 人 / ${calc.totalTeams} 隊`);
    return true;
  }

  /* ══════════════════════════════════════════════════════
     主渲染
     ══════════════════════════════════════════════════════ */
  function render(){
    const state = getState();
    populateFilters();
    populateBatchZoneOptions();
    populateBatchAllianceOptions();

    const list = getFilteredCities();
    const tbody = document.getElementById('cityTableBody');
    const editingId = editingCityRowId;

    if(tbody){
      if(list.length === 0){
        tbody.innerHTML = '<tr><td colspan="14" class="city-table-empty">無城池資料</td></tr>';
      } else {
        tbody.innerHTML = list.map(c => {
          const isEditingInline = (editingId === c.id);
          const isTierEditing = (editingCityTierId === c.id);
          const zone = state.zones.find(z => z.id === c.zoneId);
          const mapId = (c.mapNode && c.mapNode.mapId) || (zone && zone.mapId) || '';
          const mapMeta = state.mapLibrary.index?.[mapId];
          const mapName = mapMeta?.name || (mapId ? '（未知）' : '—');
          const alliance = state.alliances.find(a => a.id === c.allianceId);
          const avg = c.totalTeams > 0 ? Math.floor((Number(c.totalPower)||0) / c.totalTeams) : null;
          const icon = (alliance && alliance.icon) ? alliance.icon + ' ' : '';
          const avgDisplay = avg === null || !isFinite(avg) ? '—' : formatAvgPower(avg);
          const yi = (Number(c.totalPower) || 0) / 1e8;

          let rowHtml = '';

          if(isEditingInline){
            const mapOpts = '<option value="">（不指定）</option>' +
              Object.entries(state.mapLibrary.index || {}).map(([mid, m]) =>
                `<option value="${mid}" ${mid === mapId ? 'selected' : ''}>${esc(m.name)}</option>`
              ).join('');
            const zoneOpts = '<option value="">（未分配）</option>' +
              state.zones
                .filter(z => !mapId || !z.mapId || z.mapId === mapId)
                .map(z => `<option value="${z.id}" ${z.id === c.zoneId ? 'selected' : ''}>${esc(z.name)}</option>`)
                .join('');
            const allianceOpts = '<option value="">（不指定 / NPC）</option>' +
              state.alliances.map(a =>
                `<option value="${a.id}" ${a.id === c.allianceId ? 'selected' : ''}>${a.icon ? a.icon + ' ' : ''}${esc(a.name)}</option>`
              ).join('');
            const sideOpts = ['self','ally','enemy','common_enemy','npc'].map(s =>
              `<option value="${s}" ${s === c.side ? 'selected' : ''}>${sideLabel(s)}</option>`
            ).join('');

            rowHtml = `<tr data-city-id="${c.id}" class="inline-editing">
              <td><input type="checkbox" class="city-cb" data-id="${c.id}" disabled></td>
              <td class="inline-select-td"><select data-inline-field="mapId">${mapOpts}</select></td>
              <td class="inline-select-td"><select data-inline-field="zoneId">${zoneOpts}</select></td>
              <td class="inline-select-td"><select data-inline-field="allianceId">${allianceOpts}</select></td>
              <td class="inline-select-td"><select data-inline-field="side">${sideOpts}</select></td>
              <td><input type="text" class="inline-num-input" data-inline-field="code" value="${esc(c.code||'')}" maxlength="20" placeholder="編號"></td>
              <td class="city-name"><input type="text" class="inline-name-input" data-inline-field="name" value="${esc(c.name)}" maxlength="20"></td>
              <td><input type="number" class="inline-num-input" data-inline-field="level" value="${c.level||1}" min="1" max="10" step="1"></td>
              <td class="col-num"><input type="number" class="inline-num-input" data-inline-field="memberCount" value="${c.memberCount||0}" min="0" step="1"></td>
              <td class="col-num">
                <div class="inline-power-wrap">
                  <input type="number" class="inline-power-input" data-inline-field="totalPowerYi" value="${yi.toFixed(2)}" step="0.01" min="0">
                  <span class="inline-unit">億</span>
                </div>
              </td>
              <td class="col-num"><input type="number" class="inline-num-input" data-inline-field="totalTeams" value="${c.totalTeams||0}" min="0" step="1"></td>
              <td class="col-num inline-avg-preview" data-inline-preview="avgPower">—</td>
              <td class="city-loc-cell">${renderLocationBadge(c)}</td>
              <td class="col-actions">
                <button class="btn btn-success btn-sm" data-action="save-city-inline" data-id="${c.id}" title="儲存">💾</button>
                <button class="btn btn-ghost btn-sm" data-action="cancel-city-inline" data-id="${c.id}" title="取消">✕</button>
              </td>
            </tr>`;
          } else {
            const codeChip = c.code
              ? `<span class="city-code-chip">${esc(c.code)}</span>`
              : '<span class="text-dim">—</span>';
            const mapCell = mapId
              ? `<span class="city-map-chip" title="${esc(mapName)}">🗺️ ${esc(mapName)}</span>`
              : '<span class="text-dim">—</span>';
            rowHtml = `<tr class="${c.isCapital ? 'row-self' : ''}" data-city-id="${c.id}">
              <td><input type="checkbox" class="city-cb" data-id="${c.id}"></td>
              <td class="city-map-cell">${mapCell}</td>
              <td>${zone ? esc(zone.name) : '<span class="text-dim">—</span>'}</td>
              <td>${icon}${alliance ? esc(alliance.name) : '<span class="text-dim">NPC</span>'}</td>
              <td><span class="chip ${sideClass(c.side)}" style="font-size:9px;">${sideLabel(c.side)}</span></td>
              <td class="city-code-cell">${codeChip}</td>
              <td class="city-name">${c.isCapital ? '👑 ' : ''}${esc(c.name)}</td>
              <td><span class="chip" style="font-size:9px;">Lv.${c.level||1}</span></td>
              ${renderMemberCell(c, false)}
              <td class="col-num">${formatPower(c.totalPower)}</td>
              <td class="col-num">${c.totalTeams || '—'}</td>
              <td class="col-num">${avgDisplay}</td>
              <td class="city-loc-cell">${renderLocationBadge(c)}</td>
              <td>
                <button class="btn btn-primary btn-sm" data-action="edit-city" data-id="${c.id}">✏️</button>
                <button class="btn btn-danger btn-sm" data-action="del-city" data-id="${c.id}">🗑️</button>
              </td>
            </tr>`;
          }

          if(isTierEditing){
            rowHtml += renderTierEditRow(c);
          }

          return rowHtml;
        }).join('');
      }
    }

    /* ── 行內編輯的即時預覽（平均戰力）── */
    if(tbody){
      tbody.querySelectorAll('tr.inline-editing').forEach(tr => {
        const teamsEl = tr.querySelector('[data-inline-field="totalTeams"]');
        const powerEl = tr.querySelector('[data-inline-field="totalPowerYi"]');
        const preview = tr.querySelector('[data-inline-preview="avgPower"]');
        const updatePreview = () => {
          const teams = parseFloat(teamsEl?.value) || 0;
          const yi = parseFloat(powerEl?.value) || 0;
          const total = Math.round(yi * 1e8);
          const avg = teams > 0 ? Math.floor(total / teams) : 0;
          if(preview) preview.textContent = avg > 0 ? formatAvgPower(avg) : '—';
        };
        if(teamsEl) teamsEl.addEventListener('input', updatePreview);
        if(powerEl) powerEl.addEventListener('input', updatePreview);
        updatePreview();
      });
    }

    updateBatchBar();
    renderDistSummary();

    /* 套用權限 */
    if(typeof window.SLG.applyPermissions === 'function'){
      window.SLG.applyPermissions();
    }
  }

  /* ══════════════════════════════════════════════════════
     篩選下拉填充
     ══════════════════════════════════════════════════════ */
  function populateFilters(){
    const state = getState();

    /* 地圖下拉 */
    const mapSel = document.getElementById('cityFilterMap');
    if(mapSel){
      const cur = mapSel.value || 'active';
      const mapIdx = state.mapLibrary.index || {};
      const mapIds = Object.keys(mapIdx).sort((a,b) => (mapIdx[b].updatedAt||0) - (mapIdx[a].updatedAt||0));
      let html = '<option value="active">🌐 當前地圖</option>';
      html += '<option value="all">📚 全部地圖</option>';
      for(const mid of mapIds){
        html += `<option value="${mid}">${esc(mapIdx[mid].name || '未命名')}</option>`;
      }
      mapSel.innerHTML = html;
      const valid = ['active','all'].concat(mapIds);
      mapSel.value = valid.includes(cur) ? cur : 'active';
    }

    /* 戰區下拉（依地圖篩選） */
    const zSel = document.getElementById('cityFilterZone');
    if(zSel){
      const cur = zSel.value;
      const mapSelVal = mapSel?.value || 'active';
      let zones = state.zones;
      if(mapSelVal === 'active' && state.mapLibrary.activeMapId){
        zones = state.zones.filter(z => !z.mapId || z.mapId === state.mapLibrary.activeMapId);
      } else if(mapSelVal !== 'active' && mapSelVal !== 'all'){
        zones = state.zones.filter(z => !z.mapId || z.mapId === mapSelVal);
      }
      zSel.innerHTML = '<option value="all">全部</option>' +
        zones.map(z => `<option value="${z.id}">${esc(z.name)}</option>`).join('');
      zSel.value = cur && zones.find(z => z.id === cur) ? cur : 'all';
    }

    /* 盟下拉 */
    const aSel = document.getElementById('cityFilterAlliance');
    if(aSel){
      const cur = aSel.value;
      aSel.innerHTML = '<option value="all">全部</option>' +
        state.alliances.map(a =>
          `<option value="${a.id}">${a.icon ? a.icon + ' ' : ''}${esc(a.name)}</option>`
        ).join('');
      aSel.value = cur && state.alliances.find(a => a.id === cur) ? cur : 'all';
    }
  }

  function populateBatchZoneOptions(){
    const state = getState();
    const sel = document.getElementById('cityBatchZone');
    if(!sel) return;
    const cur = sel.value;
    let html = '<option value="">更改戰區...</option>';
    html += '<option value="__CLEAR__">（清除戰區 / 未分配）</option>';
    html += state.zones.map(z => `<option value="${z.id}">${esc(z.name)}</option>`).join('');
    sel.innerHTML = html;
    if(cur){
      const valid = (cur === '__CLEAR__') || state.zones.find(z => z.id === cur);
      if(valid) sel.value = cur;
    }
  }

  function populateBatchAllianceOptions(){
    const state = getState();
    const sel = document.getElementById('cityBatchAlliance');
    if(!sel) return;
    sel.innerHTML = '<option value="">更改所屬盟...</option>' +
      state.alliances.map(a =>
        `<option value="${a.id}">${a.icon ? a.icon + ' ' : ''}${esc(a.name)}</option>`
      ).join('');
  }

  /* ══════════════════════════════════════════════════════
     聯盟分佈摘要（城清單底部）
     ══════════════════════════════════════════════════════ */
  function renderDistSummary(){
    const el = document.getElementById('allianceDistSummary');
    if(!el) return;
    const state = getState();
    if(state.alliances.length === 0){
      el.innerHTML = '<div class="text-dim">尚未建立同盟</div>';
      return;
    }
    el.innerHTML = state.alliances.map(a => {
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

  /* ══════════════════════════════════════════════════════
     行內編輯（城池）
     ══════════════════════════════════════════════════════ */
  function startInlineEditCity(id){
    if(editingCityRowId === id) return;
    if(editingCityTierId){ editingCityTierId = null; }
    editingCityRowId = id;
    render();
    setTimeout(() => {
      const tr = document.querySelector(`tr[data-city-id="${id}"]`);
      if(tr){
        const nameInput = tr.querySelector('[data-inline-field="name"]');
        if(nameInput){ nameInput.focus(); nameInput.select(); }
      }
    }, 0);
  }

  function cancelInlineEditCity(){
    editingCityRowId = null;
    render();
  }

  function saveInlineEditCity(id){
    const state = getState();
    const tr = document.querySelector(`tr[data-city-id="${id}"]`);
    if(!tr) return false;
    const city = state.cities.find(c => c.id === id);
    if(!city) return false;

    const getVal = (field) => {
      const el = tr.querySelector(`[data-inline-field="${field}"]`);
      return el ? el.value : '';
    };

    const name = String(getVal('name') || '').trim();
    const code = String(getVal('code') || '').trim();
    const level = parseInt(getVal('level'), 10) || 1;
    const mapId = String(getVal('mapId') || '');
    const zoneId = String(getVal('zoneId') || '');
    const allianceId = String(getVal('allianceId') || '');
    const side = String(getVal('side') || 'self');
    const memberCount = parseFloat(getVal('memberCount')) || 0;
    const totalPowerYi = parseFloat(getVal('totalPowerYi')) || 0;
    const totalPower = Math.round(totalPowerYi * 1e8);
    const totalTeams = parseFloat(getVal('totalTeams')) || 0;

    if(!name){ alert('城池名稱不能為空'); return false; }
    if(name.length > 20){ alert('城池名稱最多 20 字'); return false; }
    if(level < 1 || level > 10){ alert('等級必須在 1~10 之間'); return false; }

    const avgPower = totalTeams > 0 ? Math.floor(totalPower / totalTeams) : 0;
    const updated = {
      ...city, name, code, zoneId, allianceId, side,
      level, memberCount, totalPower, totalTeams, avgPower
    };
    delete updated.tierCounts;

    /* 地圖變更：若 mapId 有變 → 清舊 mapNode */
    const oldMapId = (city.mapNode && city.mapNode.mapId) || '';
    if(mapId !== oldMapId){
      delete updated.mapNode;
    }

    window.SLG.upsertEntity('city', updated);

    /* 若指定了地圖但無座標 → 用 DataSyncManager 分配 */
    if(mapId && !updated.mapNode && window.SLG.DataSyncManager){
      const hash = (str) => {
        let h = 0;
        for(let k = 0; k < str.length; k++) h = ((h << 5) - h) + str.charCodeAt(k);
        return Math.abs(h);
      };
      const h = hash(id);
      const ang = (h % 360) * Math.PI / 180;
      const r = 400 + (h % 300);
      const x = 1000 + Math.cos(ang) * r;
      const y = 1000 + Math.sin(ang) * r;
      window.SLG.DataSyncManager.setNode(id, x, y, {
        source: 'manual',
        mapId,
      });
    } else if(!mapId){
      if(city.mapNode && window.SLG.DataSyncManager){
        window.SLG.DataSyncManager.deleteNode(id, { silent: true });
      }
    } else {
      if(window.SLG.DataSyncManager){
        window.SLG.DataSyncManager.renameCity(id);
      }
    }

    if(window.SLG.computeDefStartTimes) window.SLG.computeDefStartTimes(state.cities);
    editingCityRowId = null;
    render();
    if(window.SLG.GameMap){
      if(window.SLG.GameMap.invalidateLayout) window.SLG.GameMap.invalidateLayout();
      window.SLG.GameMap.render();
    }
    if(window.SLG.R && window.SLG.R.renderCities) window.SLG.R.renderCities();
    if(window.SLG.renderOverview) window.SLG.renderOverview();
    window.SLG.saveState('important');
    logSystem(`✅ 已儲存城池：${name}`);
    return true;
  }

  return {
    init,
    render,
    startInlineEditCity,
    cancelInlineEditCity,
    saveInlineEditCity,
    startTierEdit,
    cancelTierEdit,
    saveTierEdit,
    /* ★ v9.0.4 新增 */
    getCityLocationStatus,
    renderLocationBadge,
  };
})();

/* ============================================================
   暴露
   ============================================================ */
Object.assign(window.SLG, {
  CityManager,
});

})();
/* ============================================================================
 * ui-city.js 結束（v9.0.4）
 * ★ v9.0.4 變更摘要：
 *   1. 新增 getCityLocationStatus() — 定位狀態計算
 *   2. 新增 renderLocationBadge() — 定位徽章渲染
 *   3. 表格新增「📍 定位」欄位（td）
 *   4. 卡片新增定位徽章
 *   5. 篩選器支援 cityFilterLoc
 *   6. colspan 13 → 14
 *   7. 表格空資料提示更新
 *   8. 行內編輯新增定位 cell
 *   9. 分級編輯 colspan 13 → 14
 * ========================================================================== */
