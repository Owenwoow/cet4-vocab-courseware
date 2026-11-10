"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const SRS = require("../site/srs.js"), Recall = require("../site/recall.js"), Video = require("../site/video.js"), Vocab = require("../site/vocab.js");
const day = "2026-10-31", yesterday = SRS.add(day, -1);
const read = file => fs.readFileSync(path.join(__dirname, "../site", file), "utf8");
const json = file => JSON.parse(read(file));
const copy = value => JSON.parse(JSON.stringify(value));
const studySource = read("study.js");
// 加载真正的课文点击处理器，与学习页监听器一起测试同一次冒泡；不复制处理逻辑。
const app = read("app.js");
const courseClicks = app.slice(app.indexOf('document.addEventListener("click", e => {', app.indexOf("/* ---------- 其他点击")), app.indexOf("/* ---------- 设置页"));

function harness(hash = "#/drill/due", saved = {}) {
  const data = new Map(Object.entries(copy(saved))), plays = [], speech = [], copied = [], messages = [], listeners = new Map();
  const ids = new Map(), handlers = {};
  let generation = 0, studyDay = day;
  const view = {
    _html: "", get innerHTML() { return this._html; }, set innerHTML(html) { this._html = html; generation++; },
    querySelectorAll: () => [], querySelector: () => null,
    addEventListener(type, fn) { handlers[type] = fn; },
  };
  ids.set("#studyView", view);
  const $ = selector => {
    if (!ids.has(selector)) ids.set(selector, {style: {}, textContent: "", focus() {}});
    return ids.get(selector);
  };
  const Sync = {
    get: (key, fallback) => data.has(key) ? data.get(key) : fallback,
    set: (key, value) => data.set(key, copy(value)),
    setMany: pairs => pairs.forEach(([key, value]) => data.set(key, copy(value))),
    entries: prefix => [...data].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]),
  };
  for (const [lid, word] of [["u07-l01", "specific"], ["u08-l01", "dose"]]) {
    const lesson = json(`data/lessons/${lid}.json`), group = lesson.groups.find(g => g.entries.some(e => e.word === word));
    const entry = group.entries.find(e => e.word === word);
    if (!data.has("srs:" + word)) data.set("srs:" + word, {...SRS.freshCard(yesterday, word),
      ...(hash === "#/drill/more" ? {a: SRS.add(day, -10), s: 2, n: 2, v: 2, t: yesterday, r: "g", h: "gg", d: day} : {}),
      k: lid, g: group.no, o: entry.no, f: entry.freq});
    data.set(`learn:${lid}:g${group.no}`, day);
  }
  const context = vm.createContext({
    SRS: {...SRS, today: () => studyDay}, Recall, Video, Vocab, Sync, URLSearchParams, setTimeout, clearTimeout,
    navigator: {clipboard: {writeText: async text => { copied.push(text); }}},
    location: {hash}, document: {title: "测试", addEventListener(type, fn, capture) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({fn, capture: !!capture});
    }},
    $, $$: () => [], known: new Set(), pop: {style: {}, contains: () => false},
    BOOK: json("data/book.json"), store: {get: (key, fallback) => fallback},
    S: {examDate: "2026-12-12", voice: "ava", rate: 1, roundSize: 25, dailyCap: Sync.get("set:dailyCap",80), dailyMinutes: Sync.get("set:dailyMinutes",20), learningMode: Sync.get("set:learningMode", "precise"), quickDays: Sync.get("set:quickDays",45), quickMinutes: Sync.get("set:quickMinutes",30), quizListen: true, quizSpell: true, autoSay: false, autoEx: false},
    fetchJSON: async file => json(file),
    esc: text => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
    plainMean: text => text.replace(/<[^>]*>/g, ""), meanHTML: text => text,
    sentenceHTML: en => `<div class="sent">${en}</div>`, noteOf: () => null, Sent: {anBlock: () => ""},
    videoHTML: (video, no) => Video.options(video, no).length ? '<a data-vi="0">视频</a>' : "",
    pickVoice: rec => rec && rec.ava, rate: () => 1,
    playFile: key => plays.push(key), speakTTS: word => speech.push(word), speak: word => speech.push(word),
    readSent: (root, en) => speech.push(en), stopAll: () => {}, stopMarathon: () => {},
    peekOpen: () => false, closePeek: () => {}, scrollBack: () => {}, toast: message => messages.push(message),
  });
  vm.runInContext(studySource + "\nglobalThis.Study = Study;", context);
  vm.runInContext(courseClicks, context);
  const h = {
    data, plays, speech, copied, messages, context,
    setDay: d => studyDay = d,
    async navigate(hash) { context.location.hash = hash; await context.Study.render(hash); await new Promise(setImmediate); return h; },
    get html() { return view.innerHTML; },
    word: () => view.innerHTML.match(/class="dword"[^>]*>([^<]+)</)?.[1],
    progress: () => data.get("drill:" + (hash.includes("practice=") ? `practice:${hash.split("practice=")[1]}:${hash.split("/")[2].split("?")[0]}` : hash.split("/")[2]))?.rc,
    async render() { await context.Study.render(hash); await new Promise(setImmediate); assert.doesNotMatch(view.innerHTML, /加载失败/); return h; },
    click(dataset = {}, video = false) {
      const born = generation;
      const target = {
        dataset, classList: {contains: () => false},
        closest(selector) {
          if (selector === "#studyView a[data-vi]") return video && born === generation ? target : null;
          for (const part of selector.split(",")) {
            if (part.startsWith("#") && dataset.id === part.slice(1)) return target;
            if (part === ".study" && born === generation) return view;
            if (part === ".lrow" && dataset.w && born === generation) return target;
            const attr = part.match(/^\[data-([\w-]+)\]$/)?.[1]?.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            if (attr && attr in dataset) return target;
          }
          return null;
        },
      };
      const event = {target, composedPath: () => [target, view], preventDefault() {}};
      for (const listener of listeners.get("click") || []) if (listener.capture) listener.fn(event);
      handlers.click(event);
      for (const listener of listeners.get("click") || []) if (!listener.capture) listener.fn(event);
    },
    key(key) { for (const {fn} of listeners.get("keydown") || []) fn({key, target: {closest: () => null}, preventDefault() {}}); },
  };
  return h;
}

