# B 站讲解视频跳转

- 状态：已完成
- 日期：2026-10-15
- 需求原话：设置 b 站视频跳转链接，直接跳到对应单词的视频。背诵时先看视频再背单词效率太慢，改成先背单词，不懂不好理解的再跳到视频观看。视频有可能被隐藏或丢失，但各家上传的内容大差不差；可以根据字幕定位单词。
- 执行方式：并行 2 组（依据：A 组 5 个文件 + 40 个生成数据，B 组 7 个文件，两组不碰同一文件，只靠下面定死的数据格式衔接）
- 开工前已失败的测试：无（validate.py 0 错误，node --test 53 项全过）

## 已直接做掉的小改动

- 无

## 分组状态

| 组 | 目标 | 依赖 | 核心 | 状态 | 分支 |
|---|---|---|---|---|---|
| A | 抓字幕、对齐、生成 `site/data/video/*.json`、校验 | 无 | 是 | 已合入 | worktree-agent-a4dc7babc39cabb3e（已删） |
| B | 前端「▶ 视频」按钮（课文页、翻卡后、列表页） | 无（按下面的数据格式开发） | 否 | 已合入 | worktree-agent-a927380ff7979f16a（已删） |

## 视频来源（实测）

| id | BV | 系列 | 覆盖 | 用到的分 P | 说明 |
|---|---|---|---|---|---|
| jj1 | BV1FTPLzBEnj | 精讲带背 · 晓艳教英语 | U1–U7 | P2–P33 | 每课一 P（有的课拆 3-1/3-2）；P1 导学。用户最常用 |
| jj2 | BV1a6jR6pEq4 | 精讲带背 · 考研英语大雁 | U1–U8 | P3–P38 | P1 使用说明，P2 16 秒非正文；与 jj1 各 P 时长一秒不差 |
| qc1 | BV1Vkah6oEVo | 全程班 · 四六级2026考试 | U1–U10 | P1–P10 | 每单元一 P（约 4 小时，= 导学 + 精讲各课拼接）；P11 以后是六级，不要 |
| qc2 | BV1M5JC6HErf | 全程班 · DUO啦A梦梦 | U1–U10 | P1–P10 | 与 qc1 同一文件；P11 以后是写作阅读，不要 |
| qc3 | BV1FdpY6WEH4 | 全程班 · 四六级1次过 | U1–U10 | P1–P10 | 比 qc1 略短 |
| qc4 | BV14fbA6hEeH | 全程班分课版 · 四六级2026考试 | U1–U10 | P2–P41 | 按课分 P，每课时长约精讲 1.8 倍；分 P 标题有错有缺（无 U7(3)、U9(3)），不能信标题 |

默认优先级（全局）：jj1 → jj2 → qc1 → qc2 → qc3 → qc4，按课过滤掉不覆盖的。于是 U1–U7 从 jj1 开始，U8 从 jj2 开始，U9–U10 从 qc1 开始。

## 数据格式（两组共同遵守）

`site/data/video/<课id>.json`，每课一份，自成一体（前端只取这一个文件）：

```json
{
  "lesson": "u01-l01",
  "sources": [
    {"id": "jj1", "bv": "BV1FTPLzBEnj", "label": "精讲带背 · 晓艳教英语", "alive": true},
    {"id": "qc1", "bv": "BV1Vkah6oEVo", "label": "全程班 · 四六级2026考试", "alive": true}
  ],
  "entries": {
    "1": {"jj1": [2, 23], "qc1": [1, 1402]},
    "2": {"jj1": [2, 97], "qc1": [1, 1476, 1]}
  }
}
```

- `sources`：这一课覆盖到的视频，**数组顺序就是优先级**
- `entries`：键是词条号 `no`（字符串）；值是「视频 id → [分P号, 秒]」，第三位 `1` 表示推算出来的（approx），页面标「约」；某视频没有这个词就不出现这个键
- 链接：`https://www.bilibili.com/video/<bv>/?p=<分P号>&t=<秒>`，秒为整数

## 任务单

**子代理看不到对话，任务单必须单独拿出来也看得懂。**

### 组 A：从 B 站字幕对齐出每个词条的视频时间点

