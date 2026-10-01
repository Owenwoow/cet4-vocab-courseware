/* 四级词汇课件：数据全部来自 data/，本文件只负责渲染和交互 */
"use strict";
const $ = s => document.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));

/* ---------- 存储：读写都走 sync.js（本机优先，连上 GitHub 后自动多端同步） ---------- */
const store = {get: Sync.get, set: Sync.set};
const known = new Set();
function loadKnown() { known.clear(); for (const [w, on] of Sync.entries("known:")) if (on) known.add(w); }
const setKnown = (w, on) => { on ? known.add(w) : known.delete(w); Sync.set("known:" + w, on ? 1 : 0); };
loadKnown();

/* ---------- 设置：集中存放，设置页修改，全站生效 ---------- */
const VOICE_NAMES = {ava: "Ava", andrew: "Andrew", sonia: "Sonia", ryan: "Ryan"};
const VOICE_DESC = {ava: "美式 · 女声", andrew: "美式 · 男声", sonia: "英式 · 女声", ryan: "英式 · 男声"};
const DEFAULTS = {voice: "ava", rate: 1, mask: false, hideKnown: false, scope: "group", withZh: true, loop: false, theme: "auto",
  examDate: "2026-12-12", dailyCap: 120, autoSay: true, drillOrder: "course"};
const S = {...DEFAULTS};
const loadSettings = () => Object.assign(S, DEFAULTS, Object.fromEntries(Sync.entries("set:")));
function setS(k, v) { S[k] = v; Sync.set("set:" + k, v); applySettings(); }
loadSettings();
const darkMQ = matchMedia("(prefers-color-scheme: dark)");
function applySettings() {
  document.body.classList.toggle("mask", S.mask);
  document.body.classList.toggle("hideKnown", S.hideKnown);
  if (S.theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = S.theme;
  /* 组件库 Web Awesome 的深浅色跟着本站主题走 */
  document.documentElement.classList.toggle("wa-dark", S.theme === "dark" || (S.theme === "auto" && darkMQ.matches));
  $("#maskFab").classList.toggle("on", S.mask);
}
darkMQ.addEventListener("change", applySettings);

/* ---------- 状态 ---------- */
let BOOK = null, L = null, GLOSS = {}, AUD = {w: {}, s: {}, z: {}, voices: []};
const WORDMAP = new Map();   // 本课词条/扩展词 → {word, senses, no, ext}
/* no-cache：每次向服务器确认，重新生成数据后不会读到旧缓存 */
const fetchJSON = url => fetch(url, {cache: "no-cache"}).then(r => { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); });

/* ---------- 文本工具 ---------- */
const meanHTML = m => esc(m).replace(/\[\[(.+?)\]\]/g, "<u>$1</u>");
const plainMean = m => m.replace(/\[\[|\]\]/g, "");
const sensesText = ss => ss.map(s => `${s.pos} ${plainMean(s.mean)}`).join("　");

function lemmaCandidates(w) {
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
const findWord = w => { for (const k of lemmaCandidates(w.toLowerCase())) if (WORDMAP.has(k)) return WORDMAP.get(k); return null; };

/* 例句切成可点的单词，重点词（可能是多词短语）加 key 样式 */
function sentenceHTML(en, keys) {
  const hit = new Array(en.length).fill(false);
  for (const k of keys || []) {
    const re = new RegExp("(?<![A-Za-z])" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z])", "gi");
    let m; while ((m = re.exec(en))) for (let i = m.index; i < m.index + m[0].length; i++) hit[i] = true;
  }
  let pos = 0;
  return en.replace(/([A-Za-z']+)|([^A-Za-z']+)/g, (m, w, o) => {
    const start = pos; pos += m.length;
    if (o) return esc(o);
    return `<span class="w${hit[start] ? " key" : ""}">${w}</span>`;
  });
}

/* ---------- 音频：预生成 mp3 优先，缺失时退回浏览器语音 ---------- */
const player = new Audio();
player.preservesPitch = true;
const synth = window.speechSynthesis;
let sysVoice = null;
function pickSysVoice() {
  if (!synth) return;
  const vs = synth.getVoices().filter(v => /^en/i.test(v.lang));
  sysVoice = vs.find(v => /natural|online/i.test(v.name) && /en-US/.test(v.lang)) || vs.find(v => /en-US/.test(v.lang)) || vs[0];
}
if (synth) { pickSysVoice(); synth.onvoiceschanged = pickSysVoice; }
/* 音频放在单独的音频站（清单里的 base）。本地开发（http）用本机 8766 端口的 audio-store，
   这样新生成、还没推送的音频也能直接试听 */
const audioBase = (aud = AUD) => location.protocol === "http:" ? `http://${location.hostname}:8766/` : (aud.base || "data/audio/");
const audioURL = (key, aud) => `${audioBase(aud)}files/${key}.mp3`;
const rate = () => +S.rate;
/* 选中的声音本课没生成时，退回本课第一种 */
const pickVoice = rec => rec && (rec[S.voice] || Object.values(rec)[0]);

