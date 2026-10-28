"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), crypto = require("node:crypto");
const S = require("../site/srs.js"), B = require("../site/backup.js");
const plain = x => JSON.parse(JSON.stringify(x));
function syncHarness(initial, remote = {}) {
  const storage = {"lx:sync:doc": JSON.stringify(initial), "lx:sync:cfg": JSON.stringify({token: "模拟凭据", gist: "fake"})};
  const calls = [], timers = [], listeners = {};
  const ctx = vm.createContext({SRS: S, JSON, Date, localStorage: {
    getItem: k => storage[k] ?? null, setItem: (k, v) => storage[k] = v, removeItem: k => delete storage[k],
  }, setTimeout: f => (timers.push(f), timers.length), clearTimeout() {}, document: {addEventListener: (k, f) => listeners[k] = f}, addEventListener() {},
  fetch: async (url, opt) => {
    calls.push({url, opt});
    if (opt.method === "PATCH") remote = JSON.parse(JSON.parse(opt.body).files["cet4-progress.json"].content).d;
    return {ok: true, json: async () => ({files: {"cet4-progress.json": {content: JSON.stringify({v: 1, d: remote})}}})};
  }});
  vm.runInContext(fs.readFileSync(require.resolve("../site/sync.js"), "utf8") + "\nthis.Sync=Sync", ctx);
  return {sync: ctx.Sync, storage, calls, remote: () => remote};
}
test("同步升级保持原时间、等级及旧字段；导出重入、合并和删除都不复活旧证据", async () => {
  const old = {...S.newCard("2026-10-20"), s: 3, h: "gg", n: 2, v: 2};
  const initial = {"srs:word": [old, 123], "set:dailyCap": [120, 122]};
  const h = syncHarness(initial, initial), upgraded = plain(h.sync.dump());
  assert.equal(upgraded["srs:word"][1], 123); assert.equal(S.level(upgraded["srs:word"][0]), 3);
  for (const [k, v] of Object.entries(old)) assert.deepEqual(upgraded["srs:word"][0][k], v);
  await h.sync.start(); assert.deepEqual(plain(h.remote()), upgraded);
  const file = B.parse(B.text(h.sync.dump(), Date.now(), "isolated"));
  assert.deepEqual(B.plan(h.sync.dump(), file.d, B.CATS.map(c => c.id), "merge", Date.now()), []);
  const card = h.sync.get("srs:word"), next = S.rateRecall(card, "failed", "2026-10-28", {id: "same-attempt"});
  h.sync.setMany([["srs:word", next], ["log:2026-10-28", {f: 1}], ["drill:due", {d: "2026-10-28", rated: {word: "f"}}]]);
  await h.sync.syncNow(); const reloaded = syncHarness(h.sync.dump(), h.remote()); await reloaded.sync.start();
  const saved = reloaded.sync.get("srs:word"); assert.equal(S.rateRecall(saved, "failed", "2026-10-28", {id: "same-attempt"}), saved);
  reloaded.sync.load([["srs:word", [0, Date.now() + 100]]]); await reloaded.sync.syncNow();
  assert.equal(reloaded.sync.get("srs:word"), 0);
  assert.equal(reloaded.sync.get("set:dailyCap"), 120);
});
test("云端更新字段完整保留，专项与回忆嵌入同一卡片，墓碑赢过旧卡", async () => {
  const c = S.freshCard("2026-10-27", "life"), n = S.rateSkill(c, "spell", "f", "2026-10-28", {id: "spell"});
  const remote = {"srs:word": [n, 200], "srs:deleted": [0, 300], "evening:2026-10-28": [{finished: false, skipped: true, items: {}}, 200]};
  const h = syncHarness({"srs:word": [c, 100], "srs:deleted": [c, 100]}, remote); await h.sync.start();
  assert.equal(h.sync.get("srs:word").skills.spell.f, 1);
  assert.equal(h.sync.get("srs:word").d, c.d); assert.equal(h.sync.get("srs:deleted"), 0);
  assert.equal(h.sync.get("evening:2026-10-28").skipped, true);
});
test("缺字段旧卡可重复升级，不把旧 h/q 成绩补造为独立证据", () => {
  for (const c of [{a: "2026-10-01", s: 0, d: "2026-10-02"}, {a: "2026-10-01", s: 4, d: "2026-11-01", n: 4, r: "g", h: "gggg", q: 3}]) {
    const n = S.upgradeCard(c, "srs:test", 1);
    assert.equal(n.recall.level, S.legacyLevel(c)); assert.equal(n.recall.days, 0);
    assert.deepEqual(n.recall.history, []); assert.deepEqual(S.upgradeCard(n), n);
  }
});
const sample = process.env.CET4_BACKUP_SAMPLE || "C:/Users/Owen_W/Downloads/cet4-backup-2026-10-28.json";
test("真实只读样本：289 张有效卡，21/197/71；每张日期、原记录与时间保持，原文件哈希不变", {skip: !fs.existsSync(sample)}, () => {
  const data = fs.readFileSync(sample), hash = crypto.createHash("sha256").update(data).digest("hex");
  const source = JSON.parse(data.toString("utf8").replace(/^\uFEFF/, "")).d, upgraded = S.upgradeDoc(source);
  const known = new Set(Object.entries(source).filter(([k, [v]]) => k.startsWith("known:") && v).map(([k]) => k.slice(6)));
  const active = Object.entries(upgraded).filter(([k, [v]]) => v && (k.startsWith("srs:") && !known.has(k.slice(4)) || k.startsWith("vocab:") && !known.has(k.slice(6)) && !source["srs:" + k.slice(6)]?.[0]));
  const levels = [0, 0, 0, 0, 0, 0]; for (const [, [c]] of active) levels[S.level(c)]++;
  assert.equal(active.length, 289); assert.deepEqual(levels, [0, 21, 197, 71, 0, 0]);
  for (const [k, [v, time]] of Object.entries(source)) {
    assert.equal(upgraded[k][1], time);
    if (/^(srs|vocab):/.test(k) && v) {
      assert.equal(upgraded[k][0].d, v.d);
      for (const [field, value] of Object.entries(v)) assert.deepEqual(upgraded[k][0][field], value);
      assert.equal(upgraded[k][0].recall.days, 0);
    } else assert.deepEqual(upgraded[k][0], v);
  }
  assert.deepEqual(S.upgradeDoc(upgraded), upgraded);
  const file = B.parse(B.text(upgraded, Date.now(), "isolated")); assert.deepEqual(file.d, upgraded);
  assert.deepEqual(B.plan(upgraded, file.d, B.CATS.map(c => c.id), "merge", Date.now()), []);
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(sample)).digest("hex"), hash);
});
