"""第 4 步辅助：列出一课需要逐词释义的词，或检查释义文件是否写全。

用法：
  python pipeline/gloss_words.py u07-l02           列出例句和待释义的词（给释义模型当输入）
  python pipeline/gloss_words.py u07-l02 --check   检查 site/data/gloss/u07-l02.json 有无遗漏、空值
本课词条和扩展词（含常见词形变化）不用释义，网页直接显示书上的释义。
"""
import json
import re
import sys

from config import DATA, LESSONS

GLOSS_POS = re.compile(r"^(?:/[^/]+/\s*)?(?:modal v|aux|abbr|prep|conj|pron|adj|adv|det|art|num|int|inf|phr|n|v)\.")
GLOSS_PLACEHOLDER = re.compile(r"暂无|未收录|已跳过|待补|在线释义")


def lemma_candidates(w):
    """与网页 app.js 的 lemmaCandidates 保持一致"""
    c = [w]
    if w.endswith("'s"): c.append(w[:-2])
    if w.endswith("s'"): c += [w[:-1], w[:-2]]
    if w.endswith("ies"): c.append(w[:-3] + "y")
    if w.endswith("es"): c.append(w[:-2])
    if w.endswith("s"): c.append(w[:-1])
    if w.endswith("ied"): c.append(w[:-3] + "y")
    if w.endswith("ed"): c += [w[:-2], w[:-1], w[:-3]]
    if w.endswith("ing"): c += [w[:-3], w[:-3] + "e"]
    return c


def collect(lid):
    d = json.loads((LESSONS / f"{lid}.json").read_text(encoding="utf-8"))
    book_words = set()
    sentences = []
    for g in d["groups"]:
        for e in g["entries"]:
            book_words.add(e["word"].lower())
            book_words.update(x["word"].lower() for x in e.get("ext", []))
            if e.get("ex"):
                sentences.append(e["ex"]["en"])
    path = DATA / "examples" / f"{lid}.json"
    if path.exists():
        examples = json.loads(path.read_text(encoding="utf-8"))["entries"]
        sentences.extend(item["en"] for items in examples.values() for item in items)
    need = []
    for s in sentences:
        for t in re.findall(r"[A-Za-z']+", s):
            w = t.lower()
            if w not in need and not any(c in book_words for c in lemma_candidates(w)):
                need.append(w)
    return sentences, need


def example_gloss_errors(lesson, entries, gloss):
    book = {item["word"] for group in lesson["groups"] for entry in group["entries"]
            for item in (entry, *entry.get("ext", []))}
    words = gloss.get("words", {})
    contexts = gloss.get("examples", {})
    if not isinstance(words, dict) or not isinstance(contexts, dict):
        return ["逐词释义的 words 和 examples 必须为对象"]
    sentences = {item["en"]: set(re.findall(r"[A-Za-z']+", item["en"].lower()))
                 for examples in entries.values() for item in examples}
    errors = [f"逐词释义对应的补充例句不存在：{en}" for en in contexts.keys() - sentences.keys()]
    for en, tokens in sentences.items():
        context = contexts.get(en, {})
        if not isinstance(context, dict):
            errors.append(f"逐词释义必须为对象：{en}")
            continue
        for word in sorted(context.keys() - tokens):
            errors.append(f"逐词释义 {word!r} 不在补充例句中：{en}")
        for word in sorted(tokens):
            value = context.get(word, words.get(word))
            if value is None and word in book:
                continue
            if not (isinstance(value, str) and GLOSS_POS.match(value)
                    and re.search(r"[\u3400-\u9fff]", value) and not GLOSS_PLACEHOLDER.search(value)):
                errors.append(f"{word!r} 缺词性或中文释义：{en}")
    return errors


def main(lid, check):
    sentences, need = collect(lid)
    if not check:
        print("## 例句")
        for s in sentences:
            print(s)
        print(f"\n## 需要释义的词（{len(need)} 个，键用这里的写法）")
        print(" ".join(need))
        return
    f = DATA / "gloss" / f"{lid}.json"
    if not f.exists():
        print(f"[FAIL] {lid}：没有 {f.name}")
        sys.exit(1)
    gloss = json.loads(f.read_text(encoding="utf-8"))
    words = gloss.get("words", {})
    missing = [w for w in need if not any(c in words for c in lemma_candidates(w))]
    examples = DATA / "examples" / f"{lid}.json"
    errors = example_gloss_errors(
        json.loads((LESSONS / f"{lid}.json").read_text(encoding="utf-8")),
        json.loads(examples.read_text(encoding="utf-8"))["entries"], gloss,
    ) if examples.exists() else []
    empty = [k for k, v in words.items() if not str(v).strip()]
    status = "FAIL" if missing or empty or errors else "OK"
    print(f"[{status}] {lid}：需释义 {len(need)} 词，已写 {len(words)} 条，缺 {len(missing)}，空值 {len(empty)}")
    if missing:
        print("  缺：", " ".join(missing))
    if empty:
        print("  空：", " ".join(empty))
    for error in errors:
        print("  ", error)
    sys.exit(1 if status == "FAIL" else 0)


if __name__ == "__main__":
    main(sys.argv[1], "--check" in sys.argv)
