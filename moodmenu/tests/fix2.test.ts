import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as recommend } from "../app/api/recommend/route";
import { POST as recognize } from "../app/api/menu/route";
import { compressImage } from "../lib/image";
import { getExclusionAliases, rankDishes } from "../lib/recommend";
import { DishSchema, ProfileSchema } from "../lib/schemas";
import type { Dish } from "../lib/schemas";

const profile = ProfileSchema.parse({
  budget: null,
  currency: "¥",
  excludedIngredients: [],
  favoriteIngredients: [],
  dietaryNotes: "",
});

const realMenuCases: Array<[string, string, string[], string, boolean]> = [
  ["牛肉", "肥牛金针菇", [], "牛肉", true],
  ["牛肉", "黑椒牛柳", [], "牛肉", true],
  ["牛肉", "卤牛腱", [], "牛肉", true],
  ["牛肉", "牛仔骨煲", [], "牛肉", true],
  ["牛肉", "红烧牛杂", [], "牛肉", true],
  ["牛肉", "牛尾汤", [], "牛肉", true],
  ["牛肉", "葱爆牛筋", [], "牛肉", true],
  ["牛肉", "卤牛肚", [], "牛肉", true],
  ["牛肉", "牛肉丸汤", [], "牛肉", true],
  ["牛肉", "香辣牛肉干", [], "牛肉", true],
  ["牛肉", "酱牛腩", [], "牛肉", true],
  ["牛肉", "黑椒牛排", [], "牛肉", true],
  ["牛肉", "蔬菜烩饭", ["beef"], "牛肉", true],
  ["猪肉", "红烧肉", [], "猪肉", true],
  ["猪肉", "东坡肉", [], "猪肉", true],
  ["猪肉", "回锅肉", [], "猪肉", true],
  ["猪肉", "清蒸狮子头", [], "猪肉", true],
  ["猪肉", "肉糜蒸蛋", [], "猪肉", true],
  ["猪肉", "香煎里脊", [], "猪肉", true],
  ["猪肉", "梅菜扣肉", [], "猪肉", true],
  ["猪肉", "五花肉炒笋", [], "猪肉", true],
  ["猪肉", "肉松饭团", [], "猪肉", true],
  ["猪肉", "肉末蒸豆腐", [], "猪肉", true],
  ["猪肉", "猪油拌饭", [], "猪肉", true],
  ["猪肉", "猪肝汤", [], "猪肉", true],
  ["猪肉", "香菇青菜", ["肉馅"], "猪肉", true],
  ["猪肉", "糖醋排骨", [], "猪肉", true],
  ["猪肉", "蜜汁叉烧饭", [], "猪肉", true],
  ["猪肉", "腊肠煲仔饭", [], "猪肉", true],
  ["猪肉", "香肠披萨", [], "猪肉", true],
  ["猪肉", "培根意面", [], "猪肉", true],
  ["猪肉", "火腿炒饭", [], "猪肉", true],
  ["猪肉", "酱香猪蹄", [], "猪肉", true],
  ["猪肉", "蔬菜汤", ["pork"], "猪肉", true],
  ["鸡肉", "宫保鸡丁", [], "鸡肉", true],
  ["鸡肉", "蜜汁鸡翅", [], "鸡肉", true],
  ["鸡肉", "卤鸡腿饭", [], "鸡肉", true],
  ["鸡肉", "香煎鸡胸", [], "鸡肉", true],
  ["鸡肉", "炸鸡块", [], "鸡肉", true],
  ["鸡肉", "脆皮炸鸡", [], "鸡肉", true],
  ["鸡肉", "白切鸡", [], "鸡肉", true],
  ["鸡肉", "香辣鸡爪", [], "鸡肉", true],
  ["鸡肉", "卤鸡胗", [], "鸡肉", true],
  ["鸡肉", "鸡汤面", [], "鸡肉", true],
  ["鸡肉", "蔬菜三明治", ["鸡肉馅"], "鸡肉", true],
  ["鸡肉", "香煎鸡肉", [], "鸡肉", true],
  ["鸡肉", "蔬菜卷", ["chicken"], "鸡肉", true],
  ["羊肉", "孜然羊肉", [], "羊肉", true],
  ["羊肉", "香煎羊排", [], "羊肉", true],
  ["羊肉", "烤肉串", ["mutton"], "羊肉", true],
  ["羊肉", "羊肉手抓饭", ["lamb"], "羊肉", true],
  ["麸质/小麦", "牛肉拌面", [], "麸质/小麦", true],
  ["麸质/小麦", "清汤面", [], "麸质/小麦", true],
  ["麸质/小麦", "鸡丝面条", [], "麸质/小麦", true],
  ["麸质/小麦", "手工拉面", [], "麸质/小麦", true],
  ["麸质/小麦", "蒜香面包", [], "麸质/小麦", true],
  ["麸质/小麦", "白菜猪肉饺子", [], "麸质/小麦", true],
  ["麸质/小麦", "手工饺子皮", [], "麸质/小麦", true],
  ["麸质/小麦", "鲜肉馄饨", [], "麸质/小麦", true],
  ["麸质/小麦", "白馒头", [], "麸质/小麦", true],
  ["麸质/小麦", "叉烧包子", [], "麸质/小麦", true],
  ["麸质/小麦", "奶黄包", [], "麸质/小麦", true],
  ["麸质/小麦", "葱油饼", [], "麸质/小麦", true],
  ["麸质/小麦", "芝麻烧饼", [], "麸质/小麦", true],
  ["麸质/小麦", "葡式蛋挞", [], "麸质/小麦", true],
  ["麸质/小麦", "黄油可颂", [], "麸质/小麦", true],
  ["麸质/小麦", "肉夹馍", [], "麸质/小麦", true],
  ["麸质/小麦", "苏打饼干", [], "麸质/小麦", true],
  ["麸质/小麦", "小笼包", [], "麸质/小麦", true],
  ["麸质/小麦", "生煎包", [], "麸质/小麦", true],
  ["麸质/小麦", "玛格丽特披萨", [], "麸质/小麦", true],
  ["麸质/小麦", "罗勒意面", [], "麸质/小麦", true],
  ["麸质/小麦", "香煎面筋", [], "麸质/小麦", true],
  ["麸质/小麦", "鲜虾烧麦", [], "麸质/小麦", true],
  ["麸质/小麦", "香脆油条", [], "麸质/小麦", true],
  ["麸质/小麦", "酱油炒饭", [], "麸质/小麦", true],
  ["麸质/小麦", "蔬菜意面", ["pasta"], "麸质/小麦", true],
  ["麸质/小麦", "鸡肉沙拉", ["noodle"], "麸质/小麦", true],
  ["麸质/小麦", "烤蔬菜", ["bread"], "麸质/小麦", true],
  ["麸质/小麦", "海鲜拼盘", ["flour"], "麸质/小麦", true],
  ["麸质/小麦", "香煎鳕鱼", ["soy sauce"], "麸质/小麦", true],
  ["麸质/小麦", "脆皮鸡", ["面饼"], "麸质/小麦", true],
  ["麸质/小麦", "蔬菜汤", ["gluten"], "麸质/小麦", true],
  ["麸质/小麦", "烤土豆", ["wheat"], "麸质/小麦", true],
  ["麸质/小麦", "海鲜炒饭", ["pizza"], "麸质/小麦", true],
  ["乳制品", "燕麦拿铁", [], "乳制品", true],
  ["乳制品", "卡布奇诺", [], "乳制品", true],
  ["乳制品", "草莓酸奶", [], "乳制品", true],
  ["乳制品", "香蕉奶昔", [], "乳制品", true],
  ["乳制品", "珍珠奶茶", [], "乳制品", true],
  ["乳制品", "香草冰淇淋", [], "乳制品", true],
  ["乳制品", "芝士蛋糕", [], "乳制品", true],
  ["乳制品", "奶酪三明治", [], "乳制品", true],
  ["乳制品", "番茄浓汤", ["cream"], "乳制品", true],
  ["乳制品", "烤面包", ["cheese"], "乳制品", true],
  ["乳制品", "西式煎饼", ["butter"], "乳制品", true],
  ["乳制品", "水果杯", ["yogurt"], "乳制品", true],
  ["乳制品", "咖啡", ["latte"], "乳制品", true],
  ["乳制品", "水果麦片", ["milk"], "乳制品", true],
  ["乳制品", "烤蔬菜", ["dairy"], "乳制品", true],
  ["乳制品", "蛋白饮品", ["casein"], "乳制品", true],
  ["乳制品", "水果布丁", ["condensed milk"], "乳制品", true],
  ["乳制品", "提拉米苏", ["mascarpone"], "乳制品", true],
  ["乳制品", "焗通心粉", ["ricotta"], "乳制品", true],
  ["海鲜", "清蒸文蛤", [], "海鲜", true],
  ["海鲜", "清炒蛤", [], "海鲜", true],
  ["海鲜", "爆炒蛤蜊", [], "海鲜", true],
  ["海鲜", "香辣田螺", [], "海鲜", true],
  ["海鲜", "蒜蓉海螺", [], "海鲜", true],
  ["海鲜", "香煎扇贝", [], "海鲜", true],
  ["海鲜", "炭烤章鱼", [], "海鲜", true],
  ["海鲜", "海胆蒸蛋", [], "海鲜", true],
  ["海鲜", "酸辣汤", ["鱼露"], "海鲜", true],
  ["海鲜", "泰式炒饭", ["虾酱"], "海鲜", true],
  ["海鲜", "炒青菜", ["shrimp"], "海鲜", true],
  ["海鲜", "烤鸡", ["prawn"], "海鲜", true],
  ["海鲜", "咖喱饭", ["crab"], "海鲜", true],
  ["海鲜", "蔬菜汤", ["fish"], "海鲜", true],
  ["海鲜", "烤饭团", ["salmon"], "海鲜", true],
  ["海鲜", "炒面", ["squid"], "海鲜", true],
  ["海鲜", "海鲜焗饭", ["oyster"], "海鲜", true],
  ["海鲜", "烤蔬菜", ["lobster"], "海鲜", true],
  ["海鲜", "蒜蓉鲍鱼", [], "海鲜", true],
  ["海鲜", "鱼丸汤", [], "海鲜", true],
  ["海鲜", "鱼子寿司", [], "海鲜", true],
  ["海鲜", "鱼糜", [], "海鲜", true],
  ["海鲜", "蚝油生菜", [], "海鲜", true],
  ["海鲜", "蟹棒沙拉", [], "海鲜", true],
  ["海鲜", "蔬菜汤", ["fish cake"], "海鲜", true],
  ["海鲜", "寿司拼盘", ["fish roe"], "海鲜", true],
  ["海鲜", "海鲜炒饭", [], "海鲜", true],
  ["海鲜", "海鲜意面", [], "海鲜", true],
  ["海鲜", "墨鱼仔", [], "海鲜", true],
  ["海鲜", "海参汤", [], "海鲜", true],
  ["海鲜", "鱼片粥", [], "海鲜", true],
  ["海鲜", "烤三文鱼", [], "海鲜", true],
  ["鸡蛋", "蔬菜沙拉", ["mayonnaise"], "鸡蛋", true],
  ["鸡蛋", "火腿三明治", ["mayo"], "鸡蛋", true],
  ["花生", "香辣拌面", ["花生酱"], "花生", true],
  ["花生", "凉拌菠菜", ["花生油"], "花生", true],
  ["花生", "酸奶水果杯", ["花生碎"], "花生", true],
  ["花生", "热带风味沙拉", ["peanut"], "花生", true],
  ["花生", "咖喱串烧", ["satay"], "花生", true],
  ["鸡蛋", "番茄炒饭", ["egg"], "鸡蛋", true],
  ["鸡蛋", "西式早餐", ["eggs"], "鸡蛋", true],
  ["海鲜", "鱼香茄子", [], "海鲜", false],
  ["海鲜", "魚香茄子", [], "海鲜", false],
  ["鸡肉", "番茄炒鸡蛋", [], "鸡肉", false],
  ["鸡肉", "番茄炒雞蛋", [], "鸡肉", false],
  ["乳制品", "椰浆咖喱", [], "乳制品", false],
  ["乳制品", "椰奶咖啡", [], "乳制品", false],
  ["乳制品", "椰漿咖喱", [], "乳制品", false],
  ["牛肉", "干锅牛蛙", [], "牛肉", false],
  ["麸质/小麦", "米饭", [], "麸质/小麦", false],
  ["猪肉", "紅燒肉", [], "猪肉", true],
  ["鸡肉", "香辣雞翅", [], "鸡肉", true],
  ["麸质/小麦", "牛腩麵", [], "麸质/小麦", true],
  ["海鲜", "鮮蝦餃子", [], "海鲜", true],
  ["麸质/小麦", "瑪格麗特披薩", [], "麸质/小麦", true],
  ["鸡蛋", "三明治", ["蛋黃醬"], "鸡蛋", true],
  ["乳制品", "卡布奇諾", [], "乳制品", true],
  ["花生", "涼拌菜", ["花生醬"], "花生", true],
  ["猪肉", "東坡肉", [], "猪肉", true],
  ["猪肉", "回鍋肉", [], "猪肉", true],
  ["猪肉", "紅燒獅子頭", [], "猪肉", true],
  ["猪肉", "香煎裡脊", [], "猪肉", true],
  ["猪肉", "梅菜扣肉", [], "猪肉", true],
  ["牛肉", "紅燒牛雜", [], "牛肉", true],
  ["鸡肉", "宮保雞丁", [], "鸡肉", true],
  ["鸡肉", "滷雞腿", [], "鸡肉", true],
  ["鸡肉", "香煎雞胸", [], "鸡肉", true],
  ["鸡肉", "炸雞塊", [], "鸡肉", true],
  ["鸡肉", "白切雞", [], "鸡肉", true],
  ["麸质/小麦", "牛肉拌麵", [], "麸质/小麦", true],
  ["麸质/小麦", "手工饅頭", [], "麸质/小麦", true],
  ["麸质/小麦", "香煎麵餅", [], "麸质/小麦", true],
  ["麸质/小麦", "羅勒意麵", [], "麸质/小麦", true],
  ["麸质/小麦", "香煎麵筋", [], "麸质/小麦", true],
  ["麸质/小麦", "醬油炒飯", [], "麸质/小麦", true],
  ["麸质/小麦", "鮮蝦燒麥", [], "麸质/小麦", true],
  ["麸质/小麦", "香脆油條", [], "麸质/小麦", true],
  ["海鲜", "香煎扇貝", [], "海鲜", true],
  ["海鲜", "海膽蒸蛋", [], "海鲜", true],
  ["海鲜", "酸辣湯", ["魚露"], "海鲜", true],
  ["海鲜", "泰式炒飯", ["蝦醬"], "海鲜", true],
  ["鸡蛋", "三明治", ["蛋黃醬"], "鸡蛋", true],
  ["花生", "涼麵", ["花生醬"], "花生", true],
];

