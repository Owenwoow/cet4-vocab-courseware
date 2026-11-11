"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const S = require("../site/srs.js"), B = require("../site/backup.js");
const day = "2026-11-06", previous = S.add(day, -10);
const book = [{word: "old"}, {word: "quick"}, {word: "unknown"}];
const old = {word: "old", card: {...S.freshCard(previous, "old"), k: "u01-l01", g: 1}};
const quick = {word: "quick", card: {...S.freshCard(day, "quick"), k: "u01-l01", g: 2, quickSource: "course"}};
const learned = {"u01-l01:g1": previous, "u01-l01:g2": day};

test("统一状态承接历史已学，快背覆盖与精背训练分别判断", () => {
  const before = JSON.stringify([old, quick]);
  const states = S.learningState(book, [old, quick], learned, [], [], day);
  assert.equal(states.get("old").exposed, true);
  assert.equal(states.get("old").preciseLearned, true);
  assert.equal(states.get("quick").exposed, true);
  assert.equal(states.get("quick").preciseLearned, false);
  assert.equal(states.get("quick").needsPrecise, true);
  assert.equal(states.get("unknown").exposed, false);
  assert.equal(JSON.stringify([old, quick]), before);
  assert.equal(S.quickProgress(book, [], [old, quick], day, day, {learned}).size, 2);
});
test("仅有不明卡片不当已学，取消与新生命周期不继承旧识别证据", () => {
  const stale = {word: "unknown", card: {...S.freshCard(previous, "new-life"), k: "u01-l01", g: 3}};
  const checks = [{word: "unknown", d: previous, result: "g", life: "retired-life"}];
  assert.equal(S.learningState(book, [stale], {}, checks, [], day).get("unknown").exposed, false);
  assert.equal(S.learningState(book, [], {}, checks, ["unknown"], day).get("unknown").exposed, true);
  const vocab = {word: "unknown", vocab: true, card: {...stale.card, at: previous, p: "/test/"}};
  const state = S.learningState(book, [vocab], {}, [], [], day).get("unknown");
  assert.equal(state.exposed, true);
  assert.equal(state.firstSeen, previous);
  assert.equal(state.preciseLearned, false);
});
test("时间设置兼容保留原时间戳，重复升级幂等，较新显式设置优先", () => {
  const d = {"set:dailyMinutes": [20, 10], "set:quickMinutes": [45, 20]}, upgraded = S.upgradeDoc(d);
  assert.deepEqual(upgraded["set:studyMinutes"], [45, 20]);
  assert.deepEqual(S.upgradeDoc(upgraded), upgraded);
  const explicit = {...d, "set:studyMinutes": [30, 30]};
  assert.deepEqual(S.upgradeDoc(explicit)["set:studyMinutes"], [30, 30]);
});
test("统一时间账本去重正式历史与任务，补测和快速检查均占时间", () => {
  const recalled = {...old, card: S.rateRecall(old.card, "failed", day, {id: "formal"})};
  const records = [{d: day, life: old.card.life, word: "old", first: {result: "failed", cost: 32}, retry: {result: "independent", cost: 32}}];
  const checks = [{d: day, word: "quick", cost: 22, seconds: 80, kind: "new"}];
  const b = S.studyBudget(day, 20, [recalled], checks, records);
  assert.equal(b.used, 86);
  assert.equal(b.remaining, 1114);
  assert.equal(S.studyBudget(day, 20, [recalled], checks, [...records, records[0]]).used, 86);
  const partial = S.studyBudget(day, 20, [], [{d: day, word: "quick", budgetOnly: true, cost: 14}, {d: day, word: "quick", cost: 8}]);
  assert.equal(partial.used, 22);
});
test("剩余预算分配新词和复习，不能继续使用整日复习配额", () => {
  const many = Array.from({length: 500}, (_, i) => ({word: "w" + i}));
  const cards = many.slice(0, 200).map((x, i) => ({...x, card: {...S.freshCard(previous, x.word), k: "u01-l01", g: i}}));
  const marks = Object.fromEntries(cards.map(x => [`u01-l01:g${x.card.g}`, previous]));
  const p = S.makeQuickPlan(many, cards, [], {id: "course", started: day, baseline: 200}, day,
    {minutes: 20, availableSeconds: 176, learned: marks});
  const reviews = p.items.filter(x => x.kind !== "new").length, fresh = p.items.length - reviews;
  assert.ok(reviews * p.reviewSeconds <= 176 * .25);
  assert.ok(fresh * p.newSeconds <= 176 * .75);
  assert.equal(p.covered, 200);
  const exhausted = S.makeQuickPlan(many, [], [], {id:"course",started:previous}, day, {minutes:20,availableSeconds:0});
  assert.equal(exhausted.items.length, 0);
  assert.ok(exhausted.finish >= S.add(day, Math.ceil(many.length / Math.ceil(Math.ceil(many.length / 45) * 1.25))));
});
test("快背占满预算后精背延期，待做保留且不虚构完成记录", () => {
  const p = S.makeDailyPlan([old], day), status = S.dailyStatus(p, [old], {}, {remainingSeconds: 0});
  assert.equal(status.completed, 0);
  assert.equal(status.finished, true);
  assert.equal(status.deferred, 1);
  assert.equal(status.rows[0].done, false);
  assert.equal(status.rows[0].record.first, undefined);
});
test("当日预算跨端取首份，显式备份覆盖可替换，新计划不被旧版本反盖", () => {
  const a = [{v: 1, id: "a", d: day, created: 1, minutes: 20}, 1], b = [{v: 1, id: "b", d: day, created: 2, minutes: 30}, 5];
  assert.deepEqual(S.mergeStudyRecord("studyday:" + day, a, b), a);
  assert.deepEqual(S.mergeStudyRecord("studyday:" + day, b, a), a);
  assert.equal(B.catOf("studyday:" + day), "study");
  const restored = Object.fromEntries(B.plan({}, {["studyday:" + day]: b}, ["study"], "overwrite", 100))["studyday:" + day];
  assert.deepEqual(S.mergeStudyRecord("studyday:" + day, restored, a), restored);
  assert.equal(S.mergeStudyRecord("quick:plan:" + day, [{v: 1}, 50], [{v: 2}, 10])[0].v, 2);
});

