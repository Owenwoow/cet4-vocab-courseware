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

test("导出时间：本地时间 YYYY-MM-DD HH:MM，补零", () => {
  assert.equal(Backup.stamp(new Date(2026, 9, 20, 8, 30).getTime()), "2026-10-20 08:30");
  assert.equal(Backup.stamp(new Date(2026, 0, 5, 0, 7).getTime()), "2026-01-05 00:07");
});

/* 导出文件的文字（Backup.text）：一份各类键都有的数据，故意写乱顺序 */
const SAMPLE = {
  "zzz": [1, 17], "learnPeek": [{w: true, n: false}, 16], "vpGeo": [{x: 1, y: 2}, 15], "drill:u01": [{i: 3}, 14], "drill:u02": [0, 13],
  "pos:u02-l01": [{y: 3}, 12], "lw:u01-l01": [{p: 1}, 11], "last": ["u02-l01", 10],
  "vocab:find": [{w: "find", m: "发现", a: "2026-10-01"}, 9], "vocab:gone": [0, 8], "vocab:abandon": [{w: "abandon"}, 7],
  "srs:b": [{a: "2026-10-01", d: "2026-10-02", h: "gm"}, 6], "srs:a": [{a: "2026-10-01"}, 6], "srs:dead": [0, 6],
  "log:2026-10-02": [{g: 3, m: 1, f: 0, dv: 4, mv: 2}, 5], "log:2026-10-01": [{g: 1, m: 0, f: 0, dv: 0, mv: 0}, 5], "log:2026-09-30": [0, 5],
  "learn:u01-l01:g10": ["2026-10-01", 4], "learn:u01-l01:g2": ["2026-10-01", 4], "learn:u01-l01:g1": [0, 4], "learn:u01-l02:g1": ["2026-10-02", 4],
  "set:voice": ["ryan", 3], "set:roundSize": [0, 3], "set:autoSay": [true, 3],
  "known:b": [1, 2], "known:a": [1, 2], "known:dead": [0, 2],
};
const AT = new Date(2026, 9, 20, 8, 30).getTime();
const fileLines = txt => txt.split("\n");
/* d 里的每一行 → [键, [值, 时间]]：从「"d": {」下一行读到最后的「}」之前，每行单独 parse（顺便验证真的是一行一条） */
function dRows(txt) {
  const ls = fileLines(txt), i = ls.indexOf('"d": {');
  assert.ok(i > 0, "找得到 d 的起始行");
  const end = ls.length - 3;   // 倒数第三行是 d 的收尾 }，再往后是整个文件的 } 和换行留下的空行
  assert.equal(ls[end], "}");
  return ls.slice(i + 1, end).map(l => Object.entries(JSON.parse(`{${l.trim().replace(/,$/, "")}}`))[0]);
}

test("文字：parse 回来 d 和原来完全一样（键、值、时间），特殊字符不丢", () => {
  const d = {...SAMPLE, "vocab:quote": [{m: '带"引号"、\\反斜杠、换行\n和 <tag> 😀', w: "say \"hi\""}, 1], "known:中文": [1, 1e13]};
  const txt = Backup.text(d, AT, "http://localhost:8765");
  const f = Backup.parse(txt);
  assert.deepEqual(f, {at: AT, origin: "http://localhost:8765", d});
  assert.deepEqual(f.d["vocab:quote"], d["vocab:quote"]);
  assert.deepEqual(Backup.parse(Backup.text({}, AT, "x")).d, {});   // 空数据也是合法文件
  assert.equal(Backup.parse(Backup.text(d, AT)).origin, "");   // 没给网址也能写、能读
  assert.ok(!txt.includes("\r"));
});

test("文字：外层字段顺序 app、v、at、origin、说明、d，版本号还是 1，每个外层字段一行", () => {
  const txt = Backup.text(SAMPLE, AT, "http://localhost:8765");
  const o = JSON.parse(txt);
  assert.deepEqual(Object.keys(o), ["app", "v", "at", "origin", "说明", "d"]);
  assert.equal(o.v, 1);
  assert.deepEqual(Object.keys(o["说明"]), ["导出时间", "来自", "每类条数", "怎么导入", "字段含义"]);
  const ls = fileLines(txt);
  assert.deepEqual(ls.slice(0, 5), ["{", '"app": "cet4-vocab",', '"v": 1,', `"at": ${AT},`, '"origin": "http://localhost:8765",']);
  assert.equal(ls[5], '"说明": {');
  assert.ok(ls.includes('"d": {') && ls.at(-2) === "}" && ls.at(-1) === "", "以换行结尾");
});

