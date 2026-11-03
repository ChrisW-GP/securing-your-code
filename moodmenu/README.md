# MoodMenu AI MVP

面向消费者的中文菜单识别与个性化点餐原型，采用 Next.js App Router、TypeScript、Tailwind CSS、route handlers、Zod 与浏览器 localStorage。独立运行于此仓库的 `moodmenu` 子目录，不改动原有 workshop 应用。

## 本机启动

需要 Node.js 22.12 或更高版本。进入本目录后运行：

```powershell
npm install
Copy-Item .env.example .env.local
# 可选：在 .env.local 设置服务端 OPENAI_API_KEY、OPENAI_BASE_URL 和 OPENAI_MODEL
npm run dev
```

访问 `http://localhost:3000`。未配置模型密钥时，照片识别会明确提示不可用；可以手动录入菜品，或主动载入单独标注的示例菜单演示推荐。示例菜单绝不会混同为照片识别结果。生产环境运行 `npm run build`，再用 `npm start` 启动。

## 架构与数据流

- `app/page.tsx` 是中文移动优先界面：首页、菜单编辑、偏好、情境、推荐和历史六个视图；侧边/底部导航切换页面内容。
- `lib/store.ts` 在浏览器中校验并持久化菜单、偏好、心情、反馈、推荐历史和长期记忆。用户照片不存储；API 密钥只从服务端环境读取。
- `POST /api/menu` 在服务器校验 1–5 张、JPEG/PNG/WebP、单张 5 MB 与合计 10 MB，并检查文件签名；照片通过 OpenAI-compatible `chat/completions` 视觉接口解析，Zod 校验后才返回。模型提示明确要求价格/配料不确定时保留未知，而不猜测。
- `POST /api/recommend` 校验请求，先在服务端执行硬性忌口、价格已知且不超预算、历史拒绝等过滤，然后按心情、偏好排序；可选 LLM 只能在过滤后的候选中选择，并校验 `dish_id`。无密钥、超时、异常或无效 ID 时回退规则推荐。
- 可选 Open-Meteo 天气提示有 2.5 秒超时，失败会忽略；不阻断规则或模型推荐。设置 `WEATHER_LATITUDE` 与 `WEATHER_LONGITUDE` 才请求天气。

## 隐私、安全与边界

- 不把 API 密钥放进客户端 bundle。密钥只存在 `.env.local`，该文件被忽略；不要将真实密钥提交或分享。
- 当前 MVP 将个人档案、记忆与菜单保存在同一浏览器的 localStorage；没有登录、多设备同步或服务端个人数据存储。
- 规则只能排除菜单文字中已知的忌口成分；配料列表可能不完整，也无法识别交叉接触。过敏原不明确时必须向餐厅确认。应用不作任何食品安全或过敏安全保证。
- 图像类型、大小、数量和服务端 JSON/Zod 校验有明确限制；模型请求 20 秒超时。外部视觉模型仍受其供应商可用性、计费与隐私条款约束。
- 识别是模型读取真实照片，但仍可能误读；所有菜品、价格、配料及辣度均可编辑核实。未知价格保持 `null`，严格预算会排除价格未知项。
- 示例菜单仅由用户通过“载入示例菜单”明确选择，与识别路径分离；样例内容不是实际餐厅信息。

## 检查

```powershell
npm test
npm run typecheck
npm run build
```

最近一次执行结果（2026-11-03）：`npm test` 通过（3 个测试文件、15 个用例）；`npm run typecheck` 通过；`npm run build` 通过；`npm audit` 报告 0 个依赖漏洞。自动化视觉路由测试使用模拟兼容 API 响应验证真实照片字节上传、清晰菜单数据校验与模糊结果丢弃，不是对外部视觉服务的实测。配置有效的兼容视觉模型后，仍应使用真实照片人工核对识别效果；本仓库不包含模型 API 密钥，因此没有执行外部模型联调。

测试覆盖已知牛肉过滤、严格预算、换菜/拒绝过滤、细化心情后仍遵守限制、无候选解释、未知配料不作安全保证、偏好持久化、无密钥规则推荐、伪造模型 ID 安全回退、天气服务故障和上传大小限制。
