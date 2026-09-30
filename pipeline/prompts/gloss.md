# 任务：为例句逐词写中文释义（书外补充）

适用模型：纯文本便宜模型即可（DeepSeek / Haiku 等）。
输入：一课的 Lesson JSON（`site/data/lessons/<id>.json`）。
输出：**只输出一个 JSON 对象**，写入 `site/data/gloss/<id>.json`：

```
{
  "_note": "例句逐词释义（书外补充，AI 生成）。本课词条和扩展词不在这里，网页直接取书上的释义。",
  "words": {
    "students": "n. 学生（student 的复数）",
    "achieve": "/əˈtʃiːv/ v. 实现；取得",
    "free of charge": "phr. 免费"
  }
}
```

## 规则

1. 取所有 `ex.en` 里的单词，**小写、按句中原形**作键（`visitor's`、`astronauts'`、`doesn't` 都照原样）。
2. **跳过本课的词条和扩展词**（及其词形变化），这些网页会显示书上的释义。
3. 释义给**这句话里的意思**，一两个义项即可；词形变化注明原形，如「（spot 的过去分词）」。
4. 四级以上或不常见的词加音标（标准 IPA，`ˈ` `ː`）；a / the / is 这类基础词不加。
5. 句中有固定搭配或专有名词，额外加一条短语键：`"rely on": "phr. 依赖；依靠"`、`"raw materials": "原料"`。
6. 不要空字符串，不要重复键。

参考样例：`site/data/gloss/u07-l01.json`。
