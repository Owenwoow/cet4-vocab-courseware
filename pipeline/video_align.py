"""书外补充：从 B 站 AI 中文字幕对齐出每个词条的讲解视频时间点 → site/data/video/<课id>.json

用法：
  python pipeline/video_align.py              拉字幕（有缓存不重复请求，要 cookie，见 bili.py）、对齐、写全部课
  python pipeline/video_align.py --check      只查各视频是否还在，更新视频表和各课数据里的 alive（不重新对齐、不要 cookie）
  python pipeline/video_align.py --sample 3   每单元随机抽 3 个词（--seed 固定种子），打印首选视频跳转点前后 30 秒的字幕，人工抽查

视频表 pipeline/video_sources.json（手录，数组顺序就是优先级）：
  id、bv、label（页面上显示）、series、units [起, 止]（覆盖的单元，含两端）、pages [起, 止]（用到的分 P 号，含两端）、
  alive、durations {"分P号": 秒}（对齐时从 view 接口自动补全；validate.py 不联网，靠它检查秒数上限）
  新增视频：在表里加一行（durations 可不写）重跑即可。

数据文件格式见 docs/plans/2026-10-15-video-jump.md「数据格式」：
  {"lesson", "sources": [{id, bv, label, alive}]（优先级顺序）, "entries": {"词条号": {"视频id": [分P, 秒] 或 [分P, 秒, 1]}}}
  第三位 1 = 推算出来的（approx），页面标「约」；某视频没有这个词就不出现这个键

对齐规则：
  1. 每个视频把用到的分 P 字幕按 P 顺序接成一条时间线（分 P 标题标错、一课拆 3-1/3-2 都不影响）；
     该视频覆盖的全部词条按书序（book.json 课序 → groups[].entries[]）排队
  2. 候选 = 字幕里出现这个词的位置：大小写不敏感，词头在词边界上；含拼写变体（英式拼写、连字符）；
     ≤3 个字母的短词还要求词尾在边界上（允许 -s/-ed/-ing 等），免得 sin 匹配 since；
     别的词条以它开头的不算（flour 不匹配 flourish）。权重 = 前后 60 秒内这个词出现的次数
  3. 加权最长递增链（DP）：时间严格递增、每词至多选一个，总权重最大。不取"第一次出现"——
     老师讲上一个词时常顺嘴提到下一个（U1L1 讲 universe 时 2:33 说了 united states，真讲 unite 在 3:35）。
     选中的只是一次顺嘴提到（权重 1、夹在相邻词条的成串讲解中间）的，不算找到
  4. 跳转点 = 那段讲解的起点往前提 3 秒，不早于上一个词的跳转点，也不跨回上一个分 P。起点：
     ① 变点法：上一个词的起点之后，找一个分界，使「分界前是前两个词、分界后是这个词」的出现次数最多；
     ② 老师常先讲谐音、联想，词本身被识别错（「这个单词叫做 cost」其实是 coast），第一次认出来已经晚了，所以再往前修：
        近似拼写（bind → band）、这个词独有的中文释义（dean → 系主任）、「这个单词叫做 / 继续来」这类提示语、
        前一个词最后一次出现在 8~20 秒前（中间多半已是开场白），详见 refine()
  5. 找不到的词：① 另一个视频直接找到了 → 用两边都直接找到的前后邻近词的时间差（中位数）换算过来；
     ② 否则同视频前后两个已定位的词之间找近似拼写、中文释义，按第 4 条定起点；③ 都没有 → 按序号插值。都标 approx。
     成段缺失（整课直接找到的不足一半，或连续 5 个以上词找不到）= 这个视频没有这段，不插值，这些词不给这个视频
  6. 某分 P 没有 AI 字幕时，若别的视频有分 P 时长一秒不差（同一个文件），直接借用它的字幕，时间点就和那个分 P 一样
"""
import argparse
import bisect
import difflib
import json
import random
import re
import statistics
import sys

import bili
from config import DATA, LESSONS, ROOT

