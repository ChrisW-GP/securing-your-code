import { describe, expect, it } from "vitest";
import {
  mergeMenuItems,
  parseStoredState,
  readStorageValue,
  recordDishFeedback,
  serializeStoredState,
  writeStorageValue,
} from "../lib/store";
import { DishSchema, MenuSchema } from "../lib/schemas";

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
    expect(saved.rejectedDishIds).toEqual([]);
  });

  it("falls back to an empty profile for corrupted browser data", () => {
    expect(parseStoredState("{not json").profile.excludedIngredients).toEqual([]);
  });

  it("preserves the menu and exclusions when more than 50 favorites need truncation", () => {
    const menuItem = {
      id: "dish-existing",
      name: "番茄鸡蛋面",
      price: 26,
      ingredients: ["番茄"],
      ingredientsKnown: true,
    };
    const state = parseStoredState(JSON.stringify({
      menu: { items: [menuItem] },
      profile: {
        budget: null,
        currency: "¥",
        excludedIngredients: ["花生", "牛肉"],
        favoriteIngredients: Array.from({ length: 51 }, (_, index) => `食材${index}`),
        dietaryNotes: "",
      },
    }));
    expect(state.menu.items).toHaveLength(1);
    expect(state.profile.excludedIngredients).toEqual(["花生", "牛肉"]);
    expect(state.profile.favoriteIngredients).toHaveLength(50);
    expect(state.recoveryNotice).toContain("截取");
  });

  it("keeps a liked marker in history without learning favorite ingredients", () => {
    const state = parseStoredState(JSON.stringify({
      menu: { items: [] },
      profile: {
        budget: null,
        currency: "¥",
        excludedIngredients: ["花生"],
        favoriteIngredients: [],
        dietaryNotes: "",
      },
      history: [{
        id: "history-liked",
        dish: likedDishPlaceholder(),
        reason: "原有推荐",
        mood: "随心看看",
        createdAt: new Date().toISOString(),
      }],
    }));
    const likedDish = {
      id: "liked-dish",
      name: "番茄鸡蛋面",
      description: "",
      price: 26,
      currency: "¥",
      ingredients: ["番茄", "鸡蛋"],
      ingredientsKnown: true,
      spicyLevel: "none" as const,
      confidence: 1,
      verifiedByUser: true,
    };
    const liked = recordDishFeedback(state, likedDish, "liked");
    expect(liked.history[0].feedback).toBe("liked");
    expect(liked.profile.favoriteIngredients).toEqual([]);
    expect(liked.profile.excludedIngredients).toEqual(["花生"]);
  });

  it("repairs duplicate IDs when recognized menus from separate scans are merged", async () => {
    const makeDish = (id: string, name: string, price: number) => DishSchema.parse({ id, name, price });
    const firstScan = [makeDish("dish-1", "第一道菜", 20), makeDish("dish-2", "第二道菜", 25)];
    const secondScan = [makeDish("dish-1", "第三道菜", 30), makeDish("dish-2", "第四道菜", 35)];
    const merged = mergeMenuItems(firstScan, secondScan);
    expect(MenuSchema.safeParse({ items: merged }).success).toBe(true);
    expect(new Set(merged.map(({ id }) => id)).size).toBe(4);
    expect(merged.slice(2).every(({ id }) => !["dish-1", "dish-2"].includes(id))).toBe(true);
  });

  it("does not persist session-only rejected dish IDs", () => {
    const state = parseStoredState(JSON.stringify({
      menu: { items: [] },
      profile: {
        budget: null,
        currency: "¥",
        excludedIngredients: ["花生"],
        favoriteIngredients: [],
        dietaryNotes: "",
      },
      rejectedDishIds: ["rejected-session-dish"],
    }));
    const persisted = JSON.parse(serializeStoredState({
      ...state,
      rejectedDishIds: ["rejected-session-dish"],
    })) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty("rejectedDishIds");
    expect(parseStoredState(JSON.stringify(persisted)).rejectedDishIds).toEqual([]);
  });

  it("tolerates localStorage reads and writes throwing", () => {
    const inaccessibleStorage = {
      getItem() { throw new Error("storage denied"); },
      setItem() { throw new Error("quota exceeded"); },
    };
    expect(() => readStorageValue(inaccessibleStorage, "moodmenu.v1")).not.toThrow();
    expect(readStorageValue(inaccessibleStorage, "moodmenu.v1").notice).toContain("读取");
    expect(() => writeStorageValue(inaccessibleStorage, "moodmenu.v1", "{}")).not.toThrow();
    expect(writeStorageValue(inaccessibleStorage, "moodmenu.v1", "{}")).toContain("保存");
  });

  it("recovers invalid mood, context, and history fields independently with a visible notice", () => {
    const state = parseStoredState(JSON.stringify({
      menu: { items: [{
        id: "preserved-menu",
        name: "保留菜品",
        description: "",
        price: 18,
        currency: "¥",
        ingredients: [],
        ingredientsKnown: false,
        spicyLevel: "unknown",
        confidence: 1,
        verifiedByUser: false,
      }] },
      profile: {
        budget: null,
        currency: "¥",
        excludedIngredients: ["花生"],
        favoriteIngredients: [],
        dietaryNotes: "",
      },
      mood: "not-a-mood",
      context: 42,
      history: [{ invalid: true }],
    }));
    expect(state.menu.items).toHaveLength(1);
    expect(state.profile.excludedIngredients).toEqual(["花生"]);
    expect(state.mood).toBe("随心看看");
    expect(state.context).toBe("");
    expect(state.history).toEqual([]);
    expect(state.recoveryNotice).toContain("心情字段无效");
    expect(state.recoveryNotice).toContain("情境字段无效");
    expect(state.recoveryNotice).toContain("无效历史记录");
  });
});

function likedDishPlaceholder() {
  return {
    id: "liked-dish",
    name: "番茄鸡蛋面",
    description: "",
    price: 26,
    currency: "¥",
    ingredients: ["番茄", "鸡蛋"],
    ingredientsKnown: true,
    spicyLevel: "none" as const,
    confidence: 1,
    verifiedByUser: true,
  };
}
