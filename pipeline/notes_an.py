"""对话带练式解析：给写解析的模型列出输入，并把写好的解析合并进 notes（词组标注 ph 一律不动）。

用法：
  python pipeline/notes_an.py u07-l03 --dump    列出本课例句、书上译文、已标的词组、★ 候选、✓ 已有解析（给写解析的模型当输入）
  python pipeline/notes_an.py u07-l03 --merge   读 work/notes-an/u07-l03.json，替换本课所有句子的解析，校验通过才写入
  python pipeline/notes_an.py u07-l03 --add     读 work/notes-an/u07-l03.add.json，只给还没有解析的句子加，已有的一句不动
  python pipeline/notes_an.py u07-l03 --add --force   风格提醒确实不该改时，照样写入

work/notes-an/<id>.json 的格式：{"例句英文原文（逐字照抄）": {"talk": [...], "order": "...", "sum": "...", "cmp": "..."}}
--merge：本课所有句子的旧解析先清掉，再放进这个文件里的；文件里没有的句子就不带解析；
既没有词组也没有解析的句子从 notes 里删掉。校验（validate.py）有 ERROR 就不写入，原文件保持不变。
--add（.add.json 格式同上）：键已经有解析就报错（旧解析不许改）；校验有 ERROR 或有风格提醒都不写入（风格提醒可用 --force 放行）；
写入后把本课全部解析写回 work/notes-an/<id>.json（草稿保持完整，以后 --merge 不会丢句子），并删掉 .add.json。
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
    done = sum(1 for _, en, _ in ss if sents.get(en, {}).get("an"))
    print(f"## {lid} 例句（{len(ss)} 句；★ = 带从句 / 被动 / to do / -ing / 逗号或较长的候选，只是粗筛；"
          f"✓ = 已有解析 {done} 句，不要再写；除最简单的简单句都写）")
    for w, en, zh in ss:
        n = sents.get(en, {})
        ph = "；".join(f"{p['t']} = {p['b']}（{p['m']}）" for p in n.get("ph", []) if p.get("t") != "" ) or "无"
        mark = "✓ 已有解析" if n.get("an") else "★" if candidate(en) else "·"
        print(f"\n{mark} [{w}] {en}\n    书译：{zh}\n    已标词组：{ph}")


def read_draft(lid, src):
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
    return draft


def write_checked(lid, doc, src):
    """按例句顺序写 notes，再跑校验；有「词组解析」ERROR 就还原原文件并退出。"""
    order = [en for _, en, _ in sentences(lid)]
    doc["sents"] = {en: doc["sents"][en] for en in order if en in doc["sents"]}
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
        print(f"[FAIL] {lid}：校验没过，没有写入（改 {src.name} 后再跑）")
        for m in errs:
            print("  ERROR", m)
        sys.exit(1)


def hints_of(draft):
    return [f"{en[:40]}…：{h}" for en, an in draft.items() for h in style_hints(an)]


def merge(lid):
    src = DRAFTS / f"{lid}.json"
    draft = read_draft(lid, src)
    doc = load_notes(lid)
    sents = {}
    for en, n in doc["sents"].items():
        n = {k: v for k, v in n.items() if k != "an"}
        if n.get("ph"):
            sents[en] = n
    for en, an in draft.items():
        sents.setdefault(en, {"ph": []})["an"] = an
    doc["sents"] = sents
    write_checked(lid, doc, src)
    n_an = sum(1 for n in doc["sents"].values() if n.get("an"))
    print(f"[OK] {lid}：合并 {len(draft)} 句解析，notes 里共 {len(doc['sents'])} 句、带解析 {n_an} 句")
    hints = hints_of(draft)
    if hints:
        print(f"  风格提醒 {len(hints)} 条（已写入；逐条改掉再 merge，确实不该改的在回复里说明）：")
        for h in hints:
            print("   ", h)


def add(lid, force):
    src = DRAFTS / f"{lid}.add.json"
    draft = read_draft(lid, src)
    doc = load_notes(lid)
    had = [en for en in draft if doc["sents"].get(en, {}).get("an")]
    if had:
        print(f"[FAIL] 这些句子已经有解析，--add 不改旧解析（从 {src.name} 里删掉）：")
        for k in had:
            print("   ", k)
        sys.exit(1)
    hints = hints_of(draft)
    if hints and not force:
        print(f"[FAIL] {lid}：风格提醒 {len(hints)} 条，没有写入（逐条改掉再 --add；确实不该改的，加 --force 并在回复里说明）：")
        for h in hints:
            print("   ", h)
        sys.exit(1)
    for en, an in draft.items():
        doc["sents"].setdefault(en, {"ph": []})["an"] = an
    write_checked(lid, doc, src)
    full = {en: n["an"] for en, n in doc["sents"].items() if n.get("an")}
    DRAFTS.mkdir(parents=True, exist_ok=True)
    (DRAFTS / f"{lid}.json").write_text(json.dumps(full, ensure_ascii=False, indent=1), encoding="utf-8")
    src.unlink()
    print(f"[OK] {lid}：新增 {len(draft)} 句解析，带解析共 {len(full)} 句；已写回 {lid}.json，删掉 {src.name}")
    if hints:
        print(f"  按 --force 放行的风格提醒 {len(hints)} 条：")
        for h in hints:
            print("   ", h)


PREDICT = ("你多半", "你可能", "你要是", "你大概", "你也许", "你会想", "你想翻")
GUESS = ("前文", "上文", "上下文", "斜体")


def style_hints(an):
    """对话带练的风格自检（--merge 只提醒，--add 不放行）：见 pipeline/prompts/notes.md「写法规矩」"""
    out, talk = [], an.get("talk", [])
    plain = [b for b in talk if "照字面" in b.get("s", "")]
    if len(plain) > 1:
        out.append(f"「照字面翻就行」的块有 {len(plain)} 个，最多 1 个，其余并进相邻的块")
    if not any(w in b.get("s", "") for b in talk for w in PREDICT):
        out.append("没有一块在猜「你多半会翻成……」，这句不像带练")
    text = "".join(b.get("s", "") for b in talk) + an.get("order", "") + an.get("cmp", "")
    for w in GUESS:
        if w in text:
            out.append(f"出现「{w}」：只讲这一句和书译里看得到的东西")
    return out


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[2] not in ("--dump", "--merge", "--add"):
        print(__doc__)
        sys.exit(1)
    lid, cmd = sys.argv[1], sys.argv[2]
    if cmd == "--dump":
        dump(lid)
    elif cmd == "--merge":
        merge(lid)
    else:
        add(lid, "--force" in sys.argv[3:])
