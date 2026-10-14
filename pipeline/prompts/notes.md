# 任务：给一课例句标词组、写语法解析（书外补充）

输入：`python pipeline/note_sents.py <id>` 列出的本课例句（每句带书上译文；★ 是脚本粗筛出的解析候选）。
输出：**一个 JSON 文件** `site/data/notes/<id>.json`。读者是备考四级的学生：点句中的词组看意思，点「析」看这句为什么这么译。

```json
{
  "_note": "例句词组与语法解析（书外补充，AI 生成）",
  "sents": {
    "<例句原文，逐字照抄，包括标点>": {
      "ph": [{"t": "句中原样片段", "b": "词组原形", "m": "中文释义"}],
      "an": {"parts": [{"t": "片段", "r": "成分名或空串"}], "pts": ["要点"], "lit": "直译"}
    }
  }
}
```

一句既没有词组、也不写解析，就整句不写（不要写空对象）；只有解析没有词组的，写 `"ph": []`。

## 一、词组 ph

**标什么**：四级常见的固定搭配、短语动词、介词搭配、常用名词短语。例：`rely on`、`take away`、`be absorbed in`、`a lack of`、`in terms of`、`play a role in`、`be likely to`、`as well as`。
**不标**：自由组合（`a big house`、`read books`）、单个词、专有名词、书上本课的词条本身就是这个短语的（比如词条就是 `air conditioning`）。短句、没有搭配的句子可以一条都不标。宁缺毋滥：标出来的必须是学生值得记的搭配。

- `t`：**句中原样**的片段（含时态、复数变化：`were assured`、`taken away`、`Changes in`），首尾必须是完整的单词，不带空格、标点
- `b`：词组原形（词典写法）：`be assured`、`take away`、`change in`；需要宾语占位的用 `sth.` / `sb.` / `do`，被拆开的中间用 ` … `：`attribute … to`、`feel powerless to do`
- `m`：**这句话里的意思**，要和书上译文对得上（书上把 allow for 译成「允许」，就不要写「考虑到」）；一两个义项，不加词性
- **被拆开的搭配**写成多条，`b`、`m` 完全相同，按句中先后排：`{"t":"attribute","b":"attribute … to",…}`、`{"t":"to","b":"attribute … to",…}`。定位规则：每条取 t 在句中第一次出现的位置；同一词组的第二段起，从上一段之后找第一次出现。所以拆开的后一段只写那几个词（`to`），页面会自动找到 attribute 后面那个 to
- 不同词组的片段**不能重叠**。两个搭配共用一个词时只标更值得记的那个（`be open to` 和 `open to new memories` 只标前者）
- 同一个片段在句中出现两次、而你要标的是第二次：换一个更长、不重复的 t（把前后的词带上），或者不标

## 二、解析 an

**写不写**：★ 候选句由你判断，有值得讲的语法点才写；非候选句一般不写，除非有明显的难点（倒装、强调句、虚拟语气等）。写不出两条有用要点的，不写。一课一般 8～15 句。

**只讲四级常见语法点**：从句（宾语 / 定语 / 状语 / 同位语 / 主语从句）、非谓语（不定式、分词、动名词）、被动、时态呼应、名词化、否定（全部否定 / 部分否定 / no + 名词）、插入语、倒装、强调句、虚拟语气、无生命主语。

### parts：成分分块

把整句切成按顺序首尾相接的片段，**拼起来必须和原句一字不差**（包括空格和标点；空格、逗号、连接词单独成块时 `r` 写空串）。r 用这些名称：

`主干`、`宾语从句`、`主语从句`、`表语从句`、`同位语从句`、`定语从句`、`非限制性定语从句`、`时间状语`、`条件状语`、`原因状语`、`让步状语`、`目的状语`、`结果状语`、`方式状语`、`状语`（不好细分时）、`插入语`、`非谓语`（不定式 / 分词短语作状语、补语等）、`同位语`、`并列分句`，或空串。

切得粗一点：一个从句一块，主干一块，不要每个词一块。从句嵌在主干中间时，主干可以分成两块都标 `主干`。

### pts：要点（1～4 条）

每条**先说现象，再落到「所以书上这么译」**。不说空话（「这句话结构清晰」「注意语法」不算要点），不讲书上译文已经一目了然、没有转换的地方。

