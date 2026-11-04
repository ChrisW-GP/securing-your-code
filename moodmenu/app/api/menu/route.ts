import { NextResponse } from "next/server";
import { z } from "zod";
import { DishSchema, MenuSchema } from "@/lib/schemas";
import { chatCompletion, imageDataUri, imageSignatureMatches } from "@/lib/openai";
import { createUniqueId } from "@/lib/ids";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function parseOcrPrice(value: string): number | null {
  const matched = value.trim().match(/^[¥￥$€£]?\s*(\d+(?:\.\d{1,2})?)\s*(?:元)?$/);
  if (!matched) return null;
  const price = Number(matched[1]);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const contentLengthHeader = request.headers.get("content-length");
  if (!contentLengthHeader || !/^\d+$/.test(contentLengthHeader)) {
    return errorResponse("请使用带有内容长度的照片上传请求。", 411);
  }
  const contentLength = Number(contentLengthHeader);
  if (contentLength > MAX_TOTAL_BYTES + 100_000) {
    return errorResponse("照片总大小不能超过 10 MB。", 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("无法读取上传内容，请重试。", 400);
  }
  const files = form.getAll("photos");
  if (files.length < 1 || files.length > 5 || files.some((file) => !(file instanceof File))) {
    return errorResponse("请上传 1 至 5 张菜单照片。", 400);
  }
  let total = 0;
  const images: { url: string }[] = [];
  for (const entry of files) {
    const file = entry as File;
    if (!SUPPORTED_TYPES.has(file.type)) return errorResponse("仅支持 JPG、PNG 或 WebP 图片。", 415);
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      return errorResponse("单张照片需大于 0 且不超过 5 MB。", 413);
    }
    total += file.size;
    if (total > MAX_TOTAL_BYTES) return errorResponse("照片总大小不能超过 10 MB。", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!imageSignatureMatches(bytes, file.type)) return errorResponse("图片格式与文件内容不匹配。", 415);
    images.push({ url: imageDataUri(bytes, file.type) });
  }
  if (!process.env.OPENAI_API_KEY) return errorResponse("尚未配置视觉模型。可先手动录入菜单；示例菜单仅供演示。", 503);
  try {
    const result = await chatCompletion([
      {
        role: "system",
        content: [
          "你是菜单文字识别器，只能从图片中读取确实可见的信息，不得补全、推测或编造菜品、价格、配料或辣度。",
          "模糊或不可见的价格必须为 null。配料没有清晰列出时 ingredients 必须为空数组、ingredientsKnown 为 false。",
          "菜名必须是图片可读文字；无法确定的菜品不要输出。每个识别菜品给随机稳定短 id、货币符号、0 到 1 confidence。",
          "只输出 JSON 对象，格式为 {\"items\":[{\"id\":\"dish-1\",\"name\":\"...\",\"description\":\"\",\"price\":null,\"currency\":\"¥\",\"ingredients\":[],\"ingredientsKnown\":false,\"spicyLevel\":\"unknown\",\"confidence\":0.5,\"verifiedByUser\":false}]}。",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          { type: "text", text: "逐张读取这些菜单照片上清晰可辨的菜品，不确定的内容请留空或省略菜品。" },
          ...images.map(({ url }) => ({ type: "image_url", image_url: { url } })),
        ],
      },
    ]);
    const response = z.object({ items: z.array(z.unknown()).max(500) }).safeParse(result);
    if (!response.success) return errorResponse("菜单识别结果未通过校验，请重拍或手动录入。", 502);

    const usedIds = new Set<string>();
    const validItems = [];
    let discardedCount = 0;
    for (const [index, rawItem] of response.data.items.entries()) {
      if (validItems.length >= 200 || !isRecord(rawItem)) {
        discardedCount += 1;
        continue;
      }
      const price = typeof rawItem.price === "string" ? parseOcrPrice(rawItem.price) : rawItem.price;
      const parsedItem = DishSchema.safeParse({
        ...rawItem,
        id: `ocr-${index}`,
        price,
      });
      if (!parsedItem.success) {
        discardedCount += 1;
        continue;
      }
      validItems.push({ ...parsedItem.data, id: createUniqueId("scan", usedIds) });
    }

    const clearItems = validItems.filter((item) => item.confidence >= 0.7);
    const finalMenu = MenuSchema.safeParse({ items: clearItems });
    if (!finalMenu.success) return errorResponse("菜单识别结果未通过校验，请重拍或手动录入。", 502);
    return NextResponse.json({
      menu: finalMenu.data,
      omittedUnclear: validItems.length - clearItems.length,
      discardedCount,
      mode: "recognized",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "视觉模型暂不可用。";
    return errorResponse(message, 502);
  }
}
