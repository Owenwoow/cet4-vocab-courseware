# 任务：给例句标词组、写「对话带练」式的翻译讲解（书外补充）

读者是备考四级的学生。点句中的词组看意思；点「析」，像有个老师坐在旁边，带着他把一句难句从硬译改成通顺的中文。

数据在 `site/data/notes/<id>.json`，每句两部分：`ph` 词组标注、`an` 讲解。两部分分开写：

| 写什么 | 怎么写 | 写到哪 |
|---|---|---|
| 词组 `ph`（只在新课第一次生成时写） | `python pipeline/note_sents.py <id>` 看例句，按第一节写 | 直接写 `site/data/notes/<id>.json`，先不带 `an` |
| 讲解 `an` | `python pipeline/notes_an.py <id> --dump` 看例句、书译、已标词组，按第二、三节写 | **只写** `work/notes-an/<id>.json`，再跑 `python pipeline/notes_an.py <id> --merge` 合并（会自动校验，词组不会被动） |

`work/notes-an/<id>.json` 的格式：

```json
{
  "<例句英文原文，和 --dump 列出的逐字相同，包括标点>": {
    "talk": [{"t": "英文片段", "s": "带练文字\n→ 这一块的中文"}],
    "order": "排顺序（选填）",
    "sum": "合起来的整句译文",
    "cmp": "和书上译文的对照"
  }
}
```

`site/data/notes/<id>.json` 的整体格式：`{"_note": "例句词组与语法解析（书外补充，AI 生成）", "sents": {"<例句原文>": {"ph": [...], "an": {...}}}}`。一句既没有词组、也没有讲解，就整句不写。

## 一、词组 ph

**标什么**：四级常见的固定搭配、短语动词、介词搭配、常用名词短语。例：`rely on`、`take away`、`be absorbed in`、`a lack of`、`in terms of`、`play a role in`、`be likely to`、`as well as`。
**不标**：自由组合（`a big house`、`read books`）、单个词、专有名词、书上本课的词条本身就是这个短语的（比如词条就是 `air conditioning`）。短句、没有搭配的句子可以一条都不标。宁缺毋滥：标出来的必须是学生值得记的搭配。

- `t`：**句中原样**的片段（含时态、复数变化：`were assured`、`taken away`、`Changes in`），首尾必须是完整的单词，不带空格、标点
- `b`：词组原形（词典写法）：`be assured`、`take away`、`change in`；需要宾语占位的用 `sth.` / `sb.` / `do`，被拆开的中间用 ` … `：`attribute … to`、`feel powerless to do`
- `m`：**这句话里的意思**，要和书上译文对得上（书上把 allow for 译成「允许」，就不要写「考虑到」）；一两个义项，不加词性
- **被拆开的搭配**写成多条，`b`、`m` 完全相同，按句中先后排：`{"t":"attribute","b":"attribute … to",…}`、`{"t":"to","b":"attribute … to",…}`。定位规则：每条取 t 在句中第一次出现的位置；同一词组的第二段起，从上一段之后找第一次出现。所以拆开的后一段只写那几个词（`to`），页面会自动找到 attribute 后面那个 to
- 不同词组的片段**不能重叠**。两个搭配共用一个词时只标更值得记的那个（`be open to` 和 `open to new memories` 只标前者）
- 同一个片段在句中出现两次、而你要标的是第二次：换一个更长、不重复的 t（把前后的词带上），或者不标

## 二、讲解 an：对话带练

### 挑哪些句子

只挑**难句**，或**书上译文做了明显转换**的句子：语序前后调、名词改成动词、加了字（「让」「被」「得到」）、拆成两句、被动改主动、东西当主语……
一课写 **5～10 句**。照字面就能翻对的简单句不写；写不出带练价值的不写；**拿不准的判断（先行词、would 是不是虚拟）宁可不写这一句，也不要猜**。

### 每句的结构

页面会先自动显示开场白「先别看译文，你自己来。」，**不要**写进数据。然后：

1. **talk：一块一块往下走**（1～6 块，按句中先后）。每块：
   - `t` 贴这块英文（原句里的原样片段，按顺序）；
   - `s` 是带练文字，固定套路：**猜他会怎么翻**（「你多半会翻成……」）→ **让他自己发现问题**（「念一遍，是不是有点怪？」「放回去试试」）→ **给一个能马上动手的办法**（「眼睛往后找 to」「看到 in spite of，脑子里换成『虽然』」）→ 最后另起一行，用 `→` 开头写这一块的中文；
   - 没有卡点的块一句带过：「这块照字面翻就行：……」，同样用 `→` 行收尾。
2. **order：排顺序**（选填）。英文和中文语序不同、需要挪动时，单独一两句说为什么挪、怎么挪；不用挪就不写这个字段。
3. **sum：合起来**。自己顺下来的整句中文，不要照抄书上译文。
4. **cmp：对照书译**。一样就说一样；不一样就说差在哪、哪个更顺；书上译文明显不够好，可以直说并给出理由。页面会把 sum 和书上译文并排显示。

### 写法规矩

- 用「你」，口语，像老师坐在旁边说话。一块最多 3～4 句话（不算 → 那行），**每块只解决一个卡点**
- 不堆术语；非用不可时，马上跟一句白话（「-ing 开头当主语，就是『做某事』这件事」）
- 找指代、找搭配，一律给能动手的办法，不直接甩结论：定语从句、which / that / it 指谁，就把候选名词**一个个放回去试**，说清哪个说得通；被拆开的搭配，说「眼睛往后找……」
- would / could / might：说清是时态呼应（前面是过去时）、虚拟（有 if 条件，或和事实相反）还是委婉语气，**要说出依据**
- 中文里的引号用「」，不要用 `"`（会破坏 JSON）；英文原句里本来就有的双引号，在键和 `t` 里照抄并写成 `\"` 转义
- 不改书上的原句和译文，不把书上译文复制进 sum

