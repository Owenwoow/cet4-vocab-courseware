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

test("周一学的：次日 → 周三（周日太远）→ 下周一 → 第三周周日 → 之后按熟练度（一路看词选义记得 = 3 级，14 天）", () => {
  assert.deepEqual(walk(MON, 5), [TUE, WED, "2026-10-12", "2026-10-25", "2026-11-08", "2026-11-22"]);
});

test("周二学的：次日 → 本周日 → 下周二", () => {
  assert.deepEqual(walk(TUE, 2), [WED, SUN, "2026-10-13"]);
});

test("周三学的：次日（周四只是正常复习）→ 本周日 → 下周三 → 第三周周日", () => {
  assert.deepEqual(walk(WED, 3), [THU, SUN, "2026-10-14", "2026-10-25"]);
});

test("周五学的：次日（周六）→ 周日 → 下周五 → 第三周周日", () => {
  assert.deepEqual(walk(FRI, 3), [SAT, SUN, "2026-10-16", "2026-10-25"]);
});

test("周六、周日学的：离下个周日太远，第二站放在学习日后第 2 天", () => {
  assert.deepEqual(walk(SAT, 2), [SUN, "2026-10-12", "2026-10-17"]);
  assert.deepEqual(walk(SUN, 2), ["2026-10-12", "2026-10-13", "2026-10-18"]);
});

test("周六不再是复习站：一周七天学的词，第二站都不落在周六", () => {
  for (let i = 0; i < 7; i++) assert.notEqual(SRS.dow(SRS.stationDue(SRS.add(MON, i), 1, SRS.add(MON, i))), 6);
});

test("周末学的也能走完，站与站之间至少隔一天", () => {
  for (const d of [SAT, SUN]) {
    const dues = walk(d, 5);
    for (let i = 1; i < dues.length; i++) assert.ok(dues[i] > dues[i - 1], `${d} 第 ${i} 站 ${dues[i]} 不晚于上一站`);
  }
});

test("模糊：和记得一样进下一站，只是 h 记 m、不升题型", () => {
  const m = SRS.rate(SRS.newCard(MON), "m", TUE, {type: T.LISTEN});
  const g = SRS.rate(SRS.newCard(MON), "g", TUE, {type: T.LISTEN});
  assert.equal(m.s, 1); assert.equal(m.d, WED); assert.equal(m.r, "m"); assert.equal(m.h, "m");
  assert.deepEqual([m.s, m.d, m.v], [g.s, g.d, g.v]);
  assert.equal(m.q, 0); assert.equal(g.q, 1);
  const m2 = SRS.rate(m, "m", WED);
  assert.equal(m2.s, 2); assert.equal(m2.d, "2026-10-12");   // 连着模糊也照走：上周今天
});

test("混淆（选中易混词，hold）：站数不变，2 天后再来，h 记 m", () => {
  const c = SRS.rate(SRS.newCard(MON), "m", TUE, {type: T.MEAN, hold: true});
  assert.equal(c.s, 0); assert.equal(c.d, THU); assert.equal(c.r, "m"); assert.equal(c.h, "m"); assert.equal(c.v, 1);
  const c2 = SRS.rate(c, "g", THU);
  assert.equal(c2.s, 1); assert.equal(c2.d, FRI);   // 第二站本是周三，已过，顺到明天
  const late = SRS.rate({a: "2026-09-01", s: 4, d: "2026-10-20", n: 4, l: 0, h: "ggg", q: 2}, "m", "2026-10-20", {hold: true});
  assert.equal(late.s, 4); assert.equal(late.d, "2026-10-22");   // s≥4 也是 2 天
});

test("忘了：从今天重新开始，遗忘次数 +1，进难词本", () => {
  let c = SRS.newCard(MON);
  c = SRS.rate(c, "g", TUE);            // 到周三
  c = SRS.rate(c, "f", WED);
  assert.deepEqual([c.a, c.s, c.d, c.l], [WED, 0, THU, 1]);
  assert.ok(SRS.isHard(c));
});