const sample = process.env.CET4_BACKUP_SAMPLE || path.join(os.homedir(), "Downloads/cet4-backup-2026-11-06.json");
test("本机真实备份：已学基线完整承接，原卡、排期、校准和同步时间保留，原文件不变", {skip: !fs.existsSync(sample)}, () => {
  const bytes = fs.readFileSync(sample), hash = crypto.createHash("sha256").update(bytes).digest("hex"), raw = JSON.parse(bytes).d;
  const upgraded = S.upgradeDoc(JSON.parse(JSON.stringify(raw))), cards = Object.entries(upgraded).filter(([k,[v]]) => k.startsWith("srs:") && v).map(([k,[card]]) => ({word: k.slice(4), card}));
  const data = JSON.parse(fs.readFileSync(path.join(__dirname,"../site/data/book.json"), "utf8"));
  const words = Object.entries(data.search).filter(([,r]) => !r[2]).map(([word]) => ({word}));
  const marks = Object.fromEntries(Object.entries(upgraded).filter(([k,[v]]) => k.startsWith("learn:") && v).map(([k,[v]])=>[k.slice(6),v]));
  const known = Object.entries(upgraded).filter(([k,[v]])=>k.startsWith("known:")&&v).map(([k])=>k.slice(6));
  const states = S.learningState(words, cards, marks, [], known, day), expected = cards.filter(x=>marks[`${x.card.k}:g${x.card.g}`]).length;
  assert.equal([...states.values()].filter(s=>s.exposed).length, expected);
  assert.ok(expected >= 274);
  for (const [key,p] of Object.entries(raw)) {
    assert.equal(upgraded[key][1], p[1]);
    if (/^(srs|vocab|learn|migration):/.test(key)) assert.deepEqual(upgraded[key], p);
  }
  assert.equal(upgraded["set:studyMinutes"][0], 20);
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(sample)).digest("hex"), hash);
});