test("快速词卡退出刷新能接续，检查答错也向前走，旧词校准与排期保留", async () => {
  const h = harness("#/drill/quick", {"set:learningMode": "quick"});
  h.data.set("srs:specific", SRS.upgradeCard({...h.data.get("srs:specific"), recall: null}, "srs:specific", 1));
  await h.render();
  const old = copy(h.data.get("srs:specific"));
  assert.doesNotMatch(h.html, /undefined|加载失败/);
  assert.match(h.html, /轻量复习/);
  h.click({quickOpt: "-1"});
  const first = [...h.data.values()].find(v => v?.word === "specific" && v?.kind === "review");
  assert.equal(first.result, "f");
  const current = h.data.get("srs:specific");
  assert.deepEqual(current, old);
  h.click({quickNext: "1"}); h.click({quickOpt: "-1"}); h.click({quickNext: "1"});
  assert.match(h.html, /先看词卡/);
  const word = h.word(); h.click({quickNext: "1"});
  assert.ok(h.data.get("drill:quick").seen.includes(word));
  const restored = await harness("#/drill/quick", Object.fromEntries(h.data)).render();
  assert.notEqual(restored.word(), word);
  const plan = restored.data.get("quick:plan:" + day);
  assert.equal(plan.id, h.data.get("quick:plan:" + day).id);
});

test("快速模式跨日旧题禁止计分，回首页自动生成下一日安排", async () => {
  const h = await harness("#/drill/quick", {"set:learningMode": "quick"}).render();
  const n = [...h.data.keys()].filter(k => k.startsWith("quick:check:")).length;
  h.setDay(SRS.add(day, 1)); h.click({quickOpt: "-1"});
  assert.match(h.html, /学习安排已更新/);
  assert.equal([...h.data.keys()].filter(k => k.startsWith("quick:check:")).length, n);
  await h.navigate("#/");
  assert.ok(h.data.get("quick:plan:" + SRS.add(day, 1)));
});

test("切回精细时已达标的旧词过渡自动结束，正式证据和卡片保留", async () => {
  const h = harness("#/", {"quick:course": {v: 1, id: "course", started: yesterday, created: 1}});
  const items = ["specific", "dose"].map(word => {
    const c = SRS.upgradeCard({...h.data.get("srs:" + word), recall: null}, "srs:" + word, 1);
    h.data.set("srs:" + word, c); return {word, card: c};
  });
  h.data.set("migration:state", SRS.migrationState(items, day));
  for (const x of items) h.data.set("srs:" + x.word, SRS.rateRecall(x.card, "independent", day, {id: "calibrate-" + x.word}));
  await h.render();
  assert.equal(h.data.get("migration:state").mode, "normal");
  assert.equal(h.data.get("migration:state").ended, day);
  assert.equal(h.data.get("srs:specific").recall.result, "independent");
  assert.doesNotMatch(h.html, /data-migration-exit/);
});

test("显式取消词群清除相应快速覆盖事件，用墓碑保留删除意图", () => {
  const lesson = json("data/lessons/u07-l01.json"), group = lesson.groups.find(g => g.entries.some(e => e.word === "specific"));
  const key = SRS.quickCheckKey(day, "specific"), h = harness("#/", {[key]: {word: "specific", d: day, result: "g"}});
  h.context.Study.unmarkGroups(lesson, [group.no]);
  assert.equal(h.data.get(key), 0);
  assert.equal(h.data.get("srs:specific"), 0);
});

test("快速每日检查固定且不循环，完成后退出；切回精细只抵扣工作量", async () => {
  const h = await harness("#/drill/quick", {"set:learningMode": "quick"}).render();
  const plan = h.data.get("quick:plan:" + day), total = plan.items.length;
  for (let i = 0; i < total * 3 + 5 && !h.html.includes("<h1>今日计划已完成</h1>"); i++) {
    if (h.html.includes("先看词卡") || h.html.includes("再看一遍，后面会安排复习")) h.click({quickNext: "1"});
    else h.click({quickOpt: "-1"});
  }
  assert.match(h.html, /<h1>今日计划已完成<\/h1>/);
  assert.equal([...h.data.keys()].filter(k => k.startsWith("quick:check:")).length, total);
  assert.equal(h.data.get("drill:quick"), 0);
  h.context.S.learningMode = "precise";
  await h.navigate("#/");
  assert.match(h.html, /快速检查已抵扣/);
  assert.equal(h.data.get("migration:state").mode, "normal");
  assert.equal(h.data.get("srs:specific").recall.result, "");
});

