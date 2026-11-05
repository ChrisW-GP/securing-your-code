import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as recommend } from "../app/api/recommend/route";
import { POST as recognize } from "../app/api/menu/route";

const dish = {
  id: "dish-tofu",
  name: "香菇豆腐煲",
  description: "",
  price: 28,
  currency: "¥",
  ingredients: [],
  ingredientsKnown: false,
  spicyLevel: "unknown",
  confidence: 1,
  verifiedByUser: false,
};

function requestBody(overrides: Record<string, unknown> = {}) {
  return {
    dishes: [dish],
    profile: { budget: null, currency: "¥", excludedIngredients: [], favoriteIngredients: [], dietaryNotes: "" },
    mood: "随心看看",
    context: "",
    refinement: "",
    rejectedDishIds: [],
    excludedDishIds: [],
    ...overrides,
  };
}

function modelResponse(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function recommendationRequest(value: unknown) {
  const body = JSON.stringify(value);
  return new Request("http://localhost/api/recommend", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(body).length),
    },
    body,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("recommendation API", () => {
  it("works without an API key using only user-provided menu data", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await recommend(recommendationRequest(requestBody()));
    const result = await response.json();
    expect(result.recommendation.dish.id).toBe("dish-tofu");
    expect(result.recommendation.dish.ingredientsKnown).toBe(false);
    expect(result.reason).toContain("规则推荐");
  });

  it("rejects a nonexistent model dish_id and safely falls back to a real candidate", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelResponse('{"dish_id":"invented-id","reason":"不存在"}')));
    const response = await recommend(recommendationRequest(requestBody()));
    const result = await response.json();
    expect(result.recommendation.dish.id).toBe("dish-tofu");
    expect(result.reason).toContain("安全切换");
  });

  it("continues model selection when the optional weather service fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("WEATHER_LATITUDE", "35");
    vi.stubEnv("WEATHER_LONGITUDE", "139");
    vi.stubGlobal("fetch", vi.fn()
      .mockRejectedValueOnce(new Error("weather offline"))
      .mockResolvedValueOnce(modelResponse('{"dish_id":"dish-tofu","reason":"来自真实候选"}')));
    const response = await recommend(recommendationRequest(requestBody()));
    const result = await response.json();
    expect(result.recommendation.dish.id).toBe("dish-tofu");
    expect(result.reason).toContain("AI");
  });

  it("explains an empty candidate set without inventing a substitute", async () => {
    const response = await recommend(recommendationRequest(requestBody({ dishes: [] })));
    const result = await response.json();
    expect(result.recommendation).toBeNull();
    expect(result.reason).toContain("没有菜单");
  });

  it("rejects oversized or missing-length photo requests before parsing them", async () => {
    const missingLength = await recognize(new Request("http://localhost/api/menu", { method: "POST" }));
    expect(missingLength.status).toBe(411);
    const oversized = await recognize(new Request("http://localhost/api/menu", {
      method: "POST",
      headers: { "content-length": String(10 * 1024 * 1024 + 200_000) },
    }));
    expect(oversized.status).toBe(413);
  });

  it("extracts clear visible menu data from a real photo upload through the configured vision endpoint", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_BASE_URL", "https://vision.example/v1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelResponse(JSON.stringify({
      items: [{
        id: "dish-visible",
        name: "番茄鸡蛋面",
        description: "",
        price: 26,
        currency: "¥",
        ingredients: [],
        ingredientsKnown: false,
        spicyLevel: "unknown",
        confidence: 0.96,
        verifiedByUser: false,
      }],
    }))));
    const form = new FormData();
    form.append("photos", new File([
      new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
    ], "menu.jpg", { type: "image/jpeg" }));
    const response = await recognize(new Request("http://localhost/api/menu", {
      method: "POST",
      headers: { "content-length": "500" },
      body: form,
    }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.menu.items[0].name).toBe("番茄鸡蛋面");
    expect(result.menu.items[0].price).toBe(26);
    expect(result.menu.items[0].ingredients).toEqual([]);
    expect(result.mode).toBe("recognized");
    const sentBody = vi.mocked(fetch).mock.calls[0][1]?.body as string;
    expect(sentBody).toContain("data:image/jpeg;base64,");
  });

  it("omits unclear model guesses rather than passing them on as recognized dishes", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelResponse(JSON.stringify({
      items: [{
        id: "unclear",
        name: "猜测的菜名",
        description: "",
        price: null,
        currency: "¥",
        ingredients: [],
        ingredientsKnown: false,
        spicyLevel: "unknown",
        confidence: 0.2,
        verifiedByUser: false,
      }],
    }))));
    const form = new FormData();
    form.append("photos", new File([new Uint8Array([0xff, 0xd8, 0xff])], "menu.jpg", { type: "image/jpeg" }));
    const response = await recognize(new Request("http://localhost/api/menu", {
      method: "POST",
      headers: { "content-length": "500" },
      body: form,
    }));
    const result = await response.json();
    expect(result.menu.items).toEqual([]);
    expect(result.omittedUnclear).toBe(1);
  });

  it("replaces model dish IDs with unique server IDs on every photo recognition", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(modelResponse(JSON.stringify({
      items: [
        { id: "dish-1", name: "番茄面", price: 22, ingredients: [], ingredientsKnown: false, confidence: 0.9 },
        { id: "dish-2", name: "豆腐汤", price: 24, ingredients: [], ingredientsKnown: false, confidence: 0.9 },
      ],
    })))));
    const upload = () => {
      const form = new FormData();
      form.append("photos", new File([new Uint8Array([0xff, 0xd8, 0xff])], "menu.jpg", { type: "image/jpeg" }));
      return recognize(new Request("http://localhost/api/menu", {
        method: "POST",
        headers: { "content-length": "500" },
        body: form,
      }));
    };
    const first = await (await upload()).json();
    const second = await (await upload()).json();
    expect(first).toHaveProperty("menu");
    expect(second).toHaveProperty("menu");
    const { mergeMenuItems } = await import("../lib/store");
    const merged = mergeMenuItems(first.menu.items, second.menu.items);
    const { MenuSchema } = await import("../lib/schemas");
    expect(merged.map(({ id }) => id)).not.toContain("dish-1");
    expect(merged.map(({ id }) => id)).not.toContain("dish-2");
    expect(MenuSchema.safeParse({ items: merged }).success).toBe(true);
    expect(new Set(merged.map(({ id }) => id)).size).toBe(4);
  });

  it("parses valid OCR entries individually and counts invalid entries without failing the menu", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelResponse(JSON.stringify({
      items: [
        { id: "duplicate", name: "价格可读的菜", price: "¥38", ingredients: [], ingredientsKnown: false, confidence: 0.9 },
        { id: "duplicate", name: "价格模糊的菜", price: "请询价", ingredients: [], ingredientsKnown: false, confidence: 0.9 },
        { id: "duplicate", name: "", price: 10, confidence: 0.9 },
      ],
    }))));
    const form = new FormData();
    form.append("photos", new File([new Uint8Array([0xff, 0xd8, 0xff])], "menu.jpg", { type: "image/jpeg" }));
    const response = await recognize(new Request("http://localhost/api/menu", {
      method: "POST",
      headers: { "content-length": "500" },
      body: form,
    }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.menu.items).toHaveLength(2);
    expect(result.menu.items[0].price).toBe(38);
    expect(result.menu.items[1].price).toBeNull();
    expect(result.discardedCount).toBe(1);
  });
});
