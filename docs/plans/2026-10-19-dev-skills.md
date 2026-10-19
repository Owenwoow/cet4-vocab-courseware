# 协作技能统一成 dev- 一组，补需求澄清、会话交接和记忆读写规则

- 状态：已决定，未执行
- 日期：2026-10-19
- 来源：本会话讨论（会话交接方式 → 技能化 → 命名 → idea-shaping 定位 → 项目记忆设计），用户确认"好的"
- 范围：大部分改动在全局 `~/.claude`（claude-config 仓库），第 6、7 项在本项目；执行时两个仓库各自提交

## 交接单

```text
/task
【目标】把写代码协作的技能统一成 dev- 一组，补上需求澄清、会话交接两个技能和记忆读写规则，并清理本项目的协作文件
【要做】
1. 改名：~/.claude/skills/repo-init → dev-init，task → dev-task（目录名、frontmatter 的 name、斜杠命令）。同步改所有引用旧名的地方：workflows/dev-collab.md（交接单模板开头改成 /dev-task、各处 /task、task 技能的路径）、dev-task 自己的各个文件、dev-init 里检查 task/SKILL.md 的路径和 templates 里的引用。旧计划文件里的 /task 是历史记录，不改
2. 新建 ~/.claude/skills/dev-clarify/SKILL.md：已有项目里的需求澄清，产出交接单。流程：先读相关代码、计划、CLAUDE.md，代码能回答的不问 → 两三句话复述理解 → 决定点表（决定点 / 推荐默认值 / 理由 / 其他选项），重点覆盖"等 / 之类 / 还没想好"、只说了动作没说参数、和项目约束冲突的地方 → 一次问完，允许用户回"全按推荐"，最多 2 轮 → 给交接单和按钮（沿用 dev-collab 的规则）。从 idea-shaping 借：回声确认里"我推断的、你没明说的部分"、模糊处不许悄悄填空、抽象名词要求给具体例子、用户说"都行"时给 A/B/C 选项、发现矛盾直接指出。不借：一次只问一个、骨架六问、补充位、8 节文档。允许自动触发；description 写清触发信号，以及不用于：清晰的小改动、纯提问、从零开始的新项目想法（那是 idea-shaping）
3. 新建 ~/.claude/skills/dev-handoff/SKILL.md：半手动（不加 disable-model-invocation，description 写"只在用户明确要求整理交接时使用"）。参数是下一个任务的一句话，没给就先问。先查已经落盘的（相关计划、CLAUDE.md、rules），只补里面没有的 → 写 docs/plans/<日期>-<主题>-handoff.md（新任务需要知道的结论、相关文件和数据格式、约束、踩过的坑、没做完的事、建议的第一步；不写过程）→ 提交 → 给「新会话接着做」按钮，新会话开场：先读这份文件，再用 dev-clarify 讨论新任务
4. dev-collab.md 补规则：
   a. 交接单模板加【默认假设】栏：用户没明说、AI 按推荐值定下的
   b. 需求改了或加了功能，重新给一份完整的交接单，不在旧单上追加
   c. "需求模糊就先问清楚"：大改动用 dev-clarify；小改动仍当场问一句
   d. 改动已有功能前，先在 docs/plans/ 里搜这个功能的计划，看【已定的取舍】和【不做】；和这次需求冲突的先指出来再动手
   e. 提交说明正文写一句"为什么"，有计划文件时带上文件名
   f. 落盘一节加两条：只讨论不执行的会话，定下的结论写进 docs/plans/<日期>-<主题>.md，状态"已决定，未执行"，用交接单格式；要在已有成果上换会话做相关新任务时，用 dev-handoff
5. ~/.claude/skills/README.md 写成技能索引：每个技能一行（做什么、怎么触发）；dev 一组按流程顺序：idea-shaping（账号技能）→ dev-init → dev-clarify → dev-task → dev-handoff
6. 本项目 CLAUDE.md 加「核心模块」一节：site/srs.js（复习规则）、site/sync.js（存储与云同步）、site/sent.js 开头的定位规则和 pipeline/validate.py 的 check_notes（两边必须一致）。执行时读代码确认，有遗漏就补
7. 本项目文档整理（用 git mv）：docs/交接-音频上云.md → docs/plans/2026-09-30-audio-cloud.md，文件头补"状态：已完成"；docs/plans/demo-u7l1.md → docs/plans/2026-09-30-demo-u7l1.md，状态改成"已完成"。另外把本计划的状态更新为实际进度
【不做】
- idea-shaping 不改、不搬到本地：它是 claude.ai 账号技能，AI 改不了。它的 description 由用户自己在 claude.ai 上收窄：删掉"即使他没说……也应该考虑使用本技能"，加一句"已有代码的项目里的功能需求不用本技能，交给 dev-clarify"
- 不改其他领域技能的名字（blog-、remote- 已经是"主名称-功能"的形式）
- 不用 Claude 自带的 memory 存项目知识
- 不推送
【已定的取舍】
- 统一用 dev- 前缀，task、repo-init 也改：输入 /dev- 就能列出整套，也和 dev-collab.md 对得上；代价是交接单开头要写 /dev-task，引用要一次改完，趁现在引用还少
- 执行约束留在 dev-collab.md，不做成技能：技能用到时才加载，约束必须每轮都在
- dev-clarify 允许自动触发：最需要它的时候，恰恰是用户想不起来调它的时候；它只问不改文件，误触发代价低。dev-handoff 半手动：要先知道下一步才知道该留什么；不做成纯手动，否则按钮调不动它
- 记忆分层：怎么实现以代码为准，不另写文档；为什么写在离代码最近的地方（文件开头注释 > 计划的取舍 > 提交说明）；约束写进 CLAUDE.md 或 rules；代码和文档对不上时以代码为当前事实，并指出来
【默认假设】
- dev-handoff 的文件名后缀用英文 -handoff，和现有计划的英文短名一致
- 交接单格式只在 dev-collab.md 一处定义，dev-clarify 和 dev-task 都引用它，不复制
- dev-init 保持纯手动（沿用 repo-init 的 disable-model-invocation: true）
【验收】
- ~/.claude/skills/ 下没有 task、repo-init，有 dev-init、dev-clarify、dev-task、dev-handoff；在 ~/.claude 的 CLAUDE.md、workflows、skills 里搜旧名（/task、skills/task、repo-init），除了说明改名的地方外没有残留
- 新开会话的可用技能列表里有 dev-clarify、dev-task、dev-handoff（dev-init 是纯手动，不会出现）
- 拿一句带"等"的模糊需求试 dev-clarify：先读代码，列出决定点表，一次问完，最后给出带【默认假设】的交接单
- 本项目两份文档已经移动，CLAUDE.md 有核心模块一节；python pipeline/validate.py 和 node --test "tests/*.test.js" 仍然全绿
- claude-config 和本项目各自提交，提交信息不带任何 AI 署名
【线索】
- 现有文件：~/.claude/workflows/dev-collab.md；~/.claude/skills/task/（SKILL.md 和 8 个参考文件）；~/.claude/skills/repo-init/（SKILL.md 和 templates/）
- 可借鉴：idea-shaping 的本机缓存（只读，改了会被同步覆盖）C:\Users\Owen_W\AppData\Local\Claude-Data\claude_pzs8sxrjxfjjc\local-agent-mode-sessions\skills-plugin\f8edefe8-edeb-45d2-8d90-abd889083f98\cbc53e1c-e5c6-46c7-8e32-92419904d788\skills\idea-shaping\SKILL.md
- 本会话里已做：study-mate-skill 已移到回收站，claude-config 提交 3a8ca39（未推送）；本项目残留的 worktree 和两个 claude/ 分支已删除
```
