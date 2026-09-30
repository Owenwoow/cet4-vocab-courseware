"""部署前检查：每课都有音频清单，且清单里的音频已经在音频站上线。

用法：python pipeline/check_audio.py [--all]
默认每课抽查 5 个文件（单词、例句、中文各有）；--all 逐个检查（慢）。
缺清单或文件 404 → 退出码 1，阻止部署（多半是忘了跑 publish_audio.py）。
"""
import json
import random
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from config import AUDIO, LESSONS


def keys_of(m):
    w = [k for v in m["w"].values() for k in v.values()]
    s = [x["f"] for v in m["s"].values() for x in v.values()]
    z = list(m["z"].values())
    return w, s, z


def online(url):
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "check-audio"})
        return urllib.request.urlopen(req, timeout=15).status == 200
    except urllib.error.URLError:
        return False


def main(check_all):
    bad = 0
    for f in sorted(LESSONS.glob("*.json")):
        lid = f.stem
        mf = AUDIO / f"{lid}.json"
        if not mf.exists():
            print(f"[FAIL] {lid}：没有音频清单，先跑 build_audio.py 和 publish_audio.py")
            bad += 1
            continue
        m = json.loads(mf.read_text(encoding="utf-8"))
        if not m.get("base"):
            print(f"[FAIL] {lid}：清单里没有音频站地址 base，重跑 build_audio.py")
            bad += 1
            continue
        w, s, z = keys_of(m)
        rnd = random.Random(lid)
        sample = w + s + z if check_all else rnd.sample(w, min(2, len(w))) + rnd.sample(s, min(2, len(s))) + rnd.sample(z, min(1, len(z)))
        with ThreadPoolExecutor(16) as pool:
            ok = list(pool.map(lambda k: online(f"{m['base']}files/{k}.mp3"), sample))
        missing = [k for k, good in zip(sample, ok) if not good]
        status = "FAIL" if missing else "OK"
        print(f"[{status}] {lid}：查了 {len(sample)} 个，缺 {len(missing)} 个（{m['base']}）")
        for k in missing[:5]:
            print(f"   缺 {k}.mp3")
        bad += bool(missing)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main("--all" in sys.argv)
