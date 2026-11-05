import { describe, expect, it } from "vitest";
import { emptyReason, rankDishes } from "../lib/recommend";
import { DishSchema, ProfileSchema } from "../lib/schemas";
import type { Dish, Mood } from "../lib/schemas";

const profile = ProfileSchema.parse({
  budget: null,
  currency: "¥",
  excludedIngredients: [],
  favoriteIngredients: [],
  dietaryNotes: "",
});
const dishes: Dish[] = [
  DishSchema.parse({ id: "beef", name: "红烧牛肉饭", price: 36, ingredients: ["牛肉"], ingredientsKnown: true }),
  DishSchema.parse({ id: "tofu", name: "香菇豆腐煲", price: 28, ingredients: ["豆腐"], ingredientsKnown: true }),
  DishSchema.parse({ id: "unknown", name: "主厨推荐", price: null, ingredients: [], ingredientsKnown: false }),
  DishSchema.parse({ id: "expensive", name: "和牛套餐", price: 100, ingredients: ["和牛"], ingredientsKnown: true }),
];
const mood: Mood = "随心看看";

describe("recommendation hard filters and fallback", () => {
  it("filters a known beef dish when beef is excluded", () => {
    const candidates = rankDishes(dishes, { ...profile, excludedIngredients: ["牛肉"] }, mood, "", "", [], []);
    expect(candidates.map(({ dish }) => dish.id)).not.toContain("beef");
  });

  it("requires a known price within a strict budget", () => {
    const candidates = rankDishes(dishes, { ...profile, budget: 40 }, mood, "", "", [], []);
    expect(candidates.map(({ dish }) => dish.id)).toEqual(["tofu", "beef"]);
    expect(candidates.some(({ dish }) => dish.price === null)).toBe(false);
    expect(candidates.some(({ dish }) => dish.id === "expensive")).toBe(false);
  });

  it("does not re-recommend rejected dishes and keeps refinements within hard filters", () => {
    const candidates = rankDishes(dishes, { ...profile, budget: 40, excludedIngredients: ["牛肉"] }, mood, "", "微辣", ["tofu"], []);
    expect(candidates).toEqual([]);
  });

  it("uses a mildness refinement without relaxing budget or ingredient exclusions", () => {
    const candidates = rankDishes(
      dishes,
      { ...profile, budget: 40, excludedIngredients: ["牛肉"] },
      mood,
      "",
      "想吃微辣",
      [],
      [],
    );
    expect(candidates[0].dish.id).toBe("tofu");
    expect(candidates.some(({ dish }) => dish.id === "beef" || dish.id === "expensive" || dish.price === null)).toBe(false);
  });

  it("returns an explicit explanation for an empty menu", () => {
    expect(emptyReason(profile, [])).toContain("还没有菜单");
  });

  it("can safely recommend a manual dish with unknown allergens without a safety assertion", () => {
    const manual = DishSchema.parse({ id: "manual", name: "手工录入菜", price: 20, ingredients: [], ingredientsKnown: false });
    const candidate = rankDishes([manual], profile, mood, "", "", [], [])[0];
    expect(candidate.dish.ingredientsKnown).toBe(false);
    expect(candidate.dish.ingredients).toEqual([]);
  });

  it("labels unknown ingredients as unverifiable and ranks them below verified-safe dishes", () => {
    const unknownIngredients = DishSchema.parse({
      id: "unknown-ingredients",
      name: "今日精选",
      price: 12,
      ingredients: [],
      ingredientsKnown: false,
    });
    const knownSafe = DishSchema.parse({
      id: "known-safe",
      name: "番茄饭",
      price: 90,
      ingredients: ["番茄"],
      ingredientsKnown: true,
    });
    const candidates = rankDishes(
      [unknownIngredients, knownSafe],
      { ...profile, excludedIngredients: ["花生"] },
      mood,
      "",
      "",
      [],
      [],
    );
    expect(candidates.map(({ dish }) => dish.id)).toEqual(["known-safe", "unknown-ingredients"]);
    expect(candidates[0].reasons).toContain("符合已设置的硬性条件");
    expect(candidates[1].reasons).toContain("忌口无法核实：配料未知");
    expect(candidates[1].reasons).not.toContain("符合已设置的硬性条件");
  });
});
