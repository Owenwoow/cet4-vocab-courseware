"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const SRS = require("../site/srs.js"), Backup = require("../site/backup.js"), Recall = require("../site/recall.js");
const day = "2026-11-06", course = {v: 1, id: "course", started: day, created: 1};
const book = Array.from({length: 2327}, (_, i) => ({word: `word${i}`, order: i}));
const card = (word, d = day) => ({word, card: {...SRS.freshCard(SRS.add(day, -10), word), d}, order: +word.replace("word", "") || 0});
const event = (word, d = day, result = "g", kind = "new") => ({word, d, result, kind, at: 1, seconds: kind === "new" ? 22 : 10});

test("快速排班保护新词时间，旧卡不能直接算覆盖，输入保持不变", () => {
  const cards = book.slice(0, 300).map(x => card(x.word)), before = JSON.stringify(cards);
  const p = SRS.makeQuickPlan(book, cards, [], course, day);
  assert.equal(p.covered, 0);
  assert.equal(p.items.filter(x => x.kind === "new").length, 52);
  assert.ok(p.items.filter(x => x.kind !== "new").length <= 45);
  assert.equal(new Set(p.items.map(x => x.word)).size, p.items.length);
  assert.equal(JSON.stringify(cards), before);
  assert.equal(SRS.makeQuickPlan(book, [], [], course, day, {days: 30, minutes: 45}).items.length, 78);
});
test("漏学自动补排、限量、延期；弱词优先但每天只检查一次", () => {
  const p = SRS.makeQuickPlan(book, book.slice(0, 500).map(x => card(x.word)), [], course, SRS.add(day, 40), {minutes: 20});
  const fresh = p.items.filter(x => x.kind === "new").length;
  assert.ok(fresh > 0 && fresh <= Math.ceil(52 * 1.25));
  assert.ok(fresh * p.newSeconds + (p.items.length - fresh) * p.reviewSeconds <= 1200);
  assert.ok(p.finish > p.target);
  const checks = [event("word0", day, "f"), event("word1")];
  const tomorrow = SRS.makeQuickPlan(book, [card("word0"), card("word1")], checks, course, SRS.add(day, 1));
  assert.equal(tomorrow.covered, 2);
  assert.equal(tomorrow.items.filter(x => x.word === "word0").length, 1);
  assert.ok(!tomorrow.items.some(x => x.word === "word1"));
});
test("历史正式回忆计入共享覆盖且同日不重复；识别不改变旧词校准、等级和排期", () => {
  const x = card("word0"), y = card("word1");
  x.card = SRS.rateRecall(x.card, "independent", day, {id: "today"});
  y.card = SRS.rateRecall(y.card, "independent", SRS.add(day, -1), {id: "old"});
  const p = SRS.makeQuickPlan(book, [x, y], [], course, day);
  assert.equal(p.covered, 2);
  assert.ok(!p.items.some(x => x.word === "word0"));
  const old = SRS.upgradeCard({...SRS.newCard(day), s: 3, n: 4, v: 4, h: "gggg", r: "g"}, "srs:old", 1);
  const c = SRS.rateSkill(old, "recognition", "f", day, {id: "quick:check"});
  for (const key of ["a", "d", "s", "r", "n", "v", "h", "recall", "life"]) assert.deepEqual(c[key], old[key]);
  assert.equal(SRS.needsCalibration(c), true);
});
test("快速检查不按张数抵扣精背任务，正式首答必须真实存在", () => {
  const cards = book.slice(0, 10).map(x => card(x.word)), p = SRS.makeDailyPlan(cards, day, {cap: 10, minutes: 20});
  const s = SRS.dailyStatus(p, cards, {}, {quickWords: ["word0", "word1", "other"]});
  assert.equal(s.completed, 0);
  assert.equal(s.rows.filter(x => x.record.first).length, 0);
  assert.equal(s.rows.find(x => x.word === "word0").done, false);
});
test("真实全书模拟：45 天与 30 天足够预算时覆盖全部，结束自动维护", () => {
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, "../site/data/book.json"), "utf8"));
  const actual = Object.entries(source.search).filter(([, ref]) => !ref[2]).map(([word]) => ({word}));
  assert.equal(actual.length, 2327);
  for (const [days, minutes] of [[45, 30], [30, 45]]) {
    const checks = [], cards = new Map();
    for (let i = 0; i < days; i++) {
      const d = SRS.add(day, i), p = SRS.makeQuickPlan(actual, [...cards.values()], checks, course, d, {days, minutes});
      for (const ref of p.items) {
        checks.push(event(ref.word, d, i % 3 ? "g" : "f", ref.kind));
        if (!cards.has(ref.word)) cards.set(ref.word, card(ref.word));
      }
      assert.equal(SRS.quickStatus(p, checks, [...cards.values()]).finished, true);
    }
    assert.equal(SRS.quickProgress(actual, checks, [...cards.values()], day, SRS.add(day, days - 1)).size, 2327);
    const maintenance = SRS.makeQuickPlan(actual, [...cards.values()], checks, course, SRS.add(day, days + 3), {days, minutes});
    assert.equal(maintenance.maintenance, true);
    assert.equal(maintenance.items.filter(x => x.kind === "new").length, 0);
    assert.ok(maintenance.items.length <= minutes * 60 * .25 / maintenance.reviewSeconds);
  }
});
test("同步保留首份计划和首次识别，备份覆盖批次可恢复且过滤跨日断点", () => {
  const p = SRS.makeQuickPlan(book, [], [], course, day, {id: "p", created: 1});
  assert.deepEqual(SRS.mergeStudyRecord("quick:plan:" + day, [p, 1], [{...p, id: "p2", created: 2}, 10]), [p, 1]);
  const key = SRS.quickCheckKey(day, "word0"), first = event("word0"), second = {...first, at: 2, result: "f"};
  assert.deepEqual(SRS.mergeStudyRecord(key, [first, 1], [second, 10]), [first, 1]);
  assert.deepEqual(SRS.mergeStudyRecord(key, [second, 10], [first, 1]), [first, 1]);
  const doc = {["quick:plan:" + day]: [p, 1], [key]: [first, 1], "drill:quick": [{d: day, quick: p.id, seen: ["word0"]}, 1]};
  assert.equal(Backup.catOf(key), "study");
  assert.deepEqual(Recall.validProgress(doc["drill:quick"][0], doc, day).seen, ["word0"]);
  assert.equal(Recall.validProgress(doc["drill:quick"][0], doc, SRS.add(day, 1)), 0);
  const now = new Date(day + "T12:00:00").getTime(), out = Object.fromEntries(Backup.plan({}, doc, ["study"], "overwrite", now));
  assert.equal(out[key][0].reset, now);
  assert.equal(SRS.mergeStudyRecord(key, [second, 10], out[key])[0].result, "g");
});

