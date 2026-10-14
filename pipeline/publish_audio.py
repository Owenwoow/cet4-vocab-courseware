"""第 5′ 步：把新生成的音频推送到音频仓库（audio-store/ → cet4-vocab-audio）。

用法：python pipeline/publish_audio.py
音频文件按内容哈希命名、只增不改，所以每次提交只有新文件，仓库历史不会膨胀。
推送后 GitHub Pages 约 1 分钟生效，再推主仓库，线上课件就能播放新音频。
"""
import json
import os
import subprocess
import sys
import time

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
    head = git("rev-parse", "HEAD").strip()
    git("push", "-q", "origin", "main")
    size = sum(f.stat().st_size for f in (AUDIO_STORE / "files").glob("*.mp3"))
    print(f"已推送 {mp3} 个新音频；音频仓库共 {size / 1e6:.0f} MB（GitHub Pages 单站上限约 1GB）")
    if os.environ.get("AUDIO_SKIP_WAIT"):
        print("不等音频站构建（后面还有课要推，推完最后一课再等）")
        return
    wait_pages(head)


def wait_pages(commit, timeout=1800):
    """等音频站 Pages 用这次提交构建完成，否则紧接着推主仓库时，部署前的音频检查会因文件未上线而失败。
    看 Actions 里的「pages build and deployment」任务（builds 接口不可靠：被后来的推送取消的构建、甚至进行中的构建都会显示 errored）：
    这次提交对应的任务成功才算上线；被取消说明后面又有推送，继续等"""
    repo = git("remote", "get-url", "origin").strip().removesuffix(".git").split("github.com/")[-1]
    start = time.time()
    while time.time() - start < timeout:
        r = subprocess.run(["gh", "run", "list", "-R", repo, "-w", "pages-build-deployment", "-L", "10",
                            "--json", "headSha,status,conclusion"], capture_output=True, text=True)
        try:
            runs = json.loads(r.stdout or "[]")
        except ValueError:
            runs = []
        if any(x["headSha"] == commit and x["conclusion"] == "success" for x in runs):
            print(f"音频站已上线（{int(time.time() - start)} 秒）")
            return
        time.sleep(15)
    # 等不到不当作失败，上线与否由部署前的 check_audio.py 兜底
    print(f"等了 {timeout} 秒音频站还没构建完，稍后用 python pipeline/check_audio.py 确认再推主仓库")


if __name__ == "__main__":
    main()