SOURCES = ROOT / "pipeline" / "video_sources.json"
OUT = DATA / "video"
WINDOW = 60          # 权重窗口：前后 60 秒
LEAD = 3             # 跳转点往前提 3 秒
RUN_GAP = 5          # 连续这么多个词找不到 = 视频里没有这段
LESSON_MIN = 0.5     # 一课直接找到的比例低于这个 = 视频里没有这课
SEG_GAP = 300        # 同一段讲解里相邻两次提到这个词最多隔这么久（秒）
NEIGHBORS = 2        # 换算 approx 时每边取几个邻近词
MARKER = re.compile("这个单词叫|单词叫做|看这个单词|下一个单词|这个词叫|继续来|继续讲|再讲个|再讲一个")   # 老师开讲一个词的口头禅
MARKER_BACK = 25     # 提示语最多比词第一次出现早这么久（秒）
INTRO_GAP = 8        # 「这个单词叫做 X」：提示语和 X 之间最多隔几个字
FUZZY_MIN = 4        # 近似拼写只对 ≥4 个字母的词找
FUZZY_RATIO = 0.75   # 拼写相似度（difflib）下限
FUZZY_BACK = 60      # 近似拼写最多往前找这么久（秒）
FUZZY_SPAN = 600     # 找不到的词：前后已定位的词隔得比这还远，就不用近似拼写猜
FUZZY_NEAR = 40      # 近似拼写不能是书序前后这么多个词条之一（及其派生）
GAP_MIN, GAP_FILL = 8, 20   # 前面的词最后一次出现离起点这么远（秒）时，起点提到那一行末尾
STOPWORDS = set("that this with have they there their what when where were will would from some very like just your "
                "about been more than then them these those into only also because which make good know want well "
                "much many time people said think come does done here".split())

# 英式 → 美式拼写（AI 字幕基本按美式写）；只加候选，不影响原词
BRIT = [
    (r"programme$", "program"),
    (r"(?<=[a-z]{3})tre$", "ter"),                                 # centimetre
    (r"(?<=[a-z]{2})bre$", "ber"),                                 # fibre
    (r"llous$", "lous"),                                           # marvellous
    (r"^despatch", "dispatch"),
    (r"^cheque$", "check"),
    (r"^plough", "plow"),
    (r"(?<=[a-z]{2})our(?=$|hood|ite|able|ful|ed|ing|s$)", "or"),   # favour, neighbourhood（不动 tour、flourish）
    (r"licence$", "license"),
    (r"(?<=[a-z]{2})ise$", "ize"),                                 # realise, organise
    (r"yse$", "yze"),                                              # analyse
    (r"ogue$", "og"),                                              # catalogue, dialogue
]


# ---------- 视频表与书 ----------

def load_sources():
    return json.loads(SOURCES.read_text(encoding="utf-8"))


def save_sources(videos):
    blocks = []
    for v in videos:
        lines = [f'    "{k}": {json.dumps(x, ensure_ascii=False)}' for k, x in v.items()]
        blocks.append("  {\n" + ",\n".join(lines) + "\n  }")
    SOURCES.write_text("[\n" + ",\n".join(blocks) + "\n]\n", encoding="utf-8", newline="\n")


def book_words(with_meanings=False):
    """全书词条按书序：[(课id, 单元, 词条号, 词)]；with_meanings 时另给每个词条的中文释义关键词
    （去掉 [[ ]] 和括号里的注释，按标点切开，留两个字以上的）"""
    book = json.loads((DATA / "book.json").read_text(encoding="utf-8"))
    out, means = [], []
    for part in book["parts"]:
        for unit in part["units"]:
            for les in unit["lessons"]:
                d = json.loads((LESSONS / f"{les['id']}.json").read_text(encoding="utf-8"))
                for e in (e for g in d["groups"] for e in g["entries"]):
                    out.append((les["id"], unit["no"], e["no"], e["word"]))
                    text = "；".join(s["mean"] for p in e["prons"] for s in p["senses"]).replace("[[", "").replace("]]", "")
                    text = re.sub(r"（[^）]*）|\([^)]*\)", "", text)
                    means.append(sorted({k for k in re.split(r"[；;，,、/…\s]+", text) if len(k) >= 2}))
    return (out, means) if with_meanings else out


def video_pages(v):
    return list(range(v["pages"][0], v["pages"][1] + 1))


def covers(v, unit):
    return v["units"][0] <= unit <= v["units"][1]


# ---------- 字幕时间线 ----------

