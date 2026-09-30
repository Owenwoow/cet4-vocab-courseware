@~/.claude/workflows/dev-collab.md

# 刘晓艳网页课件生成

把《英语四级 · 你还在背单词吗》（扫描版 PDF，368 页）的 Part 01（Unit 1–10）逐课转成可交互的网页课件：思维导图、发音、例句朗读高亮、点词查义、背诵遮挡、磨耳朵。只给自己用。

## 常用命令

- 安装依赖：`pip install pypdf pillow edge-tts`
- 启动：`python -m http.server 8765 --directory site`，打开 http://localhost:8765 （不能直接双击 HTML，fetch 会被拦）
- 全量测试：`python pipeline/validate.py`（校验所有课的数据）
- 批量生成课程：用项目技能 `make-lesson`（`.claude/skills/make-lesson/SKILL.md`），子代理在 `.claude/agents/`（抽取 Sonnet、释义 Haiku）；音频走云端 `audio` 工作流，启动子代理前按技能第 4 节查额度（至少留 5%）
- 查进度：`python pipeline/lessons.py --todo 1 10`（Part 02 即 Unit 11–12 不做，已从 `toc.json` 删除）
- 部署：先 `python pipeline/publish_audio.py` 推音频，再推主仓库 `main`，自动部署（`.github/workflows/deploy.yml`：校验 → 检查音频已上线 → 目录索引 → GitHub Pages）。线上地址 https://owenwoow.github.io/cet4-vocab-courseware/
- 云端生成音频（默认，本地网络跑 edge-tts 会卡死）：Actions → `audio` 工作流（`.github/workflows/audio.yml`），手动触发，填课程 id；并发固定 3（服务器 IP 易被限流），生成后自动推音频仓库并把清单提交回 `main`。需要 Secret `AUDIO_REPO_TOKEN`（PAT，详见工作流文件头部）
- 本地预览要起两个服务：课件 8765（`site/`）、音频 8766（`audio-store/`），见 `.claude/launch.json`
- 新电脑上恢复音频目录：`git clone https://github.com/Owenwoow/cet4-vocab-audio.git audio-store`

## 目录

- `pipeline/`：流水线脚本和提示词（`prompts/`），`toc.json` 是手录的书目录
- `site/`：静态站点，直接托管这个目录；`site/data/lessons/*.json` 是唯一数据源
- `site/data/audio/*.json`：每课音频清单（进 git）；音频文件本身在单独的仓库 `cet4-vocab-audio`，本地克隆在 `audio-store/`（主仓库忽略）
- `site/data/pages/`、`work/`：脚本生成，不进 git

## 项目约束

- 内容与书上逐字一致；书外补充（`site/data/gloss/`）在页面上标「补充」
- 仓库和网站是公开的（公开仓库才有免费 Actions 额度），但只给自己用：页面带 `noindex`，`site/robots.txt` 禁止所有爬虫，不在任何地方放链接
- 原书扫描页（`site/data/pages/`）不进仓库、不部署，「看原书」只在本地版出现（`book.json` 的 `hasPages`）
- 书页码 = PDF 页序号(0 起) − 9（`pipeline/config.py`）
- 每个 Lesson 的词条序号从 01 重新开始；词群编号在整个 Unit 内连续
