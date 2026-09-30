"""第 6 步：汇总已生成的课，写出网页用的 site/data/book.json（目录 + 搜索索引）。

用法：python pipeline/build_index.py
每个 Unit 全部 Lesson 都生成后自动对数：目录上的「共 N 个词群、N 词」，以及最后一课抽到的
单元小结（词群、单词、扩展词、真题例句、经典例句）。对不上就退出码 1（CI 会拦住部署）。
"""
import json
import sys
from pathlib import Path

from config import DATA, LESSONS, PAGES, lesson_id

TOC = json.loads((Path(__file__).parent / "toc.json").read_text(encoding="utf-8"))


def main():
    # 原书页图只在本地有（不进仓库、不部署），网页据此决定显不显示「看原书」
    has_pages = PAGES.exists() and any(PAGES.glob("*.jpg"))
    book = {"title": TOC["title"], "hasPages": has_pages, "parts": [], "search": {}}
    mismatch = False
    for part in TOC["parts"]:
        p = {"no": part["no"], "title": part["title"], "units": []}
        for unit in part["units"]:
            u = {"no": unit["no"], "words": unit.get("words"), "lessons": []}
            starts = unit["lessons"]
            cnt = {"groups": 0, "words": 0, "ext": 0, "zhen": 0, "li": 0}
            done, summary = 0, None
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
                    cnt["groups"] += len(d["groups"])
                    cnt["words"] += len(entries)
                    cnt["ext"] += sum(len(e.get("ext", [])) for _, e in entries)
                    cnt["zhen"] += sum(1 for _, e in entries if e.get("ex") and e["ex"]["type"] == "真")
                    cnt["li"] += sum(1 for _, e in entries if e.get("ex") and e["ex"]["type"] == "例")
                    summary = d.get("unit_summary", summary)
                    for g, e in entries:
                        book["search"].setdefault(e["word"], [lid, e["no"], 0])
                        for x in e.get("ext", []):
                            book["search"].setdefault(x["word"], [lid, e["no"], 1])
                u["lessons"].append(item)
            if done == len(starts):
                expect = dict(summary or {})
                if unit.get("words"):
                    expect.setdefault("groups", unit["groups"])
                    expect.setdefault("words", unit["words"])
                    if (unit["groups"], unit["words"]) != (expect["groups"], expect["words"]):
                        print(f"  提醒：Unit {unit['no']} 目录与单元小结的数不同，以单元小结为准")
                names = {"groups": "词群", "words": "单词", "ext": "扩展词", "zhen": "真题例句", "li": "经典例句"}
                diff = [f"{names[k]} {cnt[k]}≠{v}" for k, v in expect.items() if cnt[k] != v]
                got = "、".join(f"{names[k]} {cnt[k]}" for k in names)
                print(f"Unit {unit['no']}：{got} → " + (f"不一致：{'；'.join(diff)}" if diff else f"与{'单元小结' if summary else '目录'}一致"))
                mismatch |= bool(diff)
                if not summary:
                    print(f"  提醒：Unit {unit['no']} 最后一课没抽到 unit_summary，只核对了目录的两个数")
            p["units"].append(u)
        book["parts"].append(p)
    out = DATA / "book.json"
    out.write_text(json.dumps(book, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ready = sum(l["ready"] for p in book["parts"] for u in p["units"] for l in u["lessons"])
    print(f"已写 {out.relative_to(DATA.parent.parent)}：{ready} 课可用，索引 {len(book['search'])} 词")
    sys.exit(1 if mismatch else 0)


if __name__ == "__main__":
    main()
