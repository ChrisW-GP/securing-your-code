# MoodMenu 修复轮 2 报告

## A. 逐条对照

1. **扩充忌口别名与常见菜名隐含食材**
   - 问题：第一轮别名覆盖不足，常见菜名、配料及英文写法可能漏过滤；以别名自动生成菜名的测试也不能代表真实菜单。
   - 修复方式：扩展牛肉、猪肉、鸡肉、羊肉、海鲜、花生、乳制品、鸡蛋和麸质/小麦别名，加入常见菜名隐含食材；用固定的独立菜单样例表逐条覆盖菜名、配料、忌口和预期，不从别名表生成菜名。
   - 对应回归测试名：`exclusion sample %s / %s has expected result`（187 条独立样例）。
   - 状态：通过。
2. **语义排除与繁简归一**
   - 问题：泛化词命中会误排除鱼香菜、鸡蛋菜、椰奶/椰浆菜，且传统字菜单可能漏匹配。
   - 修复方式：匹配前统一为简体；鸡肉组先移除“鸡蛋”，海鲜组移除“鱼香”，乳制品组移除“椰奶”“椰浆”。“牛蛙”和“米饭”保持不命中牛肉、麸质/小麦组。
   - 对应回归测试名：同一独立样例表中的语义保留行，覆盖简体与繁体例子。
   - 状态：通过。
3. **偏好页显示忌口实际匹配范围**
   - 问题：用户只看到自己输入的忌口词，无法得知别名匹配会额外排除哪些菜单项。
   - 修复方式：每个忌口标签下显示“将同时排除：”及对应别名组；组别从推荐使用的同一别名表导出。
   - 对应回归测试名：`shows each exclusion category's expanded matching terms beside its preference label`。
   - 状态：通过。
4. **大模型只接收已核实候选并校验所选 ID**
   - 问题：设置忌口时，已核实安全候选存在的情况下，模型仍能选择配料未知的菜。
   - 修复方式：若设置了忌口且存在 `ingredientsKnown` 候选，只把这些候选发送给模型，并只在该集合中接受模型 `dish_id`。未知菜 ID 或其他无效选择回退到排序后的规则推荐；API 返回给界面的候选列表仍保留原有完整候选。
   - 对应回归测试名：`only sends verified-safe candidates to the model and rejects an unverified model pick`。
   - 状态：通过。
5. **透明图片压缩白底**
   - 问题：透明 PNG/WebP 绘制到 JPEG 画布时，透明区域可能变黑。
   - 修复方式：绘图前将画布填充为白色，再绘制来源图片。
   - 对应回归测试名：`fills the image canvas white before drawing transparent source images`。
   - 状态：通过。
6. **OCR 缺少价格字段**
   - 问题：OCR 条目没有 `price` 键时，单条校验会失败并丢弃该菜。
   - 修复方式：缺失价格统一规范为 `null`，继续逐条 Zod 校验和计数。
   - 对应回归测试名：`keeps an OCR entry whose price property is missing and normalizes its price to null`。
   - 状态：通过。
7. **偏爱食材上限**
   - 问题：已达到 50 项时继续添加会将超限档案写入状态，并可能导致后续接口请求校验失败。
   - 修复方式：添加前检查重复值及 50 项上限；新值超限时不更新状态、不清空输入，并显示可见说明。
   - 对应回归测试名：`blocks adding an additional favorite after the 50-item limit with visible feedback`。
   - 状态：通过。
8. **测试名称准确性**
   - 问题：历史恢复测试将本机推荐记录称作 “long-term memory”。
   - 修复方式：改名为 “stored recommendation history”，准确描述所验证的数据。
   - 对应回归测试名：`restores validated preferences and stored recommendation history`。
   - 状态：通过。
9. **OCR 提示词样例 ID**
   - 问题：提示词 JSON 示例使用具体 `dish-1`，可能被模型当作真实 ID 模板。
   - 修复方式：改用占位符 `<generated-id>`；服务端依旧忽略模型 ID 并自行生成。
   - 对应回归测试名：`uses a placeholder rather than a concrete dish ID in the OCR prompt example`。
   - 状态：通过。

前置验证：将本轮回归测试文件复制到第一轮提交 `f1d16bd` 的干净工作树上运行，193 项测试中 110 项失败、83 项通过，退出码为 1。原始输出见 `test_output_fix2_before.txt`。修复后完整项目测试 224/224 通过。

## B. 修改和新增文件清单

- `moodmenu/README.md`
- `moodmenu/app/api/menu/route.ts`
- `moodmenu/app/api/recommend/route.ts`
- `moodmenu/app/globals.css`
- `moodmenu/app/page.tsx`
- `moodmenu/lib/image.ts`
- `moodmenu/lib/ingredients.ts`
- `moodmenu/lib/recommend.ts`
- `moodmenu/tests/fix1-utils.test.ts`
- `moodmenu/tests/fix2.test.ts`
- `moodmenu/tests/recommend.test.ts`
- `moodmenu/tests/store.test.ts`
- `moodmenu/REPORTS/REPORT_fix2.md`
- `moodmenu/REPORTS/test_output_fix2_before.txt`
- `moodmenu/REPORTS/test_output_fix2.txt`
- `moodmenu/REPORTS/alias_coverage_fix2.md`
- `moodmenu/REPORTS/MoodMenu-AI-MVP-fix2.zip`

## C. 决策与偏离

- 保持“服务端先硬过滤 → 模型只在候选中选择并校验 `dish_id` → 无效或不可用时规则回退”的架构不变。
- 忌口仍是针对已知文本的保守别名匹配，不引入外部过敏原数据库。为降低误判，按要求先移除鱼香、鸡蛋和椰奶/椰浆例外词。
- 使用项目内繁简映射表，不添加依赖。
- 未调整整体视觉风格；仅在现有偏好标签下增加匹配范围说明。

## D. 运行方法

在 `moodmenu/` 目录执行：

```powershell
npm install
npm test
npm run typecheck
npm run build
```

本轮三项命令的完整原始输出及退出码见 `test_output_fix2.txt`。第一轮代码上的回归测试输出见 `test_output_fix2_before.txt`。

## E. 已知问题

- 别名匹配是项目内有限词表及子串匹配，不能识别所有配方、隐藏配料或交叉接触；未知配料仍须向餐厅确认，应用不提供食品安全保证。
- LLM 的安全候选隔离及回退由模拟兼容 API 响应测试；未使用真实密钥联调外部模型。
- 透明图片画布行为通过自动化 Canvas mock 验证；未在真实移动设备或具体浏览器上逐一验证 PNG/WebP 编解码差异。

## F. 需决策事项

无。所有指定修复均已完成；外部模型及真实设备联调限制如 E 节所述。
