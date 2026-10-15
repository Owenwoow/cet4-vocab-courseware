/* 讲解视频跳转取数规则的单元测试：node --test tests/
   数据格式见 site/video.js 开头 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Video = require("../site/video.js");

const data = () => ({
  lesson: "u01-l01",
  sources: [
    {id: "jj1", bv: "BV1FTPLzBEnj", label: "精讲带背 · 晓艳教英语", alive: true},
    {id: "qc1", bv: "BV1Vkah6oEVo", label: "全程班 · 四六级2026考试", alive: true},
    {id: "qc3", bv: "BV1FdpY6WEH4", label: "全程班 · 四六级1次过", alive: true},
  ],
  entries: {
    "1": {jj1: [2, 23], qc1: [1, 1402], qc3: [1, 1380]},
    "2": {jj1: [2, 97], qc1: [1, 1476, 1]},
    "3": {qc1: [1, 1500, 1], qc3: [1, 1490]},
  },
});

test("链接：BV、分 P、秒拼成 B 站地址", () => {
  assert.equal(Video.url("BV1FTPLzBEnj", 2, 23), "https://www.bilibili.com/video/BV1FTPLzBEnj/?p=2&t=23");
  assert.equal(Video.url("BV1Vkah6oEVo", 10, 0), "https://www.bilibili.com/video/BV1Vkah6oEVo/?p=10&t=0");
});

test("按 sources 的顺序给出，第一个就是优先级最高的", () => {
  const o = Video.options(data(), 1);
  assert.deepEqual(o.map(x => x.id), ["jj1", "qc1", "qc3"]);
  assert.deepEqual(o[0], {id: "jj1", label: "精讲带背 · 晓艳教英语", url: "https://www.bilibili.com/video/BV1FTPLzBEnj/?p=2&t=23", approx: false, bv: "BV1FTPLzBEnj", p: 2, t: 23});
  assert.equal(o[1].url, "https://www.bilibili.com/video/BV1Vkah6oEVo/?p=1&t=1402");
});

test("sources 顺序变了，结果跟着变（不是按 entries 里的键序）", () => {
  const d = data();
  d.sources.reverse();
  assert.deepEqual(Video.options(d, 1).map(x => x.id), ["qc3", "qc1", "jj1"]);
});

test("下架的（alive: false）跳过，下一个顶上来", () => {
  const d = data();
  d.sources[0].alive = false;
  const o = Video.options(d, 1);
  assert.deepEqual(o.map(x => x.id), ["qc1", "qc3"]);
  d.sources[1].alive = false;
  assert.deepEqual(Video.options(d, 1).map(x => x.id), ["qc3"]);
  d.sources[2].alive = false;
  assert.deepEqual(Video.options(d, 1), []);
});

test("没写 alive 的当作还在", () => {
  const d = data();
  delete d.sources[0].alive;
  assert.equal(Video.options(d, 1)[0].id, "jj1");
});

test("这个视频里没有这个词的跳过", () => {
  const o = Video.options(data(), 2);
  assert.deepEqual(o.map(x => x.id), ["jj1", "qc1"]);          // qc3 没有 2
  assert.deepEqual(Video.options(data(), 3).map(x => x.id), ["qc1", "qc3"]);   // jj1 没有 3
});

test("推算出来的标 approx", () => {
  const o = Video.options(data(), 2);
  assert.equal(o[0].approx, false);
  assert.equal(o[1].approx, true);
  assert.equal(Video.options(data(), 3)[0].approx, true);
});

test("词条号数字、字符串都行；没有这个词条返回空", () => {
  assert.equal(Video.options(data(), "1").length, 3);
  assert.deepEqual(Video.options(data(), 99), []);
  assert.deepEqual(Video.options(data(), "toString"), []);      // 不能取到原型上的东西
  assert.deepEqual(Video.options(data(), null), []);
});

test("没有数据、数据残缺都返回空，不抛错", () => {
  assert.deepEqual(Video.options(null, 1), []);
  assert.deepEqual(Video.options(undefined, 1), []);
  assert.deepEqual(Video.options({}, 1), []);
  assert.deepEqual(Video.options({sources: [], entries: {}}, 1), []);
  assert.deepEqual(Video.options({sources: [{id: "jj1", bv: "BV1"}]}, 1), []);
  assert.deepEqual(Video.options({sources: [{id: "jj1", bv: "BV1"}], entries: {"1": {jj1: "x"}}}, 1), []);
  assert.deepEqual(Video.options({sources: [{id: "jj1", bv: "BV1"}], entries: {"1": {jj1: [2]}}}, 1), []);
});

test("秒数取整、不小于 0", () => {
  const d = {sources: [{id: "a", bv: "BV1", label: "甲"}], entries: {"1": {a: [3, 12.7]}, "2": {a: [3, -5]}}};
  assert.ok(Video.options(d, 1)[0].url.endsWith("?p=3&t=12"));
  assert.ok(Video.options(d, 2)[0].url.endsWith("?p=3&t=0"));
});

test("词条号：书上词条用自己的，扩展词用主词条的，逐词释义的生词没有", () => {
  assert.equal(Video.noOf({word: "unite", no: 12}), 12);
  assert.equal(Video.noOf({word: "unity", extOf: {word: "unite", no: 12}}), 12);
  assert.equal(Video.noOf({word: "found", gloss: true}), null);
  assert.equal(Video.noOf({word: "found", gloss: true, extOf: {no: 3}}), null);
  assert.equal(Video.noOf({word: "x"}), null);
  assert.equal(Video.noOf(null), null);
});

test("页内播放：嵌入播放器地址带 BV、分 P、秒，自动播放、关弹幕", () => {
  const o = Video.options(data(), 1)[1];
  assert.equal(Video.embed(o), "https://player.bilibili.com/player.html?bvid=BV1Vkah6oEVo&p=1&t=1402&autoplay=1&danmaku=0&high_quality=1");
});

test("设置里的系列偏好：这个系列排前面，其余顺序不变；没有这个系列的词照旧", () => {
  assert.deepEqual(Video.options(data(), 1, "全程班").map(x => x.id), ["qc1", "qc3", "jj1"]);
  assert.deepEqual(Video.options(data(), 1, "精讲带背").map(x => x.id), ["jj1", "qc1", "qc3"]);
  assert.deepEqual(Video.options(data(), 3, "精讲带背").map(x => x.id), ["qc1", "qc3"]);   // 3 号没有精讲
  assert.deepEqual(Video.options(data(), 1, "").map(x => x.id), ["jj1", "qc1", "qc3"]);
});
