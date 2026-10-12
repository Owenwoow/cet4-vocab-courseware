/* 滚动复习规则（纯函数，不碰页面和存储；浏览器里是全局 SRS，Node 里 require 进来跑单元测试）

   一句话：工作日早上复习「昨天的 + 上周今天的」，周末复习「本周的 + 上上周的」；之后按熟练度拉开间隔。
   实现按词算：每张卡记 学习日 a、已过站数 s、到期日 d，所以每天学多少、哪天没学都不影响。
     s=0 → 次日（a+1）
     s=1 → 本周末：a+2 起第一个周六或周日
     s=2 → 上周今天：a+7
     s=3 → 上上周：a+14 起第一个周日
     s≥4 → 按熟练度：1～2 级 7 天、3 级 14 天、4 级 21 天、5 级 30 天
   记得 → 进下一站；模糊 → 站数不变，s≤3 时 2 天后再来，s≥4 时取熟练度间隔的一半（至少 2 天）；忘了 → 从今天重新开始。
   还没到期就复习（途中看、睡前、周总结多刷）：记得 / 模糊不改计划也不记进熟练度，忘了照样重来。
   考前封顶：12-05 前复习、到期日又晚于 12-09 的，改到 12-05～12-09 之间，按词分散到各天；窗口里及之后复习的不封顶。

   熟练度（level，0～5）：每轮只记第一遍作答，h 存最近 6 次（g 记得 / m 模糊 / f 忘了），
   q 是第一遍答对过的最难题型（0 看词选义 / 1 听音选义 / 2 例句挖空、看中文选英文 / 3 拼写），z=1 是手动「斩」。
   连对 = h 末尾连续 g 的个数；从上往下命中即止：
     z=1 → 5；h 末位 f，或忘过≥2 次且连对<2 → 1；还没复习过 → 0；
     s≥4 且连对≥4 且 q≥3 → 5；s≥4 且连对≥3 且 q≥2 → 4；s≥3 且连对≥2 → 3；其他 → 2
   出题：题型 = min(熟练度对应题型, q+1)，每次最多升一级；5 级只做快速抽查。
   日期都用本地日期字符串 YYYY-MM-DD，一天从凌晨 4 点开始算 */