test("回忆自动读词，手动读音不计提示；评分后直接进入下一词", async () => {
  const h = await harness().render(), word = h.word();
  const audio = json("data/audio/u07-l01.json");
  assert.deepEqual(h.plays, [audio.w[word].ava]);
  h.click({say: "1"});
  assert.deepEqual(h.plays, [audio.w[word].ava, audio.w[word].ava]);
  assert.deepEqual(h.speech, []);
  assert.deepEqual(h.progress().current.hints, []);
  assert.match(h.html, /data-sayx="specifically"[\s\S]*?class="dext-mean"/);
  h.click({sayx: "specifically"});
  assert.equal(h.plays.at(-1), audio.w.specifically.ava);
  h.click({recallReveal: "1"});
  h.click({sayx: "specifically"});
  assert.equal(h.plays.at(-1), audio.w.specifically.ava);
  h.click({recallRate: "independent"});
  assert.equal(h.progress().first[word].result, "independent");
  assert.notEqual(h.word(), word);
  assert.equal(h.plays.length, 5);
  assert.deepEqual(h.speech, []);
});

test("早间、晚间、自由回忆共用卡片；揭晓前后保留视频，底部只留揭晓和斩", async () => {
  for (const hash of ["#/drill/due", "#/drill/more", "#/drill/today", "#/drill/all?practice=meaning"]) {
    const h = await harness(hash).render();
    assert.match(h.html, /class="drill recall flipped"/);
    assert.match(h.html, /data-vi="0"/);
    assert.match(h.html, /data-recall-reveal/);
    assert.match(h.html, /data-chop/);
    assert.doesNotMatch(h.html, /data-recall-(?:hint|aux|choice)|class="qopts"|先想主要意思/);
    const head = h.html.match(/<div class="dword"[\s\S]*?<div class="dback">/)[0];
    h.click({recallReveal: "1"});
    assert.equal(h.html.match(/<div class="dword"[\s\S]*?<div class="dback">/)[0], head);
    assert.doesNotMatch(h.html, /核对揭晓前|recall-rubric/);
    assert.equal((h.html.match(/data-recall-rate=/g) || []).length, 3);
  }
});

test("回忆视频记为提示并可续做，独立四选一不出现主动回忆评分", async () => {
  let h = await harness().render();
  h.click({}, true);
  assert.deepEqual(h.progress().current.hints, ["video"]);
  h = await harness("#/drill/due", Object.fromEntries(h.data)).render();
  h.click({recallReveal: "1"});
  assert.match(h.html, /data-recall-rate="hinted"/);
  assert.doesNotMatch(h.html, /data-recall-rate="independent"/);
  h = await harness("#/drill/all?practice=recognition").render();
  assert.match(h.html, /class="qopts"/);
  assert.equal((h.html.match(/data-opt="[0-3]"/g) || []).length, 4);
  assert.doesNotMatch(h.html, /data-recall-/);
});

test("旧四选一断点只保留提示/失败证据，不再恢复混合题或数字键选项", async () => {
  let h = await harness().render();
  const saved = h.data.get("drill:due");
  saved.rc.current.aux = {opts: ["甲", "乙", "丙", "丁"], ans: 0};
  saved.rc.current.hints = ["choice"];
  h = await harness("#/drill/due", Object.fromEntries(h.data)).render();
  assert.doesNotMatch(h.html, /data-recall-choice|class="qopts"/);
  h.key("1");
  assert.equal(h.progress().current.revealed, false);
  h.click({recallReveal: "1"});
  assert.match(h.html, /data-recall-rate="hinted"/);
});

test("新学和独立听音、拼写、看义选词不受回忆卡修复影响，点击与 R 都读当前词", async () => {
  for (const hash of ["#/drill/learn", "#/drill/all?practice=listen", "#/drill/all?practice=spell", "#/drill/all?practice=reverse"]) {
    const h = await harness(hash).render();
    assert.doesNotMatch(h.html, /data-recall-/);
    const start = h.plays.length;
    h.click({say: "1"}); h.key("R");
    assert.equal(h.plays.length, start + 2);
    assert.equal(h.plays.at(-1), h.plays.at(-2));
    assert.notEqual(h.plays.at(-1), undefined);
    assert.deepEqual(h.speech, []);
    if (hash.endsWith("learn")) assert.match(h.html, /data-studied/);
    else if (hash.includes("spell")) assert.match(h.html, /id="spell"/);
    else assert.match(h.html, /class="qopts"/);
  }
});


