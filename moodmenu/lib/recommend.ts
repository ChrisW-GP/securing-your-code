import type { Dish, Mood, Profile } from "./schemas";
import { normalizeIngredientText } from "./ingredients";

export type Candidate = { dish: Dish; score: number; reasons: string[] };

export const ingredientAliases: Record<string, string[]> = {
  猪肉: ["猪肉", "排骨", "五花", "叉烧", "香肠", "腊肠", "培根", "火腿", "猪蹄", "红烧肉", "东坡肉", "回锅肉", "狮子头", "肉糜", "里脊", "梅菜扣肉", "肉松", "肉末", "肉馅", "猪油", "猪肝", "叉烧包", "pork", "bacon", "ham", "sausage"],
  牛肉: ["牛肉", "牛腩", "牛排", "肥牛", "牛柳", "牛腱", "牛仔骨", "牛杂", "牛尾", "牛筋", "牛肚", "牛肉丸", "牛肉干", "牛骨", "beef", "steak", "brisket"],
  鸡肉: ["鸡肉", "鸡", "鸡丁", "鸡翅", "鸡腿", "鸡胸", "鸡块", "炸鸡", "白切鸡", "鸡爪", "鸡胗", "鸡肉松", "鸡汤", "鸡肉馅", "chicken"],
  羊肉: ["羊肉", "羊排", "羊腩", "羊肉串", "mutton", "lamb"],
  海鲜: ["海鲜", "鱼", "虾", "蟹", "贝", "蚝", "鱿鱼", "墨鱼", "蛤蜊", "蛤", "文蛤", "螺", "田螺", "海螺", "扇贝", "章鱼", "海胆", "鱼露", "虾酱", "海参", "鲍鱼", "鱼丸", "鱼子", "鱼糜", "蚝油", "蟹棒", "鱼粉", "shrimp", "prawn", "crab", "fish", "salmon", "squid", "oyster", "lobster", "seafood", "clam", "mussel", "scallop", "octopus", "fish cake", "fish roe"],
  花生: ["花生", "花生酱", "花生油", "花生碎", "花生粉", "花生糖", "沙爹酱", "peanut", "peanuts", "groundnut", "satay"],
  乳制品: ["乳制品", "牛奶", "奶", "奶油", "芝士", "乳酪", "黄油", "拿铁", "卡布奇诺", "酸奶", "奶昔", "奶茶", "冰淇淋", "奶酪", "cream", "cheese", "butter", "yogurt", "latte", "milk", "dairy", "cappuccino", "mozzarella", "whey", "casein", "condensed milk", "mascarpone", "ricotta"],
  鸡蛋: ["鸡蛋", "蛋", "蛋黄酱", "egg", "eggs", "mayonnaise", "mayo"],
  "麸质/小麦": ["麸质/小麦", "gluten/wheat", "麸质", "小麦", "面", "面条", "拌面", "拉面", "面包", "饺子", "饺子皮", "馄饨", "馒头", "包子", "奶黄包", "豆沙包", "小笼包", "生煎包", "叉烧包", "菜包", "面饼", "葱油饼", "烧饼", "蛋挞", "可颂", "肉夹馍", "苏打饼干", "披萨", "意面", "面筋", "烧麦", "油条", "酱油", "面粉", "pasta", "noodle", "noodles", "bread", "pizza", "flour", "soy sauce", "gluten", "wheat", "bun", "dumpling", "wonton", "crouton", "seitan"],
};

function findAliasGroup(term: string): [string, string[]] | undefined {
  const normalized = normalizeIngredientText(term.trim());
  return Object.entries(ingredientAliases).find(([name, aliases]) =>
    normalizeIngredientText(name) === normalized
    || aliases.some((alias) => normalizeIngredientText(alias) === normalized));
}

export function getExclusionAliases(term: string): string[] {
  return findAliasGroup(term)?.[1] ?? [term.trim()];
}

function containsKnownIngredient(dish: Dish, term: string): boolean {
  const [group, aliases] = findAliasGroup(term) ?? ["", [term.trim()]];
  let source = normalizeIngredientText([dish.name, dish.description, ...dish.ingredients].join(" "));
  if (group === "鸡肉") source = source.replaceAll("鸡蛋", "");
  if (group === "海鲜") source = source.replaceAll("鱼香", "");
  if (group === "乳制品") source = source.replaceAll("椰奶", "").replaceAll("椰浆", "");
  return aliases.some((alias) => source.includes(normalizeIngredientText(alias)));
}

function mentions(text: string, term: string): boolean {
  return normalizeIngredientText(text).includes(normalizeIngredientText(term));
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