const mood = "随心看看" as const;

function makeDish(id: string, name: string, ingredients: string[]): Dish {
  return DishSchema.parse({
    id,
    name,
    description: "",
    price: 20,
    currency: "¥",
    ingredients,
    ingredientsKnown: true,
    spicyLevel: "unknown",
    confidence: 1,
    verifiedByUser: false,
  });
}

function requestBody(dishes: Dish[], excludedIngredients: string[]) {
  return {
    dishes,
    profile: { ...profile, excludedIngredients },
    mood,
    context: "",
    refinement: "",
    rejectedDishIds: [],
    excludedDishIds: [],
  };
}

function recommendationRequest(body: unknown) {
  const serialized = JSON.stringify(body);
  return new Request("http://localhost/api/recommend", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(serialized).length),
    },
    body: serialized,
  });
}

function modelResponse(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fix2 independent real-menu exclusion coverage", () => {
  it.each(realMenuCases)("exclusion sample %s / %s has expected result", (name, dishName, ingredients, exclusion, shouldExclude) => {
    const dish = makeDish(`${name}-${dishName}`, dishName, ingredients);
    const candidates = rankDishes([dish], { ...profile, excludedIngredients: [exclusion] }, mood, "", "", [], []);
    expect(candidates.length === 0, `${dishName} + ${ingredients.join(",")}`).toBe(shouldExclude);
  });

  it("shows each exclusion category's expanded matching terms beside its preference label", () => {
    const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    expect(page).toContain("将同时排除：");
    expect(page).toContain("getExclusionAliases");
    expect(getExclusionAliases("猪肉")).toContain("红烧肉");
    expect(getExclusionAliases("wheat")).toContain("饺子皮");
  });

  it("blocks adding an additional favorite after the 50-item limit with visible feedback", () => {
    const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    expect(page).toContain("偏爱食材最多 50 项");
    expect(page).toContain("favoriteIngredients.length >= 50");
    const capIndex = page.indexOf("favoriteIngredients.length >= 50");
    const updateIndex = page.indexOf("update({ profile", capIndex);
    expect(capIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(capIndex);
  });
});