test("文字：说明里有导出时间、来自、怎么导入和字段含义（含 mv），每项一行", () => {
  const txt = Backup.text(SAMPLE, AT, "http://localhost:8765");
  const m = JSON.parse(txt)["说明"], ls = fileLines(txt);
  assert.equal(m["导出时间"], Backup.stamp(AT));
  assert.equal(m["来自"], "http://localhost:8765");
  assert.match(m["怎么导入"], /设置页 → 数据 → 导入…/);
  assert.match(m["怎么导入"], /\[值, 修改时间（毫秒）\]/);
  assert.match(m["怎么导入"], /0 表示已删除/);
  const f = m["字段含义"];
  assert.match(f["log:<日期>"], /mv 当天做的必做数/);
  assert.match(f["srs:<词>"], /q 答对过的最难题型（0 看词选义 \/ 1 听音 \/ 2 例句或看义选词 \/ 3 拼写）/);
  assert.match(f["srs:<词>"], /cf 易混词/);
  assert.match(f["vocab:<原形>"], /bk 书中位置/);
  assert.match(f["drill:<范围>"], /不导入/);
  // 每类的键前缀、drill: 都有解释，以后新增类别忘了写会在这里提醒
  const names = Object.keys(f);
  for (const p of ["learn:", "srs:", "log:", "vocab:", "known:", "set:", "lw:", "pos:", "drill:", "last", "vpGeo"])
    assert.ok(names.some(k => k.includes(p)), "字段含义缺 " + p);
  // 说明里每一项（含字段含义里的每一条）单独占一行
  for (const k of Object.keys(m)) assert.equal(ls.filter(l => l.startsWith(`  ${JSON.stringify(k)}: `)).length, 1, k);
  for (const [k, v] of Object.entries(f)) assert.equal(ls.filter(l => l.startsWith(`    ${JSON.stringify(k)}: ${JSON.stringify(v)}`)).length, 1, k);
});

test("文字：说明里的每类条数等于 summary（按中文名、不算墓碑和 drill:）", () => {
  const txt = Backup.text(SAMPLE, AT, "o");
  const n = Backup.summary(SAMPLE), shown = JSON.parse(txt)["说明"]["每类条数"];
  assert.deepEqual(shown, Object.fromEntries(Backup.CATS.map(c => [c.name, n[c.id]])));
  assert.deepEqual(Object.keys(shown), Backup.CATS.map(c => c.name));
  assert.deepEqual(shown, {"已会": 2, "设置": 3, "学习记录和复习卡": 7, "生词本": 2, "阅读位置": 3, "界面状态": 2, "其他": 1});
});

test("文字：d 每条记录一行，条数不丢", () => {
  const txt = Backup.text(SAMPLE, AT, "o");
  const rows = dRows(txt);
  assert.equal(rows.length, Object.keys(SAMPLE).length);
  assert.deepEqual(toObj(rows), SAMPLE);
  // 键和值写在同一行：行里除了最后的逗号没有别的换行；值本身（对象）不展开
  const start = fileLines(txt).indexOf('"d": {');
  for (let i = 0; i < rows.length; i++) assert.ok(fileLines(txt)[start + 1 + i].startsWith(`  ${JSON.stringify(rows[i][0])}: [`));
  assert.ok(fileLines(txt)[start + 1 + rows.length] === "}");
});

test("文字：d 按类别排，每类里没删的在前、已删除（0）的在最后，各自按键名排；设置的 0 不算已删除", () => {
  const keys = dRows(Backup.text(SAMPLE, AT, "o")).map(([k]) => k);
  assert.deepEqual(keys, [
    "known:a", "known:b", "known:dead",
    "set:autoSay", "set:roundSize", "set:voice",   // roundSize 是 0 但属于设置，不排最后
    "learn:u01-l01:g2", "learn:u01-l01:g10", "learn:u01-l02:g1", "srs:a", "srs:b", "log:2026-10-01", "log:2026-10-02",
    "learn:u01-l01:g1", "srs:dead", "log:2026-09-30",
    "vocab:abandon", "vocab:find", "vocab:gone",
    "last", "lw:u01-l01", "pos:u02-l01",
    "learnPeek", "vpGeo",
    "drill:u01", "drill:u02", "zzz",
  ]);
});

test("文字：旧格式（一整行、没有说明）照样能 parse，和新格式读出来一样", () => {
  const old = '{"app":"cet4-vocab","v":1,"at":1760918400000,"origin":"http://localhost:8765","d":{"known:a":[1,5],"srs:b":[{"d":"2026-10-02"},6],"set:roundSize":[0,7]}}';
  const f = Backup.parse(old);
  assert.deepEqual(f, {at: 1760918400000, origin: "http://localhost:8765", d: {"known:a": [1, 5], "srs:b": [{d: "2026-10-02"}, 6], "set:roundSize": [0, 7]}});
  assert.deepEqual(Backup.parse(Backup.text(f.d, f.at, f.origin)), f);   // 旧 → 新文字 → 读回来不变
  assert.deepEqual(Backup.parse(JSON.stringify(Backup.make(SAMPLE, AT, "o"))).d, Backup.parse(Backup.text(SAMPLE, AT, "o")).d);
  // 导入计划不受文件长相影响（只是写入的先后跟着文件里的键序走）
  const planOf = file => toObj(Backup.plan({}, file.d, ALL, "merge", 999, DEF));
  assert.deepEqual(planOf(f), planOf(Backup.parse(Backup.text(f.d, f.at, f.origin))));
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