- 背景：课件（刘晓艳《英语四级 · 你还在背单词吗》Part 01，U1–U10，共 40 课）要给每个词条加「▶ 视频」，点开跳到 B 站上老师讲这个词的时间点。用户先背词，不懂再看视频。同一套讲课录像被多个 UP 主上传（见上面「视频来源」表），视频可能下架，所以每个词在每个视频里都要有时间点，前端按优先级挑在线的。定位靠 B 站自动生成的中文字幕（ai-zh）：老师严格按书上词条顺序讲，英文单词基本被识别成英文。
- 要做：
  1. `pipeline/bili.py`：B 站接口封装（验证：能拉到 jj1 P2 的字幕，最后一行 `to` ≈ 该 P 时长 3519 秒）
     - 分 P：`GET https://api.bilibili.com/x/web-interface/view?bvid=…` → `aid`、`pages[].cid/part/duration`，不需要 cookie
     - 字幕：`GET https://api.bilibili.com/x/player/wbi/v2?aid=&cid=&bvid=`，必须带 WBI 签名和登录 cookie。签名：`/x/web-interface/nav` 的 `wbi_img` 里取 img_key、sub_key（URL 文件名去扩展名）拼起来，按 mixin 表重排取前 32 位；参数加 `wts`（秒级时间戳）后按键排序、去掉值里的 `!'()*`、urlencode，拼上那 32 位做 md5 得 `w_rid`。取 `lan == "ai-zh"` 的 `subtitle_url`（以 `//` 开头补 `https:`），内容 `body` 是 `[{from, to, content}]`
     - **不要用不签名的 `/x/player/v2`**：会随机返回别的视频的字幕。拿到字幕后校验最后一行 `to` 与分 P `duration` 相差不超过 60 秒，否则重试一次后报错
     - cookie：环境变量 `BILI_COOKIE` 指定的 JSON，默认 `C:\Users\Owen_W\Downloads\bilibili_cookie.json`，格式 `[{name, value}]`。**绝不打印、不写进日志、不复制进仓库**
     - 字幕和 view 结果缓存到 `work/bili/`（已被 .gitignore 忽略），有缓存就不重复请求；请求间隔约 1 秒
  2. `pipeline/video_sources.json`：手录的视频表（进 git），内容按上面「视频来源」表：id、bv、label、series、units（覆盖的单元）、pages（用到的分 P 号范围）、alive；另记每个用到的分 P 的时长（validate.py 不联网，要靠它检查秒数上限）。优先级就是数组顺序（验证：脚本能读）
  3. `pipeline/video_align.py`：生成 `site/data/video/<课id>.json`，格式见上面「数据格式」（验证：40 个文件都生成，validate.py 通过）
     - 每个视频把用到的分 P 字幕按 P 顺序接成一条时间线；该视频覆盖的所有单元的全部词条，按书上顺序（`site/data/book.json` 的课序 → 每课 `groups[].entries[]` 顺序）在时间线上依次往后找，时间严格递增。分 P 标题标错、一课拆 3-1/3-2 都不影响
     - 候选：字幕 `content` 里大小写不敏感地找这个词，词开头要在词边界上（前面不是字母）；同时找拼写变体：programme/program、-tre/-ter（centimetre）、-our/-or、licence/license、带连字符的词去掉连字符或拆成空格
     - **不要取"第一次出现"**：老师会在讲上一个词时顺嘴提到下一个（例：U1L1 讲 universe 时 2:33 说了 united states，真正讲 unite 在 3:35「这个单词叫做」）。每个候选的权重 = 前后 60 秒内这个词出现的次数，在保持递增的前提下选总权重最大的一组（加权最长递增链 / DP）；跳转点 = 被选中那一段里该词第一次出现的时间，再往前提 3 秒，但不早于上一个词的跳转点
     - 找不到的词：① 另一个视频里找到了，就用两边都找到的前后邻近词算出时间差（取中位数），换算过来，标 approx；② 都没有，就用同一视频里前后两个已定位词的时间插值，标 approx。**成段缺失（整课或连续 5 个以上词都找不到，例如 qc4 缺 U7(3)、U9(3)）说明这个视频没有这段，不要插值，这些词就不给这个视频**
     - 秒数换算回原分 P 内的时间（时间线时间减去该 P 起点），取整
     - `--check`：用 view 接口查每个 BV 是否还在（返回 code ≠ 0 即下架），更新 `pipeline/video_sources.json` 的 alive，并改写各课数据文件里 `sources[].alive`（不重新对齐、不需要 cookie）
     - 新增视频：在视频表里加一行重跑即可。新上传的视频没有 AI 字幕时，如果某个分 P 时长和已知视频的某个分 P 一秒不差，就直接沿用那个分 P 的时间点（写进代码，不用现在实测）
     - 跑完打印：每个视频、每课的直接找到数 / 词条数，以及 approx 清单
  4. `pipeline/validate.py` 加 `check_video`：数据文件存在时检查——词条号都在这一课里；`sources` 里的 id 都在视频表里；分 P 号在该视频用到的范围内；秒数 ≥ 0 且不超过该分 P 时长；同一视频、同一课内 (分P, 秒) 按词条顺序不减（验证：故意改坏一个文件能报 ERROR，改回通过）
  5. 抽查准确度：每单元随机抽 3 个词（共 30 个，固定随机种子），对每个词打印跳转点前后 30 秒的字幕，人工判断落点是否在这个词讲解开始前 0–20 秒内；把结果（合格数和不合格的词、原因）写进报告（验证：≥ 27 个合格；不够就调算法再抽）