def sync_durations(videos):
    """用 view 接口补全/刷新视频表里用到的分 P 时长（已下架、表里又有时长的就沿用）"""
    changed = False
    for v in videos:
        try:
            pages = bili.view(v["bv"])["pages"]
        except bili.BiliError:
            if v.get("durations") and not v["alive"]:
                continue
            raise
        dur = {str(p["page"]): p["duration"] for p in pages if p["page"] in video_pages(v)}
        if v.get("durations") != dur:
            v["durations"], changed = dur, True
    if changed:
        save_sources(videos)


def page_subtitle(videos, v, page):
    """该分 P 的字幕；没有 AI 字幕时借用别的视频里时长一秒不差的分 P"""
    body = bili.subtitle(v["bv"], page)
    if body is not None:
        return body, None
    dur = v["durations"][str(page)]
    for u in videos:
        for p, d in u["durations"].items():
            if u is not v and d == dur:
                body = bili.subtitle(u["bv"], int(p))
                if body is not None:
                    return body, f"{u['id']} P{p}"
    return [], None


def timeline(videos, v):
    """把用到的分 P 接成一条时间线：(行列表 [(起, 止, 小写文本)], 分 P 起点 [(起点, 分P)])"""
    lines, starts, t0 = [], [], 0.0
    for p in video_pages(v):
        body, borrowed = page_subtitle(videos, v, p)
        if borrowed:
            print(f"  {v['id']} P{p} 没有 AI 字幕，借用 {borrowed}（时长相同）")
        elif not body:
            print(f"  WARN {v['id']} P{p} 没有 AI 字幕，也没有可借用的分 P")
        starts.append((t0, p))
        lines += [(t0 + x["from"], t0 + x["to"], x["content"].lower()) for x in body]
        t0 += v["durations"][str(p)]
    return lines, starts


def page_span(starts, v, t):
    """时间线时间 t 所在分 P 在时间线上的 [起点, 终点)"""
    s, p = starts[max(bisect.bisect_right([s for s, _ in starts], t) - 1, 0)]
    return s, s + v["durations"][str(p)]


def to_page(starts, t, durations):
    """时间线时间 → (分P, 分P 内的整数秒)"""
    k = max(bisect.bisect_right([s for s, _ in starts], t) - 1, 0)
    s, p = starts[k]
    return p, min(max(int(t - s), 0), durations[str(p)])


# ---------- 候选与权重 ----------

def spellings(word):
    w = word.lower()
    out = {w}
    if "-" in w:
        out |= {w.replace("-", ""), w.replace("-", " ")}
    if " " in w:
        out |= {w.replace(" ", "-"), w.replace(" ", "")}
    for s in list(out):
        for a, b in BRIT:
            out.add(re.sub(a, b, s))
    return sorted(out, key=len, reverse=True)


def matcher(word, all_words):
    """返回 (正则, 要排除的更长词条)。词头在边界上；≤3 个字母的短词词尾也要在边界上"""
    sp = spellings(word)
    alt = "|".join(re.escape(s) for s in sp)
    if len(word) <= 3:
        last = re.escape(word[-1])
        pat = rf"(?<![a-z])(?:{alt})(?:s|es|d|ed|ing|{last}ed|{last}ing|{last}y|y|ly|ful|ness)?(?![a-z])"
    else:
        pat = rf"(?<![a-z])(?:{alt})"
    pool = spelling_pool(all_words)
    longer = set()
    for p in sp:
        for s, x in pool[bisect.bisect_left(pool, (p,)):bisect.bisect_left(pool, (p + "\uffff",))]:
            if x != word.lower() and s != p:
                longer.add(s)
    return re.compile(pat), sorted(longer)


_pool = {}


def spelling_pool(all_words):
    """全部词条的全部拼写 [(拼写, 词)]，按拼写排序（找「以某拼写开头的更长词条」用）"""
    key = frozenset(x.lower() for x in all_words)
    if key not in _pool:
        _pool[key] = sorted((s, x) for x in key for s in spellings(x))
    return _pool[key]


