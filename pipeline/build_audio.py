"""第 5 步：用 edge-tts（微软神经网络语音）为一课生成音频。不花 LLM token。

用法：python pipeline/build_audio.py u07-l01 [--voices ava,ryan]
产物：
  site/data/audio/files/<hash>.mp3     按「语音+文本」哈希命名，全书去重，已存在就跳过
  site/data/audio/files/<hash>.json    例句的逐词时间点（用于朗读高亮）
  site/data/audio/<lesson>.json        本课清单：文本 → 文件
慢速播放由浏览器 playbackRate 实现，不单独生成慢速音频。
"""
import argparse
import asyncio
import hashlib
import json
import re

import edge_tts

from config import AUDIO, LESSONS

VOICES = {"ava": "en-US-AvaNeural", "andrew": "en-US-AndrewNeural",
          "sonia": "en-GB-SoniaNeural", "ryan": "en-GB-RyanNeural"}
ZH_VOICE = "zh-CN-XiaoxiaoNeural"
POS_ZH = {"n.": "名词", "v.": "动词", "adj.": "形容词", "adv.": "副词", "prep.": "介词",
          "conj.": "连词", "pron.": "代词", "phr.": "短语", "n. & v.": "名词和动词"}
FILES = AUDIO / "files"
SEM = asyncio.Semaphore(8)


def senses_zh(senses):
    """把 [{pos:'n.', mean:'[[边缘]]；利润'}] 转成适合朗读的中文"""
    parts = [POS_ZH.get(s["pos"], "") + "，" + s["mean"].replace("[[", "").replace("]]", "") for s in senses]
    return "。".join(parts)


async def synth(text, voice, marks_wanted):
    key = hashlib.sha1(f"{voice}|{text}".encode()).hexdigest()[:16]
    mp3, mk = FILES / f"{key}.mp3", FILES / f"{key}.json"
    if mp3.exists() and (not marks_wanted or mk.exists()):
        return key, (json.loads(mk.read_text()) if marks_wanted else None), False
    async with SEM:
        for attempt in range(3):
            try:
                com = edge_tts.Communicate(text, voice, boundary="WordBoundary")
                audio, marks = b"", []
                async for ch in com.stream():
                    if ch["type"] == "audio":
                        audio += ch["data"]
                    elif ch["type"] == "WordBoundary":
                        marks.append([round(ch["offset"] / 1e7, 3), ch["text"]])
                break
            except Exception:
                if attempt == 2:
                    raise
                await asyncio.sleep(1.5)
    mp3.write_bytes(audio)
    if marks_wanted:
        mk.write_text(json.dumps(marks, ensure_ascii=False))
    return key, marks, True


async def main(lid, voice_keys):
    d = json.loads((LESSONS / f"{lid}.json").read_text(encoding="utf-8"))
    FILES.mkdir(parents=True, exist_ok=True)
    words, sentences, zh, meaning = [], [], [], {}
    for g in d["groups"]:
        for e in g["entries"]:
            words.append(e["word"])
            meaning[e["word"]] = senses_zh([s for p in e["prons"] for s in p["senses"]])
            if e.get("ex"):
                sentences.append(e["ex"]["en"])
                zh.append(e["ex"]["zh"])
                words += [t.lower() for t in re.findall(r"[A-Za-z']+", e["ex"]["en"])]
            for x in e.get("ext", []):
                words.append(x["word"])
                meaning.setdefault(x["word"], senses_zh(x["senses"]))
    zh += meaning.values()
    words, sentences, zh = (list(dict.fromkeys(v)) for v in (words, sentences, zh))

    # z：中文文本 → 文件；m：单词 → 其释义朗读文本（磨耳朵用）
    manifest = {"voices": voice_keys, "w": {}, "s": {}, "z": {}, "m": meaning}
    made = 0

    async def do_word(w, vk):
        nonlocal made
        key, _, new = await synth(w, VOICES[vk], False)
        manifest["w"].setdefault(w, {})[vk] = key
        made += new

    async def do_sent(s, vk):
        nonlocal made
        key, marks, new = await synth(s, VOICES[vk], True)
        manifest["s"].setdefault(s, {})[vk] = {"f": key, "m": marks}
        made += new

    async def do_zh(t):
        nonlocal made
        key, _, new = await synth(t, ZH_VOICE, False)
        manifest["z"][t] = key
        made += new

    jobs = [do_zh(t) for t in zh]
    for vk in voice_keys:
        jobs += [do_word(w, vk) for w in words] + [do_sent(s, vk) for s in sentences]
    await asyncio.gather(*jobs)

    out = AUDIO / f"{lid}.json"
    out.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size = sum(f.stat().st_size for f in FILES.glob("*.mp3"))
    print(f"{lid}：{len(words)} 词 × {len(voice_keys)} 声，{len(sentences)} 句，中文 {len(zh)} 条；"
          f"新生成 {made} 个文件；音频库共 {size // 1024} KB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("lesson")
    ap.add_argument("--voices", default="ava,ryan")
    a = ap.parse_args()
    asyncio.run(main(a.lesson, a.voices.split(",")))
