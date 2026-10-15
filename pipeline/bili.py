"""B 站接口封装：分 P 信息（view）和 AI 中文字幕（ai-zh）。只用标准库。

用法（自检）：python pipeline/bili.py BV1FTPLzBEnj 2     打印该 P 的标题、时长、字幕行数和最后一行 to

- 分 P：/x/web-interface/view，不需要 cookie
- 字幕：/x/player/wbi/v2，必须带 WBI 签名和登录 cookie。
  不要用不签名的 /x/player/v2：会随机返回别的视频的字幕。拿到字幕后核对最后一行 to 与分 P 时长
  相差不超过 60 秒，否则重试一次后报错
- cookie：环境变量 BILI_COOKIE 指向的 JSON（默认 C:\\Users\\Owen_W\\Downloads\\bilibili_cookie.json），
  格式 [{name, value}]。只放进请求头，绝不打印、不写日志、不复制进仓库
- 缓存：work/bili/view/<bv>.json、work/bili/sub/<bv>_p<分P>.json（work/ 不进 git），有缓存就不重复请求；
  请求间隔约 1 秒
"""
import gzip
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from config import WORK

CACHE = WORK / "bili"
COOKIE_FILE = Path(os.environ.get("BILI_COOKIE", r"C:\Users\Owen_W\Downloads\bilibili_cookie.json"))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
INTERVAL = 1.0          # 两次请求之间至少隔这么久（秒）
MAX_TAIL_GAP = 60       # 字幕最后一行 to 与分 P 时长的最大差（秒）
# WBI 签名的重排表（B 站前端写死的常量）
MIXIN = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39,
         12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57,
         62, 11, 36, 20, 34, 44, 52]


class BiliError(Exception):
    pass


_last = 0.0
_cookie = None
_mixin_key = None


def _cookie_header():
    global _cookie
    if _cookie is None:
        if not COOKIE_FILE.exists():
            raise BiliError(f"找不到 cookie 文件（环境变量 BILI_COOKIE 或默认路径 {COOKIE_FILE}）")
        items = json.loads(COOKIE_FILE.read_text(encoding="utf-8"))
        _cookie = "; ".join(f"{c['name']}={c['value']}" for c in items)
    return _cookie


def _get(url, params=None, cookie=False):
    """GET 一个 JSON。cookie=True 时带登录 cookie（只放请求头，出错信息里也不带）"""
    global _last
    wait = _last + INTERVAL - time.time()
    if wait > 0:
        time.sleep(wait)
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {"User-Agent": UA, "Referer": "https://www.bilibili.com/"}
    if cookie:
        headers["Cookie"] = _cookie_header()
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            if r.headers.get("Content-Encoding") == "gzip":
                raw = gzip.decompress(raw)
    except (urllib.error.URLError, TimeoutError) as e:
        raise BiliError(f"请求失败 {url.split('?')[0]}：{getattr(e, 'reason', e)}") from None
    finally:
        _last = time.time()
    return json.loads(raw.decode("utf-8"))


def _read(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def view_raw(bv):
    """不走缓存直接查 view，返回 (code, data)。code ≠ 0 表示视频不在了（下架、隐藏等）"""
    r = _get("https://api.bilibili.com/x/web-interface/view", {"bvid": bv})
    return r.get("code"), r.get("data")


def view(bv, refresh=False):
    """视频信息（aid、pages[].page/cid/part/duration），有缓存用缓存"""
    f = CACHE / "view" / f"{bv}.json"
    d = None if refresh else _read(f)
    if d is None:
        code, d = view_raw(bv)
        if code != 0:
            raise BiliError(f"{bv} 查不到（code {code}），可能已下架")
        _write(f, d)
    return d


def page_info(bv, page):
    for p in view(bv)["pages"]:
        if p["page"] == page:
            return p
    raise BiliError(f"{bv} 没有 P{page}")


def _mixin():
    global _mixin_key
    if _mixin_key is None:
        w = (_get("https://api.bilibili.com/x/web-interface/nav").get("data") or {}).get("wbi_img")
        if not w:
            raise BiliError("nav 接口没返回 wbi_img，无法签名")
        k = "".join(w[n].rsplit("/", 1)[1].split(".")[0] for n in ("img_url", "sub_url"))
        _mixin_key = "".join(k[i] for i in MIXIN)[:32]
    return _mixin_key


def wbi_sign(params):
    """参数加 wts、按键排序、去掉值里的 !'()*、urlencode，拼上 mixin key 做 md5 得 w_rid"""
    p = dict(params, wts=int(time.time()))
    p = {k: "".join(c for c in str(v) if c not in "!'()*") for k, v in sorted(p.items())}
    p["w_rid"] = hashlib.md5((urllib.parse.urlencode(p) + _mixin()).encode()).hexdigest()
    return p


def _fetch_ai_zh(bv, aid, cid):
    """请求一次字幕，返回 body 或 None（这个分 P 没有 ai-zh 字幕）"""
    r = _get("https://api.bilibili.com/x/player/wbi/v2", wbi_sign({"aid": aid, "cid": cid, "bvid": bv}), cookie=True)
    if r.get("code") != 0:
        raise BiliError(f"{bv} 字幕接口返回 code {r.get('code')}：{r.get('message')}")
    subs = ((r.get("data") or {}).get("subtitle") or {}).get("subtitles") or []
    s = next((s for s in subs if s.get("lan") == "ai-zh" and s.get("subtitle_url")), None)
    if not s:
        return None
    url = s["subtitle_url"]
    return _get("https:" + url if url.startswith("//") else url).get("body")


def subtitle(bv, page, refresh=False):
    """某分 P 的 ai-zh 字幕 [{from, to, content}]；没有 ai-zh 字幕返回 None。
    核对最后一行 to 与分 P 时长差 ≤ 60 秒（防止拿到别的视频的字幕），不符重试一次后报错"""
    f = CACHE / "sub" / f"{bv}_p{page}.json"
    body = None if refresh else _read(f)
    if body is not None:
        return body
    d = view(bv)
    p = page_info(bv, page)
    gap = None
    for _ in range(2):
        body = _fetch_ai_zh(bv, d["aid"], p["cid"])
        if not body:
            continue
        gap = abs(body[-1]["to"] - p["duration"])
        if gap <= MAX_TAIL_GAP:
            _write(f, body)
            return body
    if gap is not None:
        raise BiliError(f"{bv} P{page} 字幕末尾 {body[-1]['to']:.0f}s 与时长 {p['duration']}s 相差 {gap:.0f}s，疑似拿错了视频")
    return None


if __name__ == "__main__":
    bv, pg = sys.argv[1], int(sys.argv[2])
    info = page_info(bv, pg)
    body = subtitle(bv, pg)
    if body is None:
        print(f"{bv} P{pg}「{info['part']}」没有 ai-zh 字幕")
    else:
        print(f"{bv} P{pg}「{info['part']}」时长 {info['duration']}s，字幕 {len(body)} 行，最后一行 to = {body[-1]['to']:.1f}s")