class Corpus:
    """时间线上全部字幕拼成一个大字符串（行间用换行隔开），一次正则扫完"""

    def __init__(self, lines):
        self.lines = lines
        self.text = "\n".join(t for _, _, t in lines)
        self.offsets, n = [], 0
        for _, _, t in lines:
            self.offsets.append(n)
            n += len(t) + 1
        self.line_starts = [a for a, _, _ in lines]
        self.tokens = self.token_times = None    # 近似拼写用的英文词表，用到时再建
        # 词头索引：前 3 个字符 → 位置（只在这些位置上试匹配，比整串扫快得多）
        self.heads = {}
        for m in re.finditer(r"(?<![a-z])[a-z]", self.text):
            self.heads.setdefault(self.text[m.start():m.start() + 3], []).append(m.start())

    def time_at(self, i):
        """大字符串里第 i 个字符对应的时间（在行内按字符位置插值）"""
        k = bisect.bisect_right(self.offsets, i) - 1
        a, b, t = self.lines[k]
        return a + (b - a) * (i - self.offsets[k]) / max(len(t), 1)

    def markers(self):
        """开讲提示语：[(时间, 所在行的结束时间)]"""
        out = []
        for m in MARKER.finditer(self.text):
            k = bisect.bisect_right(self.offsets, m.start()) - 1
            out.append((self.time_at(m.start()), self.lines[k][1]))
        return sorted(out)

    def occurrences(self, word, all_words):
        """这个词在时间线上每次出现的时间（按字符位置在行内插值，同一行多个词也能分先后），
        以及其中紧跟在开讲提示语后面的（「这个单词叫做 X」）"""
        pat, longer = matcher(word, all_words)
        out, intro = set(), set()
        cand = sorted({i for s in spellings(word) for i in self.heads.get(s[:3], [])})
        for m in filter(None, (pat.match(self.text, i) for i in cand)):
            i = m.start()
            if any(self.text.startswith(x, i) for x in longer):
                continue
            t = self.time_at(i)
            out.add(t)
            k = bisect.bisect_right(self.offsets, i) - 1
            if MARKER.search(self.text, max(self.offsets[k], i - INTRO_GAP - 5), i):
                intro.add(t)
        return sorted(out), intro

    def line_end(self, t):
        """时间 t 所在字幕行的结束时间"""
        k = max(bisect.bisect_right(self.line_starts, t) - 1, 0)
        return self.lines[k][1]

    def find_text(self, keys, lo, hi):
        """(lo, hi) 里出现这些中文关键词的时间"""
        a = bisect.bisect_right(self.line_starts, lo)
        b = bisect.bisect_left(self.line_starts, hi)
        out = []
        for s, e, t in self.lines[max(a - 1, 0):b]:
            for key in keys:
                j = t.find(key)
                if j >= 0:
                    tt = s + (e - s) * j / max(len(t), 1)
                    if lo < tt < hi:
                        out.append(tt)
        return out

    def fuzzy(self, word, lo, hi, others):
        """(lo, hi) 里和这个词拼写相近、但不是它本身也不是邻近词条（others）及其派生的英文词出现的时间（字幕把词识别错时用）"""
        w = word.lower()
        if len(w) < FUZZY_MIN or not w.isalpha():
            return []
        if self.tokens is None:
            self.tokens = sorted((self.time_at(m.start()), m.group()) for m in re.finditer(r"[a-z]{%d,}" % FUZZY_MIN, self.text))
            self.token_times = [t for t, _ in self.tokens]
        out = []
        for t, tok in self.tokens[bisect.bisect_right(self.token_times, lo):bisect.bisect_left(self.token_times, hi)]:
            if (tok[0] != w[0] or abs(len(tok) - len(w)) > 3 or tok in STOPWORDS
                    or any(tok[:n] in others for n in range(FUZZY_MIN, len(tok) + 1))):
                continue
            if difflib.SequenceMatcher(None, w, tok).ratio() >= FUZZY_RATIO:
                out.append(t)
        return out


def weights(ts):
    return [bisect.bisect_right(ts, t + WINDOW) - bisect.bisect_left(ts, t - WINDOW) for t in ts]


# ---------- 加权最长递增链 ----------

def best_chain(occ):
    """occ[i] = 第 i 个词的 [(时间, 权重)]。每词至多选一个、时间严格递增，总权重最大；
    同分时选更早的时间。返回 {i: 选中的时间}"""
    times = sorted({t for o in occ for t, _ in o})
    pos = {t: k + 1 for k, t in enumerate(times)}
    n = len(times)
    tree = [None] * (n + 1)      # 树状数组，存 (总分, -时间, 词序号, 时间)

    def better(a, b):
        return b is None or (a is not None and a[:2] > b[:2])

    def query(k):
        best = None
        while k > 0:
            if better(tree[k], best):
                best = tree[k]
            k -= k & -k
        return best

    def update(k, val):
        while k <= n:
            if better(val, tree[k]):
                tree[k] = val
            k += k & -k

    prev = {}
    for i, o in enumerate(occ):
        new = []
        for t, w in o:
            b = query(pos[t] - 1)
            new.append(((b[0] if b else 0) + w, -t, i, t))
            prev[(i, t)] = (b[2], b[3]) if b else None
        for val in new:
            update(pos[val[3]], val)
    picks, k = {}, None
    best = query(n)
    if best:
        k = (best[2], best[3])
    while k:
        picks[k[0]] = k[1]
        k = prev[k]
    return picks


