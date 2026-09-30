"""第 6 步：汇总已生成的课，写出网页用的 site/data/book.json（目录 + 搜索索引）。

用法：python pipeline/build_index.py
每个 Unit 全部 Lesson 都生成后，会拿目录上的「共 N 个词群、N 词」核对一遍。
"""
import json
from pathlib import Path

from config import DATA, LESSONS, lesson_id

TOC = json.loads((Path(__file__).parent / "toc.json").read_text(encoding="utf-8"))


def main():
    book = {"title": TOC["title"], "parts": [], "search": {}}
    for part in TOC["parts"]:
        p = {"no": part["no"], "title": part["title"], "units": []}
        for unit in part["units"]:
            u = {"no": unit["no"], "words": unit.get("words"), "lessons": []}
            starts = unit["lessons"]
            done_words = done_groups = done = 0
            for i, start in enumerate(starts):
                lid = lesson_id(unit["no"], i + 1)
                f = LESSONS / f"{lid}.json"
                item = {"no": i + 1, "id": lid, "page": start, "ready": f.exists()}
                if f.exists():
                    d = json.loads(f.read_text(encoding="utf-8"))
                    entries = [(g, e) for g in d["groups"] for e in g["entries"]]
                    item["count"] = len(entries)
                    item["groups"] = [{"no": g["no"], "title": g["title"]} for g in d["groups"]]
                    done += 1
                    done_words += len(entries)
                    done_groups += len(d["groups"])
                    for g, e in entries:
                        book["search"].setdefault(e["word"], [lid, e["no"], 0])
                        for x in e.get("ext", []):
                            book["search"].setdefault(x["word"], [lid, e["no"], 1])
                u["lessons"].append(item)
            if done == len(starts) and unit.get("words"):
                ok = done_words == unit["words"] and done_groups == unit["groups"]
                print(f"Unit {unit['no']}：{done_groups} 词群 / {done_words} 词，"
                      f"目录为 {unit['groups']} / {unit['words']} → {'一致' if ok else '不一致，检查漏抽'}")
            p["units"].append(u)
        book["parts"].append(p)
    out = DATA / "book.json"
    out.write_text(json.dumps(book, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ready = sum(l["ready"] for p in book["parts"] for u in p["units"] for l in u["lessons"])
    print(f"已写 {out.relative_to(DATA.parent.parent)}：{ready} 课可用，索引 {len(book['search'])} 词")


if __name__ == "__main__":
    main()
