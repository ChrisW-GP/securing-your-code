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
});
