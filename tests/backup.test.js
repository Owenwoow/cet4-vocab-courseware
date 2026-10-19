/* 导出 / 导入备份的单元测试：node --test tests/ */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Backup = require("../site/backup.js");

const ALL = Backup.CATS.map(c => c.id);
const DEF = {voice: "ava", rate: 1, roundSize: 25, autoSay: true};
const toObj = pairs => Object.fromEntries(pairs);

test("分类：按键前缀，drill: 不导入，认不出的归其他", () => {
  assert.equal(Backup.catOf("known:apple"), "known");
  assert.equal(Backup.catOf("set:roundSize"), "set");
  for (const k of ["learn:u01-l01:g1", "srs:apple", "log:2026-10-19"]) assert.equal(Backup.catOf(k), "study");
  assert.equal(Backup.catOf("vocab:find"), "vocab");
  for (const k of ["last", "lw:u01-l01", "pos:u01-l01"]) assert.equal(Backup.catOf(k), "pos");
  for (const k of ["vpGeo", "peekTab", "listFold", "listHide", "sideOff", "learnPeek"]) assert.equal(Backup.catOf(k), "ui");
  assert.equal(Backup.catOf("drill:u01"), null);
  assert.equal(Backup.catOf("newThing"), "other");
  assert.equal(Backup.catOf("lastX"), "other");
});

test("summary：每类条数，不算墓碑和 drill:，设置的 0 照样算", () => {
  const n = Backup.summary({
    "known:a": [1, 5], "known:b": [0, 6], "set:roundSize": [0, 1], "set:voice": ["ryan", 1],
    "srs:a": [{d: 1}, 2], "learn:x:g1": [0, 3], "vocab:find": [{z: "发现"}, 2], "drill:u01": [{i: 3}, 9],
    "last": ["u01-l01", 1], "learnPeek": [{w: true, n: false}, 1], "zzz": [1, 1],
  });
  assert.deepEqual(n, {known: 1, set: 2, study: 1, vocab: 1, pos: 1, ui: 1, other: 1});
});

test("合并：每个键取时间较新的，本机更新的不被改回", () => {
  const local = {"set:voice": ["ryan", 200], "known:a": [1, 50]};
  const file = {"set:voice": ["sonia", 100], "known:a": [0, 80], "known:b": [1, 10]};
  const out = toObj(Backup.plan(local, file, ALL, "merge", 999, DEF));
  assert.deepEqual(out, {"known:a": [0, 80], "known:b": [1, 10]});   // 保留文件里的时间
});

test("合并：时间相同按值排序，和 sync.js 一致；完全相同的不写", () => {
  const out = Backup.plan({"known:a": [0, 5], "known:c": [1, 7]}, {"known:a": [1, 5], "known:c": [1, 7]}, ALL, "merge", 999);
  assert.deepEqual(out, [["known:a", [1, 5]]]);
});

test("覆盖：文件有的写文件的值、时间记 now；没有的已会 / 学习记录 / 生词本记 0", () => {
  const local = {
    "known:a": [1, 500], "known:old": [1, 500], "srs:old": [{d: 3}, 500], "learn:x:g9": ["2026-10-01", 500],
    "log:2026-10-02": [{good: 3}, 500], "vocab:old": [{z: "旧"}, 500], "known:gone": [0, 500],
  };
  const file = {"known:a": [0, 10], "srs:new": [{d: 1}, 10]};
  const out = toObj(Backup.plan(local, file, ALL, "overwrite", 999, DEF));
  assert.deepEqual(out, {
    "known:a": [0, 999], "srs:new": [{d: 1}, 999],
    "known:old": [0, 999], "srs:old": [0, 999], "learn:x:g9": [0, 999], "log:2026-10-02": [0, 999], "vocab:old": [0, 999],
    "known:gone": [0, 999],
  });   // 已经是墓碑也写 now：云端若有更新的 1，同步回来不会把覆盖改回去
});

test("覆盖：设置缺项恢复默认值（不记 0），0 是合法值不当墓碑", () => {
  const local = {"set:voice": ["ryan", 5], "set:roundSize": [0, 5], "set:rate": [1, 5], "set:removed": ["x", 5]};
  const file = {"set:autoSay": [false, 1]};
  const out = toObj(Backup.plan(local, file, ALL, "overwrite", 999, DEF));
  assert.deepEqual(out, {"set:autoSay": [false, 999], "set:voice": ["ava", 999], "set:roundSize": [25, 999], "set:rate": [1, 999]});
  // 已经是默认值也写 now（理由同墓碑）；removed 不在默认值里不动
  const out2 = toObj(Backup.plan({"set:roundSize": [25, 5]}, {"set:roundSize": [0, 1]}, ALL, "overwrite", 999, DEF));
  assert.deepEqual(out2, {"set:roundSize": [0, 999]});
});

test("覆盖：阅读位置、界面状态、其他文件里没有的不动", () => {
  const local = {"last": ["u02-l01", 5], "pos:u02-l01": [{y: 3}, 5], "vpGeo": [{x: 1}, 5], "learnPeek": [{w: true}, 5], "zzz": [1, 5]};
  assert.deepEqual(Backup.plan(local, {}, ALL, "overwrite", 999, DEF), []);
});

