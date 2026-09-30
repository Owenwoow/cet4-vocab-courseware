@~/.claude/workflows/dev-collab.md

# 刘晓艳网页课件生成

把《英语四级 · 你还在背单词吗》（扫描版 PDF，368 页）逐课转成可交互的网页课件：思维导图、发音、例句朗读高亮、点词查义、背诵遮挡、磨耳朵。只给自己用。

## 常用命令

- 安装依赖：`pip install pypdf pillow edge-tts`
- 启动：`python -m http.server 8765 --directory site`，打开 http://localhost:8765 （不能直接双击 HTML，fetch 会被拦）
- 全量测试：`python pipeline/validate.py`（校验所有课的数据）
- 生成一课：见 `docs/plans/demo-u7l1.md` 的工作流表

## 目录

- `pipeline/`：流水线脚本和提示词（`prompts/`），`toc.json` 是手录的书目录
- `site/`：静态站点，直接托管这个目录；`site/data/lessons/*.json` 是唯一数据源
- `site/data/pages/`、`site/data/audio/`、`work/`：脚本生成，不进 git

## 项目约束

- 内容与书上逐字一致；书外补充（`site/data/gloss/`）在页面上标「补充」
- 仓库不公开；页面带 `noindex`
- 书页码 = PDF 页序号(0 起) − 9（`pipeline/config.py`）
- 每个 Lesson 的词条序号从 01 重新开始；词群编号在整个 Unit 内连续
