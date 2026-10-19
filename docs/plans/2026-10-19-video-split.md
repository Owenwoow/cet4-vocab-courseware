# 讲解视频：浮窗点画面不跳 B 站；分屏看 B 站时 ▶ 让右边的标签跳过去

- 状态：已决定，未执行
- 日期：2026-10-19
- 来源：本会话 /dev-ask（一批 4 条里的 A、B 两条；C 学习新词、D 设置另有计划文件）
- 需求原话：
  - A：悬浮窗中的视频，点击视频画面没法暂停反而会跳转到 B 站原视频，这有点不符合直觉，有方法解决吗
  - B：打开这个章节对应的视频，book 和 b 站视频页面左右分屏观看；我不是每个单词都要看视频，怎么给 b 站的视频打上关键帧，我不用频繁点击播放视频
  - 手机的设计没什么问题，不需要做很大的改动
  - 补充：视频是只对电脑端更新，剩下的内容所有端都要更新

## 调研结论（2026-10-19 实测）

**A：嵌入播放器点画面跳 B 站**

- `player.bilibili.com/player.html` 页面里把 `channelKind` 写死成 `Embedded_Other`（所有外部网站一律算「第三方」）。这一档里点画面的处理是「`window.open` 打开 B 站 + 暂停」，其他档才是正常的点击暂停 / 继续。没有网址参数能改
- B 站另有白名单播放器 `www.bilibili.com/blackboard/newplayer.html`（`Embedded_White`，点画面正常暂停，还带 `iframe-player-bridge.js`），但它按 `document.referrer` 核对白名单（`whitelist.js`，B 站自家和合作网站），我们的域名会被拒（`[Permission] Not Allowed`）。伪造来源属于绕过限制，不做
- 可行：iframe 加 `sandbox="allow-scripts allow-same-origin allow-presentation"`（不给 `allow-popups`）。实测：点画面不再开 B 站、会暂停；再点画面不会继续（这一档的点击逻辑只会暂停），要点左下角 ▶ 或按空格；起播秒数和自动播放不受影响（t=300、t=600 加载约 15 秒后分别显示 5:15、10:15）
- 副作用：播放器里「进入哔哩哔哩，观看更高清」、暂停时的推荐视频、标题、UP 主头像都点不动了（都是开新窗口）。浮窗标题栏我们自己的「B 站 ↗」不受影响

**B：B 站视频上打「关键帧」**

- 别人的视频不能加分段章节（只有 UP 主能加）
- B 站视频页上 `player.seek(秒)`、改 `video.currentTime` 都能瞬间跳转、不重新加载；进度条 DOM（`.bpx-player-progress`）也拿得到，所以油猴脚本能在 B 站页面上画标记、列词表
- B 站视频页没有 `Cross-Origin-Opener-Policy` 头：课件 `window.open` 出来的标签保留引用，之后同名 `window.open(url, 名字)` 能让那个标签跳到新地址
- 线上数据 `cet4.owenwoow.com/data/...` 带 `access-control-allow-origin: *`

## 交接单

