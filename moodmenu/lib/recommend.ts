import type { Dish, Mood, Profile } from "./schemas";

export type Candidate = { dish: Dish; score: number; reasons: string[] };

const ingredientAliases: Record<string, string[]> = {
  牛肉: ["beef", "牛腩", "牛排", "牛肉"],
  豬肉: ["pork", "豬肉", "猪肉", "培根", "火腿"],
  雞肉: ["chicken", "雞肉", "鸡肉"],
  海鮮: ["seafood", "魚", "鱼", "蝦", "虾", "蟹", "貝", "貝類"],
};

function mentions(text: string, term: string): boolean {
  const normalized = text.toLocaleLowerCase();
  const needle = term.toLocaleLowerCase();
  return normalized.includes(needle);
}

function exclusionTerms(term: string): string[] {
  return ingredientAliases[term] ?? [term];
}

function containsKnownIngredient(dish: Dish, term: string): boolean {
  const source = [dish.name, dish.description, ...dish.ingredients].join(" ");
  return exclusionTerms(term).some((alias) => mentions(source, alias));
}

export function rankDishes(
  dishes: Dish[],
  profile: Profile,
  mood: Mood,
  context: string,
  refinement: string,
  rejectedDishIds: string[],
  excludedDishIds: string[],
): Candidate[] {
  return dishes
    .filter((dish) => !rejectedDishIds.includes(dish.id) && !excludedDishIds.includes(dish.id))
    .filter((dish) => !profile.excludedIngredients.some((term) => containsKnownIngredient(dish, term)))
    .filter((dish) => profile.budget === null || (dish.price !== null && dish.price <= profile.budget))
    .map((dish) => {
      const reasons = ["符合已设置的硬性条件"];
      let score = dish.verifiedByUser ? 3 : 0;
      const foodText = [dish.name, dish.description, ...dish.ingredients].join(" ");
      for (const favorite of profile.favoriteIngredients) {
        if (mentions(foodText, favorite)) {
          score += 4;
          reasons.push(`含有偏爱的「${favorite}」`);
        }
      }
      if (profile.budget !== null && dish.price !== null) {
        score += Math.max(0, 3 - (dish.price / profile.budget) * 3);
        reasons.push(`价格 ${dish.currency}${dish.price} 在预算内`);
      }
      if (mood === "想吃点暖的" && /汤|煲|热|炖/.test(foodText)) {
        score += 2;
        reasons.push("更贴合暖食心情");
      }
      if (mood === "清爽轻盈" && /沙拉|蒸|清|蔬菜/.test(foodText)) {
        score += 2;
        reasons.push("更贴合清爽心情");
      }
      if (mood === "快速填饱" && /饭|面|套餐/.test(foodText)) {
        score += 1;
        reasons.push("适合快速吃饱");
      }
      if (/微辣|少辣|不太辣|微微辣/.test(refinement) && dish.spicyLevel === "mild") {
        score += 3;
        reasons.push("辣度符合「微辣」要求");
      }
      if (/不辣|不要辣|完全不辣/.test(refinement) && dish.spicyLevel === "none") {
        score += 4;
        reasons.push("符合不辣要求");
      }
      if (context.trim()) reasons.push(`结合情境：${context.trim()}`);
      return { dish, score, reasons };
    })
    .sort((a, b) => b.score - a.score || (a.dish.price ?? Infinity) - (b.dish.price ?? Infinity));
}

export function emptyReason(profile: Profile, dishes: Dish[]): string {
  if (dishes.length === 0) return "还没有菜单菜品，请先拍摄或录入菜单。";
  if (profile.budget !== null && dishes.every((dish) => dish.price === null || dish.price > profile.budget!)) {
    return "符合预算的已知价格菜品为零。我们不会猜测价格，请核对菜单或调整预算。";
  }
  return "没有符合当前饮食限制且未被排除的菜品。可以核对过敏原信息或调整偏好后再试。";
}
