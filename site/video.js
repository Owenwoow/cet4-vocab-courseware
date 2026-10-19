/* 讲解视频跳转的取数规则（纯函数，不碰页面；浏览器里是全局 Video，Node 里 require 进来跑单元测试）

   数据 data/video/<课id>.json（pipeline/video_align.py 生成，一课一份）：
     sources：这一课覆盖到的视频 [{id, bv, label, alive}]，数组顺序就是优先级
     entries：词条号 no（字符串）→ {视频 id: [分P号, 秒] 或 [分P号, 秒, 1]}，第三位 1 = 推算出来的（approx，页面标「约」）
   电脑端另有「B 站分屏标签」：▶ 可让固定名字的 B 站标签跳到 url（不是 embed），见 app.js 与 docs/plans/2026-10-19-video-split.md
   同一套讲课被多个 UP 主上传，视频可能下架（alive: false），所以每个词有多个备选，按优先级挑还在的 */
"use strict";
const Video = (() => {
  const url = (bv, p, t) => `https://www.bilibili.com/video/${encodeURIComponent(bv)}/?p=${p}&t=${t}`;
  /* 页内播放用的 B 站嵌入播放器（o = options 里的一项）：自动播放、关弹幕；没登录时画质 360p */
  const embed = o => `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(o.bv)}&p=${o.p}&t=${o.t}&autoplay=1&danmaku=0&high_quality=1`;

  /* 这个词条能看的视频，按优先级：[{id, label, url, approx, bv, p, t}]。
     prefer = 设置里「讲解视频优先用」的系列（label 的开头，如「精讲带背」「全程班」）：这个系列的排到前面，其余照原来的顺序；没有这个系列就不变。下架的、这个视频里没有这个词的跳过；没有数据返回 [] */
  function options(data, no, prefer) {
    const out = [];
    if (!data || !Array.isArray(data.sources) || !data.entries || no == null) return out;
    const hit = Object.hasOwn(data.entries, String(no)) ? data.entries[String(no)] : null;
    if (!hit) return out;
    for (const s of data.sources) {
      if (!s || s.alive === false || !Object.hasOwn(hit, s.id)) continue;
      const [p, t, approx] = Array.isArray(hit[s.id]) ? hit[s.id] : [];
      if (!Number.isFinite(p) || !Number.isFinite(t) || !s.bv) continue;
      const sec = Math.max(0, Math.floor(t));
      out.push({id: s.id, label: s.label || s.id, url: url(s.bv, p, sec), approx: !!approx, bv: s.bv, p, t: sec});
    }
    if (!prefer) return out;
    const mine = o => o.label.startsWith(prefer);
    return [...out.filter(mine), ...out.filter(o => !mine(o))];
  }

  /* 一个词条（书上词条 / 扩展词 / 只有逐词释义的生词）在视频里对应哪个词条号：
     书上词条用自己的号，扩展词用它所属主词条的号（老师是在讲主词条时顺带讲的），逐词释义的生词不在书里，没有 */
  function noOf(e) {
    if (!e || e.gloss) return null;
    const n = e.extOf ? e.extOf.no : e.no;
    return n == null ? null : n;
  }

  return {url, embed, options, noOf};
})();
if (typeof module === "object" && module.exports) module.exports = Video;
