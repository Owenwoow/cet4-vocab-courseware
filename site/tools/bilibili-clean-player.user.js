// ==UserScript==
// @name         B站外链播放器净化
// @namespace    https://cet4.owenwoow.com/
// @version      1.0.0
// @description  隐藏外链播放器的推荐、标题、作者和引流提示，保留视频画面与播放控件。
// @match        https://player.bilibili.com/player.html*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(() => {
  "use strict";

  // 必须在 B 站播放器所在的 iframe 内运行，因此不要添加 @noframes。
  // 只隐藏已核对的独立浮层，不动视频、字幕、缓冲提示、报错和底部控制栏。
  // 样式会自动作用于后来插入的推荐卡片，无需定时扫描或删除节点。
  GM_addStyle(`
    /* 顶部视频标题、作者、关注、点赞、评论、分享。 */
    .bpx-player-container .bpx-player-top-wrap,
    /* 暂停推荐卡片及其“观看更高清”按钮。 */
    .bpx-player-container .bpx-player-relation-wrap,
    /* 播放期间单独出现的“观看更高清”按钮。 */
    .bpx-player-container .bpx-player-enter-button,
    /* 底部“去哔哩哔哩发送弹幕”提示；仍保留弹幕开关。 */
    .bpx-player-container .bpx-player-inputbar-mask {
      display: none !important;
      pointer-events: none !important;
    }
  `);
})();
