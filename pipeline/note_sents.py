"""第 4.5 步辅助：列出一课的例句（给 note-writer 当输入），或统计 notes 写了多少。

用法：
  python pipeline/note_sents.py u07-l03           列出例句，★ 标出值得考虑写解析的候选
  python pipeline/note_sents.py u07-l03 --check   统计 site/data/notes/u07-l03.json：词组数、解析数、没写到的句子
  python pipeline/note_sents.py --all             全部课的候选数和已写数汇总
格式错误由 validate.py 检查；这里只做粗筛和计数。
候选（只是粗筛，写不写由模型判断）：≥15 词；或 ≥10 词且含从句 / 被动 / 插入语的标志。
"""
import json
import re
import sys

from config import DATA, LESSONS

CLAUSE = re.compile(r"\b(that|which|who|whom|whose|where|when|what|whether|if|because|although|though|while|since|unless|until|once|as if|so that)\b", re.I)
PASSIVE = re.compile(r"\b(am|is|are|was|were|be|been|being|get|got|gets)\s+(\w+ly\s+)?\w+(ed|en|wn|ght|lt|pt|ld|ung|un)\b", re.I)
PAREN = re.compile(r",[^,]+,|\s[-—]\s|—|\(")


def sentences(lid):
    d = json.loads((LESSONS / f"{lid}.json").read_text(encoding="utf-8"))
    out = []
    for g in d["groups"]:
        for e in g["entries"]:
            if e.get("ex"):
                out.append((e["word"], e["ex"]["en"], e["ex"]["zh"]))
    return out


def candidate(en):
    n = len(re.findall(r"[A-Za-z']+", en))
    return n >= 15 or (n >= 10 and bool(CLAUSE.search(en) or PASSIVE.search(en) or PAREN.search(en)))


def load_notes(lid):
    f = DATA / "notes" / f"{lid}.json"
    return json.loads(f.read_text(encoding="utf-8")).get("sents", {}) if f.exists() else None


def main(args):
    if args and args[0] == "--all":
        tot = [0, 0, 0, 0]
        for f in sorted(LESSONS.glob("*.json")):
            ss, notes = sentences(f.stem), load_notes(f.stem)
            c = sum(candidate(en) for _, en, _ in ss)
            ph = sum(len(n.get("ph", [])) for n in (notes or {}).values())
            an = sum(1 for n in (notes or {}).values() if n.get("an"))
            tot = [tot[0] + len(ss), tot[1] + c, tot[2] + ph, tot[3] + an]
            print(f"{f.stem}：例句 {len(ss)}，候选 {c}，" + (f"词组 {ph}，解析 {an}" if notes is not None else "未生成"))
        print(f"合计：例句 {tot[0]}，候选 {tot[1]}，词组 {tot[2]}（片段条数），解析 {tot[3]}")
        return
    lid, check = args[0], "--check" in args
    ss = sentences(lid)
    if not check:
        print(f"## {lid} 例句（{len(ss)} 句，★ = 解析候选 {sum(candidate(en) for _, en, _ in ss)} 句）")
        for w, en, zh in ss:
            print(f"{'★' if candidate(en) else '·'} [{w}] {en}\n    书译：{zh}")
        return
    notes = load_notes(lid)
    if notes is None:
        print(f"[FAIL] {lid}：没有 site/data/notes/{lid}.json")
        sys.exit(1)
    missing = [en for _, en, _ in ss if en not in notes]
    ph = sum(len(n.get("ph", [])) for n in notes.values())
    an = [en for en, n in notes.items() if n.get("an")]
    cand = sum(candidate(en) for _, en, _ in ss)
    print(f"[OK] {lid}：例句 {len(ss)}，写到 {len(ss) - len(missing)} 句，词组片段 {ph} 条，解析 {len(an)} 句（候选 {cand}）")
    if missing:
        print(f"  没写到的句子（没有可标的词组就不用写，确认一下）：{len(missing)} 句")
        for en in missing:
            print("   ", en)


if __name__ == "__main__":
    main(sys.argv[1:])