def seg_start(q_all, intro, p_all, lo, hi):
    """这个词在 (lo, hi] 里那段讲解的起点：分界前是前面的词、分界后是这个词的出现次数最多（同分取早）；
    相邻两次提到隔得太久的不算同一段。分界前面还有「这个单词叫做 X」，就从那里算
    （前一个词和这个词发音相近时，字幕常把这个词也写成前一个词，分界会被推后）"""
    q = [t for t in q_all if lo < t <= hi]
    k = len(q) - 1
    while k > 0 and q[k] - q[k - 1] <= SEG_GAP:
        k -= 1
    q = q[k:]
    p = [t for t in p_all if lo <= t < hi]
    best = None
    for j, t in enumerate(q):
        sc = bisect.bisect_left(p, t) + len(q) - j
        if best is None or sc > best[0]:
            best = (sc, t)
    return max([t for t in q if t in intro and t < best[1]], default=best[1])


# ---------- 单个视频的对齐 ----------

def stray(occ, i, t):
    """只提了一次（权重 1）、且前后 60 秒内都有相邻词条的成串讲解 —— 多半是讲邻词时顺嘴提到，不算找到"""
    for j in (i - 1, i + 1):
        if 0 <= j < len(occ):
            near = [x for x in occ[j] if abs(x - t) <= WINDOW]
            if len(near) >= 3 and near[0] < t < near[-1]:
                return True
    return False


def nearby_words(res, k):
    """书序上前后 FUZZY_NEAR 个词条（含自己），小写"""
    n = res["pos"][k]
    return {res["words"][j][3].lower() for j in res["idx"][max(n - FUZZY_NEAR, 0):n + FUZZY_NEAR + 1]}


def own_meanings(res, k):
    """这个词条的中文释义关键词，去掉和前面几个词条释义重叠的（同一词群常是近义词，前一个词的讲解里也会说）"""
    n = res["pos"][k]
    prev = [m for j in res["idx"][max(n - 3, 0):n] for m in res["means"][j]]
    return [m for m in res["means"][k] if not any(m in p or p in m for p in prev)]


def marker_before(res, base, lo, before):
    """起点前不远处的「这个单词叫做」这类提示语（老师开讲时说了，但词本身常被识别错）。
    提示语和起点之间又提到前面的词，多半是提示语引出的是前面的词——除非只在后面的行里提了一次（顺口对比）"""
    markers = res["markers"]
    i = bisect.bisect_left(markers, (base,)) - 1
    if i >= 0 and markers[i][0] > max(lo, base - MARKER_BACK):
        mt, line_end = markers[i]
        mid = [t for t in before if mt <= t < base]
        if not mid or (len(mid) == 1 and mid[0] >= line_end):
            return mt
    return None


def refine(res, k, base, lo, before, intro=False):
    """讲解起点往前修（老师常先讲谐音、联想，词本身被识别错，第一次认出来已经晚了）：
    ① 起点就是「这个单词叫做 X」→ 就从这里开始（前面的近义词讲解里常提到这个词的释义，不再往前找）；
    ② 否则在最后一次提到前面的词之后，找近似拼写（bind → band、immigrate → immigrant）或这个词独有的中文释义
       （dean → 系主任），从最早的那个算；
    ③ 起点前不远有「这个单词叫做」这类提示语 → 从提示语开始；
    ④ 都没有、而前面的词最后一次出现离起点 8~20 秒：中间多半已是这个词的开场白，从那一行的末尾开始"""
    corpus = res["corpus"]
    p_before = [t for t in before if t < base]
    if not intro:
        last_p = max([lo, base - FUZZY_BACK] + p_before)
        near = corpus.fuzzy(res["words"][k][3], last_p, base, nearby_words(res, k))
        near += corpus.find_text(own_meanings(res, k), last_p, base)
        base = min(near + [base])
    m = marker_before(res, base, lo, before)
    if m is not None or intro:
        return base if m is None else m
    if p_before and GAP_MIN <= base - p_before[-1] <= GAP_FILL:
        return min(corpus.line_end(p_before[-1]), base)
    return base