- 定语从句**必须说清先行词是谁、关系词在从句里作什么成分**（主语 / 宾语 / 状语），以及书上是前置成「……的」还是拆成后面的分句
- 被动：说书上译成主动、「得到 / 受到」还是「被」
- would / could / might：说清是**时态呼应（过去将来）**还是**虚拟语气**，有依据（主句是过去时 → 呼应；有 if 条件或与现在事实相反 → 虚拟）
- 名词化：指出名词短语，说书上把它展开成了什么（动宾、主谓）
- 没把握的语法判断不要写

### lit：直译

逐词硬译、保留英文结构的一句中文，只用来和书上译文对比，让人看出书上做了哪些转换。**不要**写成书上的译文。

## 三、样例（照这个水平写）

```json
"We were assured that, except for low grades or a raise in family income, no money would be taken away.": {
  "ph": [
    {"t": "were assured", "b": "be assured", "m": "得到保证"},
    {"t": "except for", "b": "except for", "m": "除……之外"},
    {"t": "a raise in", "b": "a raise in", "m": "……的增加"},
    {"t": "taken away", "b": "take away", "m": "拿走"}
  ],
  "an": {
    "parts": [
      {"t": "We were assured", "r": "主干"},
      {"t": " that, ", "r": ""},
      {"t": "except for low grades or a raise in family income", "r": "插入语"},
      {"t": ", ", "r": ""},
      {"t": "no money would be taken away", "r": "宾语从句"},
      {"t": ".", "r": ""}
    ],
    "pts": [
      "主干 We were assured 是被动，书上译成「我们得到保证」，比「我们被保证」顺。",
      "that 引导 assured 的宾语从句；except for… 夹在 that 和从句主语之间，是插入语，所以书上把「除了……外」提到从句开头。",
      "no money 作主语，否定落在主语上，书上译成「任何钱都不会……」；would 是主句过去时引起的时态呼应（过去将来），不是虚拟语气。",
      "a raise in family income 是名词化结构，书上展开成主谓式的「家庭收入增加」。"
    ],
    "lit": "我们被保证，除了低分或家庭收入的增加以外，没有钱会被拿走。"
  }
}
```

```json
"Mistakes crack their self-confidence because they attribute errors to a lack of ability, which they feel powerless to change.": {
  "ph": [
    {"t": "attribute", "b": "attribute … to", "m": "把……归因于"},
    {"t": "to", "b": "attribute … to", "m": "把……归因于"},
    {"t": "a lack of", "b": "a lack of", "m": "缺乏"},
    {"t": "feel powerless to", "b": "feel powerless to do", "m": "感到无力做某事"}
  ],
  "an": {
    "parts": [
      {"t": "Mistakes crack their self-confidence", "r": "主干"},
      {"t": " ", "r": ""},
      {"t": "because they attribute errors to a lack of ability", "r": "原因状语"},
      {"t": ", ", "r": ""},
      {"t": "which they feel powerless to change", "r": "非限制性定语从句"},
      {"t": ".", "r": ""}
    ],
    "pts": [
      "主语 Mistakes 是无生命名词，直译「错误破坏自信」生硬，书上加「让」译成「错误会让他们的自信心崩溃」。",
      "attribute A to B 被拆开：A 是 errors，B 是 a lack of ability，书上译成「把错误归咎于能力不足」。",
      "which 的先行词是 a lack of ability（能力不足），不是 errors；which 在从句里作 change 的宾语（change which）。",
      "非限制性定语从句书上拆成后面的分句「觉得无力改变」，which 承前省略，不再译出「这种不足」。"
    ],
    "lit": "错误破坏了他们的自信，因为他们把错误归因于能力的缺乏，而他们觉得无力改变这种缺乏。"
  }
}
```

只有词组的句子：

```json
"Nowadays forests are increasingly welcome because they suck in carbon pollution from the air.": {
  "ph": [{"t": "suck in", "b": "suck in", "m": "吸入"}]
}
```

## 四、规则

1. 句子键必须逐字照抄 `note_sents.py` 列出的英文（标点、撇号都一样）
2. 中文里的引号用「」，不要用 `"`（会破坏 JSON）；英文原句里本来就有的双引号，在键和 t 里照抄并写成 `\"` 转义，这种句子照常标注，不要因为有引号就跳过
3. 不改书上的原句和译文，不把书上译文复制进 notes
4. 写完跑 `python pipeline/validate.py <id>`，有 ERROR 改到没有为止（WARN 是书上原有的提醒，不用管）