- 允许改动：`pipeline/bili.py`（新）、`pipeline/video_align.py`（新）、`pipeline/video_sources.json`（新）、`pipeline/validate.py`、`site/data/video/*.json`（新，生成的）
- 禁止改动：公共文档（CLAUDE.md、docs/、.claude/）；组 B 的文件：`site/*.js`、`site/style.css`、`site/index.html`、`tests/`、`.github/`
- 参考写法：
  - 已能用的探查脚本（可直接参考或拷贝思路）：`C:\Users\Owen_W\AppData\Local\Temp\claude\E--Code-cet4-vocab-courseware\f20aa158-6bbe-4d39-b57c-0720ed6fa284\scratchpad\bili\`——`bili.py` 有可用的 WBI 签名实现，`align.py` 是不加权的简易递增对齐，`view.json` 是 6 个视频的分 P 信息
  - 已实测的不加权对齐结果：U1L1 54 词直接找到 53，U8L4 59 找到 56，qc1 的 U1 整单元 223 找到 208，U10 232 找到 206；漏的多是英式拼写、带连字符、短词被识别成中文（wit、gum、lick）
  - 每课一份补充数据、validate.py 检查它们的写法：`site/data/roots/`、`site/data/notes/` 和 `pipeline/validate.py` 的 `check_roots`、`check_notes`；路径常量在 `pipeline/config.py`
- 验收：`python pipeline/validate.py` 0 错误；`node --test "tests/*.test.js"` 全过；40 课每个词条至少在一个视频里有时间点；全部（词条 × 视频）里非 approx 的比例 ≥ 90%；30 词抽查 ≥ 27 个合格

### 组 B：前端「▶ 视频」按钮

- 背景：同上。组 A 会生成 `site/data/video/<课id>.json`（格式见上面「数据格式」，**以那里为准**）。你这边开发时组 A 的数据还没有，用测试夹具和临时手写的数据文件。
- 要做：
  1. `site/video.js`（新）：纯函数模块，写法照 `site/vocab.js`（浏览器里是全局 `Video`，Node 里 `module.exports`）。至少：`url(bv, p, t)` 拼链接；`options(data, no)` 返回这个词条可用的视频 `[{id, label, url, approx}]`，按 `data.sources` 顺序，跳过 `alive === false` 的和 `entries[no]` 里没有的；`data` 为空或没有这个词条返回 `[]`（验证：`tests/video.test.js` 覆盖：优先级顺序、跳过下架、跳过缺词、approx 标记、空数据）
  2. `site/index.html` 在 `app.js` 前加 `<script src="video.js"></script>`；`.github/workflows/deploy.yml` 里给 js 加版本号的 sed 正则加上 `video`（验证：看 diff）
  3. 课文页（`site/app.js`）：`loadLesson` 里和其他补充数据一样并行取 `data/video/${id}.json`，失败当没有；`cardHTML` 的词条头部（🔊 旁边）加「▶ 视频」，链接到第一个可用视频，新标签页打开（`target="_blank" rel="noopener"`）；approx 的显示「▶ 视频（约）」；可用视频多于 1 个时旁边放一个小的「换」菜单，列出其余视频（显示 label，approx 的标「约」），点了同样新标签页打开；没有可用视频就不显示（验证：本地起服务，用临时数据看到按钮、链接正确）
  4. 复习 / 巩固（`site/study.js`）：`getLesson` 的缓存里同样取视频数据；卡片背面 `backHTML`（翻卡翻开后、选择题答完后都会显示）加同样的按钮。词条号：书上词条用 `x.e.no`；扩展词（`x.e.extOf`）用它所属主词条的号；只有例句逐词释义的生词（`x.e.gloss`）没有视频，不显示。注意确认点按钮不会被卡片上已有的点击处理（翻卡、读音等）截走（验证：同上）
  5. 列表页（`study.js` 的 `renderList`，生词本、今日、单元列表都走它）：每行加一个小的「▶」链接（规则同上；没有就不显示）（验证：同上）
  6. `site/style.css` 加按钮和菜单样式，手机宽度下不挤乱词条头部（验证：窄屏看一眼）
  7. 封装一个按钮 HTML 的辅助函数放在 `app.js`（`study.js` 能直接用 app.js 的全局函数，如 `esc`、`fetchJSON`），三处共用
- 允许改动：`site/video.js`（新）、`tests/video.test.js`（新）、`site/app.js`、`site/study.js`、`site/style.css`、`site/index.html`、`.github/workflows/deploy.yml`
- 禁止改动：公共文档（CLAUDE.md、docs/、.claude/）；组 A 的文件：`pipeline/`、`site/data/`（**不要提交 `site/data/video/` 下的任何文件**；走查时可以临时手写一份 `site/data/video/u01-l01.json`，交付前删掉）
- 参考写法：纯函数模块 + 单测：`site/vocab.js` + `tests/vocab.test.js`；补充数据并行加载：`app.js` 的 `loadLesson`、`study.js` 的 `getLesson`；Web Awesome 组件已可用（版本写死在 `index.html`，如 `wa-dropdown`），也可以用更轻的原生写法，和现有页面风格一致即可
- 验收：`node --test "tests/*.test.js"` 全过（含新增的 video 测试）；`python pipeline/validate.py` 0 错误；本地起服务（端口用 8785，别占 8765/8775）用临时数据确认三处按钮都出现、链接是 `https://www.bilibili.com/video/<bv>/?p=<P>&t=<秒>`、把首选视频改成 `"alive": false` 后按钮自动换成下一个；没有视频数据的课页面照常、不报错