def align_video(videos, v, words, means, all_words):
    """对齐一个视频：返回 {"idx": 该视频覆盖的全书词序号, "jumps": {全书词序号: 时间线上的跳转点}, "starts": 分 P 起点, …}"""
    idx = [k for k, w in enumerate(words) if covers(v, w[1])]
    lines, starts = timeline(videos, v)
    corpus = Corpus(lines)
    occ, intro = zip(*[corpus.occurrences(words[k][3], all_words) for k in idx]) if idx else ((), ())
    wts = [weights(o) for o in occ]
    picks = best_chain([list(zip(o, w)) for o, w in zip(occ, wts)])
    for i, t in list(picks.items()):
        if wts[i][occ[i].index(t)] == 1 and stray(occ, i, t):
            del picks[i]
    res = {"idx": idx, "pos": {k: n for n, k in enumerate(idx)}, "words": words, "means": means, "starts": starts,
           "corpus": corpus, "markers": corpus.markers(), "occ": {k: o for k, o in zip(idx, occ)}}
    # 跳转点
    jumps, bases, last_jump = {}, {}, float("-inf")
    found = sorted(picks)
    for n, i in enumerate(found):
        lo = bases[found[n - 1]] if n else float("-inf")
        before = sorted(t for m in found[max(n - 2, 0):n] for t in occ[m])
        base = bases[i] = seg_start(occ[i], intro[i], before, lo, picks[i])
        start = refine(res, idx[i], base, lo, before, intro=base in intro[i])
        # 往前修、往前提的 3 秒都不跨回上一个分 P（否则会落在上一课视频的末尾）
        last_jump = max(start - LEAD, page_span(starts, v, base)[0], last_jump)
        jumps[idx[i]] = last_jump
    res["jumps"] = jumps
    return res


def drop_missing(v, words, res):
    """成段缺失：整课直接找到不足一半 → 整课不给；连续 ≥5 个找不到 → 这些词不给。返回不给的词序号集合"""
    idx, jumps = res["idx"], res["jumps"]
    drop = set()
    by_lesson = {}
    for k in idx:
        by_lesson.setdefault(words[k][0], []).append(k)
    for lid, ks in by_lesson.items():
        if sum(k in jumps for k in ks) < LESSON_MIN * len(ks):
            drop |= set(ks)
    run = []
    for k in [k for k in idx if k not in drop] + [None]:
        if k is not None and k not in jumps:
            run.append(k)
            continue
        if len(run) >= RUN_GAP:
            drop |= set(run)
        run = []
    for k in drop:
        jumps.pop(k, None)
    return drop


def fill_approx(videos, words, results):
    """找不到的词：另一个视频换算，或同视频插值。返回 {视频id: {词序号: 时间}}"""
    approx = {}
    for v in videos:
        res = results[v["id"]]
        jumps, idx = res["jumps"], [k for k in res["idx"] if k not in res["drop"]]
        found = [k for k in idx if k in jumps]
        out = approx[v["id"]] = {}
        for k in idx:
            if k in jumps:
                continue
            n = bisect.bisect_left(found, k)
            a = found[n - 1] if n else None
            b = found[n] if n < len(found) else None
            if a is None and b is None:
                continue
            lo = jumps[a] if a is not None else 0
            hi = jumps[b] if b is not None else float("inf")
            est = from_other(videos, results, v, k, words)
            if est is None:
                est = fuzzy_approx(res, k, a, b)
            if est is None:
                if a is not None and b is not None:
                    est = lo + (hi - lo) * (k - a) / (b - a)
                else:
                    est = lo if a is not None else max(hi - LEAD, 0)
            est = min(max(est, lo), hi)
            # 一课的头一个 / 最后一个词：别落进上一课 / 下一课的分 P
            same = lambda m: m is not None and words[m][0] == words[k][0]
            if same(b) and not same(a):
                est = max(est, page_span(res["starts"], v, hi)[0])
            if same(a) and not same(b):
                est = min(est, page_span(res["starts"], v, lo)[1] - 1)
            out[k] = est
        # 相邻几个 approx 各自换算，可能前后颠倒：按书序取前缀最大，保证不减
        cur = 0
        for k in idx:
            if k in out:
                out[k] = cur = max(out[k], cur)
            else:
                cur = jumps[k]
    return approx


