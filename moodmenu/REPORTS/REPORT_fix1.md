# MoodMenu 修复轮 1 报告

## A. 逐条对照

1. **P0-1 菜品 ID 冲突**
   - 问题：识别模型可以在每次扫描中重复返回相同菜品 ID，导致菜单校验或合并失败。
   - 修复方式：服务端忽略模型 ID，为每条通过校验且保留的识别结果生成 `scan-<uuid>`；客户端合并菜单时再次修复任何冲突。
   - 对应回归测试名：`replaces model dish IDs with unique server IDs on every photo recognition`；`repairs duplicate IDs when recognized menus from separate scans are merged`。
   - 状态：通过。
2. **P0-2a 点赞误写入长期偏好**
   - 问题：点“我喜欢”会把菜品所有配料自动加入偏爱食材。
   - 修复方式：点赞只更新历史记录中的 `liked` 标记，不改变偏爱食材或忌口。
   - 对应回归测试名：`keeps a liked marker in history without learning favorite ingredients`。
   - 状态：通过。
3. **P0-2b 存档字段错误导致整体重置**
   - 问题：一个档案字段验证失败可能丢弃菜单和其余偏好。
   - 修复方式：逐项恢复菜单、档案、心情、情境、微调文本和历史；仅修复/丢弃无效字段。偏爱食材超过 50 项时截取前 50 项并提示；无效或超量忌口不会静默清空，保留有效项目并显示恢复提示。
   - 对应回归测试名：`preserves the menu and exclusions when more than 50 favorites need truncation`；`recovers invalid mood, context, and history fields independently with a visible notice`。
   - 状态：通过。
4. **P0-2c localStorage 异常及字段缺少 schema**
   - 问题：存储读写异常可能中断初始化/保存；心情、情境及历史没有逐字段结构化验证。
   - 修复方式：localStorage 读写统一 try/catch；心情、情境、微调和每条历史分别通过 Zod 校验，修复情况在首页显示。
   - 对应回归测试名：`tolerates localStorage reads and writes throwing`；`recovers invalid mood, context, and history fields independently with a visible notice`。
   - 状态：通过。
5. **P0-3 忌口匹配与未知配料排序**
   - 问题：忌口别名覆盖不足，繁简不一致会漏过滤；已设忌口时，配料未知的菜仍被描述为符合硬性条件且可能排在已核实菜之前。
   - 修复方式：在 `lib/ingredients.ts` 增加项目所需繁简字映射；按猪肉、牛肉、鸡肉、羊肉、海鲜、花生、乳制品、鸡蛋、麸质/小麦别名组（含英文）匹配。启用忌口时，未知配料候选显示“忌口无法核实：配料未知”，并排在配料已核实候选之后；界面保留“配料未知”标签。
   - 对应回归测试名：`excludes every simplified and traditional alias in the 猪肉 group`、`...牛肉...`、`...鸡肉...`、`...羊肉...`、`...海鲜...`、`...花生...`、`...乳制品...`、`...鸡蛋...`、`...麸质/小麦...`；`labels unknown ingredients as unverifiable and ranks them below verified-safe dishes`。
   - 状态：通过。
6. **P1-4 照片选择强制调用环境相机**
   - 问题：`capture="environment"` 会限制普通相册选择流程。
   - 修复方式：移除 `capture`，保留 `multiple` 多选。
   - 对应回归测试名：`offers a multi-select photo picker without forcing the environment camera`。
   - 状态：通过。
7. **P1-5 上传前未压缩照片**
   - 问题：大尺寸原图可能超过上传大小限制。
   - 修复方式：浏览器端按最长边 1600 px 缩放，以 JPEG quality 0.8 编码；压缩失败回退原图并提示，上传前仍执行单张 5 MB / 总计 10 MB 限制。
   - 对应回归测试名：`resizes images proportionally so the longest side is at most 1600 pixels`；`encodes resized photos as JPEG at quality 0.8`；`falls back to the original photo and reports compression failure`。
   - 状态：通过。
8. **P1-6 编辑食材时输入字符丢失**
   - 问题：输入过程中立即分割食材会吞掉逗号、空格等尚未完成的文本。
   - 修复方式：每道菜使用独立编辑草稿；只在失焦或回车时按逗号、顿号、分号和空白分割并提交。
   - 对应回归测试名：`splits ingredient input only when explicitly parsed`。
   - 状态：通过。
