// ==UserScript==
// @name         四级课件 · B站网页全屏
// @namespace    https://cet4.owenwoow.com/
// @version      1.0.0
// @description  从四级课件打开的讲解视频直接铺满网页，不模拟点击；其他视频可从油猴菜单手动启用。
// @match        https://www.bilibili.com/video/*
// @run-at       document-start
// @noframes
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  "use strict";

  const CLASS = "cet4-webfull";
  let active = new URL(location.href).searchParams.get("cet4_webfull") === "1";
  let command;

  // 提前声明布局，播放器节点一出现就使用；不调用 B 站按钮、私有接口或系统全屏。
  // 不重建、不搬动 video，保留登录状态、清晰度、分 P 和时间点。
  GM_addStyle(`
    html.${CLASS}, html.${CLASS} body {
      overflow: hidden !important;
      background: #000 !important;
    }
    html.${CLASS} body { visibility: hidden !important; }
    html.${CLASS} #app,
    html.${CLASS} #mirror-vdcon,
    html.${CLASS} .left-container,
    html.${CLASS} #playerWrap {
      transform: none !important;
      filter: none !important;
      perspective: none !important;
      contain: none !important;
      isolation: auto !important;
      overflow: visible !important;
      z-index: auto !important;
    }
    html.${CLASS} #bilibili-player {
      visibility: visible !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      z-index: 2147483646 !important;
      background: #000 !important;
    }
    html.${CLASS} #bilibili-player .bpx-player-container,
    html.${CLASS} #bilibili-player .bpx-player-primary-area {
      width: 100% !important;
      height: 100% !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: none !important;
      max-height: none !important;
    }
    html.${CLASS} #bilibili-player .bpx-player-sending-bar {
      display: none !important;
    }
    html.${CLASS} .bpx-player-ctrl-web-enter { display: none !important; }
    html.${CLASS} .bpx-player-ctrl-web-leave { display: block !important; }
  `);

  function apply() {
    document.documentElement.classList.toggle(CLASS, active);
  }

  function toggle() {
    active = !active;
    apply();
    updateMenu();
  }

  function updateMenu() {
    if (command != null) GM_unregisterMenuCommand(command);
    command = GM_registerMenuCommand(active ? "退出网页全屏（本页）" : "开启网页全屏（本页）", toggle);
  }

  // document-start 时根节点尚未出现的浏览器：在第一个节点插入后立即设置。
  if (document.documentElement) apply();
  else {
    const observer = new MutationObserver(() => {
      if (!document.documentElement) return;
      apply();
      observer.disconnect();
    });
    observer.observe(document, {childList: true});
  }
  updateMenu();

  // 只响应用户本人的退出操作；不派发点击、按键或轮询全屏按钮。
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !active || document.fullscreenElement) return;
    toggle();
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  document.addEventListener("click", e => {
    if (!active || !e.target.closest?.(".bpx-player-ctrl-web")) return;
    toggle();
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
})();