test("今日计划跨轮固定，补测只计实际负担，刷新与自由练习不重复正式评分", async () => {
  let h = await harness("#/drill/due", {"set:dailyCap":2}).render();
  const plan=h.data.get("plan:"+day), first=h.word();
  h.click({recallReveal:"1"}); h.click({recallRate:"failed"});
  assert.equal(h.data.get("log:"+day).f,1);
  h=await harness("#/drill/due",Object.fromEntries(h.data)).render();
  let n=0;
  while(h.word() && n++<10) {h.click({recallReveal:"1"});h.click({recallRate:"independent"});}
  assert.ok(n<10); assert.match(h.html,/今日计划已完成/);
  assert.equal(h.data.get("log:"+day).f,1); assert.equal(h.data.get("log:"+day).g,1);
  const saved=h.data.get("srs:"+first); assert.equal(saved.recall.result,"failed"); assert.equal(saved.s,0);
  assert.equal(h.data.get(SRS.taskKey(day,saved.life)).retry.result,"independent");
  await h.navigate("#/"); assert.match(h.html,/今日计划已完成/); assert.doesNotMatch(h.html,/晚间巩固|早上复习|途中看/);
  assert.deepEqual(h.data.get("plan:"+day),plan);
  const log=copy(h.data.get("log:"+day));
  h=await harness("#/drill/all?practice=meaning",Object.fromEntries(h.data)).render();
  for(let i=0;i<2;i++){h.click({recallReveal:"1"});h.click({recallRate:"independent"});}
  assert.deepEqual(h.data.get("log:"+day),log);
  assert.equal(h.data.get("srs:"+first).recall.result,"failed");
});
test("日限额包含未做首次复习的词，完成不会被剩余积压或新词改成未完成", async () => {
  const saved={}, lesson=json('data/lessons/u07-l01.json');
  for(const g of lesson.groups)for(const e of g.entries)saved['srs:'+e.word]={...SRS.freshCard(yesterday,e.word),k:lesson.id,g:g.no,o:e.no,f:e.freq};
  saved['set:dailyCap']=3;
  const h=await harness('#/',saved).render();h.context.S.dailyCap=80;
  // 首页已经生成的当日计划固定，修改设置不会临时换词或增量。
  const p=copy(h.data.get('plan:'+day)); await h.navigate('#/');assert.deepEqual(h.data.get('plan:'+day),p);
  assert.ok(p.items.length<=50);assert.ok(p.items.length< Object.keys(saved).length);
  await h.navigate('#/drill/due');
  let count=0;
  while(count++<80){
    if(h.word()){h.click({recallReveal:'1'});h.click({recallRate:'independent'});}
    else if(h.html.includes('id="nextRound"')){h.click({id:'nextRound'});await new Promise(setImmediate);}
    else break;
  }
  assert.ok(count<80);await h.navigate('#/');assert.match(h.html,/今日计划已完成/);assert.match(h.html,/今天可以安心结束/);
  assert.ok([...h.data].filter(([k,c])=>k.startsWith('srs:')&&c.d<=day).length>0);
});
test("跨凌晨四点评分不会写入错误学习日，显示返回首页提示", async () => {
  const h=await harness().render();h.click({recallReveal:'1'});h.setDay(SRS.add(day,1));h.click({recallRate:'independent'});
  assert.match(h.html,/已进入新的学习日/);assert.equal(h.data.get('log:'+day),undefined);assert.equal(h.data.get('log:'+SRS.add(day,1)),undefined);
});
test("旧晚间记录保留兼容，但不作为首页完成条件；已达到条件可退出迁移", async () => {
  const night={finished:true,items:{old:{word:'old',first:'independent'}}};
  const saved={['evening:'+yesterday]:night};
  let h=await harness('#/',saved).render();assert.deepEqual(h.data.get('evening:'+yesterday),night);
  assert.doesNotMatch(h.html,/晚间巩固|今天跳过/);
  const cohort=['specific','dose'].map(w=>({word:w,life:h.data.get('srs:'+w).life}));
  for(const w of ['specific','dose'])h.data.set('srs:'+w,SRS.rateRecall(h.data.get('srs:'+w),'independent',day,{id:w}));
  h.data.set('migration:state',{v:1,mode:'active',started:yesterday,cohort});
  await h.navigate('#/');assert.match(h.html,/data-migration-exit/);h.click({migrationExit:'1'});
  assert.equal(h.data.get('migration:state').mode,'normal');assert.doesNotMatch(h.html,/data-migration-exit|旧词已校准/);
  assert.deepEqual(h.data.get('evening:'+yesterday),night);
});

test('同步另一份词单已完成的主任务抵扣推荐量，外部未完成补测能继续而不重复计分', async () => {
  const dose={...SRS.freshCard(yesterday,'dose'),k:'u08-l01',g:1,o:1,f:1};
  const graded=SRS.rateRecall(dose,'failed',day,{id:SRS.dailyAttempt(day,dose.life),at:100});
  const saved={['srs:dose']:graded,['plan:'+day]:{v:1,d:day,id:'canonical',created:1,credited:0,items:[{word:'specific',life:'specific|0',kind:'review'}],budget:{limit:1,cap:1,minutes:20,seconds:20,retryLimit:5}},
    [SRS.taskKey(day,dose.life)]:{d:day,word:'dose',life:dose.life,first:{result:'failed',planned:true,at:100},retryWanted:true}};
  const h=await harness('#/drill/due',saved).render();assert.equal(h.word(),'dose');assert.equal(h.progress().current.retry,true);
  h.click({recallReveal:'1'});h.click({recallRate:'independent'});
  assert.match(h.html,/今日计划已完成/);assert.equal(h.data.get('srs:dose').recall.result,'failed');assert.equal(h.data.get('log:'+day),undefined);
  await h.navigate('#/');assert.match(h.html,/今日计划已完成/);
});