"use strict";
const SRS = (() => {
  const DAY = 86400000, CUTOFF_H = 4;
  const EXAM = "2026-12-12";                          // 考试日；换六级只改这里
  const H_LEN = 6, SLOW_MS = 5000;
  const LV_DAYS = [7, 7, 7, 14, 21, 30];              // s≥4 时各熟练度的间隔
  const TYPE = {MEAN: 0, LISTEN: 1, CONTEXT: 2, SPELL: 3, QUICK: 4};
  const pad = n => String(n).padStart(2, "0");
  const toNum = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / DAY; };
  const toStr = n => { const t = new Date(n * DAY); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
  const add = (s, n) => toStr(toNum(s) + n);
  const diff = (a, b) => toNum(a) - toNum(b);        // a - b，天数
  const dow = s => new Date(toNum(s) * DAY).getUTCDay();   // 0=周日 … 6=周六
  const max = (a, b) => (a > b ? a : b);
  const hash = s => { let h = 5381; for (const ch of String(s)) h = (h * 33 + ch.charCodeAt(0)) >>> 0; return h; };

  /* 今天：凌晨 4 点前还算前一天 */
  function today(now = Date.now()) {
    const t = new Date(now - CUTOFF_H * 3600000);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }
  const monday = s => add(s, -((dow(s) + 6) % 7));   // 所在周的周一（周一到周日算一周）
  function firstWeekend(s) { const w = dow(s); return w === 6 || w === 0 ? s : add(s, 6 - w); }
  const firstSunday = s => add(s, (7 - dow(s)) % 7);

  /* 第 s 站的到期日；s≥4 按熟练度 lv（不传按 4 级，即 21 天） */
  function stationDue(a, s, t, lv = 4) {
    const d = s === 1 ? firstWeekend(add(a, 2)) : s === 2 ? add(a, 7) : s === 3 ? firstSunday(add(a, 14)) : add(t, LV_DAYS[lv]);
    return max(d, add(t, 1));
  }

  /* 考前封顶：窗口（考前 7 天～考前 3 天）开始前复习、算出的到期日又晚于窗口的，按 key 分散到窗口各天；
     在窗口里或之后复习的不管（刚见过） */
  function examCap(d, t, key, exam = EXAM) {
    const lo = add(exam, -7), end = add(exam, -3);
    if (d <= end || t >= lo) return d;
    return add(lo, hash(key) % (diff(end, lo) + 1));
  }

  /* 熟练度 */
  const hist = c => c.h ?? (c.n ? c.r || "" : "");   // 旧卡没有 h：用最近一次评分顶上
  function streak(c) { const h = hist(c); let k = 0; while (k < h.length && h[h.length - 1 - k] === "g") k++; return k; }
  function level(c) {
    if (c.z) return 5;
    const h = hist(c), k = streak(c), q = c.q || 0;
    if (h.endsWith("f") || ((c.l || 0) >= 2 && k < 2)) return 1;
    if (!c.n) return 0;
    if (c.s >= 4 && k >= 4 && q >= 3) return 5;
    if (c.s >= 4 && k >= 3 && q >= 2) return 4;
    if (c.s >= 3 && k >= 2) return 3;
    return 2;
  }

  /* 出什么题：2 级在看词选义 / 听音选义间按复习次数轮换 */
  function pickType(c) {
    const lv = level(c);
    if (lv === 5) return TYPE.QUICK;
    const want = lv <= 1 ? TYPE.MEAN : lv === 2 ? (c.n || 0) % 2 : lv === 3 ? TYPE.CONTEXT : TYPE.SPELL;
    return Math.min(want, (c.q || 0) + 1);
  }

  /* 判分：选择题看对错和用时；拼写全对 g、错一个字母 m */
  const gradeChoice = (ok, ms) => (!ok ? "f" : ms > SLOW_MS ? "m" : "g");
  function editDist(a, b) {
    let prev = Array.from({length: b.length + 1}, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function gradeSpell(input, answer) {
    const d = editDist(input.trim().toLowerCase(), answer.trim().toLowerCase());
    return d === 0 ? "g" : d === 1 ? "m" : "f";
  }

  /* 记为某天学的：新卡次日到期 */
  const newCard = date => ({a: date, s: 0, d: add(date, 1), l: 0, r: "", n: 0, h: ""});
  const isDue = (c, t) => c.d <= t;

  /* 打分：g 记得 / m 模糊 / f 忘了。返回新卡，不改原卡；t 记下最近一次复习的日期。
     opt.type：这次的题型（第一遍答对时更新 q）；opt.key：考前封顶时用来分散日期，一般传单词；opt.exam：考试日（默认 EXAM） */
  function rate(c, r, t, opt = {}) {
    const key = opt.key ?? `${c.k}|${c.g}|${c.o}|${c.w}`;
    const n = {...c, r, n: (c.n || 0) + 1, t};
    const h = (hist(c) + r).slice(-H_LEN);
    if (r === "f") return {...n, a: t, s: 0, d: add(t, 1), l: (c.l || 0) + 1, h, z: 0};
    if (!isDue(c, t)) return n;                     // 提前复习：不改计划，也不记进熟练度
    const q = r === "g" && opt.type >= 0 && opt.type <= TYPE.SPELL ? Math.max(c.q || 0, opt.type) : c.q || 0;
    if (r === "m") {
      const d = c.s >= 4 ? add(t, Math.max(2, Math.floor(LV_DAYS[level({...n, h, q})] / 2))) : add(t, 2);
      return {...n, h, q, d: examCap(d, t, key, opt.exam || EXAM)};
    }
    const s = c.s + 1, nc = {...n, h, q, s};
    return {...nc, d: examCap(stationDue(c.a, s, t, level(nc)), t, key, opt.exam || EXAM)};
  }

  /* 斩：直接 5 级，30 天后（或考前窗口）抽查；抽查答错照常重来并清掉 z */
  const chop = (c, t, key = c.w || "", exam = EXAM) => ({...c, z: 1, s: Math.max(c.s, 4), d: examCap(add(t, LV_DAYS[5]), t, key, exam)});

  /* 难词本：最近一次是忘了 / 模糊，或忘过不止一次 */
  const isHard = c => c.r === "f" || c.r === "m" || (c.l || 0) >= 2;

  /* 今天要复习的：拖得最久的先来，同一天到期的火苗多的先来，再按课本顺序 */
  function dueList(items, t) {
    return items.filter(x => isDue(x.card, t))
      .sort((x, y) => (x.card.d < y.card.d ? -1 : x.card.d > y.card.d ? 1 : 0) || (y.freq || 0) - (x.freq || 0) || (x.order || 0) - (y.order || 0));
  }

  /* 可复现的随机数（seed 相同结果相同，方便测试） */
  function rng(seed) {
    let a = hash(seed);
    return () => { a = (a + 0x6D2B79F5) >>> 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }

  /* 乱序，并尽量让同组（groupOf 相同）的不相邻 */
  function shuffleSpread(list, groupOf, seed = "") {
    const a = list.slice(), rand = rng(seed);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const left = new Map(), out = [];                 // 每次从和上一个不同组的里，挑剩得最多的那组（同组按乱序先后）
    for (const x of a) left.set(groupOf(x), (left.get(groupOf(x)) || 0) + 1);
    while (a.length) {
      const last = out.length ? groupOf(out[out.length - 1]) : undefined;
      let i = -1;
      a.forEach((x, k) => { const g = groupOf(x); if (g !== last && (i < 0 || left.get(g) > left.get(groupOf(a[i])))) i = k; });
      if (i < 0) i = 0;                               // 只剩同一组：只好相邻
      left.set(groupOf(a[i]), left.get(groupOf(a[i])) - 1);
      out.push(a.splice(i, 1)[0]);
    }
    return out;
  }

  /* 本轮出题顺序：拖过的先、今天到期的后；同一段里熟练度低的先；
     同一熟练度里，复习不到 3 次的按课本顺序（保留词群联想），3 次及以上的乱序且同词群不相邻 */
  function queue(items, t, seed = t) {
    const grp = x => `${x.card.k}|${x.card.g}`;
    const due = items.filter(x => isDue(x.card, t)), out = [];
    for (const late of [true, false])
      for (let lv = 0; lv <= 5; lv++) {
        const seg = due.filter(x => (x.card.d < t) === late && level(x.card) === lv);
        out.push(...seg.filter(x => (x.card.n || 0) < 3).sort((x, y) => (x.order || 0) - (y.order || 0)));
        out.push(...shuffleSpread(seg.filter(x => (x.card.n || 0) >= 3), grp, `${seed}|${late}|${lv}`));
      }
    return out;
  }

  /* 请假顺延：学习日和到期日一起后移，整条路线不变 */
  const shift = (c, n) => ({...c, a: add(c.a, n), d: add(c.d, n)});

  return {EXAM, TYPE, today, add, diff, dow, monday, firstWeekend, firstSunday, stationDue, examCap, newCard, isDue,
    rate, chop, isHard, dueList, level, streak, pickType, gradeChoice, gradeSpell, editDist, shuffleSpread, queue, shift};
})();
if (typeof module === "object" && module.exports) module.exports = SRS;