def fuzzy_approx(res, k, a, b):
    """同视频前后两个直接找到的词之间，有这个词的近似拼写或独有的中文释义：和找讲解起点一样用变点法
    （分界前是前一个词、分界后是这些线索），再往前修"""
    jumps = res["jumps"]
    lo = jumps[a] if a is not None else float("-inf")
    hi = jumps[b] if b is not None else float("inf")
    if hi - lo > FUZZY_SPAN:      # 两个已定位的词隔得太远，猜不准
        return None
    before = [t for t in res["occ"][a] if lo <= t < hi] if a is not None else []
    near = res["corpus"].fuzzy(res["words"][k][3], lo, hi, nearby_words(res, k))
    near += res["corpus"].find_text(own_meanings(res, k), lo, hi)
    if not near:
        return None
    base = seg_start(sorted(near), set(), before, lo, max(near))
    return refine(res, k, base, lo, before) - LEAD


def from_other(videos, results, v, k, words):
    """另一个视频直接找到了第 k 个词：用两边都直接找到的邻近词（同一课内，每边至多 2 个）的时间差中位数换算。
    多个视频可选时取时间差最稳定（极差最小）的那个"""
    jv = results[v["id"]]["jumps"]
    best = None
    for u in videos:
        ju = results[u["id"]]["jumps"]
        if u is v or k not in ju:
            continue
        both = [m for m in jv if m in ju and words[m][0] == words[k][0]]
        before = sorted(m for m in both if m < k)[-NEIGHBORS:]
        after = sorted(m for m in both if m > k)[:NEIGHBORS]
        diffs = [jv[m] - ju[m] for m in before + after]
        if not diffs:
            continue
        spread = max(diffs) - min(diffs)
        if best is None or spread < best[0]:
            best = (spread, ju[k] + statistics.median(diffs))
    return best[1] if best else None


# ---------- 输出 ----------

def lesson_json(lid, sources, entries):
    head = ",\n".join(f"    {json.dumps(s, ensure_ascii=False)}" for s in sources)
    body = ",\n".join(f'    "{no}": {json.dumps(e, ensure_ascii=False)}' for no, e in entries)
    return f'{{\n  "lesson": "{lid}",\n  "sources": [\n{head}\n  ],\n  "entries": {{\n{body}\n  }}\n}}\n'


def run():
    videos = load_sources()
    sync_durations(videos)
    words, means = book_words(with_meanings=True)
    all_words = {w.lower() for *_, w in words}
    results = {}
    for v in list(videos):
        print(f"对齐 {v['id']}（{v['label']}）…")
        try:
            res = results[v["id"]] = align_video(videos, v, words, means, all_words)
        except bili.BiliError as e:
            if v["alive"]:      # 在线的视频拉不到字幕：多半是网络或 cookie 问题，停下来别把它从数据里删掉
                raise
            print(f"  WARN {v['id']} 已下架且没有字幕缓存，跳过：{e}")
            videos.remove(v)
            continue
        res["drop"] = drop_missing(v, words, res)
    approx = fill_approx(videos, words, results)

    # 写每课文件
    OUT.mkdir(parents=True, exist_ok=True)
    lessons = {}
    for k, w in enumerate(words):
        lessons.setdefault(w[0], []).append(k)
    stats = {v["id"]: {} for v in videos}
    no_video = []
    for lid, ks in lessons.items():
        entries, used = [], set()
        for k in ks:
            e = {}
            for v in videos:
                res = results[v["id"]]
                if k in res["jumps"]:
                    t, flag = res["jumps"][k], []
                elif k in approx[v["id"]]:
                    t, flag = approx[v["id"]][k], [1]
                else:
                    continue
                p, s = to_page(res["starts"], t, v["durations"])
                e[v["id"]] = [p, s] + flag
                used.add(v["id"])
            if not e:
                no_video.append(f"{lid}#{words[k][2]} {words[k][3]}")
            entries.append((words[k][2], e))
        sources = [{"id": v["id"], "bv": v["bv"], "label": v["label"], "alive": v["alive"]} for v in videos if v["id"] in used]
        (OUT / f"{lid}.json").write_text(lesson_json(lid, sources, entries), encoding="utf-8", newline="\n")
        for v in videos:
            if covers(v, words[ks[0]][1]):
                stats[v["id"]][lid] = (sum(k in results[v["id"]]["jumps"] for k in ks), len(ks),
                                       sum(k in approx[v["id"]] for k in ks), sum(k in results[v["id"]]["drop"] for k in ks))
    report(videos, words, results, approx, stats, no_video)