test('复习偏多时主动选择的新词学习量仍按设置执行', async () => {
  const h = harness('#/drill/learn', {'set:dailyCap': 1});
  h.context.S.learnSize = 2;
  await h.render();
  h.click({studied: '1'});
  assert.equal([].concat(h.data.get('drill:learn').g).length, 2);
});

test('今日首答与待巩固保留，额外巩固不重计成绩或改排期', async () => {
  const h = await harness('#/drill/due', {'set:dailyCap':2}).render();
  const first=h.word();
  assert.match(h.html,/今天到这里/);
  h.click({recallReveal:'1'}); h.click({recallRate:'failed'});
  await h.navigate('#/');
  assert.match(h.html,/计划内首答 1\/2 词/); assert.match(h.html,/待巩固 1/); assert.match(h.html,/继续学习/);
  await h.navigate('#/drill/due');
  let count=0;
  while(h.word() && count++<10){h.click({recallReveal:'1'});h.click({recallRate:'independent'});}
  assert.match(h.html,/今日计划已完成/); assert.match(h.html,/待巩固 1/);
  assert.match(h.html,/已达到掌握标准 0/); assert.match(h.html,/继续巩固/);
  const card=copy(h.data.get('srs:'+first)), log=copy(h.data.get('log:'+day));
  await h.navigate('#/drill/strengthen'); assert.equal(h.word(),first);
  assert.doesNotMatch(h.html,/data-chop/); h.key('S'); h.click({chop:'1'});
  assert.equal(h.word(),first); assert.deepEqual(h.data.get('srs:'+first),card);
  h.click({recallReveal:'1'});h.click({recallRate:'independent'});
  assert.deepEqual(h.data.get('srs:'+first),card); assert.deepEqual(h.data.get('log:'+day),log);
  assert.match(h.html,/自愿巩固只供练习/);
  await h.navigate('#/');assert.match(h.html,/待巩固 1/);
  assert.match(h.html,/本次巩固已完成/); assert.match(h.html,/再练全部/); assert.doesNotMatch(h.html,/继续巩固/);
});

async function readyStrengthen() {
  const h = await harness('#/drill/due', {'set:dailyCap':2}).render();
  let count = 0;
  while (h.word() && count++ < 10) {
    const retry = h.progress().current.retry;
    h.click({recallReveal:'1'}); h.click({recallRate: retry ? 'independent' : 'failed'});
  }
  assert.ok(count < 10); assert.match(h.html,/今日计划已完成/);
  return h;
}

test('巩固每轮各练一次，下一轮只出未独立想起的词，首页保留首答并更新剩余量', async () => {
  const h = await readyStrengthen();
  const formal = copy([...h.data].filter(([k]) => /^(srs:|task:|log:|plan:)/.test(k)));
  await h.navigate('#/drill/strengthen');
  const first = h.word(); h.click({recallReveal:'1'}); h.click({recallRate:'effort'});
  const second = h.word(); assert.notEqual(second,first);
  h.click({},true); h.click({recallReveal:'1'}); h.click({recallRate:'independent'});
  assert.equal(h.word(),undefined); assert.match(h.html,/还有 <b>1<\/b> 个词待巩固/);
  assert.match(h.html,/查看剩余词/); assert.doesNotMatch(h.html,/补测|自由抽查/);
  await h.navigate('#/');
  assert.match(h.html,/还有 1 个词待巩固/); assert.match(h.html,/已独立想起 1 \/ 2 词/);
  assert.match(h.html,/待巩固 2/);
  await h.navigate('#/drill/strengthen'); assert.equal(h.word(),second);
  h.click({recallReveal:'1'}); h.click({recallRate:'failed'});
  assert.equal(h.word(),undefined); // 不再自动插入同日补测，避免一轮内反复出现。
  h.click({strengthenContinue:'1'}); await new Promise(setImmediate);
  assert.equal(h.word(),second);
  h.click({recallReveal:'1'}); h.click({recallRate:'independent'});
  assert.match(h.html,/本次巩固已完成/); assert.doesNotMatch(h.html,/继续巩固|查看剩余词/);
  await h.navigate('#/'); assert.match(h.html,/本次巩固已完成/); assert.match(h.html,/待巩固 2/);
  assert.deepEqual([...h.data].filter(([k]) => /^(srs:|task:|log:|plan:)/.test(k)),formal);
  h.click({strengthenRestart:'1'}); await h.navigate(h.context.location.hash);
  assert.equal(h.data.get('drill:strengthen').rc.w.length,2); // 再练全部确实恢复完整名单。
  assert.deepEqual([...h.data].filter(([k]) => /^(srs:|task:|log:|plan:)/.test(k)),formal);
});

