/* 例句渲染：切成可点的单词，标出词组（书外补充 data/notes）。纯函数，不碰页面和存储；浏览器里是全局 Sent，Node 里 require 进来跑单元测试

   notes 一句的格式：{ph: [{t 句中原样片段, b 词组原形, m 释义}], an: {talk: [{t 英文片段, s 带练文字}], order?, sum, cmp}}
   词组定位（和 pipeline/validate.py 一致）：按 ph 顺序处理；
     单段取 t 在句中第一次出现、且落在单词边界上的位置；
     被拆开的搭配写成多条 ph、b 相同，第二段起从同一词组上一段的结尾之后找（attribute … to 的 to 落在 to a lack，不是 to change）。
   单词 = 连续的 [A-Za-z']，和切词规则一样；片段不能切开单词，不同词组的片段不能重叠（对不上、重叠的跳过）。
   渲染时 .w 的类名、文本、顺序和没有 notes 时完全一样（朗读高亮、背诵遮挡、磨耳朵靠它），词组只在外面包一层 .ph */
"use strict";
const Sent = (() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const isW = ch => !!ch && /[A-Za-z']/.test(ch);
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /* 从 from 起找 t 第一次出现、两头不切开单词的位置，找不到返回 -1 */
  function find(en, t, from = 0) {
    if (!t) return -1;
    for (let i = en.indexOf(t, from); i >= 0; i = en.indexOf(t, i + 1)) {
      const j = i + t.length;
      if (!(isW(en[i - 1]) && isW(en[i])) && !(isW(en[j - 1]) && isW(en[j]))) return i;
    }
    return -1;
  }

  /* 词组片段的位置：[{s, e, id, b}]；id = 这个词组在 ph 里第一段的序号（同一词组的各段共用） */
  function locate(en, ph) {
    const out = [], first = new Map(), lastEnd = new Map();
    (ph || []).forEach((p, i) => {
      if (!p || !p.t || !p.b) return;
      const again = first.has(p.b);
      const s = find(en, p.t, again ? lastEnd.get(p.b) : 0);
      if (s < 0) return;
      const e = s + p.t.length;
      if (out.some(x => x.b !== p.b && x.s < e && s < x.e)) return;   // 和别的词组重叠
      if (!again) first.set(p.b, i);
      lastEnd.set(p.b, e);
      out.push({s, e, id: first.get(p.b), b: p.b});
    });
    return out.sort((a, b) => a.s - b.s);
  }

  /* 例句 HTML：keys 重点词（可能是多词短语）加 key 样式；note 这句的 notes；hi 要高亮的词组原形（生词「遇见」用）；
     rg = {s, e}：只画句子的这一段（「析」里的英文块），单词、词组的切分和整句完全一样；被切开的半个单词画成纯文字 */
  function html(en, keys, note, hi, rg) {
    const hit = new Array(en.length).fill(false);
    for (const k of keys || []) {
      if (!k) continue;
      const re = new RegExp("(?<![A-Za-z])" + reEsc(k) + "(?![A-Za-z])", "gi");
      let m; while ((m = re.exec(en))) { for (let i = m.index; i < m.index + m[0].length; i++) hit[i] = true; if (!m[0].length) re.lastIndex++; }
    }
    const at = new Array(en.length).fill(-1), segs = note ? locate(en, note.ph) : [];
    const bOf = new Map(segs.map(x => [x.id, x.b]));
    for (const x of segs) for (let i = x.s; i < x.e; i++) at[i] = x.id;
    let out = "", cur = -1;
    const open = id => {
      if (id === cur) return;
      if (cur >= 0) out += "</span>";
      if (id >= 0) out += `<span class="ph${hi && bOf.get(id) === hi ? " key" : ""}" data-ph="${id}">`;
      cur = id;
    };
    const lo = rg ? rg.s : 0, up = rg ? rg.e : en.length;
    const re = /([A-Za-z']+)|([^A-Za-z']+)/g;
    let m;
    while ((m = re.exec(en))) {
      const s = m.index, e = s + m[0].length;
      if (e <= lo || s >= up) continue;
      if (m[1] && s >= lo && e <= up) { open(at[s]); out += `<span class="w${hit[s] ? " key" : ""}">${m[1]}</span>`; continue; }
      for (let i = Math.max(s, lo), j; i < Math.min(e, up); i = j) {   // 标点、空格可能一半在词组里；被切开的半个单词不可点
        for (j = i + 1; j < Math.min(e, up) && at[j] === at[i];) j++;
        open(m[1] ? -1 : at[i]); out += esc(en.slice(i, j));
      }
    }
    open(-1);
    return out;
  }

  /* 划选的 [a, b) 和哪个词组重叠的字符最多（segs 是 [{s, e, id}]），都不重叠返回 -1 */
  function best(segs, a, b) {
    const n = new Map();
    for (const x of segs) { const k = Math.min(b, x.e) - Math.max(a, x.s); if (k > 0) n.set(x.id, (n.get(x.id) || 0) + k); }
    let id = -1, max = 0;
    for (const [k, v] of n) if (v > max) { max = v; id = k; }
    return id;
  }

  /* 「析」：zh 是书上的译文（课程文件 ex.zh）。
     对话带练（an.talk）：开场白 → 一块块英文 + 带练文字（→ 开头的行是这块的中文）→ 排顺序 → 合起来与书译对照 */
  const ADD = `<span class="src add">补充</span>`;
  /* s = {en, keys, note, hi}：这句例句本身。英文块按位置画成可点的 .snip（和例句一样点词查义、标词组），找不到就画纯文字 */
  function talkHTML(an, zh, s) {
    const lines = x => String(x).split("\n").filter(y => y.trim())
      .map(y => /^\s*→/.test(y) ? `<div class="anto">${esc(y.trim())}</div>` : `<p>${esc(y)}</p>`).join("");
    let pos = 0;
    const enHTML = t => {
      const j = s && s.en ? s.en.indexOf(t, pos) : -1;
      if (j < 0) return `<div class="anen">${esc(t)}</div>`;
      pos = j + t.length;
      return `<div class="anen snip">${html(s.en, s.keys, s.note, s.hi, {s: j, e: pos})}</div>`;
    };
    const blocks = an.talk.map(b => `<div class="anblk">${b.t ? enHTML(b.t) : ""}<div class="ans">${lines(b.s || "")}</div></div>`).join("");
    return `<div class="an talk" hidden><div class="anh">带你译${ADD}</div>
      <p class="anopen">先别看译文，你自己来。</p>${blocks}
      ${an.order ? `<div class="anord"><b>排顺序</b>${lines(an.order)}</div>` : ""}
      <div class="antr">${an.sum ? `<div><b>合起来</b><span>${esc(an.sum)}</span></div>` : ""}${zh ? `<div><b>书译</b><span>${esc(zh)}</span></div>` : ""}</div>
      ${an.cmp ? `<p class="ancmp">${esc(an.cmp)}</p>` : ""}</div>`;
  }
  function anHTML(an, zh, s) {
    return an && Array.isArray(an.talk) ? talkHTML(an, zh, s) : "";
  }
  /* 有解析的例句：右上角「析」按钮 + 默认收起的解析块（都放在 .sent 外面；英文块是 .snip 不是 .sent，朗读高亮只数 .sent 里的 .w）。
     en、keys、hi 和这句例句的 sentenceHTML 传的一样 */
  const anBlock = (note, zh, en, keys, hi) => (note && note.an ? `<button class="anBtn" title="带你译这句（补充）">析</button>${anHTML(note.an, zh, {en, keys, note, hi})}` : "");

  /* 词组原形 → 朗读文本（和 pipeline/build_audio.py 的 phrase_spoken 一致，音频按这个文本生成）：
     括号里可省的去掉，a/b 二选一读前一个，… 和 sth. 读 something，sb. 读 somebody，adj. 读 adjective */
  const spoken = b => String(b).replace(/\([^)]*\)/g, " ").replace(/(\S+?)\/\S+/g, "$1").replace(/…/g, " something ").replace(/\badj\./g, "adjective").replace(/\+/g, " ")
    .replace(/\bsth\./g, "something").replace(/\bsb\.'s\b|\bsb's\b/g, "somebody's").replace(/\bsb\./g, "somebody").replace(/\s+/g, " ").trim();

  return {find, locate, html, best, anHTML, anBlock, spoken};
})();
if (typeof module === "object" && module.exports) module.exports = Sent;
