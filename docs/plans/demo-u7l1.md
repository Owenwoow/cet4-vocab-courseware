# Demo：Unit 7 Lesson 1 全链路

状态：demo 已跑通，待用户验收（2026-09-30）

## 已定的方向

- 只给自己用，内容**与书上一致**；书外补充（例句逐词释义）在页面上标「补充」。
- 仓库和网站公开（私有仓库没有免费 Actions 额度），只给自己用：`noindex` + `robots.txt` 禁止收录，原书扫描页不部署。
- 走 Claude Code 订阅；工作流拆成独立步骤，繁琐耗 token 的步骤可以换成 DeepSeek 等便宜模型。

## 工作流（每课一遍）

| 步 | 做什么 | 谁来做 | 命令 / 文件 |
|---|---|---|---|
| 1 | 抽页图 | 脚本 | `python pipeline/extract_pages.py 191 195` |
| 2 | 页图 → Lesson JSON | **视觉模型**（Sonnet 子代理，或 Qwen-VL / GLM-4V 等便宜视觉模型） | 提示词 `pipeline/prompts/extract_lesson.md` → `site/data/lessons/u07-l01.json` |
| 3 | 校验 | 脚本（不花 token） | `python pipeline/validate.py u07-l01` |
| 3′ | 有 ERROR 就回炉 | 同第 2 步的模型，附上错误清单和页图 | — |
| 4 | 例句逐词释义 | **纯文本便宜模型**（DeepSeek / Haiku） | 提示词 `pipeline/prompts/gloss.md` → `site/data/gloss/u07-l01.json` |
| 5 | 音频（本地生成） | 脚本（edge-tts，免费） | `python pipeline/build_audio.py u07-l01` |
| 5′ | 推送音频到音频仓库 | 脚本 | `python pipeline/publish_audio.py` |
| 6 | 目录与搜索索引 | 脚本 | `python pipeline/build_index.py` |
| 7 | 对照原书抽查 | **人** | 网页里每个词群的「📖 看原书」 |

注意：DeepSeek 的 API 目前只收文本，第 2 步（看图）用不了它，只能用在第 4 步。

## 自动核对点

- 序号每个 Lesson 从 01 连续：漏抽、重抽都会报错。
- 目录写了每个 Unit「共 N 个词群、N 词」（`pipeline/toc.json`），一个 Unit 四课都生成后，`build_index.py` 自动对数。
- 每个 Unit 末尾「单元小结」写了词群、单词、扩展词、真题例句、经典例句的数量，可以再加一层核对（未做）。
- 音标里的 `'` `:` 这类 OCR 常见错误、例句重点词拼写、导图和词条对不上，都会报出来。

## 取舍

- **不转 Markdown 文档，直接转结构化 JSON**：网页、音频、校验都要用结构化数据，多一层 Markdown 只会多一次丢信息。
- **音频改成独立 mp3，按内容哈希去重**：样例把 7 个词的音频 base64 内嵌在 HTML 里，已经 5MB；现在一课约 10MB 的独立小文件，按需加载，重跑时只补新文件。
- **慢速不再单独生成**，改用浏览器 `playbackRate`（慢 0.75 / 较慢 0.9 / 常速），音频量减半。默认生成全部四种声音（Ava / Andrew / Sonia / Ryan），每种一课约 4MB；想省空间用 `--voices ava,sonia` 这类参数只生成部分。
- **设置集中到单独的设置页**（`#/settings`，顶栏 ⚙）：发音（可试听）、语速、背诵模式、隐藏已会、磨耳朵范围/读中文/循环、主题、清空已会记录。设置存在本机浏览器里。课文页只留右下角两个悬浮按钮：「遮」（背诵模式快捷切换）和 🎧（磨耳朵）。
- **音频放独立仓库 `cet4-vocab-audio`，本地生成后推送**（2026-09-30 改）：线上生成会被语音服务限流，Actions 缓存 7 天不用就被删，届时要全书重生成；主站和音频各占一个 Pages 站点，各有约 1GB 额度。音频按内容哈希命名、只增不改，仓库历史不会膨胀。每课清单记着音频站地址 `base`，音频仓库满了就新建 `-2`，改 `pipeline/config.py` 两行，旧课不受影响。部署前 `check_audio.py` 抽查音频已上线，忘推音频会拦住部署。
- **页图不进 git**：用脚本从本地 PDF 重新生成。
- 手机上的思维导图改成竖向大纲，桌面端保持横向树。

## 下一步（待定）

- [ ] 用户验收 demo，提改动意见
- [ ] 用 Sonnet 子代理（或便宜视觉模型）按提示词跑 Unit 7 Lesson 2，对比人工结果，测出准确率
- [ ] 把工作流固化成项目技能 `.claude/skills/make-lesson/`
- [x] 部署：GitHub Actions → GitHub Pages，https://owenwoow.github.io/cet4-vocab-courseware/（2026-09-30）
  - 线上生成音频被限流、缓存会过期 → 音频改为本地生成，放独立仓库 https://owenwoow.github.io/cet4-vocab-audio/
  - Pages 缓存 10 分钟：部署时给 app.js / style.css 加版本号
  - 容量：全书音频估计约 600MB，单个音频仓库装得下；`publish_audio.py` 每次会报总量，接近 1GB 时再拆
- [ ] Part 02（词以序记）版式不同，需要另一套 schema 和模板
- [ ] 复习功能：书末艾宾浩斯打卡表