test("提前复习：记得 / 模糊（含混淆）不改计划、不记进熟练度，忘了照样重来", () => {
  const c = SRS.newCard(MON);           // 周二到期
  const g = SRS.rate(c, "g", MON);
  assert.equal(g.d, TUE); assert.equal(g.s, 0); assert.equal(g.n, 1); assert.equal(g.t, MON);
  for (const opt of [{}, {hold: true}]) {
    const m = SRS.rate(c, "m", MON, opt);
    assert.equal(m.d, TUE); assert.equal(m.s, 0); assert.equal(m.h, ""); assert.equal(m.v || 0, 0); assert.equal(m.r, "m");
  }
  const s2 = {a: MON, s: 2, d: "2026-10-12", n: 2, l: 0, h: "gg"};   // 中途的卡：模糊也不提前进站
  assert.deepEqual([SRS.rate(s2, "m", THU).s, SRS.rate(s2, "m", THU).d, SRS.rate(s2, "m", THU).h], [2, "2026-10-12", "gg"]);
  const f = SRS.rate(c, "f", MON);
  assert.equal(f.d, TUE); assert.equal(f.l, 1);
});

test("拖了几天才复习：照常进下一站，下一站不早于明天", () => {
  let c = SRS.newCard(MON);
  c = SRS.rate(c, "g", "2026-10-13");   // 次日那站拖到下周二才做，第二站早过了
  assert.equal(c.s, 1); assert.equal(c.d, "2026-10-14");
});

