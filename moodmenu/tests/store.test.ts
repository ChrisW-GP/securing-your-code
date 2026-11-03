import { describe, expect, it } from "vitest";
import { parseStoredState } from "../lib/store";

describe("local preference persistence", () => {
  it("restores validated preferences and long-term memory", () => {
    const profile = {
      budget: 45,
      currency: "¥",
      excludedIngredients: ["牛肉"],
      favoriteIngredients: ["番茄"],
      dietaryNotes: "清淡一点",
    };
    const saved = parseStoredState(JSON.stringify({
      menu: { items: [] },
      profile,
      mood: "想吃点暖的",
      context: "下雨",
      refinement: "微辣",
      rejectedDishIds: ["dish-1"],
      history: [],
    }));
    expect(saved.profile).toEqual(profile);
    expect(saved.rejectedDishIds).toEqual(["dish-1"]);
  });

  it("falls back to an empty profile for corrupted browser data", () => {
    expect(parseStoredState("{not json").profile.excludedIngredients).toEqual([]);
  });
});
