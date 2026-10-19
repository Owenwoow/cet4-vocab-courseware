# 例句讲解放宽选句：除最简单的简单句都讲

- 状态：已完成（2026-10-19）
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
| 1 | u01-l01～l04 | 已完成 | 98 |
| 2 | u02-l01～l04 | 已完成 | 94 |
| 3 | u03-l01～l04 | 已完成 | 115 |
| 4 | u04-l01～l04 | 已完成 | 101 |
| 5 | u05-l01～l04 | 已完成 | 105 |
| 6 | u06-l01～l04 | 已完成 | 121 |
| 7 | u07-l01～l04（l04 是试跑课，21 句） | 已完成 | 77 |
| 8 | u08-l01～l04 | 已完成 | 122 |
| 9 | u09-l01～l04 | 已完成 | 83 |
| 10 | u10-l01～l04 | 已完成 | 97 |
| 合计 | 40 课 | | 1013（解析 306 → 1319；粗筛候选里没解析的还剩 308 句，基本是子代理判为最简单的简单句或拿不准的） |

## 额度实测

- u07-l04 试跑（Sonnet）：约 4 万 token、5 次工具调用、2.5 分钟，新增 21 句；没写的 14 句都是最简单的简单句（含 tree-covered 当形容词、进行时、并列谓语）。总控逐句看过：被动、从句、非谓语都点了名并跟白话，cmp 引书译逐字对，没有「前文 / 斜体」；which 指代用两个候选放回去试。小毛病（猜的翻法偶尔不太像真会犯的错，如把 was driving 当被动）不影响使用，没改
- 额度：开工 6% / 17% → 改工具 + 试跑后 13% / 18%（含总控上下文）。批量按每课 5 小时 3%、周 0.5% 估
- 批量 39 课（Sonnet，3 个并行，每课一个 note-writer）：每课约 3.2～5.2 万 token、5～7 次工具调用（个别 10～11 次，多是风格提醒改了一轮）、1.5～3.5 分钟，每课新增 15～36 句
- 额度合计：5 小时窗口 6% → 85%、周 17% → 27%（含总控上下文、改工具、试跑、抽查）。折合每课约 5 小时 1.9%、周 0.25%；一个 5 小时窗口刚好跑完 40 课，没有触发等待

## 抽查与修正

每个 Unit 抽 3 句（Unit 7 另加试跑课 21 句全看），旧解析和词组用脚本逐课比对（40 课「旧句被改 0」）。发现并改掉的：
- u01-l04 namely：说成「插入语」→ 改成引出同位语
- u03-l03 It requires consistent education to be financially independent.：把形式主语后的 to be 说成「表目的」→ 改成 It 是形式主语、to be… 是真正的主语
- u07-l03 furnished：讲解说「把东西当主语」，给的中文主语却是「房间里」→ 改成「不用被，说房间里摆着什么」
- u07-l02 in combination：合译凭空多了「才能」→ 去掉，cmp 改成和书上一样
前两条错例补进了提示词「语法说法要准」。

子代理拿不准没写的（照规矩宁缺勿滥）：多是没有 if 的 would / could（约 15 句）、个别先行词（Some people regard professional change as an unpleasant experience that…、It's joyful in a way that…）、个别用法（prime oneself to、leagues of、annoyed 作谓语）。

## 收尾

- 草稿 `work/notes-an/<id>.json` 已是完整版（含新增），复制回主目录 `work/notes-an/`（worktree 里的 work/ 不进 git）
- 没推送、没跑音频（讲解不需要音频）。推送后 deploy 工作流会自动校验并部署