test('巩固可退出续练，刷新和旧断点不会复活已独立想起的词，结果仅当日有效', async () => {
  const h = await readyStrengthen(); await h.navigate('#/drill/strengthen');
  const stale = copy(h.data.get('drill:strengthen')), first = h.word();
  h.click({recallReveal:'1'}); h.click({recallRate:'independent'});
  const second = h.word(); h.click({recallReveal:'1'});
  const restored = await harness('#/drill/strengthen',Object.fromEntries(h.data)).render();
  assert.equal(restored.word(),second); assert.doesNotMatch(restored.html,/data-recall-reveal/);
  h.data.set('drill:strengthen',stale);
  await h.navigate('#/drill/strengthen'); assert.equal(h.word(),second);
  h.setDay(SRS.add(day,1)); await h.navigate('#/drill/due');
  let count = 0;
  while (h.word() && count++ < 10) { const retry = h.progress().current.retry; h.click({recallReveal:'1'}); h.click({recallRate:retry ? 'independent':'failed'}); }
  await h.navigate('#/drill/strengthen');
  assert.ok(h.data.get('drill:strengthen').rc.w.includes(first));
});

test('备份保留当日逐词巩固结果，跨日导入不会误判为巩固完成', async () => {
  const Backup = require('../site/backup.js');
  const h = await readyStrengthen(); await h.navigate('#/drill/strengthen');
  h.click({recallReveal:'1'}); h.click({recallRate:'independent'});
  const entries = [...h.data].filter(([k]) => k.startsWith('drill:strengthen-result:'));
  assert.equal(entries.length,1);
  const [key,value] = entries[0], stamp = Date.parse(day+'T12:00:00Z');
  const doc = Object.fromEntries([...h.data].map(([k,v]) => [k,[v,stamp]]));
  const imported = Backup.plan({},doc,['study'],'merge',stamp);
  assert.deepEqual(imported.find(([k]) => k===key)[1][0],value);
  const tomorrow = Backup.plan({},doc,['study'],'merge',stamp+86400000);
  assert.equal(tomorrow.find(([k]) => k===key),undefined);
});

test('当日计划固定每轮数量，设置变化次日才影响新计划', async () => {
  const h=await harness('#/', {'set:dailyCap':2}).render();
  const p=copy(h.data.get('plan:'+day)); assert.equal(p.roundSize,25);
  h.context.S.roundSize=1; await h.navigate('#/drill/due');
  assert.equal(h.data.get("drill:due").rc.w.length,2);
  assert.deepEqual(h.data.get('plan:'+day),p);
  h.setDay(SRS.add(day,1));await h.navigate('#/');
  assert.equal(h.data.get('plan:'+SRS.add(day,1)).roundSize,1);
});

test('计划外首答单列，历史抵扣和退役词不冒充首答', async () => {
  const h=await harness('#/').render();
  const a=h.data.get('srs:specific'), b=h.data.get('srs:dose');
  h.data.set('plan:'+day,{v:1,d:day,id:'old',created:1,credited:1,items:[{word:'retired',life:'retired|1',kind:'review'}],budget:{limit:2,cap:2,minutes:20,seconds:20,retryLimit:0},roundSize:20});
  for(const [word,card] of [['specific',a],['dose',b]]) h.data.set(SRS.taskKey(day,card.life),{d:day,word,life:card.life,first:{result:'failed',planned:true,at:1}});
  await h.navigate('#/');
  assert.match(h.html,/计划内首答 0\/2 词/); assert.match(h.html,/计划外首答 2 词/);
  assert.match(h.html,/历史抵扣、已退役或抵扣的计划词不计入首答/);
  assert.match(h.html,/待巩固 2/);
  await h.navigate('#/list/recap?show=all');
  assert.deepEqual(recapWords(h.html).sort(), ['dose','specific']);
  assert.equal((h.html.match(/计划外首答<\/span>/g) || []).length, 2);
});

const recapWords = html => [...html.matchAll(/<article class="lrow recap-row" data-w="([^"]+)"/g)].map(m => m[1]);
async function recapFixture(first = {specific:'failed', dose:'independent'}) {
  const h = await harness('#/').render();
  for (const [word, result] of Object.entries(first)) {
    const c = h.data.get('srs:'+word);
    h.data.set('srs:'+word, result === 'chopped' ? SRS.chop(c,day,word,h.context.S.examDate) : SRS.rateRecall(c,result,day,{id:SRS.dailyAttempt(day,c.life),at:100}));
    h.data.set(SRS.taskKey(day,c.life), {d:day,word,life:c.life,first:{result,at:100}});
  }
  return h;
}

