@~/.claude/workflows/dev-collab.md

# 刘晓艳网页课件生成

把《英语四级 · 你还在背单词吗》（扫描版 PDF，368 页）的 Part 01（Unit 1–10）逐课转成可交互的网页课件：思维导图、发音、例句朗读高亮、点词查义、背诵遮挡、磨耳朵；首页是背词门户（学习记录、巩固模式、滚动复习、周总结）。只给自己用。

## 常用命令

- 安装依赖：`pip install pypdf pillow edge-tts`
- 启动：`python -m http.server 8765 --directory site`，打开 http://localhost:8765 （不能直接双击 HTML，fetch 会被拦）
- 全量测试：`python pipeline/validate.py`（校验所有课的数据）+ `node --test "tests/*.test.js"`（复习规则单元测试）
- 批量生成课程：用项目技能 `make-lesson`（`.claude/skills/make-lesson/SKILL.md`），子代理在 `.claude/agents/`（抽取 Sonnet、释义 Haiku）；音频走云端 `audio` 工作流，启动子代理前按技能第 4 节查额度（至少留 5%）
- 查进度：`python pipeline/lessons.py --todo 1 10`（Part 02 即 Unit 11–12 不做，已从 `toc.json` 删除）
- 部署：先 `python pipeline/publish_audio.py` 推音频，再推主仓库 `main`，自动部署（`.github/workflows/deploy.yml`：校验 → 检查音频已上线 → 目录索引 → GitHub Pages）。线上地址 https://cet4.owenwoow.com/（自定义域名，旧的 github.io 地址会自动跳转过来；云同步 token 按网址存，要在这个地址下粘贴）
- 云端生成音频（默认，本地网络跑 edge-tts 会卡死）：Actions → `audio` 工作流（`.github/workflows/audio.yml`），手动触发，填课程 id；并发固定 3（服务器 IP 易被限流），生成后自动推音频仓库并把清单提交回 `main`。需要 Secret `AUDIO_REPO_TOKEN`（PAT，详见工作流文件头部）
- 本地预览要起两个服务：课件 8765（`site/`）、音频 8766（`audio-store/`），见 `.claude/launch.json`；8765 被占用时用备用的 `site-alt`（8775，localStorage 按端口隔离，测试数据不串）
- 新电脑上恢复音频目录：`git clone https://github.com/Owenwoow/cet4-vocab-audio.git audio-store`

## 目录

- `pipeline/`：流水线脚本和提示词（`prompts/`），`toc.json` 是手录的书目录
- `site/`：静态站点，直接托管这个目录；`site/data/lessons/*.json` 是唯一数据源。`app.js` 课文与设置，`study.js` 首页 / 记录 / 巩固 / 浏览 / 周总结，`srs.js` 复习规则（纯函数），`sync.js` 存储与云同步
- `site/data/audio/*.json`：每课音频清单（进 git）；音频文件本身在单独的仓库 `cet4-vocab-audio`，本地克隆在 `audio-store/`（主仓库忽略）
- `site/data/pages/`、`work/`：脚本生成，不进 git

## 项目约束

- 内容与书上逐字一致；书外补充（`site/data/gloss/`）在页面上标「补充」
- 仓库和网站是公开的（公开仓库才有免费 Actions 额度），但只给自己用：页面带 `noindex`，`site/robots.txt` 禁止所有爬虫，不在任何地方放链接
- 原书扫描页（`site/data/pages/`）不进仓库、不部署，「看原书」只在本地版出现（`book.json` 的 `hasPages`）
- 书页码 = PDF 页序号(0 起) − 9（`pipeline/config.py`）
- 每个 Lesson 的词条序号从 01 重新开始；词群编号在整个 Unit 内连续
- 学习进度（已会、设置、上次的课、每课阅读位置）统一走 `site/sync.js` 存取，不要直接写 localStorage；新增要跨设备同步的状态也走它。云端是用户自己的私密 Gist（`cet4-progress.json`），token 只存本机，绝不写进仓库
- 背词数据也走 `sync.js`：`learn:<课id>:g<词群号>` = 学的日期，`srs:<词>` = 复习卡，`log:<日期>` = 当天评分计数；取消记 0（墓碑），不要删键
- 复习规则只在 `site/srs.js` 改，改了同步改 `tests/srs.test.js`；规则说明写在文件开头和 `docs/plans/2026-10-01-vocab-portal.md`
- 组件库 Web Awesome 只引主题变量 `themes/default.css` 和组件加载器，不引 `native.css`、不用 `wa-page`（会改动课文页）；版本号写死在 `index.html`。新增脚本要加进部署工作流的版本号 sed
