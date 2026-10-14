/* 例句渲染与词组定位的单元测试：node --test tests/
   例子取自 data/notes 的样例（u07-l03 except 句、u08-l01 attribute 句） */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Sent = require("../site/sent.js");

const ATTR = "Mistakes crack their self-confidence because they attribute errors to a lack of ability, which they feel powerless to change.";
const ATTR_PH = [
  {t: "attribute", b: "attribute … to", m: "把……归因于"},
  {t: "to", b: "attribute … to", m: "把……归因于"},
  {t: "a lack of", b: "a lack of", m: "缺乏"},
  {t: "feel powerless to", b: "feel powerless to do", m: "感到无力做某事"},
];
const EXCEPT = "We were assured that, except for low grades or a raise in family income, no money would be taken away.";
const EXCEPT_PH = [
  {t: "were assured", b: "be assured", m: "得到保证"},
  {t: "except for", b: "except for", m: "除……之外"},
  {t: "a raise in", b: "a raise in", m: "……的增加"},
  {t: "taken away", b: "take away", m: "拿走；夺去"},
];
const sub = (en, x) => en.slice(x.s, x.e);
const words = h => [...h.matchAll(/<span class="w[^"]*">([^<]*)<\/span>/g)].map(m => m[0]);

test("拆开的搭配：第二段从上一段结尾之后找，attribute 和 to a lack 的 to 共用一个词组", () => {
  const segs = Sent.locate(ATTR, ATTR_PH);
  const attr = segs.filter(x => x.b === "attribute … to");
  assert.equal(attr.length, 2);
  assert.ok(attr.every(x => x.id === 0));
  assert.equal(attr[1].s, ATTR.indexOf("to a lack"));
  assert.equal(sub(ATTR, segs.find(x => x.b === "feel powerless to do")), "feel powerless to");
});

test("单段取第一次出现、落在单词边界上的位置", () => {
  assert.equal(Sent.find("the cat scattered the cat", "cat"), 4);
  assert.equal(Sent.find("scatter cat", "cat"), 8);          // scatter 里的 cat 不算
  assert.equal(Sent.find("cats", "cat"), -1);
  assert.equal(Sent.find("that's it", "that"), -1);          // 不切开 that's
  const segs = Sent.locate(EXCEPT, EXCEPT_PH);
  assert.deepEqual(segs.map(x => sub(EXCEPT, x)), ["were assured", "except for", "a raise in", "taken away"]);
  assert.deepEqual(segs.map(x => x.id), [0, 1, 2, 3]);
});

test("找不到、重叠的片段跳过", () => {
  const segs = Sent.locate("a lack of ability", [{t: "a lack of", b: "a lack of"}, {t: "lack", b: "lack"}, {t: "nothing", b: "x"}]);
  assert.deepEqual(segs.map(x => x.b), ["a lack of"]);
});

test("渲染：词组包在单词外面，单词的类名、文本、顺序和没有 notes 时一样", () => {
  const plain = Sent.html(ATTR, ["attribute"]);
  const withPh = Sent.html(ATTR, ["attribute"], {ph: ATTR_PH});
  assert.deepEqual(words(withPh), words(plain));
  const strip = h => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
  assert.equal(strip(withPh), ATTR);                          // 文字和原句一样
  /* to a lack 的 to 在 attribute 那个词组（data-ph="0"）里，to change 的 to 不在（它属于 feel powerless to） */
  assert.match(withPh, /<span class="ph" data-ph="0"><span class="w">to<\/span><\/span> <span class="ph" data-ph="2">/);
  assert.match(withPh, /<span class="ph" data-ph="3"><span class="w">feel<\/span> <span class="w">powerless<\/span> <span class="w">to<\/span><\/span> <span class="w">change<\/span>/);
  assert.equal((withPh.match(/data-ph="0"/g) || []).length, 2);
});

test("渲染：生词「遇见」高亮自己的词组", () => {
  const h = Sent.html(EXCEPT, [], {ph: EXCEPT_PH}, "take away");
  assert.match(h, /<span class="ph key" data-ph="3"><span class="w">taken<\/span> <span class="w">away<\/span><\/span>/);
});

test("划选：按重叠字符数挑词组，变形也能对上，对不上返回 -1", () => {
  const segs = Sent.locate(EXCEPT, EXCEPT_PH);
  const at = s => [EXCEPT.indexOf(s), EXCEPT.indexOf(s) + s.length];
  assert.equal(Sent.best(segs, ...at("taken away")), 3);
  assert.equal(Sent.best(segs, ...at("be taken away")), 3);
  assert.equal(Sent.best(segs, ...at("a raise in family")), 2);
  assert.equal(Sent.best(segs, ...at("low grades")), -1);
});

test("语法成分配色：主干 / 从句 / 状语 / 插入语，空串不着色", () => {
  assert.equal(Sent.role("主干"), "main");
  assert.equal(Sent.role("宾语从句"), "cl");
  assert.equal(Sent.role("非限制性定语从句"), "cl");
  assert.equal(Sent.role("原因状语"), "adv");
  assert.equal(Sent.role("插入语"), "ins");
  assert.equal(Sent.role(""), "");
  const h = Sent.anHTML({parts: [{t: "We were assured", r: "主干"}, {t: " that, ", r: ""}], pts: ["要点"], lit: "直译"}, "书译");
  assert.match(h, /anp main/); assert.match(h, /书译/); assert.match(h, /补充/);
  assert.equal(Sent.anBlock(null, "x"), "");
});