test('按当前分类复制单词，并提示复制失败', async () => {
  const h = await recapFixture({specific:'hinted', dose:'independent'});
  await h.navigate('#/list/recap?show=strengthen');
  assert.match(h.html, /复制需巩固单词/);
  h.click({recapCopy:'1'}); await new Promise(setImmediate);
  assert.equal(h.copied.at(-1), 'specific,');
  assert.equal(h.messages.at(-1), '已复制单词');
  await h.navigate('#/list/recap?show=independent');
  assert.match(h.html, /复制独立想起单词/);
  h.click({recapCopy:'1'}); await new Promise(setImmediate);
  assert.equal(h.copied.at(-1), 'dose,');
  await h.navigate('#/list/recap?show=all');
  assert.match(h.html, /复制全部单词/);
  h.click({recapCopy:'1'}); await new Promise(setImmediate);
  assert.equal(h.copied.at(-1), 'specific,dose,');
  h.context.navigator.clipboard.writeText = async () => { throw new Error('denied'); };
  h.click({recapCopy:'1'}); await new Promise(setImmediate);
  assert.equal(h.messages.at(-1), '复制失败，请检查剪贴板权限');
  const empty = await recapFixture({specific:'independent', dose:'independent'});
  await empty.navigate('#/list/recap');
  assert.doesNotMatch(empty.html, /复制需巩固单词/);
});

test('今日回顾与首页首答一致，默认只看薄弱词，切换分类和读音不改学习数据', async () => {
  const h = await recapFixture();
  await h.navigate('#/');
  assert.match(h.html, /href="#\/list\/recap">回顾今日单词/);
  const before = copy([...h.data]);
  assert.equal(h.context.Study.isStudy('#/list/recap?show=all'), true);
  await h.navigate('#/list/recap');
  assert.deepEqual(recapWords(h.html), ['specific']);
  assert.match(h.html, /首答：未想起\/想错/);
  assert.match(h.html, /尚未巩固/);
  assert.match(h.html, /首答需巩固<span>1<\/span>/);
  assert.match(h.html, /首答独立想起<span>1<\/span>/);
  assert.match(h.html, /全部<span>2<\/span>/);
  const lesson = json('data/lessons/u07-l01.json');
  const entry = lesson.groups.flatMap(g => g.entries).find(e => e.word === 'specific');
  assert.ok(h.html.includes(entry.prons[0].senses[0].mean));
  assert.match(h.html, /href="#\/u07-l01\/w\/specific"/);
  h.click({w:'specific',say:'1'});
  assert.equal(h.plays.length + h.speech.length, 1);
  await h.navigate('#/list/recap?show=independent');
  assert.deepEqual(recapWords(h.html), ['dose']);
  await h.navigate('#/list/recap?show=all');
  assert.deepEqual(recapWords(h.html).sort(), ['dose','specific']);
  await h.navigate('#/list/recap?show=invalid');
  assert.deepEqual(recapWords(h.html), ['specific']);
  assert.deepEqual([...h.data], before);
});

test('回顾保留提示和费劲的首答区别，同日补测成功不改变首答分类', async () => {
  const h = await recapFixture({specific:'hinted',dose:'effort'});
  const c = h.data.get('srs:specific'), key = SRS.taskKey(day,c.life);
  h.data.set(key, {...h.data.get(key),retry:{result:'independent',at:200}});
  await h.navigate('#/list/recap');
  assert.deepEqual(recapWords(h.html), ['specific']);
  assert.match(h.html, /首答：提示后想起/);
  assert.match(h.html, /同日补测：独立想起/);
  assert.match(h.html, /尚未自愿巩固/);
  await h.navigate('#/list/recap?show=independent');
  assert.deepEqual(recapWords(h.html), ['dose']);
  assert.match(h.html, /首答：独立但费劲/);
});

test('自愿巩固后想起的薄弱词仍可回顾，逐词结果刷新保留且不重计首答', async () => {
  const h = await readyStrengthen();
  await h.navigate('#/drill/strengthen');
  const success = h.word();
  h.click({recallReveal:'1'}); h.click({recallRate:'independent'});
  const failed = h.word();
  h.click({recallReveal:'1'}); h.click({recallRate:'failed'});
  const saved = Object.fromEntries(h.data), restored = await harness('#/list/recap',saved).render();
  const before = copy([...restored.data]);
  assert.deepEqual(recapWords(restored.html).sort(), [success,failed].sort());
  assert.match(restored.html, /自愿巩固：独立想起/);
  assert.match(restored.html, /自愿巩固：未想起\/想错/);
  assert.match(restored.html, /自愿巩固已独立想起 1 \/ 2 词/);
  assert.equal((restored.html.match(/首答：未想起\/想错/g) || []).length, 2);
  await restored.navigate('#/list/recap?show=still-weak');
  assert.deepEqual(recapWords(restored.html), [failed]);
  assert.match(restored.html, /复制巩固仍未想起单词/);
  restored.click({recapCopy:'1'}); await new Promise(setImmediate);
  assert.equal(restored.copied.at(-1), failed + ',');
  await restored.navigate('#/list/recap?show=independent');
  assert.deepEqual(recapWords(restored.html), []);
  assert.deepEqual([...restored.data], before);
});

