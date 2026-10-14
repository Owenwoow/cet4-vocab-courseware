"""第 3 步：校验 Lesson JSON。不花 token，专门拦截抽取错误。

用法：python pipeline/validate.py [u07-l01 ...]   不给参数则校验全部
退出码：有 ERROR 时为 1。WARN 需要人看一眼，不阻断。
"""
import json
import re
import sys

from config import DATA, LESSONS

POS = {"n.", "v.", "adj.", "adv.", "prep.", "conj.", "pron.", "num.", "art.",
       "int.", "aux.", "modal v.", "phr.", "n. & v.", "v. & n.", "adj. & adv.", "adv. & adj."}
TIP_TYPES = {"联想", "构词", "谐音", "对照"}
EX_TYPES = {"真", "例"}
REL = {"扩", "近义", "相关", "形近", "反义", "同根", "音近", "加s", None}
# IPA 允许的字符；OCR 常把 ˈ 认成 '，把 ː 认成 :
IPA_OK = re.compile(r"^/[a-zA-Zɑɒæʌəɜɪʊɔeiuːˈˌθðʃʒŋɡ()\s.-]+/$")


class Report:
    def __init__(self, lid):
        self.lid, self.errors, self.warns = lid, [], []

    def err(self, where, msg):
        self.errors.append(f"{where}: {msg}")

    def warn(self, where, msg):
        self.warns.append(f"{where}: {msg}")


def check_ipa(r, where, ipa):
    if not ipa:
        r.err(where, "缺少音标")
    elif "uːə" in ipa:
        r.warn(where, f"音标 {ipa} 里的 uːə 多半应为 ʊə（如 /ɪnˈʃʊə(r)/）")
    elif not IPA_OK.match(ipa):
        bad = "".join(sorted({c for c in ipa.strip("/") if not IPA_OK.match(f"/{c}/")}))
        r.warn(where, f"音标含可疑字符 {bad!r}：{ipa}")


def check_senses(r, where, senses):
    if not senses:
        r.err(where, "缺少释义")
    for s in senses:
        if s.get("pos") not in POS:
            r.warn(where, f"未登记的词性 {s.get('pos')!r}")
        m = s.get("mean", "")
        if not m:
            r.err(where, "释义为空")
        if m.count("[[") != m.count("]]"):
            r.err(where, f"下划线标记 [[ ]] 不成对：{m}")


def phrase_in(sentence, phrase):
    return re.search(r"(?<![A-Za-z])" + re.escape(phrase) + r"(?![A-Za-z])", sentence, re.I)


def map_words(node, out):
    out.append((node["w"], node.get("rel")))
    for c in node.get("children", []):
        map_words(c, out)
    return out


def unsure_marks(node, path=""):
    """抽取模型对认不清的字标了 ⟨?⟩，全部列出给人看"""
    if isinstance(node, str):
        return [f"{path} = {node}"] if "⟨?⟩" in node else []
    items = node.items() if isinstance(node, dict) else enumerate(node) if isinstance(node, list) else []
    return [m for k, v in items for m in unsure_marks(v, f"{path}.{k}" if path else str(k))]