```text
/dev-task
【目标】浮窗里点视频画面不再跳 B 站；电脑上把 B 站视频标签分屏放在右边时，词卡上的 ▶ 让那个标签跳到对应秒数，不开浮窗
【要做】
1. 只在电脑端（和浮窗布局同一个判断：vpNarrow() 为假）给浮窗 iframe（site/app.js openVideo）加 sandbox="allow-scripts allow-same-origin allow-presentation"，不给 allow-popups；保留 allow="autoplay; fullscreen; picture-in-picture" 和 allowfullscreen。确认全屏按钮还能用，不能用就补上需要的 sandbox 标记。手机上贴底部的播放器照旧不加（手机上 player.html 会自己转到简化版播放器，行为不同，这次不碰）
2. 「分屏标签」：课件用固定的窗口名（如 cet4-bili）在普通新标签里打开 B 站视频页（window.open(url, 名字)，不加 noopener，不加 popup 特性），用户自己把标签拖出来摆成左右分屏
   - 入口 ①：课文页右下角快捷按钮里加一个「B 站分屏」（窄屏 ≤600px 不显示），点了打开当前读到的那张卡（readingCard）的第一个可用视频和秒数，进入分屏状态，按钮亮起；再点一次退出分屏状态（B 站标签不关）
   - 入口 ②：浮窗标题栏的「B 站 ↗」改成在分屏标签打开同一个视频和秒数，同时关掉浮窗、进入分屏状态
3. 分屏状态下，所有 ▶（课文页词头、复习卡背面、列表页小 ▶，都走 app.js 里同一个点击分流）不再开浮窗，改成 window.open(该视频 url, 同一个名字)，让右边的标签重新加载跳过去；发现那个标签已经被关掉（引用的 closed 为真）就自动退出分屏状态，这一下照旧开浮窗。Ctrl / Shift / 中键点照旧在新标签页打开
4. 文件头注释和 docs/plans/2026-10-15-video-jump.md 末尾补一段「分屏标签」的说明（指向本文件）
【不做】
- 油猴脚本、B 站页面上的进度条标记和词表（用户选了不装东西）
- 课件里另做「本课视频词表 / 时间轴」
- 课件内分屏（右半边固定嵌入播放器）
- 用用户账号批量写 B 站笔记（接口不公开、有风控风险）
- 双向联动：B 站播到哪个词不影响课件
- 用 newplayer.html 或伪造来源绕过白名单
- 手机端改动（包括 sandbox：用户明确说视频只改电脑端）
【已定的取舍】
- 点画面只能暂停、不能继续：B 站外链播放器只给第三方网站「跳转 + 暂停」，sandbox 拦掉跳转后只剩暂停，这是能做到的最好结果；继续播放用 ▶ 或空格
- 分屏用普通新标签、不用弹出窗口：用户选的，自己拖成分屏
- 关键帧不做：用户选了「不装，也不要词表」，只保留「▶ 让右边的标签跳过去」，每次跳要重新加载 2～3 秒
- 只课件控制 B 站，不反向联动：用户按自己的节奏读书
【默认假设】
- 分屏状态只记在当前页面的内存里，刷新课件后要再点一次「B 站分屏」；因为窗口名不变，再点会接管已经开着的那个 B 站标签，不会多开一个
- 浮窗和分屏同时只用一种：进入分屏时如果浮窗开着就关掉
- 视频挑选规则不变（Video.options，按「讲解视频优先用」设置和 alive）；跨分 P、跨系列都是直接换地址
- 点 ▶ 后浏览器可能把焦点切到 B 站标签所在的窗口，先实测；切过去了就在本计划里记成已知现象，不硬做
- 不新增设置项（分屏是开关式的按钮，不进设置页）
【验收】
- node --test "tests/*.test.js" 全过、python pipeline/validate.py 0 错误
- 本地 8775 走查：开浮窗点画面，不开新标签、视频暂停；浮窗全屏能用
- 点「B 站分屏」打开 B 站标签并跳到读到的那个词；再点课文页另外两个词的 ▶，都是同一个标签跳过去，没有新开标签、没有浮窗；复习卡和列表页的 ▶ 一样
- 关掉 B 站标签后点 ▶，回到浮窗；再点「B 站分屏」能重新进入
- 375 宽看一眼：「B 站分屏」按钮不出现，其他照旧
【线索】
- 点击分流：site/app.js 「讲解视频页内播放」一节（document 上捕获阶段的 click，a[data-vi]），videoHTML、openVideo、closeVideo
- 读到哪张卡：site/app.js readingCard、currentGroup
- 右下角快捷按钮：site/index.html 的 #fabs，site/app.js 的 $("#maskFab")、$("#peekFab")
- 视频选择规则：site/video.js（Video.options、Video.url）
```
