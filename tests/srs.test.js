/* 滚动复习规则的单元测试：node --test tests/
   日期参照：2026-10-05 是周一 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const SRS = require("../site/srs.js");

const MON = "2026-10-05", TUE = "2026-10-06", WED = "2026-10-07", THU = "2026-10-08", FRI = "2026-10-09";
const SAT = "2026-10-10", SUN = "2026-10-11";

/* 按到期日一路「记得」，记下每一站的到期日 */
function walk(learn, steps) {
  let c = SRS.newCard(learn); const dues = [c.d];
  for (let i = 0; i < steps; i++) { c = SRS.rate(c, "g", c.d); dues.push(c.d); }
  return dues;
}

test("日期工具：星期、周一、加减", () => {
  assert.equal(SRS.dow(MON), 1);
  assert.equal(SRS.dow(SUN), 0);
  assert.equal(SRS.monday(SUN), MON);
  assert.equal(SRS.monday(MON), MON);
  assert.equal(SRS.add("2026-10-31", 1), "2026-11-01");
  assert.equal(SRS.diff("2026-12-12", "2026-10-01"), 72);
});

test("一天从凌晨 4 点开始算", () => {
  assert.equal(SRS.today(new Date(2026, 9, 6, 3, 59).getTime()), MON);
  assert.equal(SRS.today(new Date(2026, 9, 6, 4, 0).getTime()), TUE);
});

test("周一学的：次日 → 本周六 → 下周一 → 第三周周日 → 之后每 3 周", () => {
  assert.deepEqual(walk(MON, 5), [TUE, SAT, "2026-10-12", "2026-10-25", "2026-11-15", "2026-12-06"]);
});

test("周三学的：次日 → 本周六 → 下周三 → 第三周周日", () => {
  assert.deepEqual(walk(WED, 3), [THU, SAT, "2026-10-14", "2026-10-25"]);
});

test("周五学的：次日（周六）→ 周日 → 下周五 → 第三周周日", () => {
  assert.deepEqual(walk(FRI, 3), [SAT, SUN, "2026-10-16", "2026-10-25"]);
});

test("周末学的也能走完，站与站之间至少隔一天", () => {
  for (const d of [SAT, SUN]) {
    const dues = walk(d, 5);
    for (let i = 1; i < dues.length; i++) assert.ok(dues[i] > dues[i - 1], `${d} 第 ${i} 站 ${dues[i]} 不晚于上一站`);
  }
});

test("模糊：站数不变，2 天后再来", () => {
  const c = SRS.rate(SRS.newCard(MON), "m", TUE);
  assert.equal(c.s, 0); assert.equal(c.d, THU); assert.equal(c.r, "m");
  const c2 = SRS.rate(c, "g", THU);
  assert.equal(c2.s, 1); assert.equal(c2.d, SAT);
});

test("忘了：从今天重新开始，遗忘次数 +1，进难词本", () => {
  let c = SRS.newCard(MON);
  c = SRS.rate(c, "g", TUE);            // 到本周六
  c = SRS.rate(c, "f", SAT);
  assert.deepEqual([c.a, c.s, c.d, c.l], [SAT, 0, SUN, 1]);
  assert.ok(SRS.isHard(c));
});

test("提前复习：记得 / 模糊不改计划，忘了照样重来", () => {
  const c = SRS.newCard(MON);           // 周二到期
  const g = SRS.rate(c, "g", MON);
  assert.equal(g.d, TUE); assert.equal(g.s, 0); assert.equal(g.n, 1); assert.equal(g.t, MON);
  const m = SRS.rate(c, "m", MON);
  assert.equal(m.d, TUE);
  const f = SRS.rate(c, "f", MON);
  assert.equal(f.d, TUE); assert.equal(f.l, 1);
});

test("拖了几天才复习：照常进下一站，下一站不早于明天", () => {
  let c = SRS.newCard(MON);
  c = SRS.rate(c, "g", "2026-10-13");   // 次日那站拖到下周二才做，本周末早过了
  assert.equal(c.s, 1); assert.equal(c.d, "2026-10-14");
});

test("难词本：最近忘了 / 模糊，或忘过两次以上", () => {
  assert.ok(!SRS.isHard({r: "g", l: 1}));
  assert.ok(SRS.isHard({r: "g", l: 2}));
  assert.ok(SRS.isHard({r: "m", l: 0}));
  assert.ok(!SRS.isHard(SRS.newCard(MON)));
});

test("到期列表：拖得久的先来，同日火苗多的先来，再按课本顺序；没到期的不出现", () => {
  const items = [
    {word: "a", freq: 1, order: 1, card: {d: TUE}},
    {word: "b", freq: 3, order: 2, card: {d: TUE}},
    {word: "c", freq: 1, order: 3, card: {d: MON}},
    {word: "d", freq: 3, order: 4, card: {d: THU}},
    {word: "e", freq: 3, order: 0, card: {d: TUE}},
  ];
  assert.deepEqual(SRS.dueList(items, WED).map(x => x.word), ["c", "e", "b", "a"]);
});

test("请假顺延：学习日和到期日一起后移", () => {
  const c = SRS.shift({a: MON, s: 2, d: "2026-10-12", l: 0, r: "g", n: 2}, 3);
  assert.equal(c.a, THU); assert.equal(c.d, "2026-10-15"); assert.equal(c.s, 2);
});
