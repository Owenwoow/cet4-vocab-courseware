# 选择题干扰项去重与混淆反馈

- 状态：进行中
- 日期：2026-10-14
- 需求原话：
  1. 干扰项与正确答案不能有共同义项（如 elect 的"选择"与 select 的"选择"重复则换掉）
  2. 同词群/形近干扰项每题最多 1 个
  3. 词性辨析类（如 injury vs injure，释义几乎相同仅词性不同）保留，但答错反馈中明确提示"词性混淆：injury 是 n.，injure 是 v."
  4. 选到近义/形近干扰项时标记为"近义混淆"并安排对比复习，而不是普通答错
  5. 完成后提交并推送
- 执行方式：总控自己做（依据：1 组，4 个文件）
- 开工前已失败的测试：无

## 已直接做掉的小改动

- 无

## 分组状态

| 组 | 目标 | 依赖 | 核心 | 状态 | 分支 |
|---|---|---|---|---|---|
| A | 干扰项去重 + 混淆反馈与对比复习 | 无 | 是 | 进行中 | feat/distractor-confusion |

## 任务单

### 组 A：干扰项去重 + 混淆反馈与对比复习

- 要做：
  ① `srs.js` 加纯函数：`senseKeys`（释义拆成义项词，去掉词性、括号）、`posSet`、`distractorTag(目标, 候选)` → `"bad"`（共同义项且不属于词性辨析，不能用）/ `"pos"`（形近 + 有共同义项 + 词性完全不重叠 = 词性辨析）/ `"near"`（形近或同词群）/ `null`；`confAdd` / `confDrop` 维护卡片上的混淆词列表 `cf`（最多 3 个）（验证：单元测试覆盖 elect/select → bad，injury/injure → pos，adapt/adopt → near）
  ② `study.js` 的 `distractors`：跳过 bad；pos、near 每题合计最多 1 个；卡片 `cf` 里记着的混淆词（以及本轮刚混淆的词）优先当作这 1 个（验证：elect 题不再出现 select 的释义）
  ③ 作答：选中 pos/near 干扰项算"混淆"，复习评分记为模糊 m（不按忘了重来），本轮仍然要再答对一次；学新词时这一关重来，但不计入错误次数（验证：页面走查）
  ④ 反馈：pos 显示"✗ 词性混淆：injury 是 n.，injure 是 v."；near 显示"✗ 近义混淆：你选的是 X 的意思"；背面加一行对比（混淆词、音标、发音、释义）（验证：页面走查）
  ⑤ 对比复习：混淆词写进卡片 `cf`，下次出这个词的选择题时固定把它放进干扰项；带着它答对就从 `cf` 删掉（验证：单元测试 + 走查）
- 背景：用户发现 elect 题里 select 的释义"选择"也算对，导致题目有歧义；injury/injure 这类只差词性的题有价值，但要点明考点
- 允许改动：`site/srs.js`、`site/study.js`、`site/style.css`、`tests/srs.test.js`、本计划
- 禁止改动：课程数据 `site/data/`、`sync.js`
- 参考写法：`SRS.similar`、`SRS.pairSimilar`（srs.js）；`distractors` / `makeQ` / `answer` / `settle`（study.js）
- 验收：`python pipeline/validate.py` + `node --test "tests/*.test.js"` 全绿；本地起服务走查看词选义的答错反馈

## 决定

（收尾时填）
