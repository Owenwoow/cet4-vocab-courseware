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

test("anBlock / anHTML：没有对话带练的解析不画，旧格式不再显示", () => {
  assert.equal(Sent.anBlock(null, "x"), "");
  assert.equal(Sent.anHTML({parts: [{t: "x", r: "主干"}], pts: ["要点"], lit: "直译"}, "书译"), "");
  assert.equal(Sent.anHTML(null, "书译"), "");
});

test("对话带练：开场白、英文块、→ 行、排顺序、合起来与书译对照，文字都转义", () => {
  const an = {talk: [{t: "The letter is in fairly good condition", s: "你多半会翻成「这封信在<相当>好的状况里」。\n→ 这封信状况相当好。"},
    {s: "这块照字面翻就行。\n→ 虽然……"}], order: "先说「虽然」，再说「但」。", sum: "这封信……状况相当好。", cmp: "几乎一样。"};
  const h = Sent.anHTML(an, "书上的译文");
  assert.match(h, /class="an talk" hidden/);
  assert.match(h, /先别看译文，你自己来。/);
  assert.match(h, /<div class="anen">The letter is in fairly good condition<\/div>/);
  assert.match(h, /&lt;相当&gt;/);                                    // 转义
  assert.equal((h.match(/class="anto"/g) || []).length, 2);
  assert.equal((h.match(/class="anen"/g) || []).length, 1);          // 没有 t 的块不画英文
  assert.match(h, /<b>排顺序<\/b>/); assert.match(h, /<b>合起来<\/b>/); assert.match(h, /书上的译文/); assert.match(h, /几乎一样/); assert.match(h, /补充/);
  assert.doesNotMatch(Sent.anHTML({talk: [{t: "x", s: "y"}], sum: "s", cmp: "c"}, ""), /排顺序/);   // 没有 order 不显示
});

test("词组朗读文本：和 build_audio.py 的 phrase_spoken 一致", () => {
  assert.equal(Sent.spoken("attribute … to"), "attribute something to");
  assert.equal(Sent.spoken("be famous for sth."), "be famous for something");
  assert.equal(Sent.spoken("remind sb. of sth."), "remind somebody of something");
  assert.equal(Sent.spoken("take sb.'s advice"), "take somebody's advice");
  assert.equal(Sent.spoken("put sb./sth. to sleep"), "put somebody to sleep");
  assert.equal(Sent.spoken("have trouble (in) doing"), "have trouble doing");
  assert.equal(Sent.spoken("make sb. adj."), "make somebody adjective");
  assert.equal(Sent.spoken("take away"), "take away");
});

test("「析」英文块：按位置截出整句的一段，单词和词组的切分和整句一样，可点", () => {
  const strip = h => h.replace(/<[^>]+>/g, "");
  const s = ATTR.indexOf("because"), e = ATTR.indexOf(",");
  const h = Sent.html(ATTR, ["attribute"], {ph: ATTR_PH}, "", {s, e});
  assert.equal(strip(h), "because they attribute errors to a lack of ability");
  assert.match(h, /<span class="ph" data-ph="0"><span class="w key">attribute<\/span><\/span>/);   // 拆开的搭配两段都在，共用 data-ph="0"
  assert.match(h, /<span class="ph" data-ph="0"><span class="w">to<\/span><\/span> <span class="ph" data-ph="2">/);
  assert.equal((h.match(/class="w/g) || []).length, 9);
  /* 半个单词不可点 */
  const half = Sent.html(ATTR, [], null, "", {s: 2, e: 8});
  assert.equal(strip(half), "stakes");
  assert.doesNotMatch(half, /class="w/);
  /* anBlock 把英文块画成 .snip；找不到的片段画纯文字 */
  const an = {talk: [{t: "which they feel powerless to change", s: "x\n→ y"}, {t: "not in sentence", s: "z"}], sum: "s", cmp: "c"};
  const b = Sent.anBlock({ph: ATTR_PH, an}, "书译", ATTR, ["attribute"]);
  assert.match(b, /<div class="anen snip"><span class="w">which<\/span> <span class="w">they<\/span> <span class="ph" data-ph="3">/);
  assert.match(b, /<div class="anen">not in sentence<\/div>/);
});
