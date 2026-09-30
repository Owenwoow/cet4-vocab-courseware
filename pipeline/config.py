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
AUDIO = DATA / "audio"                    # 每课的音频清单（小，随主仓库提交）

# 音频文件本身放在单独的仓库 cet4-vocab-audio（本地克隆在 audio-store/），由它的 Pages 提供下载。
# 默认本地生成、推送；也可用 Actions 的 audio 工作流手动在云端生成（并发固定 3，避免被语音服务限流）。
# 这个仓库快满 1GB 时：新建 cet4-vocab-audio-2，把下面两行改过去；旧课的清单里记着自己的地址，不受影响。
AUDIO_STORE = ROOT / "audio-store"
AUDIO_BASE = "https://owenwoow.github.io/cet4-vocab-audio/"

# 书页码 = PDF 页序号(0 起) - 9，例：书 p191 = PDF 第 200 页(0 起)
PAGE_OFFSET = 9


def pdf_index(book_page: int) -> int:
    return book_page + PAGE_OFFSET


def lesson_id(unit: int, lesson: int) -> str:
    return f"u{unit:02d}-l{lesson:02d}"
