import type { Dish, Mood, Profile } from "./schemas";
import { normalizeIngredientText } from "./ingredients";

export type Candidate = { dish: Dish; score: number; reasons: string[] };

const ingredientAliases: Record<string, string[]> = {
  猪肉: ["猪肉", "排骨", "五花", "叉烧", "香肠", "腊肠", "培根", "火腿", "猪蹄", "pork"],
  牛肉: ["牛肉", "牛腩", "牛排", "beef"],
  鸡肉: ["鸡肉", "鸡", "chicken"],
  羊肉: ["羊肉", "羊排", "mutton", "lamb"],
  海鲜: ["海鲜", "鱼", "虾", "蟹", "贝", "蚝", "鱿鱼", "墨鱼", "蛤蜊", "海参", "seafood"],
  花生: ["花生", "peanut", "peanuts"],
  乳制品: ["乳制品", "牛奶", "奶", "奶油", "芝士", "乳酪", "黄油", "milk", "dairy"],
  鸡蛋: ["鸡蛋", "蛋", "egg", "eggs"],
  "麸质/小麦": ["麸质/小麦", "gluten/wheat", "麸质", "小麦", "面粉", "gluten", "wheat"],
};

function mentions(text: string, term: string): boolean {
  const normalized = normalizeIngredientText(text);
  const needle = normalizeIngredientText(term);
  return normalized.includes(needle);
}

function exclusionTerms(term: string): string[] {
  const normalized = normalizeIngredientText(term.trim());
  const group = Object.values(ingredientAliases).find((aliases) =>
    aliases.some((alias) => normalizeIngredientText(alias) === normalized));
  return group ?? [normalized];
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
      const ingredientsUnverified = profile.excludedIngredients.length > 0 && !dish.ingredientsKnown;
      const reasons = [ingredientsUnverified ? "忌口无法核实：配料未知" : "符合已设置的硬性条件"];
      let score = dish.verifiedByUser ? 3 : 0;
      if (ingredientsUnverified) score -= 1000;
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
      return { dish, score, reasons, ingredientsUnverified };
    })
    .sort((a, b) => Number(a.ingredientsUnverified) - Number(b.ingredientsUnverified)
      || b.score - a.score
      || (a.dish.price ?? Infinity) - (b.dish.price ?? Infinity))
    .map(({ ingredientsUnverified: _uncertain, ...candidate }) => candidate);
}

export function emptyReason(profile: Profile, dishes: Dish[]): string {
  if (dishes.length === 0) return "还没有菜单菜品，请先拍摄或录入菜单。";
  if (profile.budget !== null && dishes.every((dish) => dish.price === null || dish.price > profile.budget!)) {
    return "符合预算的已知价格菜品为零。我们不会猜测价格，请核对菜单或调整预算。";
  }
  return "没有符合当前饮食限制且未被排除的菜品。可以核对过敏原信息或调整偏好后再试。";
}
