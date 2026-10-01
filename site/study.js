/* 背词：首页（门户）、巩固模式、浏览、周总结，以及学习记录和复习卡片的读写。
   复习规则在 srs.js；这里只负责数据进出和页面。依赖 app.js 里的工具（$、esc、S、BOOK、播放等）。

   同步数据（都走 sync.js）：
     learn:<课id>:g<词群号> = 学的日期 YYYY-MM-DD（取消记 0）
     srs:<词> = {a 学习日, s 已过站数, d 到期日, l 忘记次数, r 最近评分, n 复习次数, t 最近复习日,
                k 课id, g 词群号, f 火苗, o 词条序号}（取消记 0）
     log:<日期> = {g, m, f 当天评分次数, dv 当天复习的到期词数} */
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
  const liveCards = () => allCards().filter(x => !known.has(x.word));          // 已会的不出现
  const logOf = d => Sync.get("log:" + d, null) || {g: 0, m: 0, f: 0, dv: 0};
  const groupInfo = (k, g) => {
    for (const p of BOOK.parts) for (const u of p.units) for (const l of u.lessons) if (l.id === k) return l.groups.find(x => x.no === g);
    return null;
  };

  /* 把某课的几个词群记为 date 那天学的：每个主词条建一张卡（已有卡的词不动） */
  function markGroups(les, groupNos, date) {
    const pairs = [];
    for (const g of les.groups) {
      if (!groupNos.includes(g.no)) continue;
      pairs.push([`learn:${les.id}:g${g.no}`, date]);
      for (const e of g.entries) {
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

  /* 某个范围里的卡：按词群的学习日期筛（忘了重来不改词群日期，所以「今天学的」不会混进旧词） */
  function inLearnRange(from, to) {
    const ok = new Set(learnMarks().filter(([, d]) => d >= from && d <= to).map(([k]) => k));
    return liveCards().filter(x => ok.has(`${x.card.k}:g${x.card.g}`));
  }
  const cap = () => +S.dailyCap || 120;
  const capLeft = () => Math.max(0, cap() - (logOf(T()).dv || 0));
  const dueAll = () => SRS.dueList(liveCards(), T());

  /* 范围：due 今天到期 / today / yesterday / week 本周 / lastweek / weeks 本周+上周 / hard / all /
     w:<周一> 那一周 / w2:<周一> 那一周+前一周 / uNN 某单元 / uNN-lNN 某课 */
  function scopeInfo(sc) {
    const t = T(), mon = SRS.monday(t);
    let m;
    if (sc === "due") return {title: "今天到期", items: () => dueAll().slice(0, capLeft())};
    if (sc === "today") return {title: "今天学的", items: () => inLearnRange(t, t)};
    if (sc === "yesterday") { const y = SRS.add(t, -1); return {title: "昨天学的", items: () => inLearnRange(y, y)}; }
    if (sc === "week") return {title: "本周学的", items: () => inLearnRange(mon, SRS.add(mon, 6))};
    if (sc === "lastweek") return {title: "上周学的", items: () => inLearnRange(SRS.add(mon, -7), SRS.add(mon, -1))};
    if (sc === "weeks") return {title: "本周 + 上周", items: () => inLearnRange(SRS.add(mon, -7), SRS.add(mon, 6))};
    if (sc === "hard") return {title: "难词本", items: () => liveCards().filter(x => SRS.isHard(x.card))};
    if (sc === "all") return {title: "全部已学", items: () => liveCards()};
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
    ]).then(([les, aud]) => {
      const by = new Map();
      for (const g of les.groups) for (const e of g.entries) if (!by.has(e.word)) by.set(e.word, {e, g});
      return {les, aud, by};
    }));
    return cache.get(id);
  }
  /* 卡片列表 → 带上书上的词条内容 */
  async function resolve(items) {
    const ids = [...new Set(items.map(x => x.card.k))];
    const ls = Object.fromEntries(await Promise.all(ids.map(async id => [id, await getLesson(id)])));
    return items.map(x => { const L2 = ls[x.card.k], hit = L2.by.get(x.word); return hit && {...x, lid: x.card.k, e: hit.e, grp: hit.g, aud: L2.aud}; }).filter(Boolean);
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
        const c = Sync.get("srs:" + e.word, 0);
        out.push({word: e.word, card: c || null, freq: e.freq, order: (+u) * 1e6 + L2.les.lesson * 1e4 + g.no * 100 + e.no, lid: id, e, grp: g, aud: L2.aud});
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
  function sayWord(x) {
    const key = pickVoice(x.aud.w[x.word] || x.aud.w[x.word.toLowerCase()]);
    key ? playFile(key, null, rate(), x.aud) : speakTTS(x.word, "en");
  }
  function saySent(x, slow) {
    const rec = pickVoice(x.aud.s[x.e.ex.en]);
    rec ? playFile(rec.f, null, slow ? 0.75 : rate(), x.aud) : speakTTS(x.e.ex.en, "en");
  }

  /* ---------- 公共片段 ---------- */
  const view = () => $("#studyView");
  const senseHTML = e => e.prons.map(p => p.senses.map((s, i) =>
    `<div class="dsense">${e.prons.length > 1 && i === 0 ? `<span class="ipa">${esc(p.ipa)}</span>` : ""}<span class="pos">${esc(s.pos)}</span>${meanHTML(s.mean)}</div>`).join("")).join("");
  const ipaOf = e => e.prons.map(p => p.ipa).join(" ");
  const fl = n => `<span class="fl" title="考频 ${n}/3">${"🔥".repeat(n)}</span>`;
  const btn = (href, text, attrs = 'appearance="filled"') => `<wa-button size="small" href="${href}" ${attrs}>${text}</wa-button>`;   // 默认浅底，主按钮传 variant="brand"
  function setHead(title) { $("#crumb").textContent = title; document.title = title + " · 四级词汇"; }

  /* ---------- 首页：一个个板块，按顺序画；以后加功能就往 MODULES 里加一项 ---------- */
  function streak() {
    const days = new Set(Sync.entries("log:").filter(([, v]) => v && (v.g + v.m + v.f) > 0).map(([d]) => d));
    for (const [, d] of learnMarks()) days.add(d);
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
    const t = T(), wd = SRS.dow(t), weekend = wd === 6 || wd === 0;
    const due = dueAll().length, left = capLeft(), lg = logOf(t);
    const todays = inLearnRange(t, t), groups = learnMarks().filter(([, d]) => d === t).length;
    const ready = BOOK.parts.flatMap(p => p.units.flatMap(u => u.lessons)).filter(l => l.ready);
    const last = ready.some(l => l.id === store.get("last")) ? store.get("last") : ready[0] && ready[0].id, lastL = last && last.match(/u(\d+)-l(\d+)/);
    const nightDone = todays.length && todays.every(x => x.card.t === t);
    const step = (done, n, title, desc, action) => `<li class="${done ? "done" : ""}"><span class="dot">${done ? "✓" : n}</span>
      <div class="sd"><b>${title}</b><small>${desc}</small></div>${action || ""}</li>`;
    const s1 = step(!due || !left, 1, weekend ? "周末复习" : "早上复习",
      !due ? (lg.dv ? `今天复习了 ${lg.dv} 个，全部清完` : "今天没有到期的词")
        : !left ? `今天已做满 ${cap()} 个，剩下 ${due} 个排到后面几天`
        : `到期 ${due} 个${due > left ? ` · 今天先做 ${left} 个（上限 ${cap()}）` : ""}`,
      due && left ? btn("#/drill/due", "开始", 'variant="brand"') : "");
    const s2 = weekend
      ? step(false, 2, "周总结", "看看这周学了什么、哪些词老忘", btn("#/week", "打开"))
      : step(groups > 0, 2, "学新", groups ? `今天记了 ${groups} 个词群 · ${todays.length} 词，还能接着追加` : "看完视频和课件，记下今天学了哪几个词群",
        (lastL ? btn(`#/${last}`, `继续 U${+lastL[1]} L${+lastL[2]}`) : "") + (last ? btn(`#/${last}/learn`, "记录", 'variant="brand" appearance="outlined"') : ""));
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
    return Array.from({length: 7}, (_, i) => { const d = SRS.add(mon, i), lg = logOf(d); return {d, learned: learned[d] || 0, reviewed: lg.g + lg.m + lg.f}; });
  }
  function modWeek() {
    const t = T(), days = weekCounts(SRS.monday(t));
    const cell = (x, i) => `<a class="day${x.d === t ? " now" : ""}${i >= 5 ? " we" : ""}" href="#/week">
      <span class="wd">${WEEK[(i + 1) % 7]}</span><b>${x.learned || (x.d > t ? "" : "·")}</b><small>${x.reviewed ? "复 " + x.reviewed : i >= 5 ? "复习" : ""}</small></a>`;
    const sum = days.reduce((a, x) => a + x.learned, 0);
    return `<wa-card class="mod"><div slot="header" class="mh"><b>本周</b><span class="sub">新学 ${sum} 词</span><a href="#/week">周总结 →</a></div>
      <div class="weekstrip">${days.map(cell).join("")}</div><p class="note">格子里的数字是那天新学的词数，下面是复习次数；周六日是复习日</p></wa-card>`;
  }
  function modLinks() {
    const hard = liveCards().filter(x => SRS.isHard(x.card)).length;
    return `<div class="mod links">
      <a href="#/week" class="lk"><b>📅 周总结</b><small>本周学了什么、状态如何</small></a>
      <a href="#/list/hard" class="lk"><b>📕 难词本 ${hard ? `<wa-badge pill variant="danger">${hard}</wa-badge>` : ""}</b><small>最近忘了、模糊或老忘的词</small></a>
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
  const MODULES = [modHero, modToday, modBacklog, modWeek, modLinks, modUnits];

  function renderHome() {
    setHead("首页");
    view().innerHTML = `<div class="home">${MODULES.map(f => f()).join("")}</div>`;
  }

  /* ---------- 浏览（途中看）：紧凑列表，可遮住释义 ---------- */
  async function renderList(sc) {
    const info = scopeInfo(sc);
    if (!info) { location.hash = "#/"; return; }
    setHead(info.title);
    view().innerHTML = `<p class="empty">加载中…</p>`;
    const items = sortBy(await itemsOf(sc), "course");
    const hide = !!store.get("listHide", false);
    let lastG = "";
    const rows = items.map(x => {
      const gk = `${x.lid}:${x.grp.no}`, head = gk !== lastG ? `<div class="lgh">${lesTitle(x.lid)} · 词以群记 ${x.grp.no} ${esc(x.grp.title)}</div>` : "";
      lastG = gk;
      return `${head}<div class="lrow" data-w="${esc(x.word)}"><span class="lw" data-say="1">${esc(x.word)}</span><span class="ipa">${esc(ipaOf(x.e))}</span>${fl(x.freq)}
        ${x.card && x.card.l ? `<span class="lapse" title="忘过 ${x.card.l} 次">✗${x.card.l}</span>` : ""}
        <div class="lm">${x.e.prons.flatMap(p => p.senses).map(s => `<span class="pos">${esc(s.pos)}</span>${meanHTML(s.mean)}`).join("　")}</div></div>`;
    }).join("");
    view().innerHTML = `<div class="listv${hide ? " hide" : ""}">
      <div class="vh"><h1>${esc(info.title)} <small>${items.length} 词</small></h1>
        <div class="ops"><wa-button size="small" id="listHide">${hide ? "显示释义" : "遮住释义"}</wa-button>
        ${items.length ? btn(`#/drill/${encodeURIComponent(sc)}`, "巩固模式过一遍", 'variant="brand"') : ""}</div></div>
      ${hide ? `<p class="note">点单词读音，点释义的位置显示释义</p>` : `<p class="note">点单词读音</p>`}
      ${rows || `<p class="empty">这里还没有词。${sc === "today" ? "在课文页点「记录今天学了什么」勾选词群。" : ""}</p>`}</div>`;
    view()._items = items;
  }

  /* ---------- 巩固模式 ---------- */
  let D = null;   // 当前这一轮
  const ORDERS = [["course", "课件顺序"], ["alpha", "字母顺序"], ["freq", "重要性"], ["random", "随机"]];
  function renderPicker() {
    setHead("巩固模式");
    const t = T(), mon = SRS.monday(t);
    const n = sc => scopeInfo(sc).items().length;
    const scopes = [["due", "今天到期", Math.min(dueAll().length, capLeft())], ["today", "今天学的"], ["yesterday", "昨天学的"], ["week", "本周学的"],
      ["lastweek", "上周学的"], ["weeks", "本周 + 上周"], ["hard", "难词本"], ["all", "全部已学"]];
    const units = BOOK.parts.flatMap(p => p.units);
    view().innerHTML = `<div class="picker">
      <h1>巩固模式</h1><p class="note">看英文，心里想意思，翻开对答案，再给自己打分。打分决定这个词下次什么时候出现。</p>
      <section class="panel"><h2>抽查顺序</h2>
        <div class="seg">${ORDERS.map(([v, l]) => `<button data-order="${v}" class="${S.drillOrder === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <p class="note">建议：当天、次日用课件顺序（借词群联系）；周末、二刷用字母或随机（去掉提示，检验真记住）；冲刺用重要性（🔥🔥🔥 → 🔥）</p></section>
      <section class="panel"><h2>抽哪些词</h2><div class="scopes">
        ${scopes.map(([v, l, c]) => { const k = c ?? n(v); return `<a class="sc${k ? "" : " off"}" href="#/drill/${v}"><b>${l}</b><small>${k} 词</small></a>`; }).join("")}</div>
        <div class="row"><span><b>按书上的范围</b><small>还没记为学过的词也能抽，但不排复习</small></span>
          <select id="bookScope"><option value="">选单元或课…</option>${units.map(u => `<option value="u${pad2(u.no)}">Unit ${u.no}</option>` +
            u.lessons.filter(l => l.ready).map(l => `<option value="${l.id}">　Unit ${u.no} · Lesson ${l.no}</option>`).join("")).join("")}</select></div></section></div>`;
  }

  async function startDrill(sc, preset) {
    const info = preset ? {title: preset.title} : scopeInfo(sc);
    if (!info) { location.hash = "#/drill"; return; }
    setHead("巩固 · " + info.title);
    view().innerHTML = `<p class="empty">加载中…</p>`;
    const items = preset ? preset.items : sortBy(await itemsOf(sc), S.drillOrder);
    D = {sc, title: info.title, items, queue: items.slice(), flipped: false, rated: new Map(), res: {g: 0, m: 0, f: 0, k: 0}, hash: location.hash};
    if (!items.length) { view().innerHTML = `<div class="drill"><p class="empty">「${esc(info.title)}」里没有要抽的词。</p><p class="empty">${btn("#/", "回首页")} ${btn("#/drill", "换个范围")}</p></div>`; return; }
    showCard();
  }
  function showCard() {
    if (!D.queue.length) { endDrill(); return; }
    const x = D.queue[0], done = D.items.length - new Set(D.queue.map(q => q.word)).size, retry = D.rated.has(x.word);
    const c = x.card;
    view().innerHTML = `<div class="drill${D.flipped ? " flipped" : ""}">
      <div class="dbar"><span>${esc(D.title)}</span><wa-progress-bar value="${Math.round(done / D.items.length * 100)}"></wa-progress-bar>
        <span>${done}/${D.items.length}</span><a href="#/" class="dx" title="结束">✕</a></div>
      <div class="dcard">
        <div class="dmeta">${lesTitle(x.lid)} · 词群 ${x.grp.no} ${esc(x.grp.title)}${retry ? ` · <b class="again">再来一次</b>` : ""}${c ? "" : " · 未记为学过"}</div>
        <div class="dword" data-say="1">${esc(x.word)}</div>
        <div class="dipa"><span class="ipa">${esc(ipaOf(x.e))}</span> <button class="spk" data-say="1" title="读（R）">🔊</button> ${fl(x.freq)}</div>
        ${D.flipped ? `<div class="dback">${senseHTML(x.e)}
          ${x.e.tip ? `<div class="tip"><span class="tag ${esc(x.e.tip.type)}">${esc(x.e.tip.type)}</span>${esc(x.e.tip.text)}</div>` : ""}
          ${x.e.ex ? `<div class="ex${x.e.ex.type === "真" ? " zt" : ""}"><div class="exlab">${x.e.ex.type === "真" ? `真题 ${x.e.ex.year}` : "例句"}</div>
            <div class="sent">${sentenceHTML(x.e.ex.en, x.e.ex.key)}</div><div class="dzh">${esc(x.e.ex.zh)}</div>
            <div class="ops"><button data-sent="1">▶ 例句</button><button data-sent="slow">🐢 慢速</button></div></div>` : ""}</div>` : ""}
      </div>
      <div class="dops">${D.flipped
        ? `<wa-button variant="danger" data-rate="f">忘了 <kbd>1</kbd></wa-button><wa-button variant="warning" data-rate="m">模糊 <kbd>2</kbd></wa-button>
           <wa-button variant="success" data-rate="g">记得 <kbd>3</kbd></wa-button><wa-button appearance="outlined" data-rate="k" title="标为已会，以后不再出现">已会 <kbd>4</kbd></wa-button>`
        : `<wa-button variant="brand" class="flip" data-flip="1">想好了，翻开看 <kbd>空格</kbd></wa-button>`}</div></div>`;
    if (!D.flipped && S.autoSay) sayWord(x);
  }
  function bump(r, wasDue) {
    const d = T(), lg = {...logOf(d)};
    lg[r] = (lg[r] || 0) + 1; if (wasDue) lg.dv = (lg.dv || 0) + 1;
    Sync.set("log:" + d, lg);
  }
  function rateCur(r) {
    const x = D.queue.shift();
    if (r === "k") {
      setKnown(x.word, true); D.res.k++;
      D.queue = D.queue.filter(q => q.word !== x.word);
    } else {
      if (!D.rated.has(x.word)) {                         // 每个词只有这一轮的第一次评分算数
        D.rated.set(x.word, r); D.res[r]++;
        const c = Sync.get("srs:" + x.word, 0);
        if (c) { const t = T(); bump(r, SRS.isDue(c, t)); Sync.set("srs:" + x.word, SRS.rate(c, r, t)); x.card = Sync.get("srs:" + x.word); }
      }
      if (r === "f") D.queue.push(x);                     // 忘了的排到这一轮末尾，直到记得为止
    }
    D.flipped = false;
    showCard();
  }
  function endDrill() {
    const again = D.items.filter(x => ["f", "m"].includes(D.rated.get(x.word)));
    const {g, m, f, k} = D.res;
    view().innerHTML = `<div class="drill end"><h1>这一轮结束 🎉</h1>
      <div class="tally"><span class="g">记得 <b>${g}</b></span><span class="m">模糊 <b>${m}</b></span><span class="f">忘了 <b>${f}</b></span>${k ? `<span>已会 <b>${k}</b></span>` : ""}</div>
      <p class="note">忘了的词已经当场滚到记住为止，明天早上还会再出现；模糊的 2 天后再来。</p>
      <div class="ops">${again.length ? `<wa-button variant="brand" id="redo">再过一遍忘了 / 模糊的（${again.length}）</wa-button>` : ""}
        ${btn("#/", "回首页")} ${btn("#/drill", "换个范围")}</div></div>`;
    D.again = again;
  }

  /* ---------- 周总结 ---------- */
  async function renderWeek(mon) {
    const t = T();
    mon = mon ? SRS.monday(mon) : SRS.monday(t);
    const end = SRS.add(mon, 6), days = weekCounts(mon);
    setHead(`周总结 ${md(mon)}–${md(end)}`);
    const marks = learnMarks().filter(([, d]) => d >= mon && d <= end);
    const byDay = {};
    for (const [k, d] of marks) { const [lid, g] = k.split(":g"); (byDay[d] = byDay[d] || []).push({lid, g: +g, info: groupInfo(lid, +g)}); }
    const tot = days.reduce((a, x) => ({learned: a.learned + x.learned, g: a.g + logOf(x.d).g, m: a.m + logOf(x.d).m, f: a.f + logOf(x.d).f}), {learned: 0, g: 0, m: 0, f: 0});
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
      <div class="kpis"><div><b>${tot.learned}</b><small>新学词</small></div><div><b>${marks.length}</b><small>词群</small></div><div><b>${rv}</b><small>复习次数</small></div>
        <div><b>${pct(tot.g)}%</b><small>记得</small></div></div>
      ${rv ? `<div class="ratebar"><span class="g" style="width:${pct(tot.g)}%"></span><span class="m" style="width:${pct(tot.m)}%"></span><span class="f" style="width:${pct(tot.f)}%"></span></div>
        <p class="note">记得 ${tot.g} · 模糊 ${tot.m} · 忘了 ${tot.f}</p>` : ""}
      <div class="ops">${btn(`#/drill/${encodeURIComponent("w2:" + mon)}`, "开始周复习（本周 + 上周）", 'variant="brand"')} ${btn(`#/list/${encodeURIComponent("w:" + mon)}`, "浏览本周的词")}</div>
      <section class="panel"><h2>每天学了什么</h2>${days.map((x, i) => `<div class="drow${x.d === t ? " now" : ""}"><span class="dd">周${WEEK[(i + 1) % 7]} ${md(x.d)}</span>
        <span class="dg">${(byDay[x.d] || []).map(g => `<a href="#/${g.lid}/g${g.g}">${lesTitle(g.lid)} · ${g.g} ${esc(g.info ? g.info.title : "")}</a>`).join("") || `<small>${x.d > t ? "" : i >= 5 ? "复习日" : "没记录"}</small>`}</span>
        <span class="dn">${x.learned ? x.learned + " 词" : ""}${x.reviewed ? ` · 复 ${x.reviewed}` : ""}</span></div>`).join("")}</section>
      <section class="panel"><h2>本周最常忘的词</h2>${worst.length ? `<div class="worst">${worst.map(x => `<span data-w="${esc(x.word)}">${esc(x.word)}${x.card.l ? ` <small>✗${x.card.l}</small>` : ""}</span>`).join("")}</div>
        ${btn(`#/list/hard`, "打开难词本")}` : `<p class="note">还没有忘过的词</p>`}</section>
      ${fc.length ? `<section class="panel"><h2>接下来 7 天要复习</h2><div class="fc">${fc.map(x => `<div><span class="bar" style="height:${Math.round(x.n / maxF * 60) + 2}px"></span><b>${x.n}</b><small>${WEEK[SRS.dow(x.d)]}</small></div>`).join("")}</div>
        <p class="note">明天那一格包括之前拖下来没做的；每天最多做 ${cap()} 个</p></section>` : ""}</div>`;
  }

  /* ---------- 路由入口：#/、#/drill[/范围]、#/list/范围、#/week[/周一] ---------- */
  function isStudy(h) { return h === "" || h === "#" || h === "#/" || /^#\/(drill|list|week)(\/|$)/.test(h); }
  function render(h) {
    const m = h.match(/^#\/(drill|list|week)(?:\/(.+))?$/);
    if (!m) { D = null; renderHome(); return; }
    const arg = m[2] && decodeURIComponent(m[2]);
    if (m[1] === "drill") { if (!arg) { D = null; renderPicker(); } else if (!D || D.hash !== h) startDrill(arg); else showCard(); }
    else if (m[1] === "list") { D = null; renderList(arg); }
    else { D = null; renderWeek(arg); }
    scrollTo(0, 0);
  }
  /* 别的设备同步过来新数据：首页、周总结重画；正在巩固的不打断 */
  function refresh() {
    const h = location.hash;
    if (/^#\/drill\/./.test(h)) return;
    if (/^#\/list\//.test(h)) return;
    render(h);
  }

  /* ---------- 交互 ---------- */
  function drillKey(e) {
    if (!D || !D.queue.length || !/^#\/drill\/./.test(location.hash) || (e.target.closest && e.target.closest("input,select,textarea"))) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!D.flipped) { D.flipped = true; showCard(); } return; }
    if (e.key === "r" || e.key === "R") { sayWord(D.queue[0]); return; }
    if (D.flipped && "1234".includes(e.key)) rateCur({1: "f", 2: "m", 3: "g", 4: "k"}[e.key]);
  }
  function onClick(e) {
    const t = e.target, v = view();
    if (D && /^#\/drill\/./.test(location.hash)) {
      const x = D.queue[0];
      if (t.closest("[data-flip]") || (!D.flipped && t.closest(".dcard") && !t.closest("[data-say]"))) { D.flipped = true; showCard(); return; }
      if (t.closest("[data-say]") && x) { sayWord(x); return; }
      const s = t.closest("[data-sent]"); if (s && x) { saySent(x, s.dataset.sent === "slow"); return; }
      const r = t.closest("[data-rate]"); if (r) { rateCur(r.dataset.rate); return; }
      if (t.closest("#redo")) { startDrill(D.sc, {title: "再过一遍", items: D.again}); return; }
    }
    const o = t.closest("[data-order]"); if (o) { setS("drillOrder", o.dataset.order); renderPicker(); return; }
    if (t.closest("#listHide")) { store.set("listHide", !store.get("listHide", false)); renderList(decodeURIComponent(location.hash.split("/")[2])); return; }
    const row = t.closest(".lrow");
    if (row && v._items) {
      const x = v._items.find(q => q.word === row.dataset.w);
      if (t.closest("[data-say]")) { x && sayWord(x); return; }
      if (t.closest(".lm")) { t.closest(".lm").classList.toggle("show"); return; }
    }
    const lv = t.closest("#leaveBtn");
    if (lv) {
      const n = parseInt(prompt("往后顺延几天？所有词的复习日期整体后移，相当于这几天请假了。", lv.dataset.gap), 10);
      if (n > 0 && n < 60) { Sync.setMany(allCards().map(x => ["srs:" + x.word, SRS.shift(x.card, n)])); toast(`已整体顺延 ${n} 天`); renderHome(); }
    }
  }
  function onChange(e) {
    if (e.target.id === "bookScope" && e.target.value) location.hash = "#/drill/" + e.target.value;
  }
  document.addEventListener("keydown", drillKey);
  const bind = () => { view().addEventListener("click", onClick); view().addEventListener("change", onChange); };
  bind();

  return {isStudy, render, refresh, markGroups, unmarkGroups, learnDate};
})();
