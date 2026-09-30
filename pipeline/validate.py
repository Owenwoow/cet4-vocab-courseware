"""第 3 步：校验 Lesson JSON。不花 token，专门拦截抽取错误。

用法：python pipeline/validate.py [u07-l01 ...]   不给参数则校验全部
退出码：有 ERROR 时为 1。WARN 需要人看一眼，不阻断。
"""
import json
import re
import sys

from config import LESSONS

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
            if rel not in REL:
                r.warn(gw, f"导图关系 {rel!r} 未登记")
        names = {n for n, _ in nodes}
        for e in g["entries"]:
            if e["word"] not in names:
                r.warn(gw, f"词条 {e['word']} 不在导图里")
        for n in names - in_group:
            r.warn(gw, f"导图词 {n} 在本词群找不到词条/扩展词")
    return r, len(seen)


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