def report(videos, words, results, approx, stats, no_video):
    print("\n每个视频、每课：直接找到 / 词条数（approx 数，不给的词数）")
    total_direct = total_pairs = 0
    for v in videos:
        st = stats[v["id"]]
        d = sum(x[0] for x in st.values())
        n = sum(x[1] for x in st.values())
        a = sum(x[2] for x in st.values())
        dr = sum(x[3] for x in st.values())
        total_direct += d
        total_pairs += d + a
        print(f"== {v['id']} {v['label']}：直接 {d}/{n}（{d / n:.1%}），approx {a}，不给 {dr}")
        print("   " + "  ".join(f"{lid[1:3]}{lid[-2:]} {x[0]}/{x[1]}" + (f"~{x[2]}" if x[2] else "") + (f"-{x[3]}" if x[3] else "")
                                 for lid, x in st.items()))
    print(f"\n全部（词条 × 视频）{total_pairs} 个时间点，非 approx {total_direct}（{total_direct / max(total_pairs, 1):.1%}）")
    print("\napprox 清单：")
    for v in videos:
        ks = sorted(approx[v["id"]])
        if ks:
            print(f"  {v['id']}（{len(ks)}）：" + " ".join(f"{words[k][0][1:3]}{words[k][0][-2:]}#{words[k][2]}:{words[k][3]}" for k in ks))
    if no_video:
        print(f"\nWARN 没有任何视频的词条 {len(no_video)} 个：" + " ".join(no_video))


# ---------- --check ----------

def check_alive():
    videos = load_sources()
    for v in videos:
        code, _ = bili.view_raw(v["bv"])
        v["alive"] = code == 0
        print(f"{v['id']} {v['bv']} {'在线' if v['alive'] else f'不在了（code {code}）'}")
    save_sources(videos)
    alive = {v["id"]: v["alive"] for v in videos}
    n = 0
    for f in sorted(OUT.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        for s in d["sources"]:
            s["alive"] = alive.get(s["id"], s["alive"])
        f.write_text(lesson_json(d["lesson"], d["sources"], list(d["entries"].items())), encoding="utf-8", newline="\n")
        n += 1
    print(f"已更新视频表和 {n} 个课数据文件的 alive")


# ---------- --sample ----------

def sample(per_unit, seed):
    """每单元随机抽词，打印首选视频跳转点前后 30 秒的字幕"""
    videos = {v["id"]: v for v in load_sources()}
    words = book_words()
    rng = random.Random(seed)
    for unit in sorted({w[1] for w in words}):
        for lid, _, no, word in rng.sample([w for w in words if w[1] == unit], per_unit):
            d = json.loads((OUT / f"{lid}.json").read_text(encoding="utf-8"))
            e = d["entries"].get(str(no), {})
            vid = next((s["id"] for s in d["sources"] if s["alive"] and s["id"] in e), None)
            if not vid:
                print(f"\n### {lid}#{no} {word}：没有视频")
                continue
            p, s, *ap = e[vid]
            body, _ = page_subtitle(list(videos.values()), videos[vid], p)
            print(f"\n### {lid}#{no} {word} → {vid} P{p} {s // 60}:{s % 60:02d}{'（approx）' if ap else ''}")
            near = [x for x in body if s - 30 <= x["from"] <= s + 30]
            first = next((x for x in near if x["from"] >= s), None)
            for x in near:
                t = int(x["from"])
                print(f"  {'>>' if x is first else '  '} {t // 60}:{t % 60:02d} {x['content']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--sample", type=int)
    ap.add_argument("--seed", type=int, default=20261015)
    a = ap.parse_args()
    if a.check:
        check_alive()
    elif a.sample:
        sample(a.sample, a.seed)
    else:
        run()


if __name__ == "__main__":
    sys.exit(main())