test("只导勾选的类别；drill: 任何方式都不导入", () => {
  const local = {"vocab:old": [{z: "旧"}, 5], "known:x": [1, 5]};
  const file = {"vocab:new": [{z: "新"}, 1], "known:y": [1, 1], "drill:u01": [{i: 2}, 9]};
  const cats = ALL.filter(c => c !== "vocab");
  assert.deepEqual(toObj(Backup.plan(local, file, cats, "overwrite", 999, DEF)), {"known:y": [1, 999], "known:x": [0, 999]});
  assert.deepEqual(toObj(Backup.plan(local, file, cats, "merge", 999, DEF)), {"known:y": [1, 1]});
  assert.deepEqual(Backup.plan({}, {"drill:u01": [{i: 2}, 9]}, ALL, "overwrite", 999, DEF), []);
});

test("解析：本站格式才认，格式不对返回 null", () => {
  const ok = JSON.stringify(Backup.make({"known:a": [1, 5]}, 123, "http://localhost:8765"));
  assert.deepEqual(Backup.parse(ok), {at: 123, origin: "http://localhost:8765", d: {"known:a": [1, 5]}});
  for (const bad of ["", "not json", "[]", "{}", '{"app":"other","v":1,"d":{}}', '{"app":"cet4-vocab","v":2,"d":{}}',
    '{"app":"cet4-vocab","v":1}', '{"app":"cet4-vocab","v":1,"d":[]}', '{"app":"cet4-vocab","v":1,"d":{"k":1}}',
    '{"app":"cet4-vocab","v":1,"d":{"k":[1]}}', '{"app":"cet4-vocab","v":1,"d":{"k":[1,"x"]}}'])
    assert.equal(Backup.parse(bad), null, bad);
});

test("文件名日期：本地时间补零", () => {
  assert.equal(Backup.day(new Date(2026, 0, 5, 23, 59).getTime()), "2026-01-05");
});

/* sync.js 的 dump / load：用假的 localStorage、定时器跑在 vm 里（不发网络请求） */
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
function loadSync(store) {
  const timers = [];
  const localStorage = {
    getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; },
  };
  const ctx = vm.createContext({localStorage, setTimeout: (f, ms) => (timers.push(ms), timers.length), clearTimeout() {}, Date, JSON});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../site/sync.js"), "utf8") + "\nthis.Sync = Sync;", ctx);
  return {Sync: ctx.Sync, timers};
}
const TOKEN = "github_pat_SECRET123";

test("sync.dump：返回深拷贝，不含 token；导出文件里也没有 token", () => {
  const store = {"lx:sync:doc": JSON.stringify({"known:a": [1, 5], "set:roundSize": [0, 6]}),
    "lx:sync:cfg": JSON.stringify({token: TOKEN, gist: "g1"})};
  const {Sync} = loadSync(store);
  const d = Sync.dump();
  assert.deepEqual(JSON.parse(JSON.stringify(d)), {"known:a": [1, 5], "set:roundSize": [0, 6]});
  d["known:a"][0] = 0;
  assert.equal(Sync.get("known:a"), 1);   // 改拷贝不影响本机
  const file = JSON.stringify(Backup.make(Sync.dump(), 1, "http://localhost:8765"));
  assert.ok(!file.includes(TOKEN) && !file.includes("gist"));
});

test("sync.load：保留给定时间、存本地、通知值变了的键、排一次推送；不碰 token", () => {
  const cfg = JSON.stringify({token: TOKEN, gist: "g1"});
  const store = {"lx:sync:doc": JSON.stringify({"known:a": [1, 5], "set:voice": ["ava", 5]}), "lx:sync:cfg": cfg};
  const {Sync, timers} = loadSync(store);
  const seen = [];
  Sync.on(ch => seen.push(ch));
  const n = Sync.load([["known:a", [1, 9]], ["set:voice", ["ryan", 7]], ["srs:b", [{d: 1}, 3]], ["set:voice", ["ryan", 7]]]);
  assert.equal(n, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(seen)), [["set:voice", "srs:b"]]);   // known:a 只改了时间，值没变不通知
  assert.deepEqual(JSON.parse(store["lx:sync:doc"]), {"known:a": [1, 9], "set:voice": ["ryan", 7], "srs:b": [{d: 1}, 3]});
  assert.equal(timers.length, 1);
  assert.equal(store["lx:sync:cfg"], cfg);
  assert.equal(Sync.load([["known:a", [1, 9]]]), 0);   // 完全一样的不写、不通知、不再排推送
  assert.equal(seen.length, 1); assert.equal(timers.length, 1);
});

test("合并：文件里将来的时间夹到 now", () => {
  assert.deepEqual(Backup.plan({}, {"known:a": [1, 5000]}, ["known"], "merge", 999, DEF), [["known:a", [1, 999]]]);
  assert.deepEqual(Backup.plan({"known:a": [1, 999]}, {"known:a": [1, 1e15]}, ["known"], "merge", 999, DEF), []);   // 夹完和本机一样，不写
});

test("解析：__proto__ / constructor 这类键整份拒绝", () => {
  for (const k of ["__proto__", "constructor", "prototype"])
    assert.equal(Backup.parse(`{"app":"cet4-vocab","v":1,"at":1,"d":{"known:a":[1,5],"${k}":[1,5]}}`), null);
});
