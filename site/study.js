/* 背词：首页（门户）、巩固模式、浏览、周总结，以及学习记录和复习卡片的读写。
   复习规则在 srs.js；这里只负责数据进出和页面。依赖 app.js 里的工具（$、esc、S、BOOK、播放等）。

   同步数据（都走 sync.js）：
     learn:<课id>:g<词群号> = 学的日期 YYYY-MM-DD（取消记 0）
     srs:<词> = {a 学习日, s 已过站数, d 到期日, l 忘记次数, r 最近评分, n 复习次数, t 最近复习日,
                h 最近 6 次第一遍结果, q 答对过的最难题型, z 斩, p 学新词过关的日期,
                k 课id, g 词群号, f 火苗, o 词条序号}（取消记 0）
     log:<日期> = {g, m, f 当天评分次数, dv 当天复习的到期词数}
     vocab:<原形> = 生词本：{w 原形, x 点到的写法, m 释义, p 音标, k 出处课id, e 出处词条（空 = 没有例句，如扩展词）,
                at 加入日期, o 加入时刻, bk 书中位置 [课id, 词条序号, 是否扩展词], ph 1 = 例句里标出的词组（w 是词组原形，x 是句中写法、拆开的用「 … 」连）} + 复习卡字段 a s d l r n t（移出记 0）。
                加入当天算学习日，复习规则和书上的词一样（原形含空格的按词组卡出题，见 srs.js isPhrase）；这个词所在的词群记为学过时，它从生词本「毕业」（记 0），以书上的卡为准 */
