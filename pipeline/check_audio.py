"""部署前检查：每课都有音频清单，且清单里的音频已经在音频站上线。

用法：python pipeline/check_audio.py [--all]
默认每课抽查 5 个文件（单词、例句、中文各有），并逐一检查补充例句所需音频；--all 逐个检查（慢）。
缺清单或文件 404 → 退出码 1，阻止部署（多半是忘了跑 publish_audio.py）。
"""
import json
import random
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from config import AUDIO, DATA, LESSONS

VOICE_KEYS = ("ava", "andrew", "sonia", "ryan")


def supplemental_examples(lid):
    path = DATA / "examples" / f"{lid}.json"
    if path.exists():
        for examples in json.loads(path.read_text(encoding="utf-8"))["entries"].values():
            yield from examples


def sentence_words(sentence):
    return [word.lower() for word in re.findall(r"[A-Za-z']+", sentence)]


def supplemental_audio(manifest, examples, voices=VOICE_KEYS):
    """返回补充例句所需的文件哈希，以及清单中缺失的项目。"""
    keys, missing = set(), set()

    def add(key, label):
        if isinstance(key, str) and re.fullmatch(r"[a-f0-9]{16}", key):
            keys.add(key)
        else:
            missing.add(label)

    for example in examples:
        en, zh = example["en"], example["zh"]
        add(manifest["z"].get(zh), f"译文 {zh}")
        for voice in voices:
            sentence = manifest["s"].get(en, {}).get(voice, {})
            add(sentence.get("f"), f"例句 {en} [{voice}]")
            marks = sentence.get("m")
            if not isinstance(marks, list) or not marks or not all(
                isinstance(mark, list) and len(mark) == 2
                and type(mark[0]) in (int, float) and mark[0] >= 0
                and isinstance(mark[1], str) and mark[1].strip()
                for mark in marks
            ):
                missing.add(f"时间点 {en} [{voice}]")
            for word in sentence_words(en):
                add(manifest["w"].get(word, {}).get(voice), f"单词 {word} [{voice}]")
    return keys, sorted(missing)


def keys_of(m):
    w = [k for v in m["w"].values() for k in v.values()]
    s = [x["f"] for v in m["s"].values() for x in v.values()]
    z = list(m["z"].values())
    return w, s, z


def online(url):
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "check-audio"})
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status == 200
    except urllib.error.URLError:
        return False


def main(check_all):
    bad = 0
    checked = {}
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
        required, gaps = supplemental_audio(m, supplemental_examples(lid))
        for gap in gaps:
            print(f"[FAIL] {lid}：音频清单缺少{gap}")
        bad += bool(gaps)
        rnd = random.Random(lid)
        sample = w + s + z if check_all else rnd.sample(w, min(2, len(w))) + rnd.sample(s, min(2, len(s))) + rnd.sample(z, min(1, len(z)))
        sample = list(dict.fromkeys(sample + sorted(required)))
        urls = {key: f"{m['base']}files/{key}.mp3" for key in sample}
        pending = [url for url in urls.values() if url not in checked]
        if pending:
            with ThreadPoolExecutor(16) as pool:
                checked.update(zip(pending, pool.map(online, pending)))
        missing = [key for key, url in urls.items() if not checked[url]]
        status = "FAIL" if missing else "OK"
        print(f"[{status}] {lid}：查了 {len(sample)} 个，缺 {len(missing)} 个（{m['base']}）")
        for k in missing[:5]:
            print(f"   缺 {k}.mp3")
        bad += bool(missing)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main("--all" in sys.argv)