## 决定

**结果**

- 40 课 2327 个词条都至少有一个视频；全部 12478 个（词条 × 视频）时间点里，直接从字幕找到的占 91.7%，其余是推算的（页面标「约」）
- 各视频直接找到比例：jj1 92.6%、jj2 92.4%、qc1/qc2 91.4%、qc3 91.3%、qc4 77.7%（缺 6 课，见下）
- 抽查（每单元 3 词，共 30 个，落点在讲解开始前 0–20 秒算合格）：组 A 调参用的种子 20261015 是 29/30，种子 1 是 30/30，留作验证的种子 7 是 28/30；总控另用种子 4242 独立判是 29/30，不合格的是 missile（字幕识别成「MISA」，推算落点晚了 14 秒）
- 电脑浏览器实测：链接能跳到正确的分 P 和秒数，并自动播放，超过 1 小时的秒数也行（qc1 P9 t=4992）

**对齐规则（比任务单多做的，都是为了让抽查合格）**

- 起点除了「选中段里第一次出现 − 3 秒」，还会往前修：变点法；「这个单词叫做 / 继续来」这类开讲提示语；近似拼写（band→bind）；词的独有中文释义（系主任→dean）
- 只在相邻词讲解里出现一次（权重 1）的不算找到；跳转点不会跨回上一个分 P
- 找不到的词：先用别的视频换算，再用近似拼写或中文释义定位，最后才插值，三种都标「约」
- 拼写变体另加了 -ise/-ize、-yse/-yze、-ogue/-og、-bre/-ber、-llous/-lous、despatch、cheque、plough；≤3 个字母的短词要求词尾也在词边界上（防止 sin 匹配 since）
- 成段缺失：连续 ≥5 个找不到的词不插值；另外，一课里直接找到的不到一半，就整课都不给这个视频
- 课数据的 `sources` 只列这一课里至少有一个时间点的视频
- 新上传的视频没有 AI 字幕时，借用时长一秒不差的分 P 的字幕（qc1 P6 已借用 qc2 P6）

**视频情况（新发现）**