function stopAll() { player.pause(); player.ontimeupdate = player.onended = player.onerror = null; synth && synth.cancel(); }
/* aud：用哪一课的音频清单，默认当前课（巩固模式会播别的课的词） */
function playFile(key, onEnd, r = rate(), aud) {
  stopAll();
  player.src = audioURL(key, aud); player.playbackRate = r;
  player.onended = () => onEnd && onEnd();
  player.onerror = () => onEnd && onEnd();
  player.play().catch(() => onEnd && onEnd());
}
function speakTTS(text, lang, onEnd) {
  stopAll();
  if (!synth) { onEnd && onEnd(); return; }
  const u = new SpeechSynthesisUtterance(text);
  if (lang === "en" && sysVoice) { u.voice = sysVoice; u.lang = sysVoice.lang; } else u.lang = lang === "zh" ? "zh-CN" : "en-US";
  u.rate = lang === "en" ? (rate() < 1 ? 0.7 : 0.95) : 1;
  u.onend = u.onerror = () => onEnd && onEnd();
  synth.speak(u);
}
function speak(text, onEnd) {
  const w = AUD.w[text] || AUD.w[text.toLowerCase()];
  const key = pickVoice(w);
  key ? playFile(key, onEnd) : speakTTS(text, "en", onEnd);
}
function speakZh(text, onEnd) {
  const key = AUD.z[text];
  key ? playFile(key, onEnd, 1) : speakTTS(plainMean(text), "zh", onEnd);
}
function playSentence(card, onEnd, r = rate()) {
  const e = entryOf(card), spans = $$(".sent .w", card);
  const clear = () => spans.forEach(s => s.classList.remove("reading"));
  const rec = pickVoice(AUD.s[e.ex.en]);
  if (!rec) { speakTTS(e.ex.en, "en", onEnd); return; }
  /* 语音的逐词时间点按顺序对到句中单词，用于朗读高亮 */
  const norm = x => x.toLowerCase().replace(/[^a-z']/g, "");
  let j = 0;
  const marks = rec.m.map(([t, w]) => {
    let k = j; while (k < spans.length && norm(spans[k].textContent) !== norm(w)) k++;
    if (k < spans.length) j = k + 1;
    return [t, k < spans.length ? k : Math.min(j, spans.length - 1)];
  });
  playFile(rec.f, () => { clear(); onEnd && onEnd(); }, r);
  player.ontimeupdate = () => { const m = marks.filter(m => m[0] <= player.currentTime).pop(); clear(); m && spans[m[1]] && spans[m[1]].classList.add("reading"); };
}

/* ---------- 目录抽屉 ---------- */
function lessonProgress(les) {
  if (!les.ready || les.id !== (L && L.id)) {
    const words = store.get("lw:" + les.id, null);
    if (!words) return "";
    const n = words.filter(w => known.has(w)).length;
    return `<span class="prog${n === words.length ? " done" : ""}">${n}/${words.length}</span>`;
  }
  const words = allEntries().map(e => e.word);
  const n = words.filter(w => known.has(w)).length;
  return `<span class="prog${n === words.length ? " done" : ""}">${n}/${words.length}</span>`;
}
function renderDrawer() {
  let h = `<h2>${esc(BOOK.title)}</h2>`;
  for (const p of BOOK.parts) {
    h += `<div class="part">PART 0${p.no} · ${esc(p.title)}</div>`;
    for (const u of p.units) {
      const cur = L && u.lessons.some(l => l.id === L.id);
      const ready = u.lessons.filter(l => l.ready).length;
      h += `<details${cur ? " open" : ""}><summary>Unit ${u.no}<small>${u.words ? u.words + " 词 · " : ""}${ready}/${u.lessons.length} 课</small></summary>`;
      for (const l of u.lessons) {
        const isCur = L && l.id === L.id;
        h += `<a class="les${isCur ? " cur" : ""}${l.ready ? "" : " off"}" href="#/${l.id}">Lesson ${l.no}` +
             `<span>${l.ready ? lessonProgress(l) : `<span class="prog">p${l.page} · 未生成</span>`}</span></a>`;
        if (isCur) for (const g of l.groups) h += `<a class="grp" href="#/${l.id}/g${g.no}">词以群记 ${g.no} ${esc(g.title)}</a>`;
      }
      h += `</details>`;
    }
  }
  $("#drawer").innerHTML = h;
}
const openDrawer = v => { $("#drawer").classList.toggle("open", v); $("#scrim").classList.toggle("open", v); };
/* 宽屏时侧边栏常驻，☰ 改为收起 / 展开，状态记住；窄屏仍是抽屉 */
const wide = matchMedia("(min-width:1180px)");
const applySide = () => document.body.classList.toggle("sideOff", !!store.get("sideOff", false));
$("#menuBtn").onclick = () => {
  if (!wide.matches) { openDrawer(true); return; }
  store.set("sideOff", !store.get("sideOff", false)); applySide();
};
applySide();
$("#scrim").onclick = () => openDrawer(false);
$("#drawer").addEventListener("click", e => { if (e.target.closest("a")) openDrawer(false); });

/* ---------- 思维导图 ---------- */
function mapHTML(node, root) {
  if (root) return `<div class="mm"><span class="node root">${esc(node.w)}</span>${node.children ? `<ul>${node.children.map(c => mapHTML(c)).join("")}</ul>` : ""}</div>`;
  const hit = WORDMAP.get(node.w);
  const cls = hit ? (hit.ext ? "ext" : "entry") + (!hit.ext && known.has(node.w) ? " known" : "") : "ext";
  return `<li${node.rel ? ` class="has-rel"` : ""}>${node.rel ? `<span class="rel r-${node.rel}">${esc(node.rel)}</span>` : ""}` +
         `<button class="node ${cls}" data-goto="${esc(node.w)}">${esc(node.w)}</button>` +
         `${node.children ? `<ul>${node.children.map(c => mapHTML(c)).join("")}</ul>` : ""}</li>`;
}

/* 手机版导图：单线串联的关系写在同一行（A → 相关 B → 形近 C），只在分叉处换行缩进 */
function nodeChip(node) {
  const hit = WORDMAP.get(node.w);
  const cls = hit ? (hit.ext ? "ext" : "entry") + (!hit.ext && known.has(node.w) ? " known" : "") : "ext";
  return `${node.rel ? `<span class="rel r-${esc(node.rel)}">${esc(node.rel)}</span>` : ""}<button class="node ${cls}" data-goto="${esc(node.w)}">${esc(node.w)}</button>`;
}
function mapCompactLine(node) {
  let h = nodeChip(node), cur = node;
  while (cur.children && cur.children.length === 1) { cur = cur.children[0]; h += `<span class="mseg"><span class="arr">→</span>${nodeChip(cur)}</span>`; }
  const kids = cur.children && cur.children.length > 1 ? `<ul>${cur.children.map(c => `<li>${mapCompactLine(c)}</li>`).join("")}</ul>` : "";
  return `<span class="line">${h}</span>${kids}`;
}
const mapCompact = root => `<ul class="mmc">${(root.children || []).map(c => `<li>${mapCompactLine(c)}</li>`).join("")}</ul>`;

/* ---------- 词卡 ---------- */
const allEntries = () => L.groups.flatMap(g => g.entries);
const entryOf = card => WORDMAP.get(card.dataset.word).entry;
const flames = n => "🔥".repeat(n) + `<i>${"🔥".repeat(3 - n)}</i>`;

function cardHTML(e) {
  const multi = e.prons.length > 1;
  const senses = e.prons.map(p => p.senses.map((s, i) =>
    `<div class="sense">${multi && i === 0 ? `<span class="ipa">${esc(p.ipa)}</span>` : ""}<span class="pos">${esc(s.pos)}</span>${meanHTML(s.mean)}</div>`).join("")).join("");
  const ex = e.ex ? `<div class="ex${e.ex.type === "真" ? " zt" : ""}">
      <div class="exlab">${e.ex.type === "真" ? `真题 ${e.ex.year}` : "例句"}</div>
      <div class="sent">${sentenceHTML(e.ex.en, e.ex.key)}</div>
      <div class="zh">${esc(e.ex.zh)}</div>
      <div class="ops"><button class="play">▶ 播放例句</button><button class="play" data-slow="1">🐢 慢速</button></div>
    </div>` : "";
  const exts = e.ext && e.ext.length ? `<div class="exts">${e.ext.map(x => `<div class="extrow" data-ext="${esc(x.word)}">
      <span class="tag">扩</span><b>${esc(x.word)}</b>${x.alt ? `<span class="ipa">/${esc(x.alt)}</span>` : ""}
      <span class="ipa">${esc(x.ipa)}</span><button class="spk sm" data-say="${esc(x.word)}" title="读">🔊</button>
      <span class="xm">${x.senses.map(s => `<span class="pos">${esc(s.pos)}</span>${meanHTML(s.mean)}`).join("　")}</span></div>`).join("")}</div>` : "";
  return `<article class="card${known.has(e.word) ? " known" : ""}" id="w-${esc(e.word)}" data-word="${esc(e.word)}">
    <div class="head">
      <span class="no">${String(e.no).padStart(2, "0")}</span><span class="word">${esc(e.word)}</span>
      ${e.prons.length === 1 ? `<span class="ipa">${esc(e.prons[0].ipa)}</span>` : ""}
      <button class="spk" data-say="${esc(e.word)}" title="读单词">🔊</button>
      <span class="freq" title="考频 ${e.freq}/3">${flames(e.freq)}</span>
      <button class="knowBtn">${known.has(e.word) ? "✓ 已会" : "标为已会"}</button>
    </div>
    <div class="senses">${senses}</div>
    ${e.tip ? `<div class="tip"><span class="tag ${esc(e.tip.type)}">${esc(e.tip.type)}</span>${esc(e.tip.text)}</div>` : ""}
    ${ex}${exts}
  </article>`;
}

function renderLesson() {
  const [a, b] = L.pages;
  $("#crumb").textContent = `Unit ${L.unit} · Lesson ${L.lesson}`;
  document.title = `U${L.unit} L${L.lesson} · 四级词汇`;
  $("#lessonHead").innerHTML = `<h1>Unit ${L.unit} · Lesson ${L.lesson}</h1>
    <p>${allEntries().length} 词 · ${L.groups.length} 个词群 · 书 p${a}–${b} · <span id="lessonProg"></span></p>
    <div class="chips">${L.groups.map(g => `<a href="#/${L.id}/g${g.no}">词以群记 ${g.no} ${esc(g.title)}</a>`).join("")}</div>
    <a class="pickBtn" href="#/log/${L.id}">📝 学习记录</a>`;
  $("#groups").innerHTML = L.groups.map(g => `<section class="group" id="g${g.no}" data-g="${g.no}">
      <div class="ghead"><span class="gno">词以群记 ${g.no}</span><span class="gtitle">${esc(g.title)}</span><span class="learned" data-learned="${g.no}"></span>
        ${BOOK.hasPages ? `<button class="src-btn" data-pages="${g.pages[0]}-${g.pages[1]}">📖 看原书</button>` : ""}</div>
      <div class="mapbox">${mapHTML(g.map, true)}${mapCompact(g.map)}</div>
      ${g.entries.map(cardHTML).join("")}
    </section>`).join("");
  updateProgress();
  paintLearned();
}

/* ---------- 学习记录：词群标题旁标出哪天学过；勾选在首页「学新」和记录页（study.js） ---------- */
function paintLearned() {
  for (const g of L.groups) {
    const d = Study.learnDate(L.id, g.no), el = $(`[data-learned="${g.no}"]`);
    if (el) { el.textContent = d ? `✓ ${+d.slice(5, 7)}/${+d.slice(8)} 学过` : ""; el.title = d ? `${d} 记为学过` : ""; }
  }
}
function updateProgress() {
  const words = allEntries().map(e => e.word);
  const n = words.filter(w => known.has(w)).length;
  const el = $("#lessonProg"); if (el) el.textContent = `已会 ${n}/${words.length}`;
  store.set("lw:" + L.id, words);
  renderDrawer();
}

/* ---------- 加载一课 ---------- */
async function loadLesson(id) {
  if (L && L.id === id) return;
  stopMarathon();
  const [les, gl, au] = await Promise.all([
    fetchJSON(`data/lessons/${id}.json`),
    fetchJSON(`data/gloss/${id}.json`).catch(() => ({words: {}})),
    fetchJSON(`data/audio/${id}.json`).catch(() => ({w: {}, s: {}, z: {}, m: {}, voices: []})),
  ]);
  L = les; GLOSS = gl.words || {}; AUD = au;
  WORDMAP.clear();
  for (const g of L.groups) for (const e of g.entries) {
    WORDMAP.set(e.word, {word: e.word, senses: e.prons.flatMap(p => p.senses), ipa: e.prons.map(p => p.ipa).join(" "), no: e.no, entry: e, ext: false});
    for (const x of e.ext || []) if (!WORDMAP.has(x.word)) WORDMAP.set(x.word, {word: x.word, senses: x.senses, ipa: x.ipa, no: e.no, entry: e, ext: true});
  }
  renderLesson();
}

/* ---------- 路由：#/ 首页、#/drill…、#/list/…、#/week…（study.js）；#/u07-l01、#/u07-l01/g2、#/u07-l01/w/margin、
   #/u07-l01/learn（旧地址，转到记录页）、#/settings ---------- */
let prevHash = "#/";   // 设置页「返回」回到哪
async function route() {
  const ready = BOOK.parts.flatMap(p => p.units.flatMap(u => u.lessons)).filter(l => l.ready);
  if (!ready.length) { $("#groups").innerHTML = `<p class="empty">还没有生成任何课。</p>`; return; }
  const last = ready.some(l => l.id === store.get("last")) ? store.get("last") : ready[0].id;
  const h = location.hash, isSettings = h === "#/settings", isStudy = !isSettings && Study.isStudy(h);
  if ((isSettings || isStudy) && !$("#lessonView").hidden && L) lessonScroll = {id: L.id, y: scrollY};   // 离开课文前记住读到哪
  if (!isSettings) prevHash = h || "#/";
  $("#lessonView").hidden = isSettings || isStudy; $("#fabs").hidden = isSettings || isStudy;
  $("#settingsView").hidden = !isSettings; $("#studyView").hidden = !isStudy;
  $("#homeBtn").classList.toggle("on", isStudy && !/^#\/(drill|list|week|log)/.test(h));
  $("#setBtn").classList.toggle("on", isSettings); $("#setBtn").title = $("#setBtn").ariaLabel = isSettings ? "返回" : "设置";
  if (isStudy) { stopMarathon(); pop.style.display = "none"; Study.render(h); renderDrawer(); return; }
  if (isSettings) {
    stopMarathon(); pop.style.display = "none";
    if (!L) await loadLesson(last);   // 设置页试听要用到本课音频
    renderSettings(); scrollTo(0, 0);
    $("#crumb").textContent = "设置"; document.title = "设置 · 四级词汇";
    return;
  }
  const m = h.match(/^#\/(u\d\d-l\d\d)(?:\/(g\d+|w\/.+|learn))?$/);
  const id = m && ready.some(l => l.id === m[1]) ? m[1] : last;
  const reuse = L && L.id === id;
  await loadLesson(id);
  store.set("last", id);
  if (reuse) renderLesson();   // 从设置页返回时重画，标题和进度跟上
  const t = m && m[2];
  if (t === "learn") { location.replace("#/log/" + id); return; }
  if (t && t[0] === "g") document.getElementById(t)?.scrollIntoView();
  else if (t) gotoWord(decodeURIComponent(t.slice(2)));
  else if (lessonScroll && lessonScroll.id === id) scrollTo(0, lessonScroll.y);   // 从设置页返回，回到原来的位置
  else restorePos(id);
  lessonScroll = null;
}
let lessonScroll = null;

/* ---------- 阅读位置：滚动停下后记下本课读到哪个词，下次打开（或换设备）接着读 ---------- */
let posReady = false;   // 首次同步完成前不记，免得本机的旧位置盖掉别的设备更新的位置
history.scrollRestoration = "manual";   // 刷新后由 restorePos 定位，不让浏览器自己恢复的滚动位置抢在后面
function restorePos(id) {
  const w = store.get("pos:" + id, "");
  const card = w && document.getElementById("w-" + w);
  card ? card.scrollIntoView({block: "start"}) : scrollTo(0, 0);
}
let posTimer = null;
addEventListener("scroll", () => {
  clearTimeout(posTimer);
  posTimer = setTimeout(() => {
    if (!posReady || !L || $("#lessonView").hidden) return;
    const card = scrollY < 120 ? null : $$(".card").find(c => c.getBoundingClientRect().bottom > 70);   // 顶栏 52px 下第一张露出来的卡
    store.set("pos:" + L.id, card ? card.dataset.word : "", true);
  }, 500);
}, {passive: true});
function gotoWord(w) {
  const hit = WORDMAP.get(w); if (!hit) return;
  const card = document.getElementById("w-" + hit.entry.word);
  const target = hit.ext ? card.querySelector(`[data-ext="${CSS.escape(w)}"]`) || card : card;
  target.scrollIntoView({behavior: "smooth", block: "center"});
  card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1400);
}

/* ---------- 查词浮层 ---------- */
const pop = $("#pop");
function showPop(html, rect) {
  pop.innerHTML = html; pop.style.display = "block";
  const x = Math.min(rect.left + scrollX, scrollX + document.documentElement.clientWidth - pop.offsetWidth - 8);
  pop.style.left = Math.max(8, x) + "px"; pop.style.top = (rect.bottom + scrollY + 6) + "px";
}
async function lookup(text, rect) {
  const q = text.toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return;
  const line = (w, body, src) => `<div class="pm"><b>${esc(w)}</b> ${body}${src}</div>`;
  const BOOKTAG = n => `<span class="src">书中 #${n}</span>`, ADD = `<span class="src add">补充</span>`;
  let html, needOnline = false;
  const one = w => {
    const b = findWord(w);
    if (b) return line(b.word, `<span class="ipa">${esc(b.ipa)}</span> ${esc(sensesText(b.senses))}`, BOOKTAG(b.no));
    for (const k of lemmaCandidates(w)) if (GLOSS[k]) return line(w, esc(GLOSS[k]), ADD);
    return null;
  };
  if (GLOSS[q]) html = `<div><span class="pw">${esc(text)}</span>${ADD}</div><div class="pm">${esc(GLOSS[q])}</div>`;
  else if (!q.includes(" ")) {
    html = one(q) || line(q, "查询中…", ""); needOnline = !one(q);
  } else html = `<div><span class="pw">${esc(text)}</span></div>` + q.split(" ").map(w => one(w) || line(w, "—", "")).join("");
  showPop(html + `<div class="ops"><button id="popSay">🔊 再读一遍</button></div>`, rect);
  $("#popSay").onclick = () => speak(q);
  if (needOnline) {
    try {
      const j = await fetchJSON("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(q));
      const m = j[0].meanings.slice(0, 2).map(x => `<i>${x.partOfSpeech}</i> ${esc(x.definitions[0].definition)}`).join("<br>");
      pop.querySelector(".pm").innerHTML = `<b>${esc(q)}</b> ${m}<div class="pn">英文词典在线释义（本地未收录）</div>`;
    } catch { pop.querySelector(".pm").innerHTML = `<b>${esc(q)}</b> 本地未收录，在线查询失败`; }
  }
}

/* ---------- 原书查看 ---------- */
function openPages(a, b) {
  const imgs = []; for (let p = a; p <= b; p++) imgs.push(`<img loading="lazy" src="data/pages/p${p}.jpg" alt="第 ${p} 页">`);
  $("#viewerTitle").textContent = `原书 p${a}${b > a ? "–" + b : ""}`;
  $("#viewerBody").innerHTML = imgs.join(""); $("#viewer").hidden = false;
}
$("#viewerClose").onclick = () => { $("#viewer").hidden = true; };

/* ---------- 点击事件 ---------- */
document.addEventListener("click", e => {
  const t = e.target;
  if (t.closest(".top,.drawer,.fabs,.settings,.viewer,.study")) { if (!t.closest(".search")) $("#qres").style.display = "none"; return; }
  if (t.dataset.say || t.classList.contains("play") || t.classList.contains("w")) stopMarathon();
  if (t.dataset.say) { speak(t.dataset.say); return; }
  if (t.classList.contains("play")) { playSentence(t.closest(".card"), null, t.dataset.slow ? 0.75 : rate()); return; }
  if (t.dataset.goto) { gotoWord(t.dataset.goto); return; }
  if (t.dataset.pages) { const [a, b] = t.dataset.pages.split("-").map(Number); openPages(a, b); return; }
  if (t.classList.contains("knowBtn")) {
    const card = t.closest(".card"), w = card.dataset.word;
    setKnown(w, !known.has(w));
    card.classList.toggle("known", known.has(w)); t.textContent = known.has(w) ? "✓ 已会" : "标为已会";
    $$(`.node[data-goto="${CSS.escape(w)}"]`).forEach(n => n.classList.toggle("known", known.has(w)));
    updateProgress(); return;
  }
  const masked = t.closest(".mask .sense,.mask .zh,.mask .tip,.mask .xm");
  if (masked) { masked.classList.toggle("show"); return; }
  if (pop.contains(t)) return;
  const sel = getSelection().toString().trim();
  if (sel && t.closest(".sent")) { lookup(sel, getSelection().getRangeAt(0).getBoundingClientRect()); speak(sel); return; }
  if (t.classList.contains("w")) { lookup(t.textContent, t.getBoundingClientRect()); speak(t.textContent); return; }
  pop.style.display = "none";
});
document.addEventListener("touchend", e => setTimeout(() => {
  const s = getSelection();
  if (s.toString().trim().includes(" ") && e.target.closest && e.target.closest(".sent")) lookup(s.toString(), s.getRangeAt(0).getBoundingClientRect());
}, 300));

/* ---------- 设置页 ---------- */
const seg = (key, opts) => `<div class="seg">${opts.map(([v, label]) =>
  `<button data-set="${key}" data-val="${v}" class="${String(S[key]) === String(v) ? "on" : ""}">${label}</button>`).join("")}</div>`;
const sw = (key, title, desc) => `<label class="row sw"><span><b>${title}</b><small>${desc}</small></span>
  <input type="checkbox" data-set="${key}"${S[key] ? " checked" : ""}><i></i></label>`;
function renderSettings() {
  const have = AUD.voices || [];
  const sample = L ? allEntries()[0].word : "hello";
  const back = prevHash, bm = back.match(/^#\/u(\d\d)-l(\d\d)/);
  $("#settingsView").innerHTML = `
    <a class="back" href="${back}">← 返回${bm ? ` Unit ${+bm[1]} · Lesson ${+bm[2]}` : Study.isStudy(back) && !/^#\/(drill|list|week|log)/.test(back) ? "首页" : ""}</a>
    <h1>设置</h1>
    <section class="panel"><h2>发音</h2>
      <div class="voices">${Object.keys(VOICE_NAMES).map(v => `
        <button class="voice${S.voice === v ? " on" : ""}" data-set="voice" data-val="${v}"${have.includes(v) ? "" : " disabled"}>
          <b>${VOICE_NAMES[v]}</b><small>${have.includes(v) ? VOICE_DESC[v] : "本课未生成"}</small>
          <span class="try" data-try="${v}" title="试听">🔊</span></button>`).join("")}</div>
      <div class="row"><span><b>语速</b><small>单词、例句都按这个速度播放；例句旁的 🐢 始终是慢速</small></span>
        ${seg("rate", [[0.75, "慢"], [0.9, "较慢"], [1, "常速"]])}</div>
      <p class="hint">试听词：${esc(sample)}</p>
    </section>
    <section class="panel"><h2>学习</h2>
      ${sw("mask", "背诵模式", "遮住释义、记忆法和译文，点一下显示。课文页右下角「遮」也能随手切换")}
      ${sw("hideKnown", "隐藏已会", "标为「已会」的词卡不显示，磨耳朵也跳过它们")}
    </section>
    <section class="panel"><h2>背词</h2>
      <div class="row"><span><b>考试日期</b><small>首页倒计时用</small></span><input type="date" data-set="examDate" value="${esc(S.examDate)}"></div>
      <div class="row"><span><b>每天复习上限</b><small>到期的词超过这个数，多出来的按拖得久、火苗多优先，自动排到后面几天</small></span>
        ${seg("dailyCap", [[80, "80"], [120, "120"], [200, "200"]])}</div>
      ${sw("autoSay", "巩固时自动读单词", "每翻到一个新词先读一遍；按 R 再读")}
    </section>
    <section class="panel"><h2>磨耳朵</h2>
      <div class="row"><span><b>播放范围</b><small>从右下角 🎧 开始</small></span>${seg("scope", [["group", "当前词群"], ["lesson", "整课"]])}</div>
      ${sw("withZh", "读中文", "单词后读释义，例句后读译文")}
      ${sw("loop", "循环播放", "播完从头再来")}
    </section>
    <section class="panel"><h2>外观</h2>
      <div class="row"><span><b>主题</b><small>自动跟随系统深浅色</small></span>${seg("theme", [["auto", "自动"], ["light", "浅色"], ["dark", "深色"]])}</div>
    </section>
    <section class="panel"><h2>数据</h2>
      <div class="row"><span><b>「已会」记录</b><small>共 ${known.size} 个词${Sync.connected ? "，已开启云同步，清空会同步到所有设备" : "，只存在这台设备的浏览器里"}</small></span>
        <button class="danger" id="clearKnown"${known.size ? "" : " disabled"}>清空</button></div>
    </section>
    <section class="panel" id="syncPanel"></section>`;
  renderSyncPanel();
}

/* ---------- 设置页：云同步 ---------- */
const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";
function ago(t) {
  const s = (Date.now() - t) / 1000;
  return s < 60 ? "刚刚" : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : s < 86400 ? `${Math.floor(s / 3600)} 小时前` : new Date(t).toLocaleString();
}
function renderSyncPanel() {
  const el = $("#syncPanel"); if (!el) return;
  const st = Sync.status;
  if (!Sync.connected) {
    el.innerHTML = `<h2>云同步</h2>
      <div class="row"><span><b>多端同步进度</b><small>「已会」、设置、上次读到的位置存进你自己 GitHub 账号的一个私密 Gist，电脑、手机打开就自动接上</small></span></div>
      <ol class="steps">
        <li>打开 <a href="${TOKEN_URL}" target="_blank" rel="noopener">GitHub 新建 token</a>（fine-grained token）</li>
        <li>名字随意，有效期选最长；Repository access 选 <b>Public repositories</b>；Permissions 里只把 <b>Gists</b> 设为 <b>Read and write</b>，其余都不动</li>
        <li>生成后复制，粘贴到下面点「连接」。每台设备粘贴一次即可</li>
      </ol>
      <div class="tokenrow"><input id="syncToken" type="password" placeholder="github_pat_…" autocomplete="off" spellcheck="false">
        <button id="syncConnect">连接</button></div>
      ${st.msg ? `<p class="syncmsg err">${esc(st.msg)}</p>` : ""}`;
    return;
  }
  const text = st.state === "syncing" ? "同步中…" : st.state === "error" ? esc(st.msg) : st.at ? `已同步 · ${ago(st.at)}` : "等待同步";
  el.innerHTML = `<h2>云同步</h2>
    <div class="row"><span><b>已开启</b><small class="syncstate ${st.state}">${text}</small></span>
      <button id="syncNow"${st.state === "syncing" ? " disabled" : ""}>立即同步</button></div>
    <div class="row"><span><b>断开这台设备</b><small>只删除本机保存的 token，云端进度和其他设备不受影响</small></span>
      <button class="danger" id="syncOff">断开</button></div>`;
}
Sync.onStatus(() => { if (location.hash === "#/settings") renderSyncPanel(); });
/* 设置页再点 ⚙ 直接返回，和页面里的「← 返回」去同一个地方 */
$("#setBtn").addEventListener("click", e => {
  if (location.hash !== "#/settings") return;
  e.preventDefault();
  location.hash = $("#settingsView .back").getAttribute("href");
});
$("#settingsView").addEventListener("click", e => {
  const t = e.target;
  const tryBtn = t.closest("[data-try]");
  if (tryBtn) {
    e.preventDefault();
    const w = L ? allEntries()[0].word : null, rec = w && AUD.w[w] && AUD.w[w][tryBtn.dataset.try];
    rec ? playFile(rec) : speakTTS("hello", "en");
    return;
  }
  const b = t.closest("button[data-set]");
  if (b) { const k = b.dataset.set, v = b.dataset.val; setS(k, k === "rate" || k === "dailyCap" ? +v : v); renderSettings(); if (k === "voice") speak(allEntries()[0].word); return; }
  if (t.id === "clearKnown" && confirm(`清空 ${known.size} 个「已会」记录？`)) { [...known].forEach(w => setKnown(w, false)); renderSettings(); }
  if (t.id === "syncNow") Sync.syncNow();
  if (t.id === "syncOff" && confirm("断开后这台设备不再同步，确定？")) { Sync.disconnect(); renderSettings(); }
  if (t.id === "syncConnect") {
    const token = $("#syncToken").value.trim();
    if (!token) { $("#syncToken").focus(); return; }
    t.disabled = true; t.textContent = "连接中…";
    Sync.connect(token).then(() => { posReady = true; renderSettings(); toast("云同步已开启"); })
      .catch(err => { renderSyncPanel(); const m = document.createElement("p"); m.className = "syncmsg err"; m.textContent = err.message; $("#syncPanel").append(m); });
  }
});
$("#settingsView").addEventListener("change", e => {
  const t = e.target;
  if (t.type === "checkbox" && t.dataset.set) setS(t.dataset.set, t.checked);
  else if (t.dataset.set && t.value) setS(t.dataset.set, t.value);
});

/* ---------- 右下角快捷按钮 ---------- */
$("#maskFab").onclick = () => { setS("mask", !S.mask); $$(".show").forEach(x => x.classList.remove("show")); };

/* ---------- 磨耳朵：单词×2 → 释义 → 例句 → 译文 → 扩展词 ---------- */
let runId = 0;
function stopMarathon() {
  runId++; stopAll();
  $("#playAll").classList.remove("on"); $("#playAll").textContent = "🎧";
  $$(".now,.now-part").forEach(x => x.classList.remove("now", "now-part"));
}
function currentGroup() {
  const gs = $$(".group"); let cur = gs[0];
  for (const g of gs) if (g.getBoundingClientRect().top < innerHeight * 0.4) cur = g;
  return cur;
}
function buildSteps() {
  const zh = S.withZh, steps = [];
  const scope = S.scope === "group" ? $$(".card", currentGroup()) : $$(".card");
  for (const card of scope) {
    if (card.offsetParent === null) continue;   // 被「隐藏已会」藏起来的跳过
    const e = entryOf(card), q = s => card.querySelector(s);
    steps.push({card, el: q(".word"), run: f => speak(e.word, f), gap: 400});
    steps.push({card, el: q(".word"), run: f => speak(e.word, f)});
    const meaning = w => (AUD.m && AUD.m[w]) || sensesText(WORDMAP.get(w).senses);
    if (zh) steps.push({card, el: q(".senses"), run: f => speakZh(meaning(e.word), f)});
    if (e.ex) {
      steps.push({card, el: q(".sent"), run: f => playSentence(card, f), gap: 800});
      if (zh) steps.push({card, el: q(".zh"), run: f => speakZh(e.ex.zh, f)});
    }
    $$(".extrow", card).forEach(row => {
      const x = WORDMAP.get(row.dataset.ext);
      steps.push({card, el: row, run: f => speak(x.word, f), gap: zh ? 300 : 600});
      if (zh) steps.push({card, el: row, run: f => speakZh(meaning(x.word), f)});
    });
    steps[steps.length - 1].gap = 1300;
  }
  return steps;
}
$("#playAll").onclick = function () {
  if (this.classList.contains("on")) { stopMarathon(); return; }
  stopMarathon();
  const my = runId, steps = buildSteps(); let i = 0;
  if (!steps.length) return;
  this.classList.add("on"); this.textContent = "⏹";
  const next = () => {
    if (my !== runId) return;
    if (i >= steps.length) { if (S.loop) i = 0; else { stopMarathon(); return; } }
    const st = steps[i++];
    $$(".now,.now-part").forEach(x => x.classList.remove("now", "now-part"));
    st.card.classList.add("now"); st.el && st.el.classList.add("now-part");
    st.card.scrollIntoView({behavior: "smooth", block: "center"});
    st.run(() => { if (my === runId) setTimeout(next, st.gap || 600); });
  };
  next();
};

/* ---------- 搜索 ---------- */
const qres = $("#qres");
$("#q").addEventListener("input", () => {
  const q = $("#q").value.trim().toLowerCase();
  if (!q) { qres.style.display = "none"; return; }
  const hits = Object.entries(BOOK.search).filter(([w]) => w.startsWith(q)).slice(0, 30);
  qres.innerHTML = hits.length ? hits.map(([w, [lid, no, ext]]) => {
    const [, u, l] = lid.match(/u(\d+)-l(\d+)/);
    return `<a href="#/${lid}/w/${encodeURIComponent(w)}">${esc(w)} <small>U${+u} L${+l} #${no}${ext ? " 扩展" : ""}</small></a>`;
  }).join("") : `<a><small>已生成的课里没有「${esc(q)}」</small></a>`;
  qres.style.display = "block";
});
$("#q").addEventListener("keydown", e => { if (e.key === "Enter") { const a = qres.querySelector("a[href]"); if (a) { location.hash = a.getAttribute("href"); qres.style.display = "none"; } } });
qres.addEventListener("click", () => { qres.style.display = "none"; $("#q").blur(); });

/* ---------- 别的设备的改动同步过来：刷新已会和设置；别处读到了更新的位置就跟过去 ---------- */
function toast(msg) {
  const el = $("#toast"); el.textContent = msg; el.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 3000);
}
Sync.on(changed => {
  loadKnown(); loadSettings(); applySettings(); applySide();
  if (!BOOK) return;
  const ready = BOOK.parts.flatMap(p => p.units.flatMap(u => u.lessons)).filter(l => l.ready);
  const last = store.get("last");
  const moved = ready.some(l => l.id === last) && (changed.includes("last") || changed.includes("pos:" + last));
  if (location.hash === "#/settings") { renderSettings(); renderDrawer(); return; }
  if (!$("#studyView").hidden) { Study.refresh(); return; }   // 首页、巩固不跟着别处的阅读位置跳
  if (moved) {
    const [, u, l] = last.match(/u(\d+)-l(\d+)/);
    toast(`已接上其他设备的进度：Unit ${+u} · Lesson ${+l}`);
    if (L && L.id === last) { renderLesson(); restorePos(last); }
    else location.hash = "#/" + last;
  } else if (L) { const y = scrollY; renderLesson(); scrollTo(0, y); }
});

/* ---------- 启动 ---------- */
applySettings();
window.addEventListener("hashchange", route);
fetchJSON("data/book.json").then(b => { BOOK = b; renderDrawer(); return route(); })
  .then(() => Sync.start()).then(() => { posReady = true; })
  .catch(err => { $("#groups").innerHTML = `<p class="empty">数据加载失败：${esc(err.message)}<br>请用本地服务器打开（见 README），不要直接双击 HTML。</p>`; });
