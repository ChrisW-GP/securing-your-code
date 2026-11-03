import { NextResponse } from "next/server";
import { PickSchema, RecommendationRequestSchema } from "@/lib/schemas";
import { emptyReason, rankDishes } from "@/lib/recommend";
import { chatCompletion } from "@/lib/openai";
import { fetchWeatherHint } from "@/lib/weather";

export const runtime = "nodejs";
export const maxDuration = 30;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return errorResponse("请求必须使用 application/json。", 415);
  }
  const contentLengthHeader = request.headers.get("content-length");
  if (!contentLengthHeader || !/^\d+$/.test(contentLengthHeader)) {
    return errorResponse("请求缺少有效的内容长度。", 411);
  }
  const contentLength = Number(contentLengthHeader);
  if (contentLength > 1_000_000) return errorResponse("请求内容过大。", 413);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("请求 JSON 格式无效。", 400);
  }
  const parsed = RecommendationRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("偏好或菜单数据格式不正确。", 400);
  const data = parsed.data;
  const candidates = rankDishes(
    data.dishes,
    data.profile,
    data.mood,
    data.context,
    data.refinement,
    data.rejectedDishIds,
    data.excludedDishIds,
  );
  if (candidates.length === 0) {
    return NextResponse.json({ recommendation: null, candidates: [], reason: emptyReason(data.profile, data.dishes) });
  }
  const safeDefault = candidates[0];
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ recommendation: safeDefault, candidates, reason: "规则推荐（模型未配置）。" });
  }
  try {
    const weatherHint = await fetchWeatherHint();
    const result = await chatCompletion([
      {
        role: "system",
        content: "你是选择器，只能从候选菜品中选择一个 dish_id，绝不能更改菜品、价格、食材或硬性规则。只输出 JSON：{\"dish_id\":\"候选id\",\"reason\":\"简短中文理由\"}。",
      },
      {
        role: "user",
        content: JSON.stringify({
          mood: data.mood,
          context: data.context,
          refinement: data.refinement,
          dietaryNotes: data.profile.dietaryNotes,
          weatherHint,
          candidates: candidates.map(({ dish, score, reasons }) => ({ dish_id: dish.id, name: dish.name, score, reasons })),
        }),
      },
    ]);
    const pick = PickSchema.safeParse(result);
    if (!pick.success) {
      return NextResponse.json({ recommendation: safeDefault, candidates, reason: "模型选择无效，已安全切换为规则推荐。" });
    }
    const selected = candidates.find(({ dish }) => dish.id === pick.data.dish_id);
    if (!selected) {
      return NextResponse.json({ recommendation: safeDefault, candidates, reason: "模型选择无效，已安全切换为规则推荐。" });
    }
    return NextResponse.json({
      recommendation: { ...selected, reasons: [pick.data.reason, ...selected.reasons] },
      candidates,
      reason: "AI 在已过滤的安全候选中作出选择。",
    });
  } catch {
    return NextResponse.json({ recommendation: safeDefault, candidates, reason: "模型暂不可用，已安全切换为规则推荐。" });
  }
}