9. **P1-7 单条 OCR 错误导致整份菜单失败**
   - 问题：一条坏记录或带货币符号的价格会令整个识别结果校验失败。
   - 修复方式：逐条 `safeParse`；将如“¥38”的有效价格文本转为数值，无法解析的价格设为 `null`，无效条目跳过并返回 `discardedCount`。
   - 对应回归测试名：`parses valid OCR entries individually and counts invalid entries without failing the menu`。
   - 状态：通过。
10. **P1-8 非安全上下文缺少 `crypto.randomUUID`**
    - 问题：手动新增菜品在没有可用 `randomUUID` 的上下文中会抛错。
    - 修复方式：ID 生成器在安全随机 UUID 不可用/报错时使用带计数器的本机回退。
    - 对应回归测试名：`creates an ID even when secure randomUUID is unavailable`。
    - 状态：通过。
11. **P1-9 换菜记忆持久化且清空微调仍沿用旧值**
    - 问题：拒绝菜品被写入长期本机存档；清空编辑框后推荐仍回退到旧微调内容。
    - 修复方式：序列化时排除 `rejectedDishIds`，重新加载时清空该会话列表；输入框直接更新当前微调状态，推荐读取当前值，包括空字符串。
    - 对应回归测试名：`does not persist session-only rejected dish IDs`；`persists an explicitly cleared refinement instead of restoring the prior value`。
    - 状态：通过。

## B. 修改和新增文件清单

- `moodmenu/REPORTS/REPORT_fix1.md`
- `moodmenu/REPORTS/test_output_fix1.txt`
- `moodmenu/REPORTS/changed_files_fix1.txt`
- `moodmenu/REPORTS/MoodMenu-AI-MVP-fix1.zip`
- `moodmenu/README.md`
- `moodmenu/app/api/menu/route.ts`
- `moodmenu/app/page.tsx`
- `moodmenu/lib/ids.ts`
- `moodmenu/lib/image.ts`
- `moodmenu/lib/ingredients.ts`
- `moodmenu/lib/photo-picker.ts`
- `moodmenu/lib/recommend.ts`
- `moodmenu/lib/schemas.ts`
- `moodmenu/lib/store.ts`
- `moodmenu/tests/fix1-utils.test.ts`
- `moodmenu/tests/recommend.test.ts`
- `moodmenu/tests/routes.test.ts`
- `moodmenu/tests/store.test.ts`

## C. 决策与偏离

- 未改变推荐安全边界：服务端先硬过滤；LLM 只接收服务端候选并须通过候选 `dish_id` 校验；模型失败或输出无效仍回退规则推荐。
- 未调整现有视觉风格，未增加依赖。
- 忌口以归一化后的菜名、描述及已列配料作保守子串匹配；这不表示未知配料安全。
- 为避免危险的静默数据丢失，无法恢复的忌口会有明确提示；有效忌口尽量逐项保留。
- 在原始 PR 提交快照上运行了 11 项前置行为断言，11 项均失败；修复后的项目回归测试为 40/40 通过。前置断言覆盖存档/点赞、忌口、照片入口与压缩、食材编辑、OCR、ID 回退和换菜/微调。

## D. 运行方法

从 `moodmenu/` 目录运行：

```powershell
npm install
npm test
npm run typecheck
npm run build
```

测试、类型检查和构建的完整命令输出见 `test_output_fix1.txt`。

## E. 已知问题与风险

- 未配置真实模型密钥；真实外部视觉模型联调未验证。OCR 路由由自动化测试使用模拟兼容 API 响应验证。
- 图像压缩的尺寸、质量和失败回退由自动化测试验证；真实移动设备相机/相册行为未在设备上验证。
- 菜单本身及用户忌口文字都可能不完整；别名匹配不能保证识别隐含配料或交叉接触。过敏原必须向餐厅确认。
- 忌口存档超过可恢复上限时会显示警告；此情况需用户核对，不会伪称完整恢复。

## F. 需要总指挥或用户决定的事项

无。所有指定缺陷均已处理；未验证的外部模型和真实移动设备限制见 E 节。
