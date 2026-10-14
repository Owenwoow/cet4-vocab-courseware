/* 例句渲染：切成可点的单词，标出词组（书外补充 data/notes）。纯函数，不碰页面和存储；浏览器里是全局 Sent，Node 里 require 进来跑单元测试

   notes 一句的格式：{ph: [{t 句中原样片段, b 词组原形, m 释义}], an: {parts: [{t, r}], pts: [要点], lit: 直译}}
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

  /* 例句 HTML：keys 重点词（可能是多词短语）加 key 样式；note 这句的 notes；hi 要高亮的词组原形（生词「遇见」用） */
  function html(en, keys, note, hi) {
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
    const re = /([A-Za-z']+)|([^A-Za-z']+)/g;
    let m;
    while ((m = re.exec(en))) {
      const s = m.index;
      if (m[1]) { open(at[s]); out += `<span class="w${hit[s] ? " key" : ""}">${m[1]}</span>`; continue; }
      for (let i = s, j; i < s + m[0].length; i = j) {   // 标点、空格可能一半在词组里
        for (j = i + 1; j < s + m[0].length && at[j] === at[i];) j++;
        open(at[i]); out += esc(en.slice(i, j));
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

  /* 语法成分的配色类：主干 / 各类从句 / 状语 / 插入语 / 其他；空串不着色 */
  const role = r => (!r ? "" : r === "主干" ? "main" : /从句/.test(r) ? "cl" : /状语/.test(r) ? "adv" : /插入/.test(r) ? "ins" : "oth");

  /* 「析」：成分分块 → 要点 → 直译与书译对照；zh 是书上的译文（课程文件 ex.zh） */
  function anHTML(an, zh) {
    if (!an) return "";
    const parts = (an.parts || []).map(p => {
      const t = p.t.trim(), c = role(p.r);
      if (!t) return "";
      return c ? `<span class="anp ${c}"><span class="ant">${esc(t)}</span><small>${esc(p.r)}</small></span>` : `<span class="anp"><span class="ant">${esc(t)}</span></span>`;
    }).join("");
    return `<div class="an" hidden><div class="anh">句子解析<span class="src add">补充</span></div>
      ${parts ? `<div class="anparts">${parts}</div>` : ""}
      ${an.pts && an.pts.length ? `<ul class="anpts">${an.pts.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${an.lit || zh ? `<div class="antr">${an.lit ? `<div><b>直译</b><span>${esc(an.lit)}</span></div>` : ""}${zh ? `<div><b>书译</b><span>${esc(zh)}</span></div>` : ""}</div>` : ""}</div>`;
  }
  /* 有解析的例句：右上角「析」按钮 + 默认收起的解析块（都放在 .sent 外面，不含 .w） */
  const anBlock = (note, zh) => (note && note.an ? `<button class="anBtn" title="句子解析（补充）">析</button>${anHTML(note.an, zh)}` : "");

  return {find, locate, html, best, role, anHTML, anBlock};
})();
if (typeof module === "object" && module.exports) module.exports = Sent;