## 三、示例（照这个水平和口气写）

```json
{
  "The letter is in fairly good condition, in spite of being out of the care of trained museum staff for so long.": {
    "talk": [
      {"t": "The letter is in fairly good condition",
       "s": "你多半会翻成「这封信在相当好的状况里」。念一遍，中文不这么说。in good condition 是一个整体，就是「状况好、保存得不错」。\n→ 这封信状况相当好。"},
      {"t": "in spite of being out of the care of trained museum staff for so long",
       "s": "看到 in spite of，脑子里马上换成「虽然」，后面跟的都是「虽然」的内容。being out of the care of……你可能想翻成「处于……的照顾之外」，太绕了，说白了就是「没人照顾」。谁没照顾它？trained museum staff。for so long 是「这么长时间」。\n→ 虽然这么长时间没有受到训练有素的博物馆员工的维护"}
    ],
    "order": "英文是「结果在前、虽然在后」，中文习惯先说「虽然」、再说「但」，所以把后半句提到前面。",
    "sum": "这封信虽然长期没有受到训练有素的博物馆员工的维护，但状况相当好。",
    "cmp": "几乎一样，书上多了个「其」，书面一点。"
  },
  "Creating the future you want is a lot easier if you are ready to exploit the opportunities that come your way.": {
    "talk": [
      {"t": "Creating the future you want",
       "s": "一开头就是 Creating，别慌。-ing 开头当主语，就是「做某事」这件事。the future you want 中间藏了个 that，补回去是 the future (that) you want，「你想要的未来」。\n→ 创造你想要的未来"},
      {"t": "is a lot easier",
       "s": "这块照字面翻就行。a lot 放在比较级前面是「……得多」，不是「很多」。\n→ 就会容易得多"},
      {"t": "if you are ready to exploit the opportunities that come your way",
       "s": "exploit 你可能只认识「剥削」，这里是「利用、抓住」机会。come your way 字面是「来到你的路上」，说白了就是「你遇到的」。that 指谁？放回去试：opportunities come your way，机会来到你面前，对。\n→ 如果你准备好利用你遇到的机会"}
    ],
    "order": "英文把 if 放在后面，中文的「如果」几乎总是放前面。",
    "sum": "如果你准备好抓住遇到的机会，创造你想要的未来就会容易得多。",
    "cmp": "意思一样。「抓住」比书上的「利用」顺口一点，两个都对。"
  },
  "Mistakes crack their self-confidence because they attribute errors to a lack of ability, which they feel powerless to change.": {
    "talk": [
      {"t": "Mistakes crack their self-confidence",
       "s": "你多半会翻成「错误破坏他们的自信」。念一遍，是不是有点怪？「错误」又不是人，怎么去破坏？英文爱让东西当主语，中文更习惯说「东西让人怎么样」。crack 本义是「裂开」，自信心裂开了，就是「崩溃」。\n→ 错误会让他们的自信心崩溃"},
      {"t": "because they attribute errors to a lack of ability",
       "s": "看到 attribute 先别急，眼睛往后找 to——找到了：attribute A to B，把 A 归到 B 上。A 是 errors，B 是 a lack of ability。「能力的缺乏」太翻译腔，中文直接说「能力不足」。\n→ 因为他们把错误归咎于能力不足"},
      {"t": "which they feel powerless to change",
       "s": "which 是谁？你可能以为是 errors。放回去试试：无力改变错误？错误都犯了，改什么？换 a lack of ability：无力改变能力不足——对了。中文不用把它再说一遍，直接接一个短句。\n→ 觉得无力改变"}
    ],
    "sum": "错误会让他们的自信心崩溃，因为他们把错误归咎于能力不足，觉得无力改变。",
    "cmp": "和书上完全一样，说明这几步就是书上的思路。"
  },
  "We were assured that, except for low grades or a raise in family income, no money would be taken away.": {
    "talk": [
      {"t": "We were assured that",
       "s": "你多半会翻成「我们被保证」。念一遍，别扭吧？中文很少说「被保证」，换成「得到保证」就顺了。that 后面跟的就是保证的内容。\n→ 我们得到保证"},
      {"t": "except for low grades or a raise in family income",
       "s": "这块夹在 that 和后面的话中间，像是插了一句嘴，先单独翻。except for 就是「除了……之外」。a raise in family income 你可能翻成「家庭收入的一个增加」，太硬了，把名词 raise 换成动词说：「收入增加」。\n→ 除了成绩不佳或家庭收入增加外"},
      {"t": "no money would be taken away",
       "s": "no money 打头，你可能想翻「没有钱会被拿走」。意思对，但中文更常说「任何……都不……」。再看一眼 would：前面 were assured 是过去时，这里只是跟着用了过去的 will，不是虚拟，翻成「会」就行。\n→ 任何钱都不会被拿走"}
    ],
    "sum": "我们得到保证，除了成绩不佳或家庭收入增加外，任何钱都不会被拿走。",
    "cmp": "和书上完全一样。"
  }
}
```

## 四、写完自检

1. 跑 `python pipeline/notes_an.py <id> --merge`。报错就改 `work/notes-an/<id>.json`，再 merge，直到 `[OK]`
2. 每句读一遍：有没有「猜他会怎么翻 → 发现问题 → 动手的办法 → 中文」？有没有空话（「这句话结构清晰」「注意语法」）？指代、would 的判断有没有说出依据？
