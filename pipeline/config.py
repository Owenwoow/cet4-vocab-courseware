"""流水线公共配置。"""
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")  # Windows 控制台默认 GBK，中文会乱码

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "docs" / "26英语四级-你还在背单词吗--刘晓燕.pdf"
WORK = ROOT / "work"                      # 中间产物（原尺寸页图等），不提交
SITE = ROOT / "site"                      # 可直接托管的静态站点
DATA = SITE / "data"
LESSONS = DATA / "lessons"
PAGES = DATA / "pages"                    # 压缩后的页图，供网页「看原书」
AUDIO = DATA / "audio"

# 书页码 = PDF 页序号(0 起) - 9，例：书 p191 = PDF 第 200 页(0 起)
PAGE_OFFSET = 9


def pdf_index(book_page: int) -> int:
    return book_page + PAGE_OFFSET


def lesson_id(unit: int, lesson: int) -> str:
    return f"u{unit:02d}-l{lesson:02d}"
