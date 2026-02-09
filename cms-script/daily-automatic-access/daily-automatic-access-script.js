// ==UserScript==
// @name         Daily Auto Open URL List
// @namespace    edge.daily.autourl
// @version      1.1.0
// @description  Open configured URLs automatically once per day, with clear logging.
// @author       Edge
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  'use strict';

  /* =========================
   * 配置区
   * ========================= */

  const URL_LIST = [
    'https://www.skyey2.com/forum.php?mod=forumdisplay&fid=75',
    'https://github.com/',
    'https://news.ycombinator.com/',
  ];

  const OPEN_MODE = 'queue'; // "burst" | "queue"
  const OPEN_INTERVAL_MS = 600; // queue 模式下的延迟
  const MAX_OPEN = 20;

  const STORAGE_KEY_LAST_RUN = 'edge_daily_auto_open_last_date';

  /* =========================
   * 主入口
   * ========================= */

  function main() {
    if (!shouldRunToday()) return;

    const urls = normalizeUrls(URL_LIST);
    if (urls.length === 0) return;
    if (isCurrentPageInList(urls)) return;

    openUrls(urls);
    markRunToday();
    logRunInfo();
  }

  /* =========================
   * 时间 / 状态控制
   * ========================= */

  function shouldRunToday() {
    const lastDate = GM_getValue(STORAGE_KEY_LAST_RUN, null);
    const today = getTodayString();
    return lastDate !== today;
  }

  function markRunToday() {
    GM_setValue(STORAGE_KEY_LAST_RUN, getTodayString());
  }

  function getTodayString() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function getNextRunDateString() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  /* =========================
   * URL 处理
   * ========================= */

  function normalizeUrls(list) {
    return list
      .filter(Boolean)
      .slice(0, MAX_OPEN)
      .map(u => {
        try {
          return new URL(u, location.href).href;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  function isCurrentPageInList(urls) {
    const current = location.href;
    return urls.some(u => looselySameUrl(u, current));
  }

  function looselySameUrl(a, b) {
    try {
      const ua = new URL(a);
      const ub = new URL(b);
      return ua.origin === ub.origin && ua.pathname === ub.pathname;
    } catch {
      return false;
    }
  }

  /* =========================
   * 打开逻辑
   * ========================= */

  function openUrls(urls) {
    if (OPEN_MODE === 'burst') {
      urls.forEach(openOne);
    } else {
      urls.forEach((u, i) => {
        setTimeout(() => openOne(u), i * OPEN_INTERVAL_MS);
      });
    }
  }

  function openOne(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /* =========================
   * 日志
   * ========================= */

  function logRunInfo() {
    const now = new Date();

    console.log('[Daily Auto Open] Triggered successfully', {
      currentDate: getTodayString(),
      currentTime: now.toLocaleString(),
      nextRunDate: getNextRunDateString(),
    });
  }

  /* =========================
   * 启动
   * ========================= */

  main();
})();