test("难词本：最近忘了，或忘过两次以上，或还有没分清的易混词；模糊不进", () => {
  assert.ok(!SRS.isHard({r: "g", l: 1}));
  assert.ok(SRS.isHard({r: "f", l: 1}));
  assert.ok(SRS.isHard({r: "g", l: 2}));
  assert.ok(!SRS.isHard({r: "m", l: 0}));
  assert.ok(!SRS.isHard({r: "m", l: 1}));
  assert.ok(SRS.isHard({r: "m", l: 0, cf: ["adopt"]}));
  assert.ok(SRS.isHard({r: "g", l: 0, cf: ["adopt"]}));      // 混淆后还没带着它答对过
  assert.ok(!SRS.isHard({r: "g", l: 0, cf: []}));
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

/* ---------- 熟练度 / 题型 / 间隔 / 封顶 / 出题顺序 ---------- */
const T = SRS.TYPE;
const card = o => ({a: MON, s: 0, d: TUE, l: 0, r: "", n: 0, h: "", ...o});

test("熟练度：按表从上往下命中", () => {
  assert.equal(SRS.level(card({})), 0);                                       // 新学
  assert.equal(SRS.level(card({h: "f"})), 1);                                // 学新词循环里错多了：先标生疏
  assert.equal(SRS.level(card({n: 3, h: "ggf"})), 1);                        // 最近一次忘了
  assert.equal(SRS.level(card({n: 5, h: "gfgfg", l: 2})), 1);                // 忘过 2 次、连对不到 2
  assert.equal(SRS.level(card({n: 5, h: "gfgfgg", l: 2, s: 2})), 2);         // 忘过 2 次但已连对 2
  assert.equal(SRS.level(card({n: 2, h: "gg", s: 2})), 2);
  assert.equal(SRS.level(card({n: 3, h: "gg", s: 3})), 3);
  assert.equal(SRS.level(card({n: 4, h: "ggg", s: 4, q: 1})), 3);            // 没过回忆型题，到不了 4
  assert.equal(SRS.level(card({n: 4, h: "ggg", s: 4, q: 2})), 4);
  assert.equal(SRS.level(card({n: 5, h: "gggg", s: 4, q: 2})), 4);           // 没拼对过，到不了 5
  assert.equal(SRS.level(card({n: 5, h: "gggg", s: 4, q: 3})), 5);
  assert.equal(SRS.level(card({n: 5, h: "gggm", s: 4, q: 3})), 2);           // 模糊打断连对
  assert.equal(SRS.level(card({z: 1, h: "f"})), 5);                          // 斩
});

test("旧卡没有 h：用最近一次评分顶上", () => {
  assert.equal(SRS.level({a: MON, s: 1, d: SAT, l: 0, r: "g", n: 1}), 2);
  assert.equal(SRS.level({a: MON, s: 0, d: TUE, l: 1, r: "f", n: 1}), 1);
  assert.equal(SRS.level({a: MON, s: 0, d: TUE, l: 0, r: "", n: 0}), 0);
});

test("出题：按熟练度，每次最多比答对过的升一级；5 级快速抽查", () => {
  assert.equal(SRS.pickType(card({})), T.MEAN);
  assert.equal(SRS.pickType(card({n: 1, h: "g", s: 1})), T.LISTEN);         // 2 级按复习次数轮换
  assert.equal(SRS.pickType(card({n: 2, h: "gg", s: 2, q: 1})), T.MEAN);
  assert.equal(SRS.pickType(card({n: 3, h: "gg", s: 3, q: 0})), T.LISTEN);   // 3 级该出例句，但只答对过看词选义
  assert.equal(SRS.pickType(card({n: 3, h: "gg", s: 3, q: 1})), T.CONTEXT);
  assert.equal(SRS.pickType(card({n: 4, h: "ggg", s: 4, q: 2})), T.SPELL);
  assert.equal(SRS.pickType(card({n: 5, h: "gggg", s: 4, q: 3})), T.QUICK);
});

test("提前复习不影响熟练度和题型：睡前巩固过的新词，次日早上仍是 0 级、看词选义", () => {
  const MON_NEW = SRS.newCard(MON);
  const night = SRS.rate(MON_NEW, "g", MON, {type: T.MEAN});                 // 当晚睡前巩固（还没到期）
  assert.equal(night.n, 1); assert.equal(night.v || 0, 0);
  assert.equal(SRS.level(night), 0); assert.equal(SRS.pickType(night), T.MEAN);
  const morning = SRS.rate(night, "g", TUE, {type: T.MEAN});                 // 次日早上到期复习
  assert.equal(morning.v, 1); assert.equal(morning.h, "g");
  assert.equal(SRS.pickType(morning), T.LISTEN);                              // 正式复习 1 次后才轮到听音
  const again = SRS.rate(morning, "g", TUE, {type: T.LISTEN});                // 当天再提前刷一遍，轮换不受影响
  assert.equal(again.v, 1); assert.equal(SRS.pickType(again), T.LISTEN);
  assert.equal(SRS.reviews({n: 2, h: "m", r: "m"}), 1);                     // 旧卡没有 v：按 h 的长度算
});

test("判分：选择题按题型的时限内答对 = 记得，慢 = 模糊；拼写错一个字母 = 模糊", () => {
  for (const [kind, ms] of [["mean", 8000], ["listen", 8000], ["reverse", 10000], ["cloze", 15000]]) {
    assert.equal(SRS.gradeChoice(true, ms, kind), "g", kind);
    assert.equal(SRS.gradeChoice(true, ms + 1, kind), "m", kind);
    assert.equal(SRS.gradeChoice(false, 1000, kind), "f", kind);
  }
  assert.equal(SRS.gradeChoice(true, 7000), "g");             // 不传题型按看词选义（词组卡也是）
  assert.equal(SRS.gradeChoice(true, 9000), "m");
  assert.equal(SRS.gradeChoice(true, 12000, "spell"), "m");   // 没有时限的题型按看词选义
  assert.equal(SRS.gradeSpell(" Abandon ", "abandon"), "g");
  assert.equal(SRS.gradeSpell("abandom", "abandon"), "m");
  assert.equal(SRS.gradeSpell("abndon", "abandon"), "m");
  assert.equal(SRS.gradeSpell("abodon", "abandon"), "f");
});

test("打分记录：h 只留 6 次，第一遍答对才升 q，提前复习不记，忘了清掉斩", () => {
  let c = card({h: "gggggg", n: 6, s: 2, d: TUE});
  c = SRS.rate(c, "g", TUE, {type: T.CONTEXT});
  assert.equal(c.h, "gggggg"); assert.equal(c.q, 2);
  const m = SRS.rate(card({d: TUE}), "m", TUE, {type: T.SPELL});
  assert.equal(m.q, 0); assert.equal(m.h, "m");
  const early = SRS.rate(card({d: SAT, h: "g", n: 1, s: 1}), "g", TUE, {type: T.LISTEN});
  assert.equal(early.h, "g"); assert.equal(early.q || 0, 0); assert.equal(early.d, SAT); assert.equal(early.n, 2);
  const f = SRS.rate(card({z: 1, s: 5, d: TUE, h: "gggg", n: 6}), "f", TUE);
  assert.equal(f.z, 0); assert.equal(f.s, 0); assert.equal(f.h, "ggggf"); assert.equal(SRS.level(f), 1);
});

test("s≥4 间隔按熟练度；模糊也进站，但打断连对落到 2 级，7 天", () => {
  const t = "2026-10-20";
  const base = {a: "2026-09-01", s: 3, d: t, n: 4, l: 0};
  assert.equal(SRS.rate({...base, h: "gf", l: 1}, "g", t).d, "2026-10-27");               // 2 级 7 天
  assert.equal(SRS.rate({...base, h: "ggg", q: 1}, "g", t).d, "2026-11-03");               // 3 级 14 天
  assert.equal(SRS.rate({...base, h: "ggg", q: 2}, "g", t).d, "2026-11-10");               // 4 级 21 天
  assert.equal(SRS.rate({...base, h: "ggg", q: 3}, "g", t).d, "2026-11-19");               // 5 级 30 天
  const m = SRS.rate({...base, s: 4, h: "ggg", q: 3}, "m", t, {type: T.SPELL});
  assert.equal(m.d, "2026-10-27"); assert.equal(m.s, 5); assert.equal(SRS.level(m), 2); assert.equal(m.q, 3);   // 本该 5 级 30 天
  assert.equal(SRS.rate({...base, s: 4, h: "ggg", q: 2, l: 2}, "m", t).d, "2026-10-27");   // 忘过 2 次：1 级，也是 7 天
  const s2 = {a: "2026-10-06", s: 2, d: t, n: 2, l: 0, h: "gg"};
  assert.equal(SRS.rate(s2, "m", t).s, 3); assert.equal(SRS.rate(s2, "m", t).d, SRS.rate(s2, "g", t).d);   // s≤3 和记得同一站
  assert.equal(SRS.rate(s2, "m", t).d, "2026-10-25");
});

test("考前封顶：窗口前复习、到期又晚于 12-09 的，分散到 12-05～12-09；窗口里复习的不管", () => {
  const days = new Set();
  for (let i = 0; i < 200; i++) {
    const d = SRS.examCap("2026-12-20", "2026-11-20", "w" + i);
    assert.ok(d >= "2026-12-05" && d <= "2026-12-09", d);
    days.add(d);
  }
  assert.equal(days.size, 5);
  assert.equal(SRS.examCap("2026-12-20", "2026-11-20", "x"), SRS.examCap("2026-12-20", "2026-11-20", "x"));   // 同一个词每次一样
  assert.equal(SRS.examCap("2026-12-08", "2026-11-20", "x"), "2026-12-08");   // 没超不动
  assert.equal(SRS.examCap("2027-01-05", "2026-12-06", "x"), "2027-01-05");   // 窗口里刚复习过
  const c = SRS.rate({a: "2026-09-01", s: 4, d: "2026-11-25", n: 5, l: 0, h: "ggg", q: 2}, "g", "2026-11-25", {key: "abandon"});
  assert.ok(c.d >= "2026-12-05" && c.d <= "2026-12-09", c.d);
});

test("斩：直接 5 级，30 天后（或考前窗口）抽查", () => {
  const c = SRS.chop(card({n: 1, h: "g", s: 1}), "2026-10-13", "abandon");
  assert.equal(SRS.level(c), 5); assert.equal(c.s, 4); assert.equal(c.d, "2026-11-12");
  assert.equal(SRS.pickType(c), T.QUICK);
  const late = SRS.chop(card({}), "2026-11-20", "abandon");
  assert.ok(late.d >= "2026-12-05" && late.d <= "2026-12-09");
});

test("乱序：是原列表的重排，同组尽量不相邻，同一个 seed 结果相同", () => {
  const list = [];
  for (let i = 0; i < 12; i++) list.push({id: i, g: i < 6 ? "A" : i < 9 ? "B" : i < 11 ? "C" : "D"});
  for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
    const out = SRS.shuffleSpread(list, x => x.g, seed);
    assert.deepEqual(out.map(x => x.id).sort((a, b) => a - b), list.map(x => x.id));
    for (let i = 1; i < out.length; i++) assert.notEqual(out[i].g, out[i - 1].g, out.map(x => x.g).join(""));
    assert.deepEqual(SRS.shuffleSpread(list, x => x.g, seed), out);
  }
  assert.equal(SRS.shuffleSpread([{g: "A"}, {g: "A"}, {g: "A"}], x => x.g).length, 3);
});

test("本轮顺序：拖过的先，熟练度低的先，复习不到 3 次按课本顺序，3 次以上乱序", () => {
  const it = (word, order, c) => ({word, order, card: card({k: "u01-l01", d: WED, ...c})});
  const items = [
    it("late", 9, {d: MON, n: 1, h: "g", s: 1}),
    it("red", 8, {n: 2, h: "gf"}),
    it("b2", 2, {n: 1, h: "g", s: 1}),
    it("b1", 1, {n: 1, h: "g", s: 1}),
    it("x1", 3, {n: 4, h: "ggg", s: 2, g: 1}),
    it("x2", 4, {n: 4, h: "ggg", s: 2, g: 1}),
    it("x3", 5, {n: 4, h: "ggg", s: 2, g: 2}),
    it("future", 0, {d: FRI, n: 1}),
  ];
  const q = SRS.queue(items, WED).map(x => x.word);
  assert.equal(q.length, 7);
  assert.deepEqual(q.slice(0, 4), ["late", "red", "b1", "b2"]);
  assert.deepEqual(q.slice(4).sort(), ["x1", "x2", "x3"]);
  assert.equal(q[5], "x3");                                                   // 同词群的 x1、x2 被隔开
});

test("形近：编辑距离小或前 4 个字母相同", () => {
  assert.ok(SRS.similar("adapt", "adopt"));
  assert.ok(SRS.similar("Affect", "effect"));
  assert.ok(SRS.similar("conserve", "conservation"));
  assert.ok(!SRS.similar("space", "space"));
  assert.ok(!SRS.similar("union", "moon"));
});

test("形近词相邻：不同词群的挪到一起，同词群的不动", () => {
  const it = (word, g) => ({word, card: {k: "u01-l01", g}});
  const list = [it("adapt", 1), it("moon", 2), it("space", 3), it("adopt", 4), it("adapter", 1)];
  assert.deepEqual(SRS.pairSimilar(list, x => x.card.g).map(x => x.word), ["adapt", "adopt", "moon", "space", "adapter"]);
  const t = WED, card2 = (word, g) => ({word, order: 0, card: card({k: "u01-l01", g, d: WED, n: 4, h: "ggg", s: 2})});
  const q = SRS.queue([card2("adapt", 1), card2("moon", 2), card2("space", 3), card2("adopt", 4), card2("union", 5), card2("unite", 5)], t).map(x => x.word);
  const i = q.indexOf("adapt"), j = q.indexOf("adopt");
  assert.equal(Math.abs(i - j), 1, q.join(","));
  assert.notEqual(Math.abs(q.indexOf("union") - q.indexOf("unite")), 1, q.join(","));   // 同词群照旧隔开
});

test("方案文档里的 abandon：一路走到牢记（10-19 模糊照样进站）", () => {
  let c = SRS.newCard("2026-10-12");
  const step = (r, t, type) => {
    assert.equal(c.d, t); assert.equal(SRS.pickType(c), type, t);   // 题型就是系统会出的那种
    c = SRS.rate(c, r, t, {type, key: "abandon"}); return [SRS.level(c), c.d];
  };
  assert.deepEqual(step("g", "2026-10-13", T.MEAN), [2, "2026-10-14"]);
  assert.deepEqual(step("g", "2026-10-14", T.LISTEN), [2, "2026-10-19"]);
  assert.deepEqual(step("m", "2026-10-19", T.MEAN), [2, "2026-11-01"]);      // 进第 3 站，连对清零
  assert.deepEqual(step("g", "2026-11-01", T.LISTEN), [2, "2026-11-08"]);    // 连对 1：还是 2 级，7 天
  assert.deepEqual(step("g", "2026-11-08", T.MEAN), [3, "2026-11-22"]);
  assert.deepEqual(step("g", "2026-11-22", T.CONTEXT), [4, "2026-12-09"]);   // 21 天是 12-13，封顶到考前窗口
  assert.deepEqual(step("g", "2026-12-09", T.SPELL), [5, "2027-01-08"]);     // 窗口里复习，不封顶
});

test("干扰项：义项拆分与词性", () => {
  assert.deepEqual([...SRS.senseKeys("v. 选举，推选；选择")], ["选举", "推选", "选择"]);
  assert.deepEqual([...SRS.senseKeys("v. （使）适应；使适合")], ["适应", "使适合"]);
  assert.deepEqual([...SRS.posSet("v. 选择，选拔；adj. 精选的")], ["v.", "adj."]);
});

test("干扰项：共同义项不能用、只差词性的算词性辨析、形近/同词群算易混", () => {
  const elect = {word: "elect", mean: "v. 选举，推选；选择"};
  assert.equal(SRS.distractorTag(elect, {word: "select", mean: "v. 选择，选拔；adj. 精选的；优等的"}), "bad");
  const injury = {word: "injury", mean: "n. 伤害，损伤"};
  assert.equal(SRS.distractorTag(injury, {word: "injure", mean: "v. 损害，伤害；受伤"}), "pos");
  assert.equal(SRS.distractorTag(injury, {word: "harm", mean: "v. 伤害"}), "bad");     // 不形近：照样不能用
  assert.equal(SRS.distractorTag({word: "adapt", mean: "v. （使）适应；使适合"}, {word: "adopt", mean: "v. 收养；采纳；接受"}), "near");
  assert.equal(SRS.distractorTag(injury, {word: "carrot", mean: "n. 胡萝卜"}), null);
  assert.equal(SRS.distractorTag(injury, {word: "carrot", mean: "n. 胡萝卜"}, true), "near");
});

test("混淆词列表：新的在前、去重、最多 3 个", () => {
  assert.deepEqual(SRS.confAdd(undefined, "a"), ["a"]);
  assert.deepEqual(SRS.confAdd(["a", "b", "c"], "b"), ["b", "a", "c"]);
  assert.deepEqual(SRS.confAdd(["a", "b", "c"], "d"), ["d", "a", "b"]);
  assert.deepEqual(SRS.confDrop(["a", "b"], "a"), ["b"]);
  assert.deepEqual(SRS.confDrop(undefined, "a"), []);
});

/* ---------- 词组卡：生词本里原形含空格的，或 ph=1 的例句词组 ---------- */
test("词组卡：原形含空格或标了 ph 的生词", () => {
  assert.ok(SRS.isPhrase({w: "take away"}));
  assert.ok(SRS.isPhrase({w: "is bound to"}));               // 以前从逐词释义划选加进来的短语
  assert.ok(SRS.isPhrase({w: "attribute … to", ph: 1}));
  assert.ok(!SRS.isPhrase({w: "abandon"}));
  assert.ok(!SRS.isPhrase(card({})));                         // 书上的卡没有 w
});

test("词组卡出题：只出看词组选义，5 级快速抽查（翻卡）；不出听音、例句、拼写", () => {
  const ph = o => card({w: "take away", ph: 1, ...o});
  assert.equal(SRS.pickType(ph({})), T.MEAN);
  assert.equal(SRS.pickType(ph({n: 1, h: "g", s: 1})), T.MEAN);            // 普通卡这里会出听音
  assert.equal(SRS.pickType(ph({n: 3, h: "gg", s: 3, q: 1})), T.MEAN);     // 普通卡出例句
  assert.equal(SRS.pickType(ph({n: 4, h: "ggg", s: 4})), T.MEAN);          // 普通卡出拼写
  assert.equal(SRS.pickType(ph({n: 5, h: "gggg", s: 4})), T.QUICK);
  assert.equal(SRS.pickType(card({n: 1, h: "g", s: 1}), {phrase: true}), T.MEAN);   // 也可以显式按词组算
  for (let s = 0; s <= 5; s++) for (const h of ["", "g", "gg", "ggg", "gggg", "gf", "ggm"])
    assert.ok([T.MEAN, T.QUICK].includes(SRS.pickType(ph({s, h, n: h.length}))), `s=${s} h=${h}`);
});

test("词组卡熟练度：不看 q，4 / 5 级只看站数和连对", () => {
  const ph = o => card({w: "take away", ...o});
  assert.equal(SRS.level(ph({n: 4, h: "ggg", s: 4})), 4);                  // 普通卡 q=0 只有 3 级
  assert.equal(SRS.level(card({n: 4, h: "ggg", s: 4})), 3);
  assert.equal(SRS.level(ph({n: 5, h: "gggg", s: 4})), 5);
  assert.equal(SRS.level(ph({n: 5, h: "gggg", s: 3})), 3);                  // 站数不够
  assert.equal(SRS.level(ph({n: 5, h: "gggf", s: 4})), 1);
  assert.equal(SRS.level(card({n: 4, h: "ggg", s: 4}), {phrase: true}), 4);
});

test("词组卡一路看词组选义记得，也能走到牢记", () => {
  let c = {...SRS.newCard("2026-10-12"), w: "take away", ph: 1};
  for (let i = 0; i < 10 && SRS.level(c) < 5; i++) {
    assert.ok([T.MEAN, T.QUICK].includes(SRS.pickType(c)));
    c = SRS.rate(c, "g", c.d, {type: SRS.pickType(c), key: "take away"});
  }
  assert.equal(SRS.level(c), 5);
  assert.equal(SRS.pickType(c), T.QUICK);
});

/* ---------- 设置：想得久算模糊的时限倍数、关掉的题型 ---------- */
test("判分时限倍数：宽松 ×1.5、严格 ×0.75，0 = 不按时间判模糊；不传和 1 一样", () => {
  assert.equal(SRS.gradeChoice(true, 12000, "mean", {slow: 1.5}), "g");
  assert.equal(SRS.gradeChoice(true, 12001, "mean", {slow: 1.5}), "m");
  assert.equal(SRS.gradeChoice(true, 6000, "mean", {slow: 0.75}), "g");
  assert.equal(SRS.gradeChoice(true, 6001, "mean", {slow: 0.75}), "m");
  assert.equal(SRS.gradeChoice(true, 22500, "cloze", {slow: 1.5}), "g");
  assert.equal(SRS.gradeChoice(true, 600000, "cloze", {slow: 0}), "g");
  assert.equal(SRS.gradeChoice(false, 1000, "mean", {slow: 0}), "f");
  for (const ms of [7000, 8000, 8001, 20000]) assert.equal(SRS.gradeChoice(true, ms, "mean", {}), SRS.gradeChoice(true, ms, "mean", {slow: 1}));
});

test("关掉听音：本该出听音的换成例句题（看词选义答对过就直接升），其余不变", () => {
  const off = {off: [T.LISTEN]};
  assert.equal(SRS.pickType(card({}), off), T.MEAN);
  assert.equal(SRS.pickType(card({n: 1, h: "g", s: 1}), off), T.CONTEXT);           // 2 级轮到听音
  assert.equal(SRS.pickType(card({n: 2, h: "gg", s: 2, q: 1}), off), T.MEAN);       // 2 级轮到看词选义
  assert.equal(SRS.pickType(card({n: 3, h: "gg", s: 3, q: 0}), off), T.CONTEXT);    // 本来被 q+1 限在听音
  assert.equal(SRS.pickType(card({n: 4, h: "ggg", s: 4, q: 2}), off), T.SPELL);
  assert.equal(SRS.pickType(card({n: 5, h: "gggg", s: 4, q: 3}), off), T.QUICK);
  assert.equal(SRS.level(card({n: 4, h: "ggg", s: 4, q: 2}), off), 4);              // 4 级照旧看例句题
});

test("关掉拼写：最高出到例句题，熟练度不要求拼对过、能到 5 级", () => {
  const off = {off: [T.SPELL]};
  assert.equal(SRS.pickType(card({n: 4, h: "ggg", s: 4, q: 2}), off), T.CONTEXT);
  assert.equal(SRS.pickType(card({n: 3, h: "gg", s: 3, q: 1}), off), T.CONTEXT);
  assert.equal(SRS.level(card({n: 5, h: "gggg", s: 4, q: 2}), off), 5);
  assert.equal(SRS.level(card({n: 5, h: "gggg", s: 4, q: 0}), off), 5);             // 同词组卡：只看站数和连对
  assert.equal(SRS.level(card({n: 5, h: "gggg", s: 3, q: 2}), off), 3);
  assert.equal(SRS.level(card({n: 5, h: "gggm", s: 4, q: 2}), off), 2);
  assert.equal(SRS.pickType(card({n: 5, h: "gggg", s: 4, q: 2}), off), T.QUICK);
  const both = {off: [T.LISTEN, T.SPELL]};
  for (let s = 0; s <= 5; s++) for (const h of ["", "g", "gg", "ggg", "gggg", "gf"]) for (const q of [0, 1, 2])
    assert.ok([T.MEAN, T.CONTEXT, T.QUICK].includes(SRS.pickType(card({s, h, n: h.length, q}), both)), `s=${s} h=${h} q=${q}`);
});

test("关掉拼写：一路记得能走到牢记，间隔按放宽的熟练度拉开", () => {
  const off = [T.SPELL];
  let c = SRS.newCard("2026-10-12");
  for (let i = 0; i < 12 && SRS.level(c, {off}) < 5; i++) {
    const ty = SRS.pickType(c, {off});
    assert.notEqual(ty, T.SPELL);
    c = SRS.rate(c, "g", c.d, {type: ty, key: "abandon", off, exam: "2027-06-12"});
  }
  assert.equal(SRS.level(c, {off}), 5);
  assert.equal(SRS.level(c), 4);                                                      // 不放宽时还差拼写
  const t = "2026-10-20", base = {a: "2026-09-01", s: 3, d: t, n: 4, l: 0, h: "ggg", q: 2};
  assert.equal(SRS.rate(base, "g", t, {off}).d, "2026-11-19");                        // 5 级 30 天
  assert.equal(SRS.rate(base, "g", t).d, "2026-11-10");                               // 默认 4 级 21 天
});
