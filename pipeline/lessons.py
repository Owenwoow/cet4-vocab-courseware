"""列出各课的书页范围和完成情况，给总控会话排任务用。

用法：
  python pipeline/lessons.py              全部 Part 01 课
  python pipeline/lessons.py 8 10         只看 Unit 8~10
  python pipeline/lessons.py --todo 8 10  只列还没完成的课
状态列：数据 / 释义 / 音频清单 / 音频已推送（✓ 完成，· 未做）
"""
import json
import subprocess
import sys
from pathlib import Path

from config import AUDIO, AUDIO_STORE, DATA, LESSONS, lesson_id

TOC = json.loads((Path(__file__).parent / "toc.json").read_text(encoding="utf-8"))


def all_lessons():
    """按书顺序给出 (id, unit, lesson, 起页, 止页)；止页 = 下一课起页 - 1；最后一课止于 end_page（Part 02 即 Unit 11–12 不做）"""
    flat = [(u["no"], i + 1, start) for p in TOC["parts"] for u in p["units"] for i, start in enumerate(u["lessons"])]
    out = []
    for k, (unit, les, start) in enumerate(flat):
        end = (flat[k + 1][2] if k + 1 < len(flat) else TOC["end_page"] + 1) - 1
        out.append((lesson_id(unit, les), unit, les, start, end))
    return out


def audio_pushed():
    """音频仓库里已提交且无未推送改动时，视为已推送"""
    try:
        dirty = subprocess.run(["git", "-C", str(AUDIO_STORE), "status", "--porcelain"], capture_output=True, text=True).stdout.strip()
        ahead = subprocess.run(["git", "-C", str(AUDIO_STORE), "rev-list", "--count", "@{u}..HEAD"], capture_output=True, text=True).stdout.strip()
        return not dirty and ahead == "0"
    except FileNotFoundError:
        return False


def main(args):
    todo = "--todo" in args
    nums = [int(a) for a in args if a.isdigit()]
    lo, hi = (nums + [1, 10])[:2] if nums else (1, 10)
    pushed = audio_pushed()
    print(f"{'课':<9}{'书页':<10}数据 释义 音频 推送")
    for lid, unit, les, a, b in all_lessons():
        if not lo <= unit <= hi:
            continue
        st = [(LESSONS / f"{lid}.json").exists(), (DATA / "gloss" / f"{lid}.json").exists(), (AUDIO / f"{lid}.json").exists()]
        st.append(st[2] and pushed)
        if todo and all(st):
            continue
        print(f"{lid:<9}p{a}-{b:<6}" + "   ".join("✓" if x else "·" for x in st))


if __name__ == "__main__":
    main(sys.argv[1:])
