"""第 1 步：从扫描版 PDF 抽出指定书页的图片。

用法：python pipeline/extract_pages.py 191 195
产物：
  work/pages/p191.png        原尺寸，交给视觉模型抽取
  site/data/pages/p191.jpg   压缩版，网页「看原书」用
"""
import io
import sys

import pypdf
from PIL import Image

from config import PDF, WORK, PAGES, pdf_index


def main(first: int, last: int):
    reader = pypdf.PdfReader(str(PDF))
    (WORK / "pages").mkdir(parents=True, exist_ok=True)
    PAGES.mkdir(parents=True, exist_ok=True)
    for page in range(first, last + 1):
        img = reader.pages[pdf_index(page)].images[0]
        (WORK / "pages" / f"p{page}.png").write_bytes(img.data)
        im = Image.open(io.BytesIO(img.data)).convert("RGB")
        im.save(PAGES / f"p{page}.jpg", quality=72, optimize=True)
        print(f"p{page}: {im.size[0]}x{im.size[1]}")


if __name__ == "__main__":
    main(int(sys.argv[1]), int(sys.argv[2]))
