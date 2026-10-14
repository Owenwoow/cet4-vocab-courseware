"""对话带练式解析：给写解析的模型列出输入，并把写好的解析合并进 notes（词组标注 ph 一律不动）。

用法：
  python pipeline/notes_an.py u07-l03 --dump    列出本课例句、书上译文、已标的词组、★ 候选（给写解析的模型当输入）
  python pipeline/notes_an.py u07-l03 --merge   读 work/notes-an/u07-l03.json，替换本课所有句子的解析，校验通过才写入

work/notes-an/<id>.json 的格式：{"例句英文原文（逐字照抄）": {"talk": [...], "order": "...", "sum": "...", "cmp": "..."}}
合并规则：本课所有句子的旧解析先清掉，再放进这个文件里的；文件里没有的句子就不带解析；
既没有词组也没有解析的句子从 notes 里删掉。校验（validate.py）有 ERROR 就不写入，原文件保持不变。
规范和示例见 pipeline/prompts/notes.md。
"""
import json
import sys

import validate
from config import DATA, LESSONS, WORK
from note_sents import candidate, sentences

NOTES = DATA / "notes"
DRAFTS = WORK / "notes-an"


def load_notes(lid):
    f = NOTES / f"{lid}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    return {"_note": "例句词组与语法解析（书外补充，AI 生成）", "sents": {}}


def dump(lid):
    sents = load_notes(lid)["sents"]
    ss = sentences(lid)
    print(f"## {lid} 例句（{len(ss)} 句；★ = 长句或带从句 / 被动 / 插入语的候选，只是粗筛，写不写你判断；一课写 5~10 句）")
    for w, en, zh in ss:
        n = sents.get(en, {})
        ph = "；".join(f"{p['t']} = {p['b']}（{p['m']}）" for p in n.get("ph", []) if p.get("t") != "" ) or "无"
        print(f"\n{'★' if candidate(en) else '·'} [{w}] {en}\n    书译：{zh}\n    已标词组：{ph}")


def merge(lid):
    src = DRAFTS / f"{lid}.json"
    if not src.exists():
        print(f"[FAIL] 没有 {src}（先按 pipeline/prompts/notes.md 写好）")
        sys.exit(1)
    try:
        draft = json.loads(src.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        print(f"[FAIL] {src.name} 不是合法的 JSON：{err}（中文引号用「」，英文双引号写成 \\\"）")
        sys.exit(1)
    known = {en for _, en, _ in sentences(lid)}
    bad = [k for k in draft if k not in known]
    if bad:
        print(f"[FAIL] 这些键不是本课的例句（要和 --dump 列出的英文逐字相同）：")
        for k in bad:
            print("   ", k)
        sys.exit(1)

    doc = load_notes(lid)
    sents = {}
    for en, n in doc["sents"].items():
        n = {k: v for k, v in n.items() if k != "an"}
        if n.get("ph"):
            sents[en] = n
    for en, an in draft.items():
        sents.setdefault(en, {"ph": []})["an"] = an
    order = [en for _, en, _ in sentences(lid)]
    doc["sents"] = {en: sents[en] for en in order if en in sents}

    f = NOTES / f"{lid}.json"
    old = f.read_text(encoding="utf-8") if f.exists() else None
    NOTES.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    r, _ = validate.validate(LESSONS / f"{lid}.json")
    errs = [m for m in r.errors if m.startswith("词组解析")]
    if errs:
        if old is None:
            f.unlink()
        else:
            f.write_text(old, encoding="utf-8")
        print(f"[FAIL] {lid}：校验没过，没有写入（改 {src.name} 后再 merge）")
        for m in errs:
            print("  ERROR", m)
        sys.exit(1)
    n_an = sum(1 for n in doc["sents"].values() if n.get("an"))
    print(f"[OK] {lid}：合并 {len(draft)} 句解析，notes 里共 {len(doc['sents'])} 句、带解析 {n_an} 句")


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[2] not in ("--dump", "--merge"):
        print(__doc__)
        sys.exit(1)
    (dump if sys.argv[2] == "--dump" else merge)(sys.argv[1])
