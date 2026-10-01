/* ============================================================================
 * dataMigrations.js — v9.0.0 資料版本遷移系統
 * 職責：
 *   ① 定義資料結構版本（dataVersion）
 *   ② 提供各版本的遷移函式（v0 → v1 → v2 → ...）
 *   ③ 讀取雲端資料時自動執行遷移
 *   ④ 遷移失敗時拋出錯誤（不覆蓋本機）
 * ========================================================================== */
(function(){
'use strict';

window.SLG = window.SLG || {};

const {
  logSystem,
} = window.SLG;

/* ============================================================
   版本號
   ============================================================ */
const APP_VERSION = 'v9.0.0';
const DATA_VERSION = 1;   /* ★ 當前程式支援的最新資料結構版本 */

/* ============================================================
   DataMigrations
   ============================================================ */
const DataMigrations = {
  /* ── 當前版本號 ── */
  current: DATA_VERSION,
  appVersion: APP_VERSION,

  /* ── 遷移函式對照表 ──
   *  key = 來源版本號
   *  value = 從 key → key+1 的遷移函式
   *  說明：
   *    0: 舊版 v8.x 資料 → v9.0.0（補齊新欄位）
   *    1: 未來 v9.x → v10.x 的遷移
   */
  migrations: {

    /* ══════════════════════════════════════════════════
       0 → 1：v8.x（無 dataVersion）→ v9.0.0
       ══════════════════════════════════════════════════ */
    0: function(data){
      if(!data) return data;
      const result = data;

      /* ── 補齊 settings 新欄位 ── */
      if(!result.settings) result.settings = {};
      if(typeof result.settings.routeRequireSameMap !== 'boolean'){
        result.settings.routeRequireSameMap = true;
      }
      if(typeof result.settings.warRequireSameMap !== 'boolean'){
        result.settings.warRequireSameMap = true;
      }
      if(typeof result.settings.attackRequireRoute !== 'boolean'){
        result.settings.attackRequireRoute = false;
      }
      if(typeof result.settings.crossZoneWarAllowed !== 'boolean'){
        result.settings.crossZoneWarAllowed = false;
      }

      /* ── 補齊 zones 的 mapId ── */
      if(Array.isArray(result.zones)){
        for(const z of result.zones){
          if(typeof z.mapId !== 'string') z.mapId = '';
        }
      }

      /* ── 補齊 cities 的 code / mapNode ── */
      if(Array.isArray(result.cities)){
        for(const c of result.cities){
          if(typeof c.code !== 'string') c.code = '';
          if(c.mapNode && typeof c.mapNode.mapId !== 'string'){
            c.mapNode.mapId = '';
          }
          /* 補齊 attackTargets / defendTargets 陣列 */
          if(!Array.isArray(c.attackTargets)) c.attackTargets = [];
          if(!Array.isArray(c.defendTargets)) c.defendTargets = [];
        }
      }

      /* ── 補齊 alliances ── */
      if(Array.isArray(result.alliances)){
        for(const a of result.alliances){
          if(typeof a.icon !== 'string') a.icon = '';
          if(typeof a.order !== 'number') a.order = 9999;
        }
      }

      /* ── 補齊 routes ── */
      if(!Array.isArray(result.routes)) result.routes = [];

      /* ── 補齊 troopTiers ── */
      if(!result.troopTiers){
        result.troopTiers = {
          tiers: [
            { maxLevel: 17, teamsPerPlayer: 3 },
            { maxLevel: 20, teamsPerPlayer: 4 },
            { maxLevel: 24, teamsPerPlayer: 5 },
            { maxLevel: 'Infinity', teamsPerPlayer: 6 },
          ],
          autoCalcOnImport: true,
          preserveOldTotal: false,
        };
      }

      return result;
    },

    /* ══════════════════════════════════════════════════
       1 → 2：未來擴充（暫無）
       ══════════════════════════════════════════════════ */
    1: function(data){
      /* 未來新增遷移邏輯 */
      return data;
    },

  },

  /* ══════════════════════════════════════════════════════
     自動執行遷移
     @param {Object} raw - 從雲端讀取的原始資料
     @returns {Object} - 遷移後的資料（含 dataVersion）
     @throws {Error} - 遷移失敗時拋出（呼叫端需處理）
     ══════════════════════════════════════════════════════ */
  migrate(raw){
    if(!raw){
      return raw;
    }

    /* 讀取來源版本（無 dataVersion 視為 0） */
    const fromVersion = (typeof raw.dataVersion === 'number') ? raw.dataVersion : 0;
    const toVersion = this.current;

    /* 已是最新版 → 直接回傳 */
    if(fromVersion >= toVersion){
      /* 確保有 dataVersion 欄位 */
      if(typeof raw.dataVersion !== 'number'){
        raw.dataVersion = toVersion;
      }
      return raw;
    }

    console.log(`[遷移] 開始：v${fromVersion} → v${toVersion}`);

    /* 深拷貝，避免修改原始資料 */
    let result;
    try{
      result = JSON.parse(JSON.stringify(raw));
    }catch(e){
      throw new Error('資料無法深拷貝：' + e.message);
    }

    /* 逐版本遷移 */
    for(let v = fromVersion; v < toVersion; v++){
      const fn = this.migrations[v];
      if(typeof fn !== 'function'){
        console.warn(`[遷移] v${v} → v${v + 1} 無對應遷移函式，跳過`);
        continue;
      }
      try{
        result = fn(result);
        console.log(`[遷移] v${v} → v${v + 1} ✅`);
      }catch(e){
        console.error(`[遷移] v${v} → v${v + 1} 失敗`, e);
        throw new Error(`遷移失敗（v${v} → v${v + 1}）：${e.message}`);
      }
    }

    /* 寫入最終版本號 */
    result.dataVersion = toVersion;
    result.appVersion = this.appVersion;
    result.dataUpdatedAt = Date.now();

    console.log(`[遷移] 完成：v${fromVersion} → v${toVersion}`);
    logSystem(`🔀 資料已升級：v${fromVersion} → v${toVersion}`);
    return result;
  },

  /* ══════════════════════════════════════════════════════
     檢查資料結構是否有效
     @param {Object} data
     @returns {boolean}
     ══════════════════════════════════════════════════════ */
  validate(data){
    if(!data) return false;
    if(typeof data !== 'object') return false;

    /* 若有 data 欄位（sharedSandboxes 格式） */
    const payload = data.data || data;

    if(!payload) return false;
    if(!Array.isArray(payload.cities)) return false;
    if(!Array.isArray(payload.alliances)) return false;
    if(!Array.isArray(payload.zones)) return false;
    if(!Array.isArray(payload.routes)) return false;

    return true;
  },

  /* ══════════════════════════════════════════════════════
     檢查是否需要遷移
     @param {Object} data
     @returns {boolean}
     ══════════════════════════════════════════════════════ */
  needsMigration(data){
    if(!data) return false;
    const fromVersion = (typeof data.dataVersion === 'number') ? data.dataVersion : 0;
    return fromVersion < this.current;
  },

  /* ══════════════════════════════════════════════════════
     取得版本資訊（給 UI 顯示）
     ══════════════════════════════════════════════════════ */
  getVersionInfo(data){
    const dv = (data && typeof data.dataVersion === 'number') ? data.dataVersion : 0;
    const av = (data && data.appVersion) ? data.appVersion : 'v8.x';
    return {
      dataVersion: dv,
      appVersion: av,
      currentDataVersion: this.current,
      currentAppVersion: this.appVersion,
      isOutdated: dv < this.current,
    };
  },
};

/* ============================================================
   暴露
   ============================================================ */
Object.assign(window.SLG, {
  APP_VERSION,
  DATA_VERSION,
  DataMigrations,
});

})();