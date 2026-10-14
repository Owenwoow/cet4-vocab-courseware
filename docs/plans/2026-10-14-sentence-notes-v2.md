# 例句讲解改成「对话带练」，词组单独生成音频

- 状态：进行中（阶段 1 已完成）
- 日期：2026-10-14
- 需求原话：
  1. 「词组读音生硬，单独生成词组的音频」
  2. 「我不太喜欢你现在的这套讲解方式，讲解的不够生动和明白，解析是我需要你带着我去翻译个比较差或者比较难的句子」
  3. 讲解类型定为「对话带练」（另外三种：改稿对照、先讲故事、只讲卡点，都没选）
  4. 「哪些任务交给你做，哪些任务交给 WorkBuddy 做（额度有限）」
- 执行方式：总控（Claude）做格式、校验、页面、音频代码和审查；WorkBuddy 做 40 课讲解的批量生成；推送和云端音频由用户或 WorkBuddy 执行
- 开工前已失败的测试：无

## 阶段与分工

| 阶段 | 谁做 | 做什么 | 状态 |
|---|---|---|---|
| 1 | Claude | 新格式、校验、合并脚本、提示词、页面「析」改版、词组音频代码 | 已完成 |
| 2 | WorkBuddy | 试跑 u07-l03、u08-l01 | 待开始 |
| 3 | Claude | 逐句审查试跑结果，按需改提示词；结论：可以批量 / 改提示词 / 改成 WorkBuddy 写初稿、Claude 审难句 | 待开始 |
| 4 | WorkBuddy | 批量其余 38 课，每个 Unit 开一个新对话、一个提交 | 待开始 |
| 5 | Claude | 每个 Unit 抽查 3 句；收尾文档 | 待开始 |
| 6 | 用户或 WorkBuddy | 推送 → 云端 audio 工作流按 Unit 跑 40 课（生成词组音频）→ 确认部署 | 待开始（可提前到阶段 1 推送后，与 2~4 并行） |

## 讲解类型：对话带练

每句：页面自动显示开场白「先别看译文，你自己来。」→ 一块一块往下走（猜你会怎么翻 → 让你自己发现问题 → 给一个能马上动手的办法 → → 这块的中文）→ 排顺序（中英文语序不同时）→ 合起来，和书译对照。
写法：用「你」、口语；一块最多 3～4 句、只解决一个卡点；没卡点的一句带过；术语马上跟白话；找指代一律「放回去试」；would 说出依据。只挑难句或书上有明显转换的句子，一课 5～10 句；拿不准的不写。
完整规范和 4 个示例在 `pipeline/prompts/notes.md`。

## 数据格式

`an = {talk: [{t 英文片段（按句中顺序，可省）, s 带练文字（→ 开头的行是这块的中文）}], order? 排顺序, sum 合起来, cmp 和书译的对照}`，talk 1～6 块。
去掉旧格式的 parts（成分分块）、pts、lit；词组标注 ph 不变。旧格式在全部重写前照常显示，validate 报 WARN「旧格式待重写」。

## 阶段 1 做了什么

- `pipeline/validate.py`：`check_talk` 检查新格式；旧格式只报 WARN
- `pipeline/notes_an.py`：`--dump` 列出例句、书译、已标词组、★ 候选；`--merge` 读 `work/notes-an/<id>.json`，替换本课所有讲解，ph 不动，校验不过不写入
- `pipeline/prompts/notes.md`：重写成对话带练规范，示例 letter / Creating / attribute / except 四句
- `.claude/agents/note-writer.md`、`.claude/skills/make-lesson/SKILL.md`：新课先写词组，讲解走 work 文件 + merge
- `site/sent.js` + `site/style.css`：「析」渲染对话带练（开场白、英文块、→ 行、排顺序、合起来 / 书译、对照），兼容旧格式
- 词组音频：`pipeline/build_audio.py` 读 notes 的 ph，按原形生成 4 种声音（清单字段 `p`）；朗读文本规则 `phrase_spoken`（括号里可省的去掉，a/b 读前一个，… 和 sth. 读 something，sb. 读 somebody，adj. 读 adjective），和 `site/sent.js` 的 `spoken` 一致（1409 个原形逐个对过）；`site/app.js` 点词组、「再读一遍」优先播 `AUD.p[原形]`，没有就用浏览器语音读同样的文本

## 给 WorkBuddy 的指令

见对话里整理的 B（试跑）、D（批量）、E（推送与音频）三段；要点：
- 先读 `pipeline/prompts/notes.md`；每课 `--dump` → 写 `work/notes-an/<id>.json` → `--merge` 直到 `[OK]`
- 只改 `work/notes-an/` 和 merge 产生的 `site/data/notes/`；拿不准的句子不写；提交不加 AI 署名，不 push

## 决定

- 成分分块（彩色块）去掉：对话带练本来就按块讲，再放一排彩色块是重复
- 开场白由页面统一显示，不进数据，省得 40 课各写一遍、写法不一
- 讲解让 WorkBuddy 写中间文件、脚本合并：词组标注不可能被改坏，格式错了合不进去
- 词组占位符读 something / somebody（用户选定）；adj. 读 adjective 是总控补的规则（只有 4 个词组用到）
