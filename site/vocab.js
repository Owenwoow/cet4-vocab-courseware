/* 生词本的文字处理（纯函数，不碰页面和存储；浏览器里是全局 Vocab，Node 里 require 进来跑单元测试）

   生词来自例句的逐词释义（data/gloss，AI 补充），一条长这样：
     「/faʊnd/ v. 发现（find 的过去式）」= 音标 + 词性 + 意思 + 变形标注
   加入生词本存原形：有变形标注就取标注里的词（found → find）；没有就按词形变化去书的目录里找（studies → study）；
   缩写、否定、短语保留原样（you've、shouldn't、is bound to） */
"use strict";
const Vocab = (() => {
  /* 变形标注：（find 的过去式）。「的」前面只能是一个词，所以（you have 的缩写）不算 */
  const NOTE = /（([A-Za-z'-]+) ?的([^（）]*)）/;
  const NOTES = new RegExp(NOTE.source, "g");
  const INFLECT = /^(复数|过去|现在分词|现在形式|进行式|第三人称|三单|比较级|最高级|所有格|属格|-ing|动词形式)/;
  const isInflect = s => INFLECT.test(s.trim());

  /* 词形变化的候选原形，第一个是它自己 */
  function candidates(w) {
    const c = [w];
    if (w.endsWith("'s")) c.push(w.slice(0, -2));
    if (w.endsWith("s'")) c.push(w.slice(0, -1), w.slice(0, -2));
    if (w.endsWith("ies")) c.push(w.slice(0, -3) + "y");
    if (w.endsWith("es")) c.push(w.slice(0, -2));
    if (w.endsWith("s")) c.push(w.slice(0, -1));
    if (w.endsWith("ied")) c.push(w.slice(0, -3) + "y");
    if (w.endsWith("ed")) c.push(w.slice(0, -2), w.slice(0, -1), w.slice(0, -3));
    if (w.endsWith("ing")) c.push(w.slice(0, -3), w.slice(0, -3) + "e");
    return c;
  }

  /* 释义里标注的原形，没有就返回空串 */
  function lemmaFromGloss(gloss) {
    const m = (gloss || "").match(NOTE);
    return m && isInflect(m[2]) ? m[1].toLowerCase() : "";
  }

  /* 原形：surface 点到的写法，gloss 这个写法的逐词释义，inBook(w) 书的目录里有没有这个词 */
  function lemma(surface, gloss, inBook) {
    const w = surface.toLowerCase().trim();
    if (/\s/.test(w)) return w;                      // 短语原样
    const g = lemmaFromGloss(gloss);
    if (g) return g;
    if (inBook && !inBook(w)) for (const c of candidates(w).slice(1)) if (inBook(c)) return c;
    return w;
  }

  /* 拆出开头的音标；dropNote 时去掉变形标注（存原形时，标注和「found」的音标都不再适用） */
  function parse(gloss, dropNote) {
    let t = (gloss || "").trim(), p = "";
    const m = t.match(/^(\/[^/]+\/)\s*/);
    if (m) { p = m[1]; t = t.slice(m[0].length); }
    if (dropNote) t = t.replace(NOTES, (all, b, s) => (isInflect(s) ? "" : all)).trim();
    return {p, m: t};
  }

  /* 「pron. & v. 你已经」→ [{pos: "pron. & v.", mean: "你已经"}]；没有词性的整句当意思 */
  function senses(m) {
    const t = (m || "").trim();
    if (!t) return [];
    const r = t.match(/^([a-z]+\.(?:\s*[&/]\s*[a-z]+\.)*)\s*(.*)$/);
    return [r ? {pos: r[1], mean: r[2]} : {pos: "", mean: t}];
  }

  return {candidates, lemmaFromGloss, lemma, parse, senses};
})();
if (typeof module === "object" && module.exports) module.exports = Vocab;
