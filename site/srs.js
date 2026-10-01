/* 滚动复习规则（纯函数，不碰页面和存储；浏览器里是全局 SRS，Node 里 require 进来跑单元测试）

   一句话：工作日早上复习「昨天的 + 上周今天的」，周末复习「本周的 + 上上周的」。
   实现按词算：每张卡记 学习日 a、已过站数 s、到期日 d，所以每天学多少、哪天没学都不影响。
     s=0 → 次日（a+1）
     s=1 → 本周末：a+2 起第一个周六或周日
     s=2 → 上周今天：a+7
     s=3 → 上上周：a+14 起第一个周日
     s≥4 → 今天 +21（考前每 3 周至少见一次）
   记得 → 进下一站；模糊 → 站数不变、2 天后再来；忘了 → 从今天重新开始。
   还没到期就复习（途中看、睡前、周总结多刷）：记得 / 模糊不改计划，忘了照样重来。
   日期都用本地日期字符串 YYYY-MM-DD，一天从凌晨 4 点开始算 */
"use strict";
const SRS = (() => {
  const DAY = 86400000, CUTOFF_H = 4;
  const pad = n => String(n).padStart(2, "0");
  const toNum = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / DAY; };
  const toStr = n => { const t = new Date(n * DAY); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
  const add = (s, n) => toStr(toNum(s) + n);
  const diff = (a, b) => toNum(a) - toNum(b);        // a - b，天数
  const dow = s => new Date(toNum(s) * DAY).getUTCDay();   // 0=周日 … 6=周六
  const max = (a, b) => (a > b ? a : b);

  /* 今天：凌晨 4 点前还算前一天 */
  function today(now = Date.now()) {
    const t = new Date(now - CUTOFF_H * 3600000);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }
  const monday = s => add(s, -((dow(s) + 6) % 7));   // 所在周的周一（周一到周日算一周）
  function firstWeekend(s) { const w = dow(s); return w === 6 || w === 0 ? s : add(s, 6 - w); }
  const firstSunday = s => add(s, (7 - dow(s)) % 7);

  function stationDue(a, s, t) {
    const d = s === 1 ? firstWeekend(add(a, 2)) : s === 2 ? add(a, 7) : s === 3 ? firstSunday(add(a, 14)) : add(t, 21);
    return max(d, add(t, 1));
  }

  /* 记为某天学的：新卡次日到期 */
  const newCard = date => ({a: date, s: 0, d: add(date, 1), l: 0, r: "", n: 0});
  const isDue = (c, t) => c.d <= t;

  /* 打分：g 记得 / m 模糊 / f 忘了。返回新卡，不改原卡 */
  function rate(c, r, t) {
    const n = {...c, r, n: (c.n || 0) + 1};
    if (r === "f") return {...n, a: t, s: 0, d: add(t, 1), l: (c.l || 0) + 1};
    if (!isDue(c, t)) return n;                     // 提前复习：不改计划
    if (r === "m") return {...n, d: add(t, 2)};
    const s = c.s + 1;
    return {...n, s, d: stationDue(c.a, s, t)};
  }

  /* 难词本：最近一次是忘了 / 模糊，或忘过不止一次 */
  const isHard = c => c.r === "f" || c.r === "m" || (c.l || 0) >= 2;

  /* 今天要复习的：拖得最久的先来，同一天到期的火苗多的先来，再按课本顺序 */
  function dueList(items, t) {
    return items.filter(x => isDue(x.card, t))
      .sort((x, y) => (x.card.d < y.card.d ? -1 : x.card.d > y.card.d ? 1 : 0) || (y.freq || 0) - (x.freq || 0) || (x.order || 0) - (y.order || 0));
  }

  /* 请假顺延：学习日和到期日一起后移，整条路线不变 */
  const shift = (c, n) => ({...c, a: add(c.a, n), d: add(c.d, n)});

  return {today, add, diff, dow, monday, firstWeekend, firstSunday, stationDue, newCard, isDue, rate, isHard, dueList, shift};
})();
if (typeof module === "object" && module.exports) module.exports = SRS;
