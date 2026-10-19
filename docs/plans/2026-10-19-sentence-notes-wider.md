# 例句讲解放宽选句：除最简单的简单句都讲

- 状态：进行中
- 日期：2026-10-19
- 需求：现在 2327 个例句只有 306 句有「析」；用户英语基础弱，希望除了最简单的简单句，带被动、从句、非谓语、插入语或较长的例句都讲（例：She was applauded as she came on stage.、The band played a familiar tune which had everyone clapping along.，都在 u07-l04）。讲解格式、写法沿用 10-14 定的「对话带练」（`2026-10-14-sentence-notes-v2.md`），只放宽选句
- 执行：本会话总控，worktree 分支 `claude/notes-expand-cde186`；note-writer 子代理（Sonnet）每课一个，在本 worktree 里跑（不用 isolation: worktree），只补讲解
- 开工前已失败的测试：无（validate 40 课 0 错误，node 66 项全过）
- 开工额度：5 小时窗口 6%、周 17%（Pro）

## 不做

不改已有 306 句讲解；不改词组 ph；不改前端；不跑音频；Part 02 不做。

## 工具改动（已完成）

- `pipeline/prompts/notes.md` 第二节：选句改成「除最简单的简单句都写」，写明什么算最简单；1 个卡点的短句也写、1～2 块；去掉「每句至少 2 个真卡点」「一课 5～10 句」；被动、从句、非谓语要点出语法名称并紧跟白话；补 She was applauded… 短句示例；补写走 `.add.json` + `--add`
- `pipeline/note_sents.py`：候选粗筛放宽（as/before/after/than/so 等连词、常见不规则过去分词、to do、-ing 短语（排除进行时和 thing/morning 类名词）、任一逗号、≥12 词）；列表里 ✓ 标已有解析；`--all` 多一列「没解析的候选」。候选 506 → 1536（会多标，子代理按标准排除）
- `pipeline/notes_an.py`：`--dump` 标「✓ 已有解析」；新增 `--add`：读 `work/notes-an/<id>.add.json`，键已有解析就报错，校验 ERROR 或风格提醒都不写入（`--force` 放行风格提醒），写入后把本课全部解析写回 `<id>.json` 并删掉 `.add.json`
- `.claude/agents/note-writer.md`、`.claude/skills/make-lesson/SKILL.md`：加「只补讲解」模式和新选句标准

## 进度

| Unit | 课 | 状态 | 新增句数 |
|---|---|---|---|
| 7 | u07-l04（试跑定质量） | 待做 | |
| 1～10 | 其余 39 课 | 待做 | |

## 额度实测

（试跑后填）