describe("fix2 model and upload regressions", () => {
  it("only sends verified-safe candidates to the model and rejects an unverified model pick", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelResponse(
      '{"dish_id":"unknown-ingredients","reason":"模型选择未知配料"}',
    )));
    const known = makeDish("verified-safe", "番茄饭", ["番茄"]);
    const unknown = DishSchema.parse({
      ...makeDish("unknown-ingredients", "主厨推荐", []),
      ingredientsKnown: false,
    });
    const response = await recommend(recommendationRequest(requestBody([unknown, known], ["花生"])));
    const result = await response.json();
    const sentBody = vi.mocked(fetch).mock.calls[0][1]?.body as string;
    expect(sentBody).toContain("verified-safe");
    expect(sentBody).not.toContain("unknown-ingredients");
    expect(result.recommendation.dish.id).toBe("verified-safe");
    expect(result.reason).toContain("安全切换");
  });

  it("fills the image canvas white before drawing transparent source images", async () => {
    const original = new File(["transparent"], "menu.png", { type: "image/png" });
    const bitmap = { width: 800, height: 600, close() {} } as ImageBitmap;
    const operations: string[] = [];
    let fillStyle = "";
    const context = {
      drawImage() { operations.push("draw"); },
      fillRect() { operations.push("fill"); },
      set fillStyle(value: string) { fillStyle = value; },
      get fillStyle() { return fillStyle; },
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob(callback: BlobCallback, type: string) {
        callback(new Blob(["jpeg"], { type }));
      },
    };
    vi.stubGlobal("document", { createElement: () => canvas });
    await compressImage(original, async () => bitmap);
    expect(fillStyle).toBe("#fff");
    expect(operations).toEqual(["fill", "draw"]);
  });

  it("keeps an OCR entry whose price property is missing and normalizes its price to null", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelResponse(JSON.stringify({
      items: [{
        id: "ignored",
        name: "价格未标注的菜",
        ingredients: [],
        ingredientsKnown: false,
        confidence: 0.9,
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
    expect(response.status).toBe(200);
    expect(result.menu.items).toHaveLength(1);
    expect(result.menu.items[0].price).toBeNull();
  });

  it("uses a placeholder rather than a concrete dish ID in the OCR prompt example", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelResponse('{"items":[]}')));
    const form = new FormData();
    form.append("photos", new File([new Uint8Array([0xff, 0xd8, 0xff])], "menu.jpg", { type: "image/jpeg" }));
    await recognize(new Request("http://localhost/api/menu", {
      method: "POST",
      headers: { "content-length": "500" },
      body: form,
    }));
    const sentBody = vi.mocked(fetch).mock.calls[0][1]?.body as string;
    expect(sentBody).not.toContain("dish-1");
    expect(sentBody).toContain("<generated-id>");
  });
});
