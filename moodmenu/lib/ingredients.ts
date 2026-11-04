const simplifiedCharacters: Record<string, string> = {
  豬: "猪",
  燒: "烧",
  腸: "肠",
  臘: "腊",
  雞: "鸡",
  魚: "鱼",
  蝦: "虾",
  貝: "贝",
  蠔: "蚝",
  魷: "鱿",
  參: "参",
  製: "制",
  質: "质",
  黃: "黄",
  麩: "麸",
  麥: "麦",
  麵: "面",
  鮮: "鲜",
  濃: "浓",
};

export function normalizeIngredientText(value: string): string {
  return Array.from(value, (character) => simplifiedCharacters[character] ?? character).join("").toLowerCase();
}

export function parseIngredientInput(value: string): string[] {
  return value.split(/[,，、;；\s]+/).map((ingredient) => ingredient.trim()).filter(Boolean);
}
