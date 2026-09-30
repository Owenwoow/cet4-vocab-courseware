"""第 5′ 步：把新生成的音频推送到音频仓库（audio-store/ → cet4-vocab-audio）。

用法：python pipeline/publish_audio.py
音频文件按内容哈希命名、只增不改，所以每次提交只有新文件，仓库历史不会膨胀。
推送后 GitHub Pages 约 1 分钟生效，再推主仓库，线上课件就能播放新音频。
"""
import subprocess

from config import AUDIO_STORE


def git(*args):
    return subprocess.run(["git", "-C", str(AUDIO_STORE), *args], check=True, capture_output=True, text=True).stdout


def main():
    git("add", "-A")
    new = [l for l in git("status", "--porcelain").splitlines() if l.strip()]
    if not new:
        print("音频仓库没有新文件，不用推送")
        return
    mp3 = sum(l.endswith(".mp3") for l in new)
    git("commit", "-q", "-m", f"chore: 新增 {mp3} 个音频")
    git("push", "-q", "origin", "main")
    size = sum(f.stat().st_size for f in (AUDIO_STORE / "files").glob("*.mp3"))
    print(f"已推送 {mp3} 个新音频；音频仓库共 {size / 1e6:.0f} MB（GitHub Pages 单站上限约 1GB）")


if __name__ == "__main__":
    main()