"use strict";
const Study = (() => {
  const T = () => SRS.today();
  const pad2 = n => String(n).padStart(2, "0");
  const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
  const md = d => `${+d.slice(5, 7)}/${+d.slice(8)}`;
  const lesTitle = k => `U${+k.slice(1, 3)} L${+k.slice(5, 7)}`;
  const ord = c => (+c.k.slice(1, 3)) * 1e6 + (+c.k.slice(5, 7)) * 1e4 + c.g * 100 + c.o;

  /* ---------- 数据 ---------- */
  const learnMarks = () => Sync.entries("learn:").filter(([, d]) => d);          // [["u07-l01:g3", "2026-10-01"], …]
  const learnDate = (k, g) => Sync.get(`learn:${k}:g${g}`, 0) || "";
  const allCards = () => Sync.entries("srs:").filter(([, c]) => c).map(([word, card]) => ({word, card, freq: card.f, order: ord(card)}));
  /* 生词本：火苗记 0，同一天到期时排在书上的词后面；课件顺序里排在所有书上的词之后，按加入先后 */
  const vocabMarks = () => Sync.entries("vocab:").filter(([, v]) => v);
  const vocabGet = w => Sync.get("vocab:" + w, 0) || null;
  const vocabCards = () => vocabMarks().filter(([w]) => !known.has(w) && !Sync.get("srs:" + w, 0))
    .map(([word, card]) => ({word, card, freq: 0, order: 1e13 + (card.o || 0), vocab: true}));
  const liveCards = () => [...allCards().filter(x => !known.has(x.word)), ...vocabCards()];   // 已会的不出现
  const cardKey = x => (x.vocab ? "vocab:" : "srs:") + x.word;
  /* r = {w, x, m, p, k, e, bk}：加入当天算学习日，明天第一次复习 */
  function addVocab(r) {
    const t = T();
    if (known.has(r.w)) setKnown(r.w, false);       // 标过已会又遇到不认识，说明没会
    Sync.set("vocab:" + r.w, {...SRS.newCard(t), ...r, at: t, o: Date.now()});
  }
  const removeVocab = w => Sync.set("vocab:" + w, 0);
  /* 书上已在复习的词又不认识了：记一次忘了，明天再来、进难词本 */
  function forgetBook(w) {
    const c = Sync.get("srs:" + w, 0); if (!c) return;
    if (known.has(w)) setKnown(w, false);
    Sync.set("srs:" + w, SRS.rate(c, "f", T()));
  }
  const logOf = d => Sync.get("log:" + d, null) || {g: 0, m: 0, f: 0, dv: 0};
  const groupInfo = (k, g) => {
    for (const p of BOOK.parts) for (const u of p.units) for (const l of u.lessons) if (l.id === k) return l.groups.find(x => x.no === g);
    return null;
  };

  /* 把某课的几个词群记为 date 那天学的：每个主词条建一张卡（已有卡的词不动）；生词本里的这些词毕业 */
  function markGroups(les, groupNos, date) {
    const pairs = [];
    for (const g of les.groups) {
      if (!groupNos.includes(g.no)) continue;
      pairs.push([`learn:${les.id}:g${g.no}`, date]);
      for (const e of g.entries) {
        const v = vocabGet(e.word);
        if (v && !(v.bk && v.bk[2])) pairs.push(["vocab:" + e.word, 0]);
        if (Sync.get("srs:" + e.word, 0)) continue;
        pairs.push(["srs:" + e.word, {...SRS.newCard(date), k: les.id, g: g.no, f: e.freq, o: e.no}]);
      }
    }
    Sync.setMany(pairs);
  }
  /* 取消记录：只删这个词群自己建的卡 */
  function unmarkGroups(les, groupNos) {
    const pairs = [];
    for (const g of les.groups) {
      if (!groupNos.includes(g.no)) continue;
      pairs.push([`learn:${les.id}:g${g.no}`, 0]);
      for (const e of g.entries) {
        const c = Sync.get("srs:" + e.word, 0);
        if (c && c.k === les.id && c.g === g.no) pairs.push(["srs:" + e.word, 0]);
      }
    }
    Sync.setMany(pairs);
  }
  /* 按「词群键 → 要不要记」批量保存：新勾的记为 date 那天学的，取消的删掉 */
  async function saveMarks(want, date) {
    const byLes = {};
    for (const [key, on] of want) { const [lid, g] = key.split(":g"); (byLes[lid] = byLes[lid] || {add: [], del: []})[on ? "add" : "del"].push(+g); }
    for (const [lid, {add, del}] of Object.entries(byLes)) {
      const {les} = await getLesson(lid);
      if (add.length) markGroups(les, add, date);
      if (del.length) unmarkGroups(les, del);
    }
  }

  /* 书上所有词群按顺序排开（只算已生成的课） */
  const seq = () => BOOK.parts.flatMap(p => p.units.flatMap(u => u.lessons.filter(l => l.ready)
    .flatMap(l => l.groups.map(g => ({lid: l.id, no: g.no, title: g.title, key: `${l.id}:g${g.no}`})))));
  /* 接下来要学的词群：从记过的最后一个往后数；一个都没记过就从上次读的那课开始 */
  function nextGroups(n) {
    const all = seq(), learned = new Set(learnMarks().map(([k]) => k));
    let start = -1;
    all.forEach((g, i) => { if (learned.has(g.key)) start = i; });
    if (start < 0) { const i = all.findIndex(g => g.lid === store.get("last")); start = i > 0 ? i - 1 : -1; }
    return all.slice(start + 1).filter(g => !learned.has(g.key)).slice(0, n);
  }
  /* 词群的词数要读课文才知道：先空着，读到再填上 */
  const counts = new Map();
  async function fillCounts(lids, then) {
    for (const lid of new Set(lids)) {
      if ([...counts.keys()].some(k => k.startsWith(lid + ":"))) continue;
      try { const {les} = await getLesson(lid); for (const g of les.groups) counts.set(`${lid}:g${g.no}`, g.entries.length); } catch { /* 没网就不显示词数 */ }
    }
    $$("[data-qn]", view()).forEach(el => { const n = counts.get(el.dataset.qn); if (n) el.textContent = n + " 词"; });
    then && then();
  }
  const wordsOf = keys => keys.reduce((a, k) => a + (counts.get(k) || 0), 0);

  /* 某个范围里的卡：按词群的学习日期筛（忘了重来不改词群日期，所以「今天学的」不会混进旧词）；生词按加入日期 */
  function inLearnRange(from, to) {
    const ok = new Set(learnMarks().filter(([, d]) => d >= from && d <= to).map(([k]) => k));
    return liveCards().filter(x => (x.vocab ? x.card.at >= from && x.card.at <= to : ok.has(`${x.card.k}:g${x.card.g}`)));
  }
  const cap = () => +S.dailyCap || 120;
  const capLeft = () => Math.max(0, cap() - (logOf(T()).dv || 0));
  const dueAll = () => SRS.dueList(liveCards(), T());

  /* 范围：due 今天到期（一轮最多 ROUND 个，按熟练度排）/ learn 今天学的、学新词还没过关的 / today / yesterday / week 本周 / lastweek / weeks 本周+上周 / hard / all / vocab 生词本 /
     w:<周一> 那一周 / w2:<周一> 那一周+前一周 / lv:<0～5> 某个熟练度 / uNN 某单元 / uNN-lNN 某课 */
  function scopeInfo(sc) {
    const t = T(), mon = SRS.monday(t);
    let m;
    if (sc === "due") return {title: "今天到期", items: () => SRS.queue(liveCards(), t).slice(0, Math.min(ROUND, capLeft()))};
    if (sc === "learn") return {title: "学新词", items: () => inLearnRange(t, t).filter(x => !x.card.p)};
    if (sc === "today") return {title: "今天学的", items: () => inLearnRange(t, t)};
    if (sc === "yesterday") { const y = SRS.add(t, -1); return {title: "昨天学的", items: () => inLearnRange(y, y)}; }
    if (sc === "week") return {title: "本周学的", items: () => inLearnRange(mon, SRS.add(mon, 6))};
    if (sc === "lastweek") return {title: "上周学的", items: () => inLearnRange(SRS.add(mon, -7), SRS.add(mon, -1))};
    if (sc === "weeks") return {title: "本周 + 上周", items: () => inLearnRange(SRS.add(mon, -7), SRS.add(mon, 6))};
    if (sc === "hard") return {title: "难词本", items: () => liveCards().filter(x => SRS.isHard(x.card))};
    if (sc === "all") return {title: "全部已学", items: () => liveCards()};
    if (sc === "vocab") return {title: "生词本", items: () => vocabCards()};
    if ((m = sc.match(/^lv:([0-5])$/))) return {title: "熟练度 · " + LV_NAME[+m[1]], items: () => liveCards().filter(x => SRS.level(x.card) === +m[1])};
    if ((m = sc.match(/^w(2?):(\d{4}-\d\d-\d\d)$/))) {
      const a = m[1] ? SRS.add(m[2], -7) : m[2];
      return {title: `${md(a)}–${md(SRS.add(m[2], 6))}${m[1] ? "（两周）" : ""}`, items: () => inLearnRange(a, SRS.add(m[2], 6))};
    }
    if ((m = sc.match(/^u(\d\d)(?:-l(\d\d))?$/))) return {title: m[2] ? `Unit ${+m[1]} · Lesson ${+m[2]}` : `Unit ${+m[1]}`, book: sc};
    return null;
  }

  /* ---------- 课文缓存：巩固、浏览要用别的课的释义和音频 ---------- */
  const cache = new Map();
  function getLesson(id) {
    if (!cache.has(id)) cache.set(id, Promise.all([
      fetchJSON(`data/lessons/${id}.json`),
      fetchJSON(`data/audio/${id}.json`).catch(() => ({w: {}, s: {}, z: {}, voices: []})),
      fetchJSON(`data/roots/${id}.json`).catch(() => ({words: {}})),
      fetchJSON(`data/gloss/${id}.json`).catch(() => ({words: {}})),
      fetchJSON(`data/notes/${id}.json`).catch(() => ({sents: {}})),
      fetchJSON(`data/video/${id}.json`).catch(() => null),   // 讲解视频跳转（规则见 video.js），没有这一课的数据就是 null
    ]).then(([les, aud, rt, gl, nt, vd]) => {
      const by = new Map(), ext = new Map(), map = new Map();   // map：查词用，和 app.js 的 WORDMAP 一样
      for (const g of les.groups) for (const e of g.entries) {
        e.root = rt.words?.[e.word]; if (!by.has(e.word)) by.set(e.word, {e, g});
        for (const x of e.ext || []) if (!ext.has(x.word)) ext.set(x.word, {x, e, g});
        map.set(e.word, {word: e.word, senses: e.prons.flatMap(p => p.senses), ipa: e.prons.map(p => p.ipa).join(" "), no: e.no, entry: e, ext: false});
        for (const x of e.ext || []) if (!map.has(x.word)) map.set(x.word, {word: x.word, senses: x.senses, ipa: x.ipa, no: e.no, entry: e, ext: true});
      }
      return {les, aud, by, ext, map, gloss: gl.words || {}, notes: {sents: nt.sents || {}}, video: vd};   // notes：例句词组与语法解析（书外补充）
    }).catch(err => { cache.delete(id); throw err; }));   // 失败的不缓存，下次重试
    return cache.get(id);
  }
  /* 例句点词查义用的那课数据（app.js 的 lookup） */
  const lookupCtx = lid => getLesson(lid).then(x => ({lid, gloss: x.gloss, map: x.map, aud: x.aud, notes: x.notes}));
  /* 卡片列表 → 带上书上的词条内容 */
  async function resolve(items) {
    const ids = new Set();
    for (const x of items) { ids.add(x.card.k); if (x.vocab && x.card.bk) ids.add(x.card.bk[0]); }
    const ls = Object.fromEntries(await Promise.all([...ids].map(async id => [id, await getLesson(id)])));
    return items.map(x => {
      if (x.vocab) return resolveVocab(x, ls);
      const L2 = ls[x.card.k], hit = L2.by.get(x.word);
      return hit && {...x, lid: x.card.k, e: hit.e, grp: hit.g, aud: L2.aud, notes: L2.notes, video: L2.video};
    }).filter(Boolean);
  }
  /* 生词：书上有这个词条就用书上的完整内容，是扩展词就用扩展词的释义，都不是就用逐词释义；
     另带上遇见它的那句例句（src） */
  function resolveVocab(x, ls) {
    const c = x.card, S2 = ls[c.k], B = c.bk && ls[c.bk[0]];
    const hit = c.e && S2 && S2.by.get(c.e);
    const src = hit && hit.e.ex ? {ex: hit.e.ex, lid: c.k, entry: c.e, x: c.x, aud: S2.aud, notes: S2.notes} : null;
    let e, grp = null, aud = S2 ? S2.aud : {w: {}, s: {}}, notes = S2 ? S2.notes : null;
    const main = B && !c.bk[2] && B.by.get(c.w), ext = B && c.bk[2] && B.ext.get(c.w);
    if (main) { e = main.e; grp = main.g; aud = B.aud; notes = B.notes; }
    else if (ext) { e = {word: c.w, prons: [{ipa: ext.x.ipa, senses: ext.x.senses}], freq: 0, extOf: ext.e}; grp = ext.g; aud = B.aud; }
    else e = {word: c.w, prons: [{ipa: c.p || "", senses: Vocab.senses(c.m)}], freq: 0, gloss: true, ph: !!c.ph};   // ph：释义来自例句词组（notes）
    return {...x, lid: c.bk ? c.bk[0] : c.k, e, grp, aud, notes, src, nb: true, video: main || ext ? B.video : null};   // nb：按生词显示（书上范围里的生词仍按词群显示）；video：书上有这个词才有视频
  }
  /* 按书上的课 / 单元取词（包括还没记为学过的；没记过的只能看，不排复习） */
  async function bookItems(sc) {
    const [, u, l] = sc.match(/^u(\d\d)(?:-l(\d\d))?$/);
    const ids = BOOK.parts.flatMap(p => p.units).filter(x => x.no === +u).flatMap(x => x.lessons).filter(x => x.ready && (!l || x.no === +l)).map(x => x.id);
    const out = [];
    for (const id of ids) {
      const L2 = await getLesson(id);
      for (const g of L2.les.groups) for (const e of g.entries) {
        if (known.has(e.word)) continue;
        const c = Sync.get("srs:" + e.word, 0), v = !c && vocabGet(e.word);   // 还没学、但在生词本里的，评分算进生词卡
        out.push({word: e.word, card: c || v || null, vocab: !!v, freq: e.freq, order: (+u) * 1e6 + L2.les.lesson * 1e4 + g.no * 100 + e.no, lid: id, e, grp: g, aud: L2.aud, notes: L2.notes, video: L2.video});
      }
    }
    return out;
  }
  const itemsOf = sc => { const info = scopeInfo(sc); return info.book ? bookItems(info.book) : resolve(info.items()); };

  function sortBy(list, how) {
    const a = [...list];
    if (how === "alpha") a.sort((x, y) => x.word.localeCompare(y.word));
    else if (how === "freq") a.sort((x, y) => (y.freq || 0) - (x.freq || 0) || x.order - y.order);
    else if (how === "random") for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    else a.sort((x, y) => x.order - y.order);
    return a;
  }

  /* ---------- 发音（用词所在那课的音频清单） ---------- */
  function sayWord(x, w = x.word, onEnd) {   // w：读这个词的扩展词时传进来；onEnd：读完（出错也算）时调用
    const key = pickVoice(x.aud.w[w] || x.aud.w[w.toLowerCase()]);
    key ? playFile(key, onEnd, rate(), x.aud) : speakTTS(w, "en", onEnd);
  }
  /* src：读生词遇见的那句（在出处那课的音频里），否则读词条自己的例句；和课文页一样逐词高亮（卡片上这两句各在一个 .ex 里） */
  function saySent(x, slow, src) {
    const {ex, aud} = src ? {ex: x.src.ex, aud: x.src.aud} : {ex: x.e.ex, aud: x.aud};
    readSent(view().querySelector(src ? ".ex.meet" : ".ex:not(.meet)"), ex.en, null, slow ? 0.75 : rate(), aud);
  }

  /* ---------- 公共片段 ---------- */
  const view = () => $("#studyView");
  const senseHTML = e => e.prons.map(p => p.senses.map((s, i) =>
    `<div class="dsense">${e.prons.length > 1 && i === 0 ? `<span class="ipa">${esc(p.ipa)}</span>` : ""}<span class="pos">${esc(s.pos)}</span>${meanHTML(s.mean)}</div>`).join("")).join("");
  const ipaOf = e => e.prons.map(p => p.ipa).join(" ");
  /* 讲解视频按钮（app.js 的 videoHTML）：x.video 是词条所在那课的视频数据；扩展词用主词条的号，逐词释义的生词不在书里，没有 */
  const videoOf = (x, mini) => videoHTML(x.video, Video.noOf(x.e), mini, x.word);
  /* 生词：遇见它的那句例句，生词高亮，可朗读 */
  const meetHTML = x => x.src ? `<div class="ex meet"><div class="exlab">遇见 · ${lesTitle(x.src.lid)} ${esc(x.src.entry)} 的例句</div>
    <div class="sent" data-lid="${x.src.lid}" data-src="${esc(x.src.entry)}">${sentenceHTML(x.src.ex.en, x.card.ph ? [] : [x.src.x], noteOf(x.src.notes, x.src.ex.en), x.card.ph ? x.card.w : "")}</div><div class="dzh">${esc(x.src.ex.zh)}</div>${Sent.anBlock(noteOf(x.src.notes, x.src.ex.en), x.src.ex.zh, x.src.ex.en, x.card.ph ? [] : [x.src.x], x.card.ph ? x.card.w : "")}
    <div class="ops"><button data-sent="src">▶ 例句</button><button data-sent="srcslow">🐢 慢速</button></div></div>` : "";
  /* 生词的来历：哪天加的、书上有没有 */
  const vocabMeta = x => `生词 · ${md(x.card.at)} 加入${x.card.bk ? ` · 书中 ${lesTitle(x.card.bk[0])} #${x.card.bk[1]}${x.card.bk[2] ? " 的扩展词" : ""}` : ""}`;
  const fl = n => `<span class="fl" title="考频 ${n}/3">${"🔥".repeat(n)}</span>`;
  const LV_NAME = ["新学", "生疏", "认识", "熟悉", "掌握", "牢记"];
  const lvDot = n => `<span class="lvdot${n ? "" : " hollow"}" style="--c:var(--lv${n})" title="熟练度：${LV_NAME[n]}"></span>`;
  const btn = (href, text, attrs = 'appearance="filled"') => `<wa-button size="small" href="${href}" ${attrs}>${text}</wa-button>`;   // 默认浅底，主按钮传 variant="brand"
  const loadFail = err => { view().innerHTML = `<p class="empty">加载失败：${esc(err.message)}<br>检查网络后 <a href="javascript:location.reload()">重新加载</a></p>`; };
  function setHead(title) { $("#crumb").textContent = title; document.title = title + " · 四级词汇"; }

  /* ---------- 首页：一个个板块，按顺序画；以后加功能就往 MODULES 里加一项 ---------- */
  function streak() {
    const days = new Set(Sync.entries("log:").filter(([, v]) => v && (v.g + v.m + v.f) > 0).map(([d]) => d));
    for (const [, d] of learnMarks()) days.add(d);
    for (const [, v] of vocabMarks()) days.add(v.at);
    let t = T(), n = 0;
    if (!days.has(t)) t = SRS.add(t, -1);   // 今天还没学不算断
    while (days.has(t)) { n++; t = SRS.add(t, -1); }
    return n;
  }
  function modHero() {
    const t = T(), left = SRS.diff(S.examDate || "2026-12-12", t), n = streak();
    return `<div class="hero">
      <div><div class="cd">${left > 0 ? `距四级 <b>${left}</b> 天` : left === 0 ? "今天考试，加油！" : "考试已结束"}</div>
        <small>${esc(S.examDate)} · 今天 ${md(t)} 周${WEEK[SRS.dow(t)]}</small></div>
      ${n ? `<div class="streak" title="连续学习天数">🔥 连续 ${n} 天</div>` : ""}</div>`;
  }
  function modToday() {
    const t = T(), weekend = SRS.dow(t) === 0;   // 周日是复习日
    const due = dueAll().length, left = capLeft(), lg = logOf(t);
    const todays = inLearnRange(t, t), groups = learnMarks().filter(([, d]) => d === t).length;
    const nv = todays.filter(x => x.vocab).length, nb = todays.length - nv, plusV = nv ? ` + 生词 ${nv} 个` : "";
    const ready = BOOK.parts.flatMap(p => p.units.flatMap(u => u.lessons)).filter(l => l.ready);
    const last = ready.some(l => l.id === store.get("last")) ? store.get("last") : ready[0] && ready[0].id, lastL = last && last.match(/u(\d+)-l(\d+)/);
    const nightDone = todays.length && todays.every(x => x.card.t === t);
    const nl = todays.filter(x => !x.card.p).length;   // 学新词还没过关的
    const step = (done, n, title, desc, action, extra) => `<li class="${done ? "done" : ""}"><span class="dot">${done ? "✓" : n}</span>
      <div class="sd"><b>${title}</b><small>${desc}</small></div>${action || ""}${extra || ""}</li>`;
    const s1 = step(!due || !left, 1, weekend ? "周日复习" : "早上复习",
      !due ? (lg.dv ? `今天复习了 ${lg.dv} 个，全部清完` : "今天没有到期的词")
        : !left ? `今天已做满 ${cap()} 个，剩下 ${due} 个排到后面几天`
        : `到期 ${due} 个${due > left ? ` · 今天先做 ${left} 个（上限 ${cap()}）` : ""}${Math.min(due, left) > ROUND ? ` · 每轮 ${ROUND} 个` : ""}`,
      due && left ? btn("#/drill/due", "开始", 'variant="brand"') : "");
    const s2 = step(groups > 0 && !nl, 2, weekend ? "学新（周日可选）" : "学新",
      groups ? `今天记了 ${groups} 个词群 · ${nb} 词${plusV}，${nl ? `还有 ${nl} 个没过「学新词」测验` : "新词测验已全部过关；学了更多就接着记"}` : `看完视频和课件，在「学习记录」里勾上今天学的词群，再点「学新词」过一遍测验${nv ? `（已加生词 ${nv} 个）` : ""}`,
      `<span class="acts">${lastL ? btn(`#/${last}`, `继续 U${+lastL[1]} L${+lastL[2]}`) : ""}${btn("#/log", "📝 学习记录", groups || nl ? undefined : 'variant="brand"')}${nl ? btn("#/drill/learn", `学新词 ${nl}`, 'variant="brand"') : ""}</span>`);
    const s3 = step(false, 3, "途中看", todays.length ? `今天的 ${todays.length} 个词，掏出手机随时过一眼` : weekend ? "看看本周学的词" : "记录今天学的之后，这里能快速浏览",
      todays.length ? btn("#/list/today", "浏览") : weekend ? btn("#/list/week", "浏览") : "");
    const s4 = step(nightDone, 4, "睡前巩固", todays.length ? (nightDone ? "今天学的都过了一遍" : `把今天学的 ${todays.length} 个词再过一遍`) : "今天还没有新学的词",
      todays.length ? btn("#/drill/today", nightDone ? "再来" : "开始", nightDone ? undefined : 'variant="brand"') : "");
    return `<wa-card class="mod today"><div slot="header" class="mh"><b>今天</b><a href="#/drill">自由抽查 →</a></div>
      <ol class="steps4">${s1}${s2}${s3}${s4}</ol></wa-card>`;
  }
  function lastActive() {
    let last = "";
    for (const [d, v] of Sync.entries("log:")) if (v && (v.g + v.m + v.f) > 0 && d > last) last = d;
    for (const [, d] of learnMarks()) if (d > last) last = d;
    for (const [, v] of vocabMarks()) if (v.at > last) last = v.at;
    return last;
  }
  function modBacklog() {
    const t = T(), due = dueAll(), over = due.filter(x => x.card.d < t);
    if (!over.length) return "";
    const oldest = SRS.diff(t, over[0].card.d), la = lastActive(), gap = la ? SRS.diff(t, la) : 0;
    if (over.length <= capLeft() && gap < 3) return "";
    return `<wa-callout variant="warning" class="mod"><b>积压了 ${over.length} 个词</b>，最早的拖了 ${oldest} 天。
      今天建议先不学新词，把旧词清一清；每天最多 ${cap()} 个，剩下的会自动排到后面几天。
      <div class="ops"><wa-button size="small" id="leaveBtn" data-gap="${Math.max(1, gap - 1)}">我请假了，整体往后顺延…</wa-button></div></wa-callout>`;
  }
  function weekCounts(mon) {
    const byGroup = new Map();
    for (const x of allCards()) { const k = `${x.card.k}:g${x.card.g}`; byGroup.set(k, (byGroup.get(k) || 0) + 1); }
    const learned = {};
    for (const [k, d] of learnMarks()) learned[d] = (learned[d] || 0) + (byGroup.get(k) || 0);
    const vocab = {};
    for (const [w, v] of vocabMarks()) (vocab[v.at] = vocab[v.at] || []).push(w);
    return Array.from({length: 7}, (_, i) => { const d = SRS.add(mon, i), lg = logOf(d); return {d, learned: learned[d] || 0, vocab: vocab[d] || [], reviewed: lg.g + lg.m + lg.f}; });
  }
  function modWeek() {
    const t = T(), days = weekCounts(SRS.monday(t));
    const cell = (x, i) => `<a class="day${x.d === t ? " now" : ""}${i === 6 ? " we" : ""}" href="#/week">
      <span class="wd">${WEEK[(i + 1) % 7]}</span><b>${x.learned + x.vocab.length || (x.d > t ? "" : "·")}</b><small>${x.reviewed ? "复 " + x.reviewed : i === 6 ? "复习" : ""}</small></a>`;
    const sum = days.reduce((a, x) => a + x.learned + x.vocab.length, 0);
    return `<wa-card class="mod"><div slot="header" class="mh"><b>本周</b><span class="sub">新学 ${sum} 词</span><a href="#/week">周总结 →</a></div>
      <div class="weekstrip">${days.map(cell).join("")}</div><p class="note">格子里的数字是那天新学的词数（含生词），下面是复习次数；周日是复习日</p></wa-card>`;
  }
  function modLinks() {
    const hard = liveCards().filter(x => SRS.isHard(x.card)).length, nv = vocabCards().length;
    return `<div class="mod links">
      <a href="#/week" class="lk"><b>📅 周总结</b><small>本周学了什么、状态如何</small></a>
      <a href="#/list/hard" class="lk"><b>📕 难词本 ${hard ? `<wa-badge pill variant="danger">${hard}</wa-badge>` : ""}</b><small>忘过的词和没分清的易混词</small></a>
      <a href="#/list/vocab" class="lk"><b>📒 生词本 ${nv ? `<wa-badge pill variant="neutral">${nv}</wa-badge>` : ""}</b><small>例句里点生词加进来的</small></a>
      <a href="#/drill" class="lk"><b>🎲 自由抽查</b><small>选范围和顺序随便抽</small></a></div>`;
  }
  function modUnits() {
    const per = {};
    for (const x of allCards()) { const u = +x.card.k.slice(1, 3); per[u] = (per[u] || 0) + 1; }
    const units = BOOK.parts.flatMap(p => p.units);
    return `<wa-card class="mod"><div slot="header" class="mh"><b>课程</b><span class="sub">环里是已经记为学过的词</span></div>
      <div class="units">${units.map(u => { const n = per[u.no] || 0, pct = u.words ? Math.round(n / u.words * 100) : 0, first = u.lessons.find(l => l.ready);
        return `<a class="unit" href="${first ? "#/" + first.id : "#/"}"><wa-progress-ring value="${pct}" style="--size:56px;--track-width:5px;--indicator-width:5px">${n || ""}</wa-progress-ring>
          <span>Unit ${u.no}</span><small>${u.words} 词</small></a>`; }).join("")}</div></wa-card>`;
  }
  /* 熟练度分布：一根分段条 + 图例（带数量），点哪一段就看那一档的词 */
  function modMastery() {
    const cards = liveCards();
    if (!cards.length) return "";
    const n = [0, 0, 0, 0, 0, 0];
    for (const x of cards) n[SRS.level(x.card)]++;
    const order = [1, 2, 3, 4, 5, 0];                   // 生疏在最前，新学放最后
    const seg = i => n[i] ? `<a href="#/list/lv:${i}" style="flex:${n[i]};${i ? `background:var(--lv${i})` : "box-shadow:inset 0 0 0 1.5px var(--lv0)"}" title="${LV_NAME[i]} ${n[i]} 个"></a>` : "";
    return `<wa-card class="mod"><div slot="header" class="mh"><b>熟练度</b><span class="sub">共 ${cards.length} 词 · 掌握以上 ${n[4] + n[5]} 个</span></div>
      <div class="lvbar">${order.map(seg).join("")}</div>
      <div class="lvlegend">${order.map(i => `<a href="#/list/lv:${i}">${lvDot(i)}${LV_NAME[i]} <b>${n[i]}</b></a>`).join("")}</div>
      <p class="note">按每个词第一遍作答算：生疏 = 最近答错；掌握要能看中文想出英文；牢记要拼得出或手动「斩」过。点一档看具体的词</p></wa-card>`;
  }
  const MODULES = [modHero, modToday, modBacklog, modMastery, modWeek, modLinks, modUnits];

  function renderHome() {
    setHead("首页");
    view().innerHTML = `<div class="home">${MODULES.map(f => f()).join("")}</div>`;
  }

  /* ---------- 记录页：像书的目录，Unit → Lesson → 词群，一行一个，勾上就是学过（跳着学、补记、取消用） ---------- */
  let W = null;   // 还没保存的改动：{want: 词群键 → 勾不勾, day}
  function renderLog(focus) {
    setHead("学习记录");
    if (!W) W = {want: new Map(), day: "today"};
    const learned = new Map(learnMarks()), all = seq();
    const fLid = focus || (nextGroups(1)[0] || {}).lid || store.get("last") || (all[0] || {}).lid;
    const fU = fLid ? +fLid.slice(1, 3) : 1;
    const on = key => (W.want.has(key) ? W.want.get(key) : learned.has(key));
    const units = BOOK.parts.flatMap(p => p.units);
    view().innerHTML = `<div class="logv">
      <div class="vh"><h1>学习记录</h1><span class="seg">${[["today", "今天"], ["yesterday", "昨天"]].map(([v, l]) =>
        `<button data-lday="${v}" class="${W.day === v ? "on" : ""}">记为${l}学的</button>`).join("")}</span></div>
      <p class="note">像翻书的目录一样，勾上学过的词群再保存；取消勾选会删掉那个词群的学习记录和复习进度。</p>
      ${units.map(u => {
        const ls = u.lessons.filter(l => l.ready), keys = ls.flatMap(l => l.groups.map(g => `${l.id}:g${g.no}`)), n = keys.filter(k => learned.has(k)).length;
        return `<details class="lunit" data-u="${u.no}"${u.no === fU ? " open" : ""}><summary>Unit ${u.no}<small>已记 ${n}/${keys.length} 个词群</small></summary>
          ${ls.map(l => `<div class="lles" id="log-${l.id}"><div class="llh">Lesson ${l.no}</div>${l.groups.map(g => {
            const key = `${l.id}:g${g.no}`, d = learned.get(key);
            return `<label class="lrec${on(key) ? " on" : ""}"><input type="checkbox" data-g="${key}"${on(key) ? " checked" : ""}>
              <span class="lno">${g.no}</span><span class="gt">${esc(g.title)}</span>
              ${d ? `<span class="ld" title="${d} 记为学过">${md(d)} 学过</span>` : ""}<span class="qn" data-qn="${key}">${counts.has(key) ? counts.get(key) + " 词" : ""}</span></label>`; }).join("")}</div>`).join("")}</details>`; }).join("")}
      <div class="logbar"><span id="logInfo"></span><wa-button size="small" variant="brand" id="logSave">保存</wa-button></div></div>`;
    paintLogBar();
    const open = units.find(u => u.no === fU);
    if (open) fillCounts(open.lessons.filter(l => l.ready).map(l => l.id), paintLogBar);
    if (focus) setTimeout(() => document.getElementById("log-" + focus)?.scrollIntoView({block: "start"}), 0);
  }
  function logDiff() {
    const learned = new Map(learnMarks()), add = [], del = [];
    for (const [k, v] of W.want) { if (v && !learned.has(k)) add.push(k); if (!v && learned.has(k)) del.push(k); }
    return {add, del};
  }
  function paintLogBar() {
    const el = $("#logInfo"); if (!el || !W) return;
    const {add, del} = logDiff(), w = wordsOf(add);
    el.innerHTML = add.length || del.length
      ? `${add.length ? `新勾 <b>${add.length}</b> 个词群${w ? ` · ${w} 词` : ""}` : ""}${add.length && del.length ? "；" : ""}${del.length ? `取消 <b>${del.length}</b> 个` : ""}`
      : "勾上学过的词群";
    $("#logSave").disabled = !add.length && !del.length;
  }

  /* ---------- 浏览（途中看）：紧凑列表，可遮住释义 ---------- */
  async function renderList(sc) {
    const info = scopeInfo(sc);
    if (!info) { location.hash = "#/"; return; }
    setHead(info.title);
    view().innerHTML = `<p class="empty">加载中…</p>`;
    let items;
    const vpage = sc === "vocab";   // 生词本页：新加的在前，带「移出」
    try { items = sortBy(await itemsOf(sc), "course"); if (vpage) items.reverse(); } catch (err) { loadFail(err); return; }
    const hide = !!store.get("listHide", false), fold = !!store.get("listFold", false);
    const lvOf = x => (x.card ? SRS.level(x.card) : -1);
    const nFold = items.filter(x => lvOf(x) >= 4).length;
    let lastG = "";
    const rows = items.map(x => {
      const gk = x.nb ? "v:" + x.card.at : `${x.lid}:${x.grp.no}`;
      const head = gk === lastG ? "" : `<div class="lgh">${x.nb ? `生词 · ${md(x.card.at)} 加入` : `${lesTitle(x.lid)} · 词以群记 ${x.grp.no} ${esc(x.grp.title)}`}</div>`;
      lastG = gk;
      const bk = x.nb && x.card.bk, w = encodeURIComponent(x.word);
      const from = x.nb ? `<div class="lsrc">${x.src ? `遇见于 <a href="#/${x.src.lid}/w/${encodeURIComponent(x.src.entry)}">${lesTitle(x.src.lid)} ${esc(x.src.entry)}</a> 的例句` : ""}
        ${bk ? `${x.src ? " · " : ""}书中 <a href="#/${bk[0]}/w/${w}">${lesTitle(bk[0])} #${bk[1]}${bk[2] ? " 扩展词" : ""}</a>` : ""}
        ${vpage ? `<button class="vdel" data-vdel="${esc(x.word)}">移出</button>` : ""}</div>` : "";
      const ms = x.e.prons.flatMap(p => p.senses);
      const lv = lvOf(x);
      return `${head}<div class="lrow${lv >= 0 ? " lv" + lv : ""}" data-w="${esc(x.word)}">${lv >= 0 ? lvDot(lv) : ""}<span class="lw" data-say="1">${esc(x.word)}</span><span class="ipa">${esc(ipaOf(x.e))}</span>${fl(x.nb ? x.e.freq || 0 : x.freq)}
        ${x.vocab && !vpage ? `<span class="vt">生词</span>` : ""}${x.card && x.card.l ? `<span class="lapse" title="忘过 ${x.card.l} 次">✗${x.card.l}</span>` : ""}${videoOf(x, true)}
        <div class="lm">${ms.length ? ms.map(s => `<span class="pos">${esc(s.pos)}</span>${meanHTML(s.mean)}`).join("　") : "（没有现成释义，看例句）"}${x.e.gloss ? `<span class="src add">补充</span>` : ""}</div>${from}</div>`;
    }).join("");
    view().innerHTML = `<div class="listv${hide ? " hide" : ""}${fold ? " fold" : ""}">
      <div class="vh"><h1>${esc(info.title)} <small>${items.length} 词</small></h1>
        <div class="ops"><wa-button size="small" appearance="filled" id="listHide">${hide ? "显示释义" : "遮住释义"}</wa-button>
        ${nFold ? `<wa-button size="small" appearance="filled" id="listFold">${fold ? "展开已掌握" : "折叠已掌握"}</wa-button>` : ""}
        ${items.length ? btn(`#/drill/${encodeURIComponent(sc)}`, "巩固模式过一遍", 'variant="brand"') : ""}</div></div>
      ${hide ? `<p class="note">点单词读音，点释义的位置显示释义</p>` : `<p class="note">点单词读音</p>`}
      ${fold && nFold ? `<p class="foldnote">已折叠 ${nFold} 个掌握 / 牢记的词</p>` : ""}
      ${rows || `<p class="empty">这里还没有词。${sc === "today" ? "在「学习记录」里勾上今天学的词群，或者在例句里点生词加进生词本。" : vpage ? "读例句时点不认识的词，在弹出的释义里点「＋ 生词本」。" : ""}</p>`}</div>`;
    view()._items = items;
  }

  /* ---------- 巩固模式：一轮循环到全部答对；学新词两关（看词选义 + 听音选义）都过才算过关 ----------
     题型按熟练度出（SRS.pickType），只记每个词这一轮的第一遍作答；答错的隔 3～5 张再出。
     中途关掉：复习的第一遍成绩已经存了，学新词过关的记了 p，下次进来只剩没做完的 */
  let D = null;   // 当前这一轮
  const ROUND = 25, WINDOW = 8, HIST = 30;           // 复习每轮最多 25 个；学新词同时在背最多 8 个；「上一个」最多回看 30 个
  const KIND_NO = {mean: 0, listen: 1, cloze: 2, reverse: 2, spell: 3, flip: 4};
  const KIND_NAME = {mean: "看词选义", listen: "听音选义", cloze: "例句填空", reverse: "看义选词", spell: "拼写", flip: "翻卡自评"};
  const ORDERS = [["course", "课件顺序"], ["alpha", "字母顺序"], ["freq", "重要性"], ["random", "随机"]];
  const MODES = [["quiz", "智能出题"], ["flip", "翻卡自评"]];
  function renderPicker() {
    setHead("巩固模式");
    const n = sc => scopeInfo(sc).items().length;
    const scopes = [["due", "今天到期", Math.min(dueAll().length, capLeft(), ROUND)], ["learn", "学新词"], ["today", "今天学的"], ["yesterday", "昨天学的"], ["week", "本周学的"],
      ["lastweek", "上周学的"], ["weeks", "本周 + 上周"], ["hard", "难词本"], ["vocab", "生词本"], ["all", "全部已学"]];
    const units = BOOK.parts.flatMap(p => p.units);
    view().innerHTML = `<div class="picker">
      <h1>巩固模式</h1><p class="note">智能出题：按每个词的熟练度出四选一、听音、例句填空、拼写，答错的这一轮里会再出，直到答对。翻卡自评：看英文想意思，翻开后自己打分。</p>
      <section class="panel"><h2>出题方式</h2>
        <div class="seg">${MODES.map(([v, l]) => `<button data-dmode="${v}" class="${S.drillMode === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <p class="note">「今天到期」固定按熟练度排顺序（拖过的、生疏的先来，复习满 3 次的打乱）；「学新词」总是智能出题</p></section>
      <section class="panel"><h2>抽查顺序</h2>
        <div class="seg">${ORDERS.map(([v, l]) => `<button data-order="${v}" class="${S.drillOrder === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <p class="note">建议：当天、次日用课件顺序（借词群联系）；周末、二刷用字母或随机（去掉提示，检验真记住）；冲刺用重要性（🔥🔥🔥 → 🔥）</p></section>
      <section class="panel"><h2>抽哪些词</h2><div class="scopes">
        ${scopes.map(([v, l, c]) => { const k = c ?? n(v); return `<a class="sc${k ? "" : " off"}" href="#/drill/${v}"><b>${l}</b><small>${k} 词</small></a>`; }).join("")}</div>
        <div class="row"><span><b>按书上的范围</b><small>还没记为学过的词也能抽，但不排复习</small></span>
          <select id="bookScope"><option value="">选单元或课…</option>${units.map(u => `<option value="u${pad2(u.no)}">Unit ${u.no}</option>` +
            u.lessons.filter(l => l.ready).map(l => `<option value="${l.id}">　Unit ${u.no} · Lesson ${l.no}</option>`).join("")).join("")}</select></div></section></div>`;
  }

  /* ---------- 出题用的小工具 ---------- */
  const sensesOf = e => e.prons.flatMap(p => p.senses);
  const meanText = e => sensesOf(e).slice(0, 3).map(s => `${s.pos} ${plainMean(s.mean)}`.trim()).join("；");
  const mainPos = e => (sensesOf(e)[0] || {}).pos || "";
  /* 干扰项的候选：这一轮涉及的课里所有书上词条 + 这一轮的词 */
  async function buildPool(items) {
    const pool = new Map();
    for (const id of new Set(items.map(x => x.lid).filter(Boolean))) {
      try { for (const [w, {e, g}] of (await getLesson(id)).by) if (!pool.has(w)) pool.set(w, {e, g}); } catch { /* 没网就只用这一轮的词 */ }
    }
    for (const x of items) if (!pool.has(x.word)) pool.set(x.word, {e: x.e, g: x.grp});
    return [...pool.values()].filter(p => meanText(p.e));
  }
  /* 挑 3 个干扰项（每个带 tag，见 SRS.distractorTag）：和正确答案有共同义项的不要（只差词性的除外）；
     形近 / 同词群 / 词性辨析合计最多 1 个，混淆过的词（卡片 cf、本轮刚混淆的）优先占这个名额；其次同词性（词性辨析的词按同词性算，不然总被同词群挤掉），同分随机 */
  function distractors(x) {
    const me = meanText(x.e), pos = mainPos(x.e), t = {word: x.word, mean: me}, seen = new Set([me]), out = [];
    const cf = new Set([...(D.cf.get(x.word) || []), ...((x.card && x.card.cf) || [])]);
    const cands = D.pool.filter(p => p.e.word.toLowerCase() !== x.word.toLowerCase())
      .map(p => { const m = meanText(p.e); return {e: p.e, m, tag: SRS.distractorTag(t, {word: p.e.word, mean: m}, !!x.grp && p.g === x.grp)}; })
      .filter(c => c.tag !== "bad")
      .map(c => ({...c, s: (c.tag && cf.has(c.e.word) ? 10 : 0) + (c.tag ? 3 : 0) + (c.tag === "pos" || mainPos(c.e) === pos ? 2 : 0) + Math.random() * 1.5}))
      .sort((a, b) => b.s - a.s);
    let near = false;
    for (const c of cands) {
      if (seen.has(c.m) || (c.tag && near)) continue;
      if (c.tag) near = true;
      seen.add(c.m); out.push(c); if (out.length === 3) break;
    }
    return out;
  }
  /* 词组卡：生词本里原形含空格的（含以前从逐词释义划选的短语），或从例句词组加进来的（ph） */
  const isPh = x => !!(x.vocab && x.card && SRS.isPhrase(x.card));
  const fakeEntry = (word, m, ipa = "") => ({word, prons: [{ipa, senses: Vocab.senses(m)}]});
  /* 词组卡的干扰项候选：phs = 这一轮涉及的课的 notes 里所有词组 + 生词本里别的词组；vbs = 生词本里的单词 */
  async function buildPhrasePool(items) {
    const ph = new Map();
    for (const id of new Set(items.flatMap(x => [x.lid, x.card && x.card.k]).filter(Boolean))) {
      try { for (const n of Object.values((await getLesson(id)).notes.sents)) for (const p of n.ph || []) if (p.b && p.m && !ph.has(p.b)) ph.set(p.b, p.m); } catch { /* 没网就少一些候选 */ }
    }
    const vs = vocabMarks();
    for (const [w, v] of vs) if (SRS.isPhrase(v) && v.m && !ph.has(w)) ph.set(w, v.m);
    return {phs: [...ph].map(([b, m]) => fakeEntry(b, m)), vbs: vs.filter(([, v]) => !SRS.isPhrase(v) && v.m).map(([w, v]) => fakeEntry(w, v.m, v.p))};
  }
  /* 看词组选义的 3 个干扰项：先取别的词组的释义，不够从生词释义补，再不够从书上词条补；同一原形、相同释义的不要 */
  function phraseDistractors(x) {
    const me = meanText(x.e), lw = x.word.toLowerCase(), seen = new Set([me]), out = [];
    const take = list => {
      for (const e of shuffle(list.slice())) {
        if (out.length >= 3) return;
        const m = meanText(e);
        if (!m.trim() || seen.has(m) || e.word.toLowerCase() === lw) continue;
        seen.add(m); out.push({e, tag: null});
      }
    };
    take(D.phs); take(D.vbs); take(D.pool.map(p => p.e));
    return out;
  }
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  /* 例句挖空：生词用遇见它的那句，书上的词用词条例句；找不到这个词就返回 null */
  function clozeOf(x) {
    const ex = x.nb && x.src ? x.src.ex : x.e.ex;
    if (!ex) return null;
    const keys = (x.nb && x.src ? [x.src.x] : ex.key && ex.key.length ? ex.key : [x.word]).slice().sort((a, b) => b.length - a.length);
    let en = ex.en, hit = false;
    for (const k of keys) en = en.replace(new RegExp("(?<![A-Za-z])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z])", "gi"), () => { hit = true; return "\u0000"; });
    return hit ? {html: esc(en).replace(/\u0000/g, `<span class="blank">　?　</span>`), zh: ex.zh} : null;
  }
  /* 这个词这次出什么题 */
  function kindFor(x) {
    if (!meanText(x.e)) return "flip";               // 没有现成释义的生词出不了选择题
    if (D.learn) return !isPh(x) && (D.st.get(x.word) || {}).stage ? "listen" : "mean";   // 词组卡两关都是看词组选义
    if (D.flip) return "flip";
    if (D.kind.has(x.word)) return D.kind.get(x.word);   // 答错再来：同一种题
    const ty = x.card ? SRS.pickType(x.card, {phrase: isPh(x)}) : SRS.TYPE.MEAN;   // 词组卡只会是看词组选义或翻卡
    if (ty === SRS.TYPE.CONTEXT) return clozeOf(x) && SRS.reviews(x.card) % 2 === 0 ? "cloze" : "reverse";
    return ["mean", "listen", null, "spell", "flip"][ty];
  }
  function makeQ(x, kind) {
    const q = {x, kind, state: "ask", t0: 0};
    if (kind === "mean" || kind === "listen" || kind === "cloze" || kind === "reverse") {
      const cs = shuffle([{e: x.e, tag: null}, ...(isPh(x) ? phraseDistractors(x) : distractors(x))]);
      q.es = cs.map(c => c.e); q.tags = cs.map(c => c.tag);
      q.ans = q.es.indexOf(x.e);
      q.opts = q.es.map(e => (kind === "mean" || kind === "listen" ? meanText(e) : e.word));
      if (kind === "cloze") q.cloze = clozeOf(x);
    }
    return q;
  }

  async function startDrill(sc, preset) {
    const info = preset ? {title: preset.title} : scopeInfo(sc);
    if (!info) { location.hash = "#/drill"; return; }
    setHead("巩固 · " + info.title);
    view().innerHTML = `<p class="empty">加载中…</p>`;
    const learn = !preset && sc === "learn", hash = location.hash;
    let items, pool = [], pp = {phs: [], vbs: []};
    try {
      items = preset ? preset.items : await itemsOf(sc);
      if (!preset && sc !== "due") items = sortBy(items, learn ? "course" : S.drillOrder);   // 到期的已按熟练度排好
      if (learn || S.drillMode !== "flip") pool = await buildPool(items);
      if ((learn || S.drillMode !== "flip") && items.some(isPh)) pp = await buildPhrasePool(items);
    } catch (err) { loadFail(err); return; }
    if (location.hash !== hash) return;              // 加载期间去了别的页
    D = {sc, title: info.title, items, learn, flip: !learn && S.drillMode === "flip", pool, ...pp, hash,
      queue: learn ? items.slice(0, WINDOW) : items.slice(), pending: learn ? items.slice(WINDOW) : [],
      st: new Map(), kind: new Map(), cf: new Map(), rated: new Map(), passed: 0, res: {g: 0, m: 0, f: 0}, q: null, hist: [], back: 0};
    if (!items.length) {
      view().innerHTML = `<div class="drill"><p class="empty">「${esc(info.title)}」里没有要抽的词。${learn ? "先在「学习记录」里勾上今天学的词群。" : ""}</p><p class="empty">${btn("#/", "回首页")} ${btn("#/drill", "换个范围")}</p></div>`;
      return;
    }
    next();
  }
  function next() {
    stopAll();                                       // 上一题没读完的词、例句（连同高亮）停掉
    const pq = D.q;
    if (pq && (pq.state === "done" || pq.r || pq.chopped)) { D.hist.push(pq); if (D.hist.length > HIST) D.hist.shift(); }
    D.back = 0;
    if (!D.queue.length) { D.q = null; endDrill(); return; }
    const x = D.queue[0], kind = kindFor(x);
    if (!D.learn) D.kind.set(x.word, kind);
    D.q = makeQ(x, kind);
    showCard();
  }

  /* 卡片背面：释义、记忆法、词根、例句、扩展词、生词出处（翻卡和答错后都用） */
  const backHTML = x => `<div class="dback">${senseHTML(x.e)}${x.e.gloss ? `<div class="dnote">${x.e.prons[0].senses.length ? "" : "没有现成释义，看例句 · "}<span class="src add">补充</span> ${x.e.ph ? "例句词组释义" : "例句逐词释义"}</div>` : ""}
    ${x.e.extOf ? `<div class="dnote">书上 #${x.e.extOf.no} ${esc(x.e.extOf.word)} 的扩展词</div>` : ""}
    ${x.e.tip ? `<div class="tip"><span class="tag ${esc(x.e.tip.type)}">${esc(x.e.tip.type)}</span>${esc(x.e.tip.text)}</div>` : ""}
    ${x.e.root ? `<div class="tip root"><span class="tag 构词">词根</span>${esc(x.e.root)}<span class="src add">补充</span></div>` : ""}
    ${x.e.ex ? `<div class="ex${x.e.ex.type === "真" ? " zt" : ""}"><div class="exlab">${x.e.ex.type === "真" ? `真题 ${x.e.ex.year}` : "例句"}</div>
      <div class="sent" data-lid="${x.lid}" data-src="${esc(x.e.word)}">${sentenceHTML(x.e.ex.en, x.e.ex.key, noteOf(x.notes, x.e.ex.en))}</div><div class="dzh">${esc(x.e.ex.zh)}</div>${Sent.anBlock(noteOf(x.notes, x.e.ex.en), x.e.ex.zh, x.e.ex.en, x.e.ex.key)}
      <div class="ops"><button data-sent="1">▶ 例句</button><button data-sent="slow">🐢 慢速</button></div></div>` : ""}
    ${x.e.ext && x.e.ext.length ? `<div class="dext">${x.e.ext.map(y => `<div class="dextrow"><span class="tag">扩</span><b data-sayx="${esc(y.word)}">${esc(y.word)}</b>
      <span class="ipa">${esc(y.ipa)}</span><button class="spk sm" data-sayx="${esc(y.word)}" title="读">🔊</button>
      <span>${y.senses.map(s => `<span class="pos">${esc(s.pos)}</span>${meanHTML(s.mean)}`).join("　")}</span></div>`).join("")}</div>` : ""}
    ${meetHTML(x)}</div>`;
  /* vid：翻开 / 答完以后才在 🔊 旁边放讲解视频按钮（答题前放出来就等于给了答案） */
  const wordHead = (x, vid) => `<div class="dword" data-say="1">${esc(x.word)}</div>
    <div class="dipa"><span class="ipa">${esc(ipaOf(x.e))}</span> <button class="spk" data-say="1" title="读（R）">🔊</button>${vid ? videoOf(x) : ""} ${fl(x.nb ? x.e.freq || 0 : x.freq)}</div>`;

  /* 正在看的那一题：回看时是历史里的，否则是当前题 */
  const curQ = () => (D.back ? D.hist[D.hist.length - D.back] : D.q);
  const RESULT = {g: "✓ 记得", m: "≈ 模糊", f: "✗ 忘了"};
  const RUBRIC = `<p class="rubric">忘了 = 主要意思想不起来或想错｜模糊 = 想了一会儿才想起，或只记得主要意思｜记得 = 很快想起主要意思（次要意思不要求）</p>`;
  function showCard() {
    const past = D.back > 0, q = curQ(), x = q.x, c = x.card, total = D.items.length;
    const retry = !past && q.state === "ask" && (D.learn ? (D.st.get(x.word) || {}).err : D.rated.has(x.word));
    const stage = D.learn && !past ? `第 ${((D.st.get(x.word) || {}).stage || 0) + 1}/2 关` : "";
    pop.style.display = "none";
    const bar = `<div class="dbar"><span>${esc(D.title)}</span><wa-progress-bar value="${Math.round(D.passed / total * 100)}"></wa-progress-bar>
      <span>${D.learn ? "过关 " : ""}${D.passed}/${total}</span><a href="#/" class="dx" title="结束">✕</a></div>`;
    const meta = `<div class="dmeta">${past ? `<b class="pastk">回看 · 上 ${D.back} 个</b> · ` : ""}${x.nb ? vocabMeta(x) : `${lesTitle(x.lid)} · 词群 ${x.grp.no} ${esc(x.grp.title)}`} · <b class="qk">${KIND_NAME[q.kind]}</b>${stage ? ` · ${stage}` : ""}${retry ? ` · <b class="again">再来一次</b>` : ""}${past ? ` · ${q.chopped ? "已斩" : RESULT[q.r] || ""}` : ""}${c ? "" : " · 未记为学过"}</div>`;
    const prevBtn = D.back < D.hist.length ? `<wa-button appearance="outlined" data-prev="1" title="回看上一个词">← 上一个</wa-button>` : "";
    const pastOps = `${prevBtn}<wa-button variant="brand" data-fwd="1">${D.back > 1 ? "下一个 →" : "回到当前 →"} <kbd>空格</kbd></wa-button>`;
    if (q.kind === "flip" || (past && q.state !== "done")) {   // 翻卡；回看时没作答就斩掉的题也按翻卡样子展示
      const open = q.flipped || past;
      view().innerHTML = `<div class="drill${open ? " flipped" : ""}${past ? " past" : ""}">${bar}<div class="dcard${open ? "" : " locked"}">${meta}${wordHead(x, open)}${open ? backHTML(x) : ""}</div>
        <div class="dops">${past ? pastOps : q.flipped
          ? `${prevBtn}<wa-button variant="danger" data-rate="f">忘了 <kbd>1</kbd></wa-button><wa-button variant="warning" data-rate="m">模糊 <kbd>2</kbd></wa-button>
             <wa-button variant="success" data-rate="g">记得 <kbd>3</kbd></wa-button>${chopBtn(x)}${RUBRIC}`
          : `${prevBtn}<wa-button variant="brand" class="flip" data-flip="1">想好了，翻开看 <kbd>空格</kbd></wa-button>${chopBtn(x)}`}</div></div>`;
      if (!past && !q.flipped && !q.said) { q.said = true; if (S.autoSay) sayWord(x); }
      return;
    }
    const done = q.state === "done", ok = done && q.r !== "f" && !q.conf;
    let body = "";
    if (q.kind === "mean") body = wordHead(x, done);
    else if (q.kind === "listen") body = done ? wordHead(x, true) : `<button class="bigspk" data-say="1" title="再听一遍（R）">🔊</button><p class="note qhint">听发音，选意思 · R 再听</p>`;
    else if (q.kind === "reverse") body = `<div class="qmean">${esc(meanText(x.e))}</div>${done ? wordHead(x, true) : `<p class="note qhint">选出对应的英文</p>`}`;
    else if (q.kind === "cloze") body = `<div class="qsent">${q.cloze.html}</div>${done ? `<div class="dzh">${esc(q.cloze.zh)}</div>${wordHead(x, true)}` : `<p class="note qhint">选出填进空里的词（可能是变形）</p>`}`;
    else if (q.kind === "spell") body = `<div class="qmean">${esc(meanText(x.e))}</div>
      ${done ? `<div class="spres ${q.r === "g" ? "ok" : "bad"}">${q.r === "g" ? "✓ 拼对了" : `${q.input ? `你写的：<s>${esc(q.input)}</s>` : "没写"}${q.r === "m" ? " · 差一个字母，算模糊" : ""}`}</div>${wordHead(x, true)}`
        : `<button class="spk" data-say="1" title="再听（R）">🔊</button><div class="spellbox"><input id="spell" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(x.word[0] + " _".repeat(Math.max(0, x.word.length - 1)))}"></div>`}`;
    const verdict = done && q.kind !== "spell" ? `<div class="qverdict ${ok ? "ok" : "bad"}">${q.conf ? confHTML(x, q.conf) : q.r === "g" ? "✓ 答对了" : q.r === "m" ? "✓ 答对了，但想得有点久（记为模糊）" : q.pick === -1 ? "✗ 不认识" : "✗ 答错了"}</div>` : "";
    const opts = q.opts ? `<div class="qopts">${q.opts.map((o, i) => `<button class="qopt${done && i === q.ans ? " ok" : ""}${done && i === q.pick && i !== q.ans ? " bad" : ""}" data-opt="${i}"${done ? " disabled" : ""}><kbd>${i + 1}</kbd><span>${esc(o)}</span></button>`).join("")}</div>` : "";
    const ops = past ? pastOps : done
      ? `${prevBtn}<wa-button variant="brand" data-next="1">继续 <kbd>空格</kbd></wa-button>`
      : q.kind === "spell" ? `${prevBtn}<wa-button appearance="outlined" data-opt="-1">不会 <kbd>Esc</kbd></wa-button><wa-button variant="brand" data-spell="1">提交 <kbd>Enter</kbd></wa-button>${chopBtn(x)}`
      : `${prevBtn}<wa-button appearance="outlined" data-opt="-1">不认识 <kbd>0</kbd></wa-button>${chopBtn(x)}`;
    view().innerHTML = `<div class="drill quiz${done ? (ok ? " right" : " wrong") : ""}${past ? " past" : ""}">${bar}<div class="dcard${done || past ? "" : " locked"}">${meta}${body}${opts}${verdict}${done && q.conf ? cmpHTML(q.conf.e) : ""}${done ? backHTML(x) : ""}</div><div class="dops">${ops}</div></div>`;
    if (!done) {
      q.t0 = Date.now();                               // 从回看回来重新计时
      if (!q.said) { q.said = true; if (q.kind === "listen" || q.kind === "spell" || (q.kind === "mean" && S.autoSay)) sayQ(q); }
      if (q.kind === "spell") $("#spell").focus();
    }
  }
  /* 读当前题的词：听音题从第一次读完（出错也算）才开始计时，之后按 R 重听不重新计时 */
  function sayQ(q) {
    if (q.kind !== "listen" || q.heard) { sayWord(q.x); return; }
    sayWord(q.x, q.x.word, () => { if (q.heard) return; q.heard = true; if (q.state === "ask") q.t0 = Date.now(); });
  }
  /* 上一个 / 往回翻到头再往前：只看不改 */
  function goBack() { if (D.back < D.hist.length) { stopAll(); D.back++; showCard(); } }
  function goFwd() { if (D.back > 0) { stopAll(); D.back--; showCard(); } }

  /* 作答：i 是选项序号（-1 = 不认识 / 不会）；拼写传 input */
  function answer(i, input) {
    const q = D.q; if (!q || q.state !== "ask") return;
    const x = q.x, ms = Date.now() - q.t0;
    if (q.kind === "spell") { q.input = input || ""; q.r = i === -1 || !q.input.trim() ? "f" : SRS.gradeSpell(q.input, x.word); }
    else {
      q.pick = i;
      const tag = i >= 0 && i !== q.ans ? q.tags[i] : null;   // 选中易混的干扰项：算混淆，记模糊，不按忘了重来
      if (tag) { q.conf = {tag, e: q.es[i]}; q.r = "m"; } else q.r = SRS.gradeChoice(i === q.ans, ms, q.kind);
    }
    q.state = "done";                                // 答对答错都展开完整卡片，按「继续」再走
    settle(x, q.r, q.kind, !!q.conf);
    if (q.es) noteConf(x, q);
    showCard();
    if (q.r !== "f" && q.kind !== "mean") sayWord(x);
  }
  /* 斩：太简单了，直接升到牢记，30 天后（或考前窗口）抽查一次；算本轮过关，不计入复习次数 */
  const chopBtn = x => (x.card && !x.card.z ? `<wa-button appearance="outlined" data-chop="1" title="太简单，直接标为牢记，一个月后抽查">斩 <kbd>S</kbd></wa-button>` : "");
  function chopCur() {
    const q = D.q, x = q && q.x;
    if (D.back || !x || !x.card || (q.kind !== "flip" && q.state !== "ask")) return;
    const key = cardKey(x), c = Sync.get(key, 0); if (!c) return;
    const t = T(), u = SRS.chop(c, t, x.word, S.examDate);
    Sync.set(key, D.learn ? {...u, p: t} : u); x.card = Sync.get(key);
    q.chopped = true;
    D.res.z = (D.res.z || 0) + 1; D.passed++; (D.chopped = D.chopped || new Set()).add(x.word);
    D.queue = D.queue.filter(y => y.word !== x.word);
    if (D.learn && D.pending.length) D.queue.push(D.pending.shift());
    toast(`已斩 ${x.word}：${md(x.card.d)} 抽查`);
    next();
  }
  function rateFlip(r) {
    const q = D.q, x = q.x;
    q.r = r;
    settle(x, r, "flip");
    next();
  }
  /* 记成绩、排队：复习只记第一遍；学新词两关都过（或错满 3 次后再对一次）才过关 */
  function settle(x, r, kind, conf = false) {
    const ok = r !== "f" && !conf;                   // 混淆：成绩记模糊，但这一轮还要再答对一次
    D.queue.shift();
    if (!D.rated.has(x.word)) { D.rated.set(x.word, r); D.res[r]++; if (!D.learn) record(x, r, kind, conf); }
    if (D.learn) {
      const s = D.st.get(x.word) || {stage: 0, err: 0};
      if (ok) s.stage++; else { s.stage = 0; if (!conf) s.err++; }   // 混淆不算错次数
      D.st.set(x.word, s);
      if (ok && (s.stage >= 2 || s.err >= 3 || kind === "flip")) { D.passed++; learnPass(x, s); if (D.pending.length) D.queue.push(D.pending.shift()); }
      else reinsert(x);
    } else if (ok) D.passed++;
    else reinsert(x);
  }
  /* 对比复习：混淆的词记进卡片 cf，下次出这个词的选择题固定放进干扰项；带着它答对就删掉 */
  function noteConf(x, q) {
    if (q.conf) D.cf.set(x.word, SRS.confAdd(D.cf.get(x.word), q.conf.e.word));
    const key = cardKey(x), c = Sync.get(key, 0);
    if (!c) return;
    let cf = c.cf || [];
    if (q.conf) cf = SRS.confAdd(cf, q.conf.e.word);
    else if (q.pick === q.ans) for (const e of q.es) cf = SRS.confDrop(cf, e.word);
    if (cf.join() === (c.cf || []).join()) return;
    const u = {...c, cf};
    if (!cf.length) delete u.cf;
    Sync.set(key, u); x.card = u;
  }
  const posText = e => [...SRS.posSet(meanText(e))].join("、") || "?";
  const confHTML = (x, {tag, e}) => tag === "pos"
    ? `✗ 词性混淆：${esc(x.word)} 是 ${esc(posText(x.e))}，${esc(e.word)} 是 ${esc(posText(e))}<small>记为模糊，下次会把两个词放在一起考</small>`
    : `✗ 近义混淆：你选的 ${esc(e.word)} 是「${esc(meanText(e))}」<small>记为模糊，下次会把两个词放在一起考</small>`;
  const cmpHTML = e => `<div class="dcmp"><span class="tag">对比</span><b data-sayx="${esc(e.word)}">${esc(e.word)}</b>
    <span class="ipa">${esc(ipaOf(e))}</span><button class="spk sm" data-sayx="${esc(e.word)}" title="读">🔊</button>
    <span>${sensesOf(e).map(s => `<span class="pos">${esc(s.pos)}</span>${meanHTML(s.mean)}`).join("　")}</span></div>`;
  const reinsert = x => D.queue.splice(Math.min(D.queue.length, 3 + Math.floor(Math.random() * 3)), 0, x);
  function record(x, r, kind, hold = false) {        // hold：混淆，站数不变、2 天后再来
    const key = cardKey(x), c = Sync.get(key, 0);
    if (!c) return;                                  // 没记为学过的词：评分不排复习
    const t = T();
    bump(r, SRS.isDue(c, t));
    Sync.set(key, SRS.rate(c, r, t, {type: KIND_NO[kind], key: x.word, exam: S.examDate, hold}));
    x.card = Sync.get(key);
  }
  /* 学新词过关：记 p = 今天；错过 2 次的先在 h 记一个 f（明天显示生疏、优先出），错满 3 次进难词本 */
  function learnPass(x, s) {
    const key = cardKey(x), c = Sync.get(key, 0);
    if (!c) return;
    const u = {...c, p: T()};
    if (s.err >= 2 && !c.n) { u.h = ((c.h || "") + "f").slice(-6); u.v = 0; }   // 这个 f 不算复习过
    if (s.err >= 3) u.r = "f";
    Sync.set(key, u); x.card = u;
  }
  function bump(r, wasDue) {
    const d = T(), lg = {...logOf(d)};
    lg[r] = (lg[r] || 0) + 1; if (wasDue) lg.dv = (lg.dv || 0) + 1;
    Sync.set("log:" + d, lg);
  }
  function endDrill() {
    const {g, m, f} = D.res;
    if (D.learn) {
      const missed = D.items.filter(x => (D.st.get(x.word) || {}).err);
      view().innerHTML = `<div class="drill end"><h1>今天的新词全部过关 🎉</h1>
        <div class="tally"><span>过关 <b>${D.passed}</b></span><span class="g">一次就过 <b>${D.items.filter(x => !(D.st.get(x.word) || {}).err && !(D.chopped && D.chopped.has(x.word))).length}</b></span><span class="f">错过才过 <b>${missed.length}</b></span>${D.res.z ? `<span>斩 <b>${D.res.z}</b></span>` : ""}</div>
        ${missed.length ? `<p class="note">错过的：${missed.map(x => esc(x.word)).join("、")}${missed.some(x => D.st.get(x.word).err >= 2) ? "（错 2 次以上的明天早上标红、优先出）" : ""}</p>` : ""}
        <p class="note">明天早上照常复习这些词。</p>
        <div class="ops">${btn("#/", "回首页", 'variant="brand"')} ${btn("#/list/today", "浏览今天的词")}</div></div>`;
      return;
    }
    const again = D.items.filter(x => ["f", "m"].includes(D.rated.get(x.word)));
    const more = D.sc === "due" ? Math.min(dueAll().length, capLeft()) : 0;
    view().innerHTML = `<div class="drill end"><h1>这一轮结束 🎉</h1>
      <div class="tally"><span class="g">记得 <b>${g}</b></span><span class="m">模糊 <b>${m}</b></span><span class="f">忘了 <b>${f}</b></span>${D.res.z ? `<span>斩 <b>${D.res.z}</b></span>` : ""}</div>
      <p class="note">${D.items.some(x => x.card) ? "成绩按每个词第一遍算：忘了的已经当场滚到答对，明天早上还会再出现；模糊的照常往后排，只是题型先不升级；选了易混词的过两天再来。" : ""}${D.items.some(x => !x.card) ? "这一轮有还没记为学过的词，它们的评分不排复习；学了以后在「学习记录」里勾上。" : ""}</p>
      <div class="ops">${more ? `<wa-button variant="brand" id="nextRound">再来一轮（还有 ${more} 个到期）</wa-button>` : ""}
        ${again.length ? `<wa-button ${more ? 'appearance="filled"' : 'variant="brand"'} id="redo">再过一遍忘了 / 模糊的（${again.length}）</wa-button>` : ""}
        ${btn("#/", "回首页")} ${btn("#/drill", "换个范围")}</div></div>`;
    D.again = again;
  }

  /* ---------- 周总结 ---------- */
  async function renderWeek(mon) {
    const t = T();
    mon = mon ? SRS.monday(mon) : SRS.monday(t);
    const end = SRS.add(mon, 6), days = weekCounts(mon);
    setHead("周总结");
    const marks = learnMarks().filter(([, d]) => d >= mon && d <= end);
    const byDay = {};
    for (const [k, d] of marks) { const [lid, g] = k.split(":g"); (byDay[d] = byDay[d] || []).push({lid, g: +g, info: groupInfo(lid, +g)}); }
    const tot = days.reduce((a, x) => ({learned: a.learned + x.learned, vocab: a.vocab + x.vocab.length, g: a.g + logOf(x.d).g, m: a.m + logOf(x.d).m, f: a.f + logOf(x.d).f}), {learned: 0, vocab: 0, g: 0, m: 0, f: 0});
    const rv = tot.g + tot.m + tot.f, pct = n => rv ? Math.round(n / rv * 100) : 0;
    const weekCards = inLearnRange(mon, end);
    const worst = weekCards.filter(x => x.card.l || x.card.r === "f" || x.card.r === "m")
      .sort((a, b) => (b.card.l || 0) - (a.card.l || 0) || (a.card.r === "f" ? -1 : 1)).slice(0, 20);
    const fc = [];
    if (mon === SRS.monday(t)) {                          // 只给本周预告下周
      const live = liveCards();
      for (let i = 1; i <= 7; i++) { const d = SRS.add(t, i); fc.push({d, n: live.filter(x => (i === 1 ? x.card.d <= d : x.card.d === d)).length}); }
    }
    const maxF = Math.max(1, ...fc.map(x => x.n));
    view().innerHTML = `<div class="weekv">
      <div class="vh"><a class="nav" href="#/week/${SRS.add(mon, -7)}">← 上一周</a><h1>${md(mon)}–${md(end)}</h1>
        ${mon < SRS.monday(t) ? `<a class="nav" href="#/week/${SRS.add(mon, 7)}">下一周 →</a>` : `<span class="nav"></span>`}</div>
      <div class="kpis"><div><b>${tot.learned + tot.vocab}</b><small>新学词${tot.vocab ? `（含生词 ${tot.vocab}）` : ""}</small></div><div><b>${marks.length}</b><small>词群</small></div><div><b>${rv}</b><small>复习次数</small></div>
        <div><b>${pct(tot.g)}%</b><small>记得</small></div></div>
      ${rv ? `<div class="ratebar"><span class="g" style="width:${pct(tot.g)}%"></span><span class="m" style="width:${pct(tot.m)}%"></span><span class="f" style="width:${pct(tot.f)}%"></span></div>
        <p class="note">记得 ${tot.g} · 模糊 ${tot.m} · 忘了 ${tot.f}</p>` : ""}
      <div class="ops">${btn(`#/drill/${encodeURIComponent("w2:" + mon)}`, "开始周复习（本周 + 上周）", 'variant="brand"')} ${btn(`#/list/${encodeURIComponent("w:" + mon)}`, "浏览本周的词")}</div>
      <section class="panel"><h2>每天学了什么</h2>${days.map((x, i) => `<div class="drow${x.d === t ? " now" : ""}"><span class="dd">周${WEEK[(i + 1) % 7]} ${md(x.d)}</span>
        <span class="dg">${(byDay[x.d] || []).map(g => `<a href="#/${g.lid}/g${g.g}">${lesTitle(g.lid)} · ${g.g} ${esc(g.info ? g.info.title : "")}</a>`).join("")}${x.vocab.length ? `<span class="dv">生词：${x.vocab.map(esc).join("、")}</span>` : ""}${(byDay[x.d] || x.vocab.length) ? "" : `<small>${x.d > t ? "" : i === 6 ? "复习日" : "没记录"}</small>`}</span>
        <span class="dn">${x.learned ? x.learned + " 词" : ""}${x.vocab.length ? `${x.learned ? " + " : ""}生词 ${x.vocab.length}` : ""}${x.reviewed ? ` · 复 ${x.reviewed}` : ""}</span></div>`).join("")}</section>
      <section class="panel"><h2>本周最常忘的词</h2>${worst.length ? `<div class="worst">${worst.map(x => `<span data-w="${esc(x.word)}">${esc(x.word)}${x.card.l ? ` <small>✗${x.card.l}</small>` : ""}</span>`).join("")}</div>
        ${btn(`#/list/hard`, "打开难词本")}` : `<p class="note">还没有忘过的词</p>`}</section>
      ${fc.length ? `<section class="panel"><h2>接下来 7 天要复习</h2><div class="fc">${fc.map(x => `<div><span class="bar" style="height:${Math.round(x.n / maxF * 60) + 2}px"></span><b>${x.n}</b><small>${WEEK[SRS.dow(x.d)]}</small></div>`).join("")}</div>
        <p class="note">明天那一格包括之前拖下来没做的；每天最多做 ${cap()} 个</p></section>` : ""}</div>`;
  }

  /* ---------- 路由入口：#/、#/drill[/范围]、#/list/范围、#/week[/周一]、#/log[/课id] ---------- */
  function isStudy(h) { return h === "" || h === "#" || h === "#/" || /^#\/(drill|list|week|log)(\/|$)/.test(h); }
  /* y：回到这个页面时接着上次滚到的位置（app.js 按地址记），新打开为 0 */
  async function render(h, y = 0) {
    const m = h.match(/^#\/(drill|list|week|log)(?:\/(.+))?$/);
    if (!m || m[1] !== "log") W = null;   // 离开记录页，没保存的勾选作废
    if (!m) { D = null; renderHome(); scrollBack(y, h); return; }
    const arg = m[2] && decodeURIComponent(m[2]);
    if (m[1] === "log") { D = null; renderLog(arg); if (!arg || y) scrollBack(y, h); return; }
    if (m[1] === "drill") { if (!arg) { D = null; renderPicker(); } else { y = 0; if (!D || D.hash !== h) startDrill(arg); else if (D.q) showCard(); else endDrill(); } }
    else if (m[1] === "list") { D = null; await renderList(arg); }
    else { D = null; await renderWeek(arg); }
    scrollBack(y, h);   // 加载期间又去了别的页就不动
  }
  /* 别的设备同步过来新数据：首页、周总结重画；正在巩固的不打断 */
  function refresh() {
    const h = location.hash;
    if (/^#\/drill\/./.test(h)) return;
    if (/^#\/(list|log)/.test(h)) return;              // 浏览、记录页不重画，免得滚动位置和没保存的勾选丢掉
    render(h, scrollY);
  }

  /* ---------- 交互 ---------- */
  function drillKey(e) {
    if (!D || !D.q || !/^#\/drill\/./.test(location.hash) || e.ctrlKey || e.metaKey || e.altKey) return;
    const q = D.q;
    if (e.target.id === "spell") {                   // 拼写框：Enter 提交、Esc 不会，其余照常打字
      if (e.key === "Enter") { e.preventDefault(); answer(0, e.target.value); }
      else if (e.key === "Escape") answer(-1, "");
      return;
    }
    if (e.target.closest && e.target.closest("input,select,textarea")) return;
    if (e.key === "ArrowLeft") { goBack(); return; }
    if (D.back) {                                    // 回看中：只能翻页、听读音
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") { e.preventDefault(); goFwd(); }
      else if (e.key === "r" || e.key === "R") sayWord(curQ().x);
      return;
    }
    if (e.key === "r" || e.key === "R") { sayQ(q); return; }
    if (e.key === "s" || e.key === "S") { chopCur(); return; }
    if (q.kind === "flip") {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!q.flipped) { q.flipped = true; showCard(); } return; }
      if (q.flipped && "123".includes(e.key)) rateFlip({1: "f", 2: "m", 3: "g"}[e.key]);
      return;
    }
    if (q.state === "done") { if (e.key === " " || e.key === "Enter") { e.preventDefault(); next(); } return; }
    if (e.key === "0") { answer(-1); return; }
    if (q.opts && /^[1-9]$/.test(e.key) && +e.key <= q.opts.length) answer(+e.key - 1);
  }
  function onClick(e) {
    const t = e.target, v = view();
    if (D && /^#\/drill\/./.test(location.hash)) {
      const q = D.q, x = q && q.x;
      if (t.closest("#redo")) { startDrill(D.sc, {title: "再过一遍", items: D.again}); return; }
      if (t.closest("#nextRound")) { startDrill("due"); return; }
      if (!q) return;
      if (t.closest("[data-prev]")) { goBack(); return; }
      if (t.closest("[data-fwd]")) { goFwd(); return; }
      if (D.back) {                                  // 回看中：只响应读音和例句
        const px = curQ().x, sx = t.closest("[data-sayx]"), s = t.closest("[data-sent]");
        if (sx) sayWord(px, sx.dataset.sayx); else if (s) saySent(px, /slow/.test(s.dataset.sent), s.dataset.sent.startsWith("src")); else if (t.closest("[data-say]")) sayWord(px);
        return;
      }
      if (q.kind === "flip" && (t.closest("[data-flip]") || (!q.flipped && t.closest(".dcard") && !t.closest("[data-say]")))) { q.flipped = true; showCard(); return; }
      const sx = t.closest("[data-sayx]"); if (sx) { sayWord(x, sx.dataset.sayx); return; }
      const s = t.closest("[data-sent]"); if (s) { const v = s.dataset.sent; saySent(x, /slow/.test(v), v.startsWith("src")); return; }
      if (t.closest("[data-say]")) { sayQ(q); return; }
      const r = t.closest("[data-rate]"); if (r) { rateFlip(r.dataset.rate); return; }
      if (t.closest("[data-chop]")) { chopCur(); return; }
      const op = t.closest("[data-opt]"); if (op && q.state === "ask") { answer(+op.dataset.opt, ""); return; }
      if (t.closest("[data-spell]")) { answer(0, ($("#spell") || {}).value); return; }
      if (t.closest("[data-next]")) { next(); return; }
    }
    const ld = t.closest("[data-lday]"); if (ld && W) { W.day = ld.dataset.lday; $$("[data-lday]", v).forEach(b => b.classList.toggle("on", b === ld)); return; }
    if (t.closest("#logSave") && W) {
      const {add, del} = logDiff();
      if (!add.length && !del.length) return;
      if (del.length && !confirm(`取消 ${del.length} 个词群的学习记录？这些词的复习进度也会删掉。`)) return;
      const day = W.day === "today" ? T() : SRS.add(T(), -1), label = W.day === "today" ? "今天" : "昨天";
      saveMarks([...add.map(k => [k, true]), ...del.map(k => [k, false])], day).then(() => {
        toast(add.length ? `已记为${label}学的：${add.length} 个词群${del.length ? `，取消 ${del.length} 个` : ""}` : `已取消 ${del.length} 个词群`);
        const y = scrollY; W = null; renderLog(); scrollTo(0, y);
      }).catch(err => toast("保存失败：" + err.message));
      return;
    }
    const o = t.closest("[data-order]"); if (o) { setS("drillOrder", o.dataset.order); renderPicker(); return; }
    const dm = t.closest("[data-dmode]"); if (dm) { setS("drillMode", dm.dataset.dmode); renderPicker(); return; }
    if (t.closest("#listHide")) { store.set("listHide", !store.get("listHide", false)); renderList(decodeURIComponent(location.hash.split("/")[2])); return; }
    if (t.closest("#listFold")) { store.set("listFold", !store.get("listFold", false)); renderList(decodeURIComponent(location.hash.split("/")[2])); return; }
    const vd = t.closest("[data-vdel]");
    if (vd) {
      const w = vd.dataset.vdel;
      if (!confirm(`把「${w}」移出生词本？它的复习进度也会删掉。`)) return;
      removeVocab(w); toast(`已移出 ${w}`);
      const y = scrollY; renderList("vocab").then(() => scrollTo(0, y));
      return;
    }
    const row = t.closest(".lrow");
    if (row && v._items) {
      const x = v._items.find(q => q.word === row.dataset.w);
      if (t.closest("[data-say]")) { x && sayWord(x); return; }
      if (t.closest(".lm")) { t.closest(".lm").classList.toggle("show"); return; }
    }
    const lv = t.closest("#leaveBtn");
    if (lv) {
      const n = parseInt(prompt("往后顺延几天？所有词的复习日期整体后移，相当于这几天请假了。", lv.dataset.gap), 10);
      if (n > 0 && n < 60) { Sync.setMany([...allCards(), ...vocabMarks().map(([word, card]) => ({word, card, vocab: true}))].map(x => [cardKey(x), SRS.shift(x.card, n)])); toast(`已整体顺延 ${n} 天`); renderHome(); }
    }
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === "bookScope" && t.value) location.hash = "#/drill/" + t.value;
    if (t.dataset.g && W) {
      const learned = !!Sync.get("learn:" + t.dataset.g, 0);
      t.checked === learned ? W.want.delete(t.dataset.g) : W.want.set(t.dataset.g, t.checked);
      t.closest(".lrec").classList.toggle("on", t.checked);
      paintLogBar();
    }
  }
  /* 记录页展开别的单元时再读词数（toggle 事件不冒泡，用捕获） */
  function onToggle(e) {
    const d = e.target; if (!d.matches || !d.matches("details.lunit") || !d.open) return;
    const u = BOOK.parts.flatMap(p => p.units).find(x => x.no === +d.dataset.u);
    if (u) fillCounts(u.lessons.filter(l => l.ready).map(l => l.id), paintLogBar);
  }
  document.addEventListener("keydown", drillKey);
  const bind = () => { view().addEventListener("click", onClick); view().addEventListener("change", onChange); view().addEventListener("toggle", onToggle, true); };
  bind();

  return {isStudy, render, refresh, lookupCtx, markGroups, unmarkGroups, learnDate, vocabGet, addVocab, removeVocab, forgetBook};
})();
