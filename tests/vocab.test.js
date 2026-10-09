/* 生词本文字处理的单元测试：node --test tests/
   例子都取自 data/gloss 里真实的逐词释义 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Vocab = require("../site/vocab.js");

const book = new Set(["study", "student", "optimistic"]);
const inBook = w => book.has(w);

test("原形：按释义里的变形标注取", () => {
  assert.equal(Vocab.lemma("found", "/faʊnd/ v. 发现（find 的过去式）"), "find");
  assert.equal(Vocab.lemma("Backgrounds", "/ˈbækɡraʊndz/ n. 背景；经历（background 的复数）"), "background");
  assert.equal(Vocab.lemma("reunited", "v. 重逢（reunite 的过去分词）"), "reunite");
  assert.equal(Vocab.lemma("continues", "v. 继续（continue 的第三人称单数）"), "continue");
  assert.equal(Vocab.lemma("assigns", "v. 指派（assign 的三单）"), "assign");
  assert.equal(Vocab.lemma("higher", "adj. 高的（high 的比较级）"), "high");
  assert.equal(Vocab.lemma("doing", "v. 做；进行（do 的 -ing 形式）"), "do");
  assert.equal(Vocab.lemma("patents", "n. 专利（patent 的复数；本课词条）"), "patent");
  assert.equal(Vocab.lemma("astronauts'", "n. 宇航员（astronaut 的复数所有格）"), "astronaut");
});

test("原形：缩写、否定、多词标注、短语保留原样", () => {
  assert.equal(Vocab.lemma("you've", "/juːv/ pron. & v. 你已经（you have 的缩写）"), "you've");
  assert.equal(Vocab.lemma("shouldn't", "mod. 不应该（should 的否定形式）"), "shouldn't");
  assert.equal(Vocab.lemma("it's", "pron./v. 它是（it is 的缩略）"), "it's");
  assert.equal(Vocab.lemma("is bound to", "注定会"), "is bound to");
  assert.equal(Vocab.lemma("necessity", "n. 必要（词条，但这里作为需要释义的上下文词）"), "necessity");
});

test("原形：释义没标注时按词形变化去书里找", () => {
  assert.equal(Vocab.lemma("studies", "n. 研究", inBook), "study");
  assert.equal(Vocab.lemma("students", "", inBook), "student");
  assert.equal(Vocab.lemma("optimistic", "adj. 乐观的", inBook), "optimistic");
  assert.equal(Vocab.lemma("parallel", "/ˈpærəlel/ adj. 平行的", inBook), "parallel");   // 书里没有，原样
});

test("拆释义：音标、去掉变形标注", () => {
  assert.deepEqual(Vocab.parse("/faʊnd/ v. 发现（find 的过去式）", true), {p: "/faʊnd/", m: "v. 发现"});
  assert.deepEqual(Vocab.parse("/faʊnd/ v. 发现（find 的过去式）", false), {p: "/faʊnd/", m: "v. 发现（find 的过去式）"});
  assert.deepEqual(Vocab.parse("/juːv/ pron. & v. 你已经（you have 的缩写）", true), {p: "/juːv/", m: "pron. & v. 你已经（you have 的缩写）"});
  assert.deepEqual(Vocab.parse("adj. 小的；少的", true), {p: "", m: "adj. 小的；少的"});
  assert.deepEqual(Vocab.parse("", true), {p: "", m: ""});
});

test("释义拆成词性 + 意思", () => {
  assert.deepEqual(Vocab.senses("v. 发现；找到"), [{pos: "v.", mean: "发现；找到"}]);
  assert.deepEqual(Vocab.senses("pron. & v. 你已经"), [{pos: "pron. & v.", mean: "你已经"}]);
  assert.deepEqual(Vocab.senses("pron./v. 不做"), [{pos: "pron./v.", mean: "不做"}]);
  assert.deepEqual(Vocab.senses("注定会"), [{pos: "", mean: "注定会"}]);
  assert.deepEqual(Vocab.senses(""), []);
});