test('巩固仍未想起只包含当日已练且最新结果未独立想起的词', async () => {
  const h = await recapFixture({specific:'failed', dose:'hinted'});
  const card = h.data.get('srs:specific'), key = 'drill:strengthen-result:' + encodeURIComponent(card.life);
  await h.navigate('#/list/recap?show=still-weak');
  assert.deepEqual(recapWords(h.html), []);
  assert.match(h.html, /尚未巩固的词不计入此处/);
  h.data.set(key, {d:day, life:card.life, word:'specific', result:'hinted'});
  await h.navigate('#/list/recap?show=still-weak');
  assert.deepEqual(recapWords(h.html), ['specific']);
  h.data.set(key, {d:day, life:card.life, word:'specific', result:'independent'});
  await h.navigate('#/list/recap?show=still-weak');
  assert.deepEqual(recapWords(h.html), []);
  h.data.set(key, {d:yesterday, life:card.life, word:'specific', result:'failed'});
  await h.navigate('#/list/recap?show=still-weak');
  assert.deepEqual(recapWords(h.html), []);
});

test('没有首答和全独立想起时有明确空状态，跨学习日不混入昨天的词', async () => {
  const h = await harness('#/list/recap').render();
  assert.deepEqual(recapWords(h.html), []);
  assert.match(h.html, /今天还没有首答记录/);
  const done = await recapFixture({specific:'independent',dose:'effort'});
  await done.navigate('#/list/recap');
  assert.match(done.html, /今天的首答没有需要巩固的词/);
  await done.navigate('#/list/recap?show=all');
  assert.equal(recapWords(done.html).length, 2);
  done.setDay(SRS.add(day,1));
  await done.navigate('#/list/recap?show=all');
  assert.deepEqual(recapWords(done.html), []);
  assert.match(done.html, /今天还没有首答记录/);
});

test('只有卡片当日回忆历史时可回顾，已斩词单列而不冒充独立想起', async () => {
  const h = await recapFixture({specific:'failed',dose:'chopped'});
  const c = h.data.get('srs:specific');
  h.data.delete(SRS.taskKey(day,c.life));
  await h.navigate('#/list/recap');
  assert.deepEqual(recapWords(h.html), ['specific']);
  await h.navigate('#/list/recap?show=all');
  assert.deepEqual(recapWords(h.html).sort(), ['dose','specific']);
  assert.match(h.html, /首答：已斩/);
  await h.navigate('#/list/recap?show=independent');
  assert.deepEqual(recapWords(h.html), []);
});

test('取消或重建的词保留当日首答，不借用新生命周期的巩固结果', async () => {
  const h = await recapFixture();
  const c = h.data.get('srs:specific');
  h.data.set('srs:specific', {...c,life:'rebuilt'});
  h.data.set('drill:strengthen-result:'+encodeURIComponent(c.life), {d:day,life:c.life,word:'specific',result:'independent'});
  const before = copy([...h.data]);
  await h.navigate('#/list/recap');
  assert.deepEqual(recapWords(h.html), ['specific']);
  assert.match(h.html, /已不在当前复习词单，仅保留今日首答/);
  assert.doesNotMatch(h.html, /自愿巩固：独立想起|data-say=/);
  assert.deepEqual([...h.data], before);
});

test('生词本首答同样进入回顾，释义使用现有生词解析', async () => {
  const h = await recapFixture();
  const card = {...SRS.freshCard(yesterday,'phrase-life'),w:'a phrase',x:'a phrase',k:'u07-l01',e:'specific',m:'n. 演示词组',at:day,o:1};
  h.data.set('vocab:a phrase',card);
  h.data.set(SRS.taskKey(day,card.life), {d:day,word:card.w,life:card.life,first:{result:'failed',at:200,planned:true}});
  const before = copy([...h.data]);
  await h.navigate('#/list/recap');
  assert.ok(recapWords(h.html).includes('a phrase'));
  assert.match(h.html, /演示词组/);
  assert.match(h.html, /生词本 · 查看出处/);
  assert.match(h.html, /计划外首答/);
  assert.deepEqual([...h.data], before);
});

test('课文加载失败仍能回顾完整首答词单，其他课的释义继续显示', async () => {
  const saved = Object.fromEntries((await recapFixture()).data);
  const h = harness('#/list/recap?show=all', saved);
  h.context.fetchJSON = async file => {
    if (file === 'data/lessons/u07-l01.json') throw new Error('offline');
    return json(file);
  };
  const before = copy([...h.data]);
  await h.render();
  assert.deepEqual(recapWords(h.html).sort(), ['dose','specific']);
  assert.match(h.html, /释义暂不可用/);
  assert.match(h.html, /href="#\/u08-l01\/w\/dose"/);
  assert.deepEqual([...h.data], before);
});

test('离开回顾页后，尚未完成的词条加载不会覆盖新页面', async () => {
  const saved = Object.fromEntries((await recapFixture()).data);
  const h = harness('#/list/recap?show=all', saved);
  let release;
  h.context.fetchJSON = file => file === 'data/lessons/u07-l01.json'
    ? new Promise(resolve => {release = () => resolve(json(file));}) : Promise.resolve(json(file));
  const pending = h.render();
  await new Promise(setImmediate);
  assert.equal(typeof release,'function');
  await h.navigate('#/');
  release(); await pending;
  assert.match(h.html, /class="home"/);
  assert.doesNotMatch(h.html, /<h1>今日单词回顾/);
});
