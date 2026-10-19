# 设置页：导出 / 导入本机的设置和学习记录

- 状态：已合并到 2026-10-19-batch.md（已决定，未执行）
- 日期：2026-10-19
- 来源：本会话 /dev-ask（一批里追加的 E）
- 需求原话：加上一个功能，导出本地配置、记录，就是导入当前 user data，可选择导入 data，打开本地浏览器 data 存放位置

## 调研结论

- 「打开浏览器存数据的位置」做不到：网页没有权限打开或读取电脑上的文件夹。数据在浏览器配置目录的数据库里（Chrome：`%LOCALAPPDATA%\Google\Chrome\User Data\Default\Local Storage\leveldb`，Edge 在 `Microsoft\Edge\...` 下同样位置），二进制格式、所有网站混在一起，打开也看不了，手改会坏。用户选了「导出到下载文件夹 + 设置页写一句说明」代替
- 现有存储（site/sync.js）：所有进度在 localStorage 的一个键 `lx:sync:doc` 里，格式 `{键: [值, 修改时间]}`；云同步 token 在 `lx:sync:cfg`，不在 doc 里。键前缀：`known:` `set:` `learn:` `srs:` `log:` `vocab:` `drill:` `last` `lw:` `pos:` `vpGeo` `peekTab` `listFold` `listHide` `sideOff`
- 每个网址各存一份：本地 8765、8775 和线上 cet4.owenwoow.com 的数据互不相通，导出 / 导入也能在它们之间搬

## 交接单

```text
/dev-task
【目标】设置页「数据」一节能把本机的设置和学习记录导出成文件，再导回来（可勾选类别、可选合并或覆盖）；电脑、手机都能用
【要做】
1. 新建纯函数模块 site/backup.js（写法照 site/vocab.js：浏览器里是全局 Backup，Node 里 module.exports）+ tests/backup.test.js：
   - 类别（按键前缀分）：已会 known: / 设置 set: / 学习记录和复习卡 learn: srs: log:（三者绑在一起，拆开会对不上）/ 生词本 vocab: / 阅读位置 last、lw:、pos: / 界面状态 vpGeo、peekTab、listFold、listHide、sideOff / 其他（认不出的键，以后新增的）；drill:（巩固做到一半，当天有效）不导入
   - summary(fileDoc)：每类有几条（不算记 0 的墓碑）
   - plan(localDoc, fileDoc, cats, mode, now)：算出要写入的 [键, [值, 时间]] 列表。merge = 每个键取时间较新的（规则同 sync.js 的 merge）；overwrite = 勾选类别里文件有的键写入文件的值、时间记 now；文件里没有、本机有的：已会 / 学习记录和复习卡 / 生词本记 0（墓碑），设置恢复成默认值（不记 0，不然设置会读成 0），阅读位置、界面状态、其他不动
2. site/sync.js（核心模块）加两个函数：dump() 返回 doc 的拷贝；load(pairs) 一次写入 [键, [值, 时间]]（保留给定的时间，不改成 Date.now()），存本地、触发 on(changed) 回调、排一次推送。token（cfg）不经过这两个函数
3. 设置页「数据」一节（site/app.js renderSettings 和点击处理）：
   - 「导出」：下载 cet4-backup-<今天 YYYY-MM-DD>.json，内容 {app: "cet4-vocab", v: 1, at 导出时刻, origin 网址, d: dump()}
   - 「导入」：选文件 → 校验格式（不是这个格式就提示，不改任何东西）→ 预览：导出时间、来自哪个网址、每类条数，勾选类别（默认全勾）、选方式（合并默认 / 覆盖）→ 确认后执行；选了覆盖时先自动下载一份当前数据 cet4-backup-<日期>-导入前.json 再写入 → 提示「已导入 N 条」并刷新页面
   - 说明一句：数据存在这个浏览器里，每个网址各存一份（本地版和线上版分开）；网页打不开那个位置；导出的文件在浏览器的下载文件夹，下载栏里点「在文件夹中显示」能找到
4. site/index.html 在 app.js 前加 <script src="backup.js"></script>；.github/workflows/deploy.yml 的版本号 sed 正则加上 backup
5. 文档：sync.js 文件头补一句 dump / load；CLAUDE.md 目录一节 site/ 那行补上 backup.js
【不做】
- 打开浏览器存数据的文件夹（做不到）
- 选一个备份文件夹（File System Access）、导出时勾选类别、定期自动备份 / 提醒（用户都选了不做）
- 导出云同步 token
【已定的取舍】
- 两种导入方式、默认合并：合并永远不会把本机更新的记录改回去；覆盖用来拿旧备份回退，覆盖前自动先导出一份防手滑
- 导出全部、导入时再挑：一个文件什么都有，简单
- 存到下载文件夹：所有浏览器和手机都能用
【默认假设】
- 预览里默认全部类别都勾上
- 开着云同步时，导入后照常推到 Gist，其他设备跟着变（不另外提示）
- 导入后整页刷新，不做局部重画
- 文件来自别的网址（比如本地版导出、线上版导入）照样能导
- 手机上「导出」走浏览器的下载 / 分享，「导入」用系统的选文件
【验收】
- node --test "tests/*.test.js" 全过（新增 backup 测试：合并取新、覆盖写 now 和墓碑、设置缺项恢复默认、drill: 不导入、导出内容里没有 token）；python pipeline/validate.py 0 错误
- 本地走查：8765 导出 → 8775 导入（合并）后已会、学习记录、生词本、设置都过来了；8775 再改一个设置后导入旧文件（合并）设置不被改回；同一文件选覆盖：先下载了「导入前」备份，设置被改回；取消勾选生词本后导入，生词本不变；乱选一个 JSON 文件提示格式不对、数据不变
- 375 宽：导出、导入按钮和预览不挤乱
- 开着云同步时导入后 Gist 更新：本地没有 token 时写「未验证」
【线索】
- 存储：site/sync.js（merge、newer、setMany、entries、changeFns）；设置页：site/app.js renderSettings 的「数据」一节和 $("#settingsView") 的点击 / change 处理；别的设备改动同步过来后的刷新：app.js「别的设备的改动同步过来」一节（Sync.on）
- 纯函数模块 + 单测写法：site/vocab.js + tests/vocab.test.js
- 设置默认值：site/app.js DEFAULTS
```