test("离线新卡不能覆盖另一端正式回忆，显式备份覆盖与墓碑仍优先", () => {
  const c = {...SRS.freshCard(day, "quick:course:word0"), quickSource: "course"};
  const recalled = SRS.rateRecall(c, "failed", SRS.add(day, 1), {id: "formal"});
  assert.deepEqual(SRS.mergeStudyRecord("srs:word0", [c, 10], [recalled, 5]), [recalled, 5]);
  assert.deepEqual(SRS.mergeStudyRecord("srs:word0", [recalled, 5], [c, 10]), [recalled, 5]);
  assert.deepEqual(SRS.mergeStudyRecord("srs:word0", [recalled, 5], [0, 10]), [0, 10]);
  const restored = Object.fromEntries(Backup.plan({}, {"srs:word0": [c, 1]}, ["study"], "overwrite", 100))["srs:word0"];
  assert.deepEqual(SRS.mergeStudyRecord("srs:word0", [recalled, 5], restored), restored);
  const laterCourse = {...course, id: "later", created: 2};
  const earlyPlan = SRS.makeQuickPlan(book, [], [], course, day, {id: "early", created: 20});
  const latePlan = SRS.makeQuickPlan(book, [], [], laterCourse, day, {id: "late", created: 10});
  assert.equal(SRS.mergeStudyRecord("quick:plan:" + day, [earlyPlan, 20], [latePlan, 10])[0].course, course.id);
});

test("移出生词或重建卡片后不复活旧任务，也不冒充本轮覆盖", () => {
  const x = card("word0"), p = SRS.makeQuickPlan(book, [x], [], course, day);
  assert.ok(p.items.find(ref => ref.word === "word0").life);
  const removed = SRS.quickStatus(p, [], []), rebuilt = SRS.quickStatus(p, [], [{...x, card: {...x.card, life: "new-life"}}]);
  for (const status of [removed, rebuilt]) {
    assert.equal(status.rows.find(ref => ref.word === "word0").retired, true);
    assert.ok(!status.todo.some(ref => ref.word === "word0"));
  }
  assert.equal(SRS.quickProgress(book, [], [x], day, day).size, 0);
});
