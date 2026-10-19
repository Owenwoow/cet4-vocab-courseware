"""第 4.5 步辅助：列出一课的例句（给 note-writer 当输入），或统计 notes 写了多少。

用法：
  python pipeline/note_sents.py u07-l03           列出例句，★ 标出值得考虑写解析的候选
  python pipeline/note_sents.py u07-l03 --check   统计 site/data/notes/u07-l03.json：词组数、解析数、没写到的句子
  python pipeline/note_sents.py --all             全部课的候选数和已写数汇总
格式错误由 validate.py 检查；这里只做粗筛和计数。
候选（只是粗筛，写不写由模型判断）：≥12 词；或含从句连词 / 被动 / to do / -ing 短语 / 逗号、破折号、括号。
讲解的选句标准是「除最简单的简单句都写」（pipeline/prompts/notes.md 第二节），宁可多标几个让模型排除。
"""
import json
import re
import sys

from config import DATA, LESSONS

CLAUSE = re.compile(r"\b(that|which|who|whom|whose|where|when|what|whether|if|because|although|though|while|since|unless|until|once|as|before|after|than|so|whenever|wherever|however|whatever|whoever)\b", re.I)
# 被动：be / get +（副词）+ 过去分词；规则变化看词尾，常见的不规则过去分词单列
IRREGULAR = "made|done|said|paid|laid|heard|put|set|cut|hit|shut|read|led|met|sent|spent|lent|bent|lost|found|left|kept|told|sold|held|built|seen|born|borne|struck|stuck|hung|won|run|begun|understood|upset|spread|hurt|cast|shed|fed|fled|bred|bound|wound|ground"
PASSIVE = re.compile(r"\b(am|is|are|was|were|be|been|being|get|got|gets|getting|gotten)\s+(\w+ly\s+)?(\w+(ed|en|wn|ght|lt|pt|ld|ung|un)|" + IRREGULAR + r")\b", re.I)
# to do：to 后面不是冠词、代词、限定词（粗筛：to school 这类介词短语也会标上）
TO_DO = re.compile(r"\bto\s+(?!(the|a|an|his|her|my|your|our|their|its|this|that|these|those|me|him|them|us|you|it|one|some|any|every|each|all|no)\b)[a-z]+\b", re.I)
# -ing 短语：不跟在 be 后面（进行时 is running out 不算），也不是 thing / morning 这类名词
ING_NOUN = {"thing", "something", "nothing", "anything", "everything", "morning", "evening", "during", "king", "ring", "spring", "string", "wing", "ceiling", "building", "feeling", "meeting", "painting", "clothing", "wedding", "pudding", "setting", "beginning", "ending", "warning", "training", "funding", "housing", "sibling", "darling", "interesting", "boring", "amazing", "exciting", "according"}
BE = {"am", "is", "are", "was", "were", "be", "been", "being", "i'm", "it's", "he's", "she's", "they're", "we're", "you're"}
PAREN = re.compile(r",|\s[-—]\s|—|\(")


def sentences(lid):
    d = json.loads((LESSONS / f"{lid}.json").read_text(encoding="utf-8"))
    out = []
    for g in d["groups"]:
        for e in g["entries"]:
            if e.get("ex"):
                out.append((e["word"], e["ex"]["en"], e["ex"]["zh"]))
    return out


def has_ing(en):
    for m in re.finditer(r"\b([A-Za-z]{2,}ing)\b", en):
        before = en[:m.start()].split()[-1:]
        if m.group(1).lower() not in ING_NOUN and not (before and before[0].lower() in BE):
            return True
    return False


def candidate(en):
    n = len(re.findall(r"[A-Za-z']+", en))
    return n >= 12 or bool(CLAUSE.search(en) or PASSIVE.search(en) or TO_DO.search(en) or has_ing(en) or PAREN.search(en))


def load_notes(lid):
    f = DATA / "notes" / f"{lid}.json"
    return json.loads(f.read_text(encoding="utf-8")).get("sents", {}) if f.exists() else None


def main(args):
    if args and args[0] == "--all":
        tot = [0, 0, 0, 0, 0]
        for f in sorted(LESSONS.glob("*.json")):
            ss, notes = sentences(f.stem), load_notes(f.stem)
            done = {en for en, n in (notes or {}).items() if n.get("an")}
            c = sum(candidate(en) for _, en, _ in ss)
            left = sum(candidate(en) and en not in done for _, en, _ in ss)
            ph = sum(len(n.get("ph", [])) for n in (notes or {}).values())
            tot = [tot[0] + len(ss), tot[1] + c, tot[2] + left, tot[3] + ph, tot[4] + len(done)]
            print(f"{f.stem}：例句 {len(ss)}，候选 {c}（没解析的 {left}），" + (f"词组 {ph}，解析 {len(done)}" if notes is not None else "未生成"))
        print(f"合计：例句 {tot[0]}，候选 {tot[1]}（没解析的 {tot[2]}），词组 {tot[3]}（片段条数），解析 {tot[4]}")
        return
    lid, check = args[0], "--check" in args
    ss = sentences(lid)
    if not check:
        done = {en for en, n in (load_notes(lid) or {}).items() if n.get("an")}
        print(f"## {lid} 例句（{len(ss)} 句，★ = 解析候选 {sum(candidate(en) for _, en, _ in ss)} 句，✓ = 已有解析）")
        for w, en, zh in ss:
            print(f"{'✓' if en in done else '★' if candidate(en) else '·'} [{w}] {en}\n    书译：{zh}")
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
