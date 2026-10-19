/* 导出 / 导入备份（纯函数，不碰页面和存储；浏览器里是全局 Backup，Node 里 require 进来跑单元测试）

   备份文件 = {app: "cet4-vocab", v: 1, at 导出时刻, origin 网址, d: Sync.dump()}，d 的格式同 sync.js：{键: [值, 修改时间]}。
   云同步 token 不在 d 里（sync.js 单独存），所以文件里也没有。

   导入按键前缀分类，可勾选类别：
     已会 known: / 设置 set: / 学习记录和复习卡 learn: srs: log:（三者绑在一起，拆开会对不上）/ 生词本 vocab: /
     阅读位置 last、lw:、pos: / 界面状态 vpGeo、peekTab、listFold、listHide、sideOff、learnPeek / 其他（认不出的键，以后新增的）
     drill:（巩固做到一半，当天有效）不导入。
   两种方式：
     merge 合并 = 每个键取时间较新的（规则同 sync.js 的 merge），永远不会把本机更新的记录改回去
     overwrite 覆盖 = 勾选类别里文件有的键写入文件的值、时间记 now；文件里没有、本机有的：
       已会 / 学习记录和复习卡 / 生词本记 0（墓碑）；设置恢复成默认值（不记 0，有的设置合法值就是 0，比如 roundSize）；
       阅读位置、界面状态、其他不动。值已经和目标一样的键跳过 */
"use strict";
const Backup = (() => {
  const APP = "cet4-vocab", V = 1;
  const CATS = [
    {id: "known", name: "已会", prefixes: ["known:"], tomb: true},
    {id: "set", name: "设置", prefixes: ["set:"]},
    {id: "study", name: "学习记录和复习卡", prefixes: ["learn:", "srs:", "log:"], tomb: true},
    {id: "vocab", name: "生词本", prefixes: ["vocab:"], tomb: true},
    {id: "pos", name: "阅读位置", keys: ["last"], prefixes: ["lw:", "pos:"]},
    {id: "ui", name: "界面状态", keys: ["vpGeo", "peekTab", "listFold", "listHide", "sideOff", "learnPeek"]},
    {id: "other", name: "其他"},
  ];
  const SKIP = ["drill:"];
  const BY_ID = Object.fromEntries(CATS.map(c => [c.id, c]));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const newer = (a, b) => a[1] > b[1] || (a[1] === b[1] && JSON.stringify(a[0]) > JSON.stringify(b[0]));

  /* 键属于哪一类；不导入的返回 null */
  function catOf(k) {
    if (SKIP.some(p => k.startsWith(p))) return null;
    for (const c of CATS) if ((c.keys || []).includes(k) || (c.prefixes || []).some(p => k.startsWith(p))) return c.id;
    return "other";
  }
  const isTomb = (k, v) => v === 0 && !!(BY_ID[catOf(k)] || {}).tomb;   // 只有这几类的 0 是墓碑，设置的 0 是正常值

  /* 每类有几条（不算墓碑、不算不导入的） */
  function summary(fileDoc) {
    const n = Object.fromEntries(CATS.map(c => [c.id, 0]));
    for (const [k, [v]] of Object.entries(fileDoc)) { const c = catOf(k); if (c && !isTomb(k, v)) n[c]++; }
    return n;
  }

  /* 要写入的 [键, [值, 时间]] 列表。cats = 勾选的类别 id，defaults = 设置的默认值 {名字: 值}（不带 set: 前缀） */
  function plan(localDoc, fileDoc, cats, mode, now, defaults = {}) {
    const on = new Set(cats), out = [];
    for (const [k, p] of Object.entries(fileDoc)) {
      if (!on.has(catOf(k))) continue;
      const l = localDoc[k];
      if (mode === "merge") { if (!l || newer(p, l)) out.push([k, [p[0], p[1]]]); }
      else if (!l || !same(l[0], p[0])) out.push([k, [p[0], now]]);
    }
    if (mode !== "overwrite") return out;
    for (const [k, l] of Object.entries(localDoc)) {
      if (k in fileDoc) continue;
      const c = catOf(k);
      if (!on.has(c)) continue;
      if (BY_ID[c].tomb) { if (l[0] !== 0) out.push([k, [0, now]]); }
      else if (c === "set") {
        const name = k.slice(4);
        if (name in defaults && !same(l[0], defaults[name])) out.push([k, [defaults[name], now]]);
      }
    }
    return out;
  }

  /* 生成备份文件内容 */
  const make = (d, at, origin) => ({app: APP, v: V, at, origin, d});

  /* 解析备份文件文字：格式不对返回 null */
  function parse(text) {
    let o;
    try { o = JSON.parse(text); } catch { return null; }
    if (!o || typeof o !== "object" || o.app !== APP || o.v !== V) return null;
    const d = o.d;
    if (!d || typeof d !== "object" || Array.isArray(d)) return null;
    for (const p of Object.values(d)) if (!Array.isArray(p) || p.length !== 2 || typeof p[1] !== "number" || !isFinite(p[1])) return null;
    return {at: typeof o.at === "number" ? o.at : 0, origin: typeof o.origin === "string" ? o.origin : "", d};
  }

  /* 文件名里的日期：本地时间 YYYY-MM-DD */
  const day = t => { const x = new Date(t); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

  return {CATS, catOf, summary, plan, make, parse, day};
})();
if (typeof module === "object" && module.exports) module.exports = Backup;