- qc4（全程班分课版）缺 6 课：U7L3、U9L3、U6L2、U8L2 没有对应的分 P（P26「Unit6（3）」实为 U6L3-1，P32「Unit8（1）(2)」只有 L1）；U1L4、U9L2 的分 P 没有 AI 字幕
- 6 个视频是同一套录像：qc3 = 导学 1399 秒 + 精讲各 P；qc1 比 qc3 略长；qc4 前段与精讲一致、后面多了内容
- B 站 AI 字幕常见的识别错误：识别成同音的其他词（coast→cost、march→much、assess→access），或识别成中文谐音；短词常被识别成中文（wit、gum、lick）

**前端**

- 「换」菜单只列主按钮以外的视频；列表页每行一个小 ▶，只开第一个可用的视频，不带菜单
- 扩展词用所属主词条的时间点；只有逐词释义的生词没有视频
- 复习页里点完按钮后焦点留在链接上，按空格或回车会触发「继续」而不是打开链接，和原有按钮的行为一致，没处理

**手机端：维持现状（2026-10-16 用户决定，不常用）**

手机上按钮照常显示，但用手机浏览器打开 B 站网页时跳不到对应秒数。以后要做时，下面是 375 宽模拟器里实测过的做法：

- 现有链接在手机网页（m.bilibili.com）里打开：停在 0 秒，一直显示「正在缓冲」，跳不过去
- 唤起 App：B 站手机网页自己的「打开 App」按钮用的是 `bilibili://video/<av号>?page=<分P−1>&start_progress=<毫秒>`。数据里还要补 av 号（view 接口的 `aid`）。真机没测过；iOS 每次唤起都会先弹确认框，微信里打开课件时会被拦；看一个词要切两次 App
- 页内嵌入播放器：`https://player.bilibili.com/player.html?bvid=<BV>&p=<分P>&t=<秒>&danmaku=0`。手机上会转到简化版播放器，画质 360p，手动点一下播放后从指定秒数开始播，分 P 正确。不离开页面，割裂感最小；当时推荐的就是这个（电脑端维持新标签页打开）

**改为页内播放（2026-10-16，用户看过 demo 后决定，推翻了上面「不嵌入播放器」和「手机端维持现状」两条）**

- 点 ▶ 不再跳到 B 站，而是在页面里开 B 站嵌入播放器（`Video.embed`）：电脑上是画中画式浮窗，手机上贴在底部。没登录时画质 360p，播放窗里留一个「B 站 ↗」可以去 B 站看高清。Ctrl / Shift / 中键点按钮，照旧在新标签页打开 B 站
- 电脑上拖标题栏移动、拖四个角缩放，画面保持 16:9，宽度 280～1100px，整个窗口留在屏幕内。位置和大小按「离右边、下边的距离 + 宽度」记在 `vpGeo`（走 Sync）；按右下角记，是为了换一个屏幕大小也还在原来那个角落。双击标题栏恢复默认
- 词头只留一个和 🔊 成对的圆形 ▶，所有按钮长得一样（起初推算的时间点用虚线圈区分，用户看不出含义，去掉了，只在悬停提示和播放窗下拉框里标「约」）；「换」从词卡上去掉，换视频改在播放窗的下拉框里。复习卡上的 ▶ 放在读音旁边，只在翻开或答完题之后出现，免得答题前就能看讲解
- 设置 →「讲解视频优先用」（`set:videoPrefer`）：精讲带背 / 全程班，按 label 开头匹配系列。选的那种里没有这个词，就用另一种
- 已知的小别扭：点过播放窗里面以后，键盘焦点会停在 iframe 里，复习页的空格、数字键要先点一下页面才能用；播放窗开着时，第一下 Esc 先关播放窗

**分屏标签与浮窗点画面不跳 B 站（2026-10-19，只电脑端，详见 `2026-10-19-video-split.md`）**

- 浮窗 iframe 加 `sandbox="allow-scripts allow-same-origin allow-presentation"`（不给 allow-popups）：B 站外链播放器点画面原本是「开 B 站 + 暂停」，拦掉后只剩暂停；再点画面不会继续，要点播放器左下角 ▶ 或按空格。手机不加
- 右下角「B站」按钮（窄屏不显示）：用固定窗口名 `cet4-bili` 在普通新标签里打开读到那张卡的第一个视频，进入分屏状态，用户自己把标签拖成左右分屏；分屏状态下所有 ▶ 让那个标签跳过去、不开浮窗；标签被关掉自动退出。浮窗标题栏的「B 站 ↗」也改成在分屏标签打开并关掉浮窗。状态只记在页面内存，刷新后再点一次按钮会接管已开着的同名标签