def validate(path):
    d = json.loads(path.read_text(encoding="utf-8"))
    r = Report(d.get("id", path.stem))
    for m in unsure_marks(d):
        r.warn("认不清", m)
    us = d.get("unit_summary")
    if us is not None and set(us) != {"groups", "words", "ext", "zhen", "li"}:
        r.err("单元小结", f"字段应为 groups/words/ext/zhen/li，实际 {sorted(us)}")
    expect_no = 1
    seen = set()
    for g in d["groups"]:
        gw = f"词群{g['no']}"
        if not g.get("title"):
            r.err(gw, "缺少标题")
        in_group = set()
        for e in g["entries"]:
            w = f"{gw} #{e.get('no')} {e.get('word')}"
            if e.get("no") != expect_no:
                r.err(w, f"序号不连续，期望 {expect_no}（漏抽或重抽？）")
                expect_no = e.get("no", expect_no)
            expect_no += 1
            if e["word"] in seen:
                r.err(w, "重复词条")
            seen.add(e["word"])
            in_group.add(e["word"])
            if e.get("freq") not in (1, 2, 3):
                r.err(w, f"考频应为 1~3，实际 {e.get('freq')}")
            if not e.get("prons"):
                r.err(w, "缺少 prons")
            for p in e.get("prons", []):
                check_ipa(r, w, p.get("ipa"))
                check_senses(r, w, p.get("senses"))
            tip = e.get("tip")
            if tip and tip.get("type") not in TIP_TYPES:
                r.warn(w, f"未登记的记忆法类型 {tip.get('type')!r}")
            ex = e.get("ex")
            if ex:
                if ex.get("type") not in EX_TYPES:
                    r.err(w, f"例句类型应为 真/例，实际 {ex.get('type')!r}")
                if ex.get("type") == "真" and not ex.get("year"):
                    r.err(w, "真题例句缺少年份")
                if not ex.get("en") or not ex.get("zh"):
                    r.err(w, "例句或译文为空")
                if re.search("[‘’“”]", ex.get("en", "")):
                    r.err(w, "英文例句里有弯引号，撇号/引号要用直的 ' \"（否则网页点读会把 wasn’t 拆成两个词）")
                for k in ex.get("key", []):
                    if not phrase_in(ex["en"], k):
                        r.err(w, f"重点词 {k!r} 不在例句中")
                if not ex.get("key"):
                    r.warn(w, "例句没有标重点词")
            else:
                r.warn(w, "没有例句（确认书上确实没有，或在下一页）")
            for x in e.get("ext", []):
                xw = f"{w} → 扩展 {x.get('word')}"
                in_group.add(x["word"])
                check_ipa(r, xw, x.get("ipa"))
                check_senses(r, xw, x.get("senses"))
        # 思维导图与词条互相核对
        nodes = map_words(g["map"], [])[1:]
        for word, rel in nodes:
            # 书上也有「pet相关」「去et」这类临时标签，短标签都放行，只拦明显抄错的长串
            if rel not in REL and len(rel) > 6:
                r.warn(gw, f"导图关系 {rel!r} 过长，确认是否抄错")
        names = {n for n, _ in nodes}
        root = g["map"]["w"]
        for e in g["entries"]:
            if e["word"] not in names and e["word"] not in root:   # 根节点可能就是词条，如「device 相关」
                r.warn(gw, f"词条 {e['word']} 不在导图里")
        for n in names - in_group:
            r.warn(gw, f"导图词 {n} 在本词群找不到词条/扩展词")
    check_roots(r, d)
    check_notes(r, d)
    return r, len(seen)


WORD_CH = re.compile(r"[A-Za-z']")


def find_at_boundary(s, t, start=0):
    """t 在 s 里从 start 起第一次出现、两端落在单词边界上的位置；找不到返回 -1。
    与网页 sentenceHTML 的定位规则一致（单词 = 字母和撇号）"""
    i = s.find(t, start)
    while i >= 0:
        before = s[i - 1] if i > 0 else ""
        after = s[i + len(t)] if i + len(t) < len(s) else ""
        if not (before and WORD_CH.match(before)) and not (after and WORD_CH.match(after)):
            return i
        i = s.find(t, i + 1)
    return -1


def locate_phrases(s, ph):
    """按定位规则给每条 ph 找位置：单段取第一次出现；同一 b 的后续段从上一段结尾之后找。
    返回 [(起, 止) 或 None]"""
    last_end, out = {}, []
    for p in ph:
        t, b = p.get("t", ""), p.get("b", "")
        i = find_at_boundary(s, t, last_end.get(b, 0)) if t else -1
        if i < 0:
            out.append(None)
            continue
        out.append((i, i + len(t)))
        last_end[b] = i + len(t)
    return out


