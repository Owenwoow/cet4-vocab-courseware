"""放大页图的局部，给视觉模型看清小字（音标、下划线、导图标签）。

用法：python pipeline/zoom.py 197 left-top [right-top ...]   一次可给多个区域，省工具调用
区域：left-top / left-bottom / right-top / right-bottom（每栏上下半，最常用）
      left / right（整栏）、top / bottom（整页上下半，适合看思维导图）
产物：work/zoom/p197-left-top.png（2 倍放大），每个区域打印一行路径，用 Read（可并行）打开。
"""
import sys

from PIL import Image

from config import WORK

REGIONS = {  # (左, 上, 右, 下)，按页宽高的比例
    "left": (0, 0, .52, 1), "right": (.48, 0, 1, 1), "top": (0, 0, 1, .52), "bottom": (0, .48, 1, 1),
    "left-top": (0, 0, .52, .52), "left-bottom": (0, .48, .52, 1),
    "right-top": (.48, 0, 1, .52), "right-bottom": (.48, .48, 1, 1),
}


def main(page, region):
    im = Image.open(WORK / "pages" / f"p{page}.png").convert("RGB")
    w, h = im.size
    l, t, r, b = REGIONS[region]
    crop = im.crop((int(l * w), int(t * h), int(r * w), int(b * h)))
    crop = crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
    out = WORK / "zoom" / f"p{page}-{region}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    crop.save(out)
    print(out)


if __name__ == "__main__":
    for region in sys.argv[2:]:
        main(int(sys.argv[1]), region)
