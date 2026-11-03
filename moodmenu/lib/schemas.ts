import { z } from "zod";

export const DishSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).default(""),
  price: z.number().nonnegative().nullable(),
  currency: z.string().max(8).default("¥"),
  ingredients: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  ingredientsKnown: z.boolean().default(false),
  spicyLevel: z.enum(["none", "mild", "medium", "hot", "unknown"]).default("unknown"),
  confidence: z.number().min(0).max(1).default(0.5),
  verifiedByUser: z.boolean().default(false),
});

export const MenuSchema = z.object({
  items: z.array(DishSchema).max(200),
}).superRefine((menu, context) => {
  if (new Set(menu.items.map(({ id }) => id)).size !== menu.items.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "Dish IDs must be unique." });
  }
});

export const ProfileSchema = z.object({
  budget: z.number().positive().nullable(),
  currency: z.string().max(8),
  excludedIngredients: z.array(z.string().trim().min(1)).max(50),
  favoriteIngredients: z.array(z.string().trim().min(1)).max(50),
  dietaryNotes: z.string().max(500),
});

export const MoodSchema = z.enum(["想吃点暖的", "清爽轻盈", "犒劳自己", "快速填饱", "随心看看"]);

export const RecommendationRequestSchema = z.object({
  dishes: z.array(DishSchema).max(200),
  profile: ProfileSchema,
  mood: MoodSchema,
  context: z.string().max(240).default(""),
  refinement: z.string().max(240).default(""),
  rejectedDishIds: z.array(z.string().max(80)).max(200).default([]),
  excludedDishIds: z.array(z.string().max(80)).max(200).default([]),
}).superRefine((request, context) => {
  if (new Set(request.dishes.map(({ id }) => id)).size !== request.dishes.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dishes"], message: "Dish IDs must be unique." });
  }
});

export const PickSchema = z.object({
  dish_id: z.string().min(1).max(80),
  reason: z.string().min(1).max(300),
});

export type Dish = z.infer<typeof DishSchema>;
export type Menu = z.infer<typeof MenuSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type Mood = z.infer<typeof MoodSchema>;
export type RecommendationRequest = z.infer<typeof RecommendationRequestSchema>;