def check_notes(r, data):
    """例句词组与语法解析（site/data/notes/，书外补充）"""
    f = DATA / "notes" / f"{data['id']}.json"
    if not f.exists():
        return
    sents = {e["ex"]["en"] for g in data["groups"] for e in g["entries"] if e.get("ex")}
    notes = json.loads(f.read_text(encoding="utf-8")).get("sents")
    if not isinstance(notes, dict):
        r.err("词组解析", "缺少 sents 对象")
        return
    for s, n in notes.items():
        where = f"词组解析「{s[:40]}{'…' if len(s) > 40 else ''}」"
        if s not in sents:
            r.err(where, "本课没有这句例句（键要和 ex.en 逐字相同）")
            continue
        ph = n.get("ph", [])
        if not isinstance(ph, list):
            r.err(where, "ph 应为数组")
            ph = []
        for p in ph:
            for k in ("t", "b", "m"):
                if not str(p.get(k, "")).strip():
                    r.err(where, f"词组 {p.get('t')!r} 的 {k} 为空")
        spans = locate_phrases(s, ph)
        taken = []   # (起, 止, b)
        for p, sp in zip(ph, spans):
            t = p.get("t", "")
            if t and not (WORD_CH.match(t[0]) and WORD_CH.match(t[-1])):
                r.err(where, f"词组片段 {t!r} 首尾应是单词，不要带空格或标点")
            if sp is None:
                r.err(where, f"词组片段 {t!r} 不在句中，或没落在单词边界上")
                continue
            for a, z, b in taken:
                if sp[0] < z and a < sp[1] and b != p.get("b"):
                    r.err(where, f"词组 {p.get('b')!r} 的片段 {p.get('t')!r} 和词组 {b!r} 重叠")
            taken.append((*sp, p.get("b")))
        an = n.get("an")
        if an is None:
            continue
        if "talk" in an:
            check_talk(r, where, s, an)
            continue
        r.err(where, "解析必须是 talk 格式（对话带练），见 pipeline/prompts/notes.md")


TALK_KEYS = {"talk", "order", "sum", "cmp"}


def check_talk(r, where, s, an):
    """对话带练式解析：talk 1~6 块（t 是英文片段，按顺序出现在原句里，可省；s 是带练文字），
    order 排顺序（选填），sum 合起来的译文，cmp 和书译的对照"""
    extra = set(an) - TALK_KEYS
    if extra:
        r.err(where, f"解析里有多余的字段 {sorted(extra)}（只能有 talk/order/sum/cmp）")
    talk = an.get("talk")
    if not isinstance(talk, list) or not 1 <= len(talk) <= 6:
        r.err(where, f"talk 应为 1~6 块，实际 {len(talk) if isinstance(talk, list) else talk!r}")
        talk = talk if isinstance(talk, list) else []
    pos = 0
    for i, b in enumerate(talk, 1):
        if not isinstance(b, dict) or not str(b.get("s", "")).strip():
            r.err(where, f"第 {i} 块的带练文字 s 为空")
            continue
        t = b.get("t", "")
        if t:
            j = s.find(t, pos)
            if j < 0:
                r.err(where, f"第 {i} 块的英文片段 {t[:30]!r} 不在原句里，或顺序不对（要按句中先后）")
            else:
                pos = j + len(t)
    if "order" in an and not str(an["order"]).strip():
        r.err(where, "order 写了但是空的（不需要就删掉这个字段）")
    for k in ("sum", "cmp"):
        if not str(an.get(k, "")).strip():
            r.err(where, f"缺少 {k}（{'合起来的译文' if k == 'sum' else '和书译的对照'}）")


def check_roots(r, data):
    """词根法补充（site/data/roots/，书外）：只给书上用联想/谐音法的词条补。"""
    f = DATA / "roots" / f"{data['id']}.json"
    if not f.exists():
        return
    tips = {e["word"]: (e.get("tip") or {}).get("type") for g in data["groups"] for e in g["entries"]}
    for word, text in json.loads(f.read_text(encoding="utf-8")).get("words", {}).items():
        where = f"词根补充 {word}"
        if word not in tips:
            r.err(where, "本课没有这个词条")
        elif tips[word] not in ("联想", "谐音"):
            r.err(where, f"书上已是「{tips[word]}」法，不需要补词根")
        if not isinstance(text, str) or "→" not in text:
            r.err(where, f"格式应为「词根（含义）+ … → 词义」：{text!r}")


def main(ids):
    files = [LESSONS / f"{i}.json" for i in ids] if ids else sorted(LESSONS.glob("*.json"))
    failed = False
    for f in files:
        r, n = validate(f)
        status = "FAIL" if r.errors else "OK"
        print(f"[{status}] {r.lid}：{n} 个词条，{len(r.errors)} 错误，{len(r.warns)} 提醒")
        for m in r.errors:
            print("  ERROR", m)
        for m in r.warns:
            print("  WARN ", m)
        failed |= bool(r.errors)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
