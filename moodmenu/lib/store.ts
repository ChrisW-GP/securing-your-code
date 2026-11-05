"use client";

import { useCallback, useEffect, useState } from "react";
import { createUniqueId } from "./ids";
import { HistoryEntrySchema, MenuSchema, MoodSchema, ProfileSchema, type Dish, type Menu, type Mood, type Profile } from "./schemas";
import type { HistoryEntry } from "./schemas";
import { parseIngredientInput } from "./ingredients";
import { z } from "zod";

export type AppState = {
  menu: Menu;
  profile: Profile;
  mood: Mood;
  context: string;
  refinement: string;
  rejectedDishIds: string[];
  history: HistoryEntry[];
  recoveryNotice: string;
};

const STORAGE_KEY = "moodmenu.v1";
const ContextSchema = z.string().max(240);
const NotesSchema = z.string().max(500);
const CurrencySchema = z.string().max(8);
const BudgetSchema = z.number().positive().nullable();
const emptyProfile: Profile = {
  budget: null,
  currency: "¥",
  excludedIngredients: [],
  favoriteIngredients: [],
  dietaryNotes: "",
};

const initialState: AppState = {
  menu: { items: [] },
  profile: emptyProfile,
  mood: "随心看看",
  context: "",
  refinement: "",
  rejectedDishIds: [],
  history: [],
  recoveryNotice: "",
};

type StoragePort = Pick<Storage, "getItem" | "setItem">;

export function readStorageValue(storage: StoragePort, key: string): { value: string | null; notice: string } {
  try {
    return { value: storage.getItem(key), notice: "" };
  } catch {
    return { value: null, notice: "无法读取本机存储；已使用默认设置，请重新核对并保存忌口。" };
  }
}

export function writeStorageValue(storage: StoragePort, key: string, value: string): string {
  try {
    storage.setItem(key, value);
    return "";
  } catch {
    return "无法保存到本机存储；更改仅在当前页面暂时有效，请重新核对忌口。";
  }
}

export function serializeStoredState(state: AppState): string {
  const { rejectedDishIds: _sessionOnly, recoveryNotice: _transient, ...persisted } = state;
  return JSON.stringify(persisted);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function salvageIngredients(value: unknown, notices: string[], field: string): string[] {
  if (!Array.isArray(value)) {
    if (value !== undefined) notices.push(`${field}格式无效，未能恢复；请重新核对。`);
    return [];
  }
  const items = value.flatMap((item) => {
    const parsed = z.string().trim().min(1).max(80).safeParse(item);
    if (parsed.success) return [parsed.data];
    notices.push(`${field}中有无效项目已移除，请重新核对。`);
    return [];
  });
  if (items.length > 500) {
    notices.push(`${field}超过 500 项，仅恢复前 500 项；请重新核对遗漏的忌口。`);
    return items.slice(0, 500);
  }
  return [...new Set(items)];
}

export function parseStoredState(raw: string | null): AppState {
  const notices: string[] = [];
  try {
    const saved: unknown = JSON.parse(raw ?? "null");
    if (!isRecord(saved)) {
      if (raw !== null) notices.push("本机存档格式无效，已恢复默认设置；请重新核对忌口。");
      return { ...initialState, recoveryNotice: notices.join(" ") };
    }

    const menuItems: Dish[] = [];
    const usedIds = new Set<string>();
    const rawItems = isRecord(saved.menu) && Array.isArray(saved.menu.items) ? saved.menu.items : [];
    if (saved.menu !== undefined && rawItems.length === 0 && (!isRecord(saved.menu) || !Array.isArray(saved.menu.items))) {
      notices.push("菜单存档格式无效，无法恢复菜单。");
    }
    for (const rawItem of rawItems.slice(0, 200)) {
      const parsed = MenuSchema.shape.items.element.safeParse(rawItem);
      if (!parsed.success) {
        notices.push("有无效菜单项目已移除。");
        continue;
      }
      const dish = parsed.data;
      if (usedIds.has(dish.id)) {
        dish.id = createUniqueId("restored", usedIds);
        notices.push("重复菜品编号已修复。");
      } else {
        usedIds.add(dish.id);
      }
      menuItems.push(dish);
    }
    if (rawItems.length > 200) notices.push("菜单超过 200 项，仅恢复前 200 项。");

    const rawProfile = isRecord(saved.profile) ? saved.profile : {};
    if (saved.profile !== undefined && !isRecord(saved.profile)) notices.push("偏好存档格式无效，已恢复有效字段。");
    const budget = BudgetSchema.safeParse(rawProfile.budget ?? null);
    const currency = CurrencySchema.safeParse(rawProfile.currency ?? "¥");
    const excludedIngredients = salvageIngredients(rawProfile.excludedIngredients, notices, "忌口");
    const favorites = salvageIngredients(rawProfile.favoriteIngredients, notices, "偏爱食材");
    if (favorites.length > 50) {
      favorites.length = 50;
      notices.push("偏爱食材超过 50 项，已截取前 50 项。");
    }
    const dietaryNotes = NotesSchema.safeParse(rawProfile.dietaryNotes ?? "");
    if (!budget.success) notices.push("预算字段无效，已恢复为不设预算。");
    if (!currency.success) notices.push("货币字段无效，已恢复为默认值。");
    if (!dietaryNotes.success) notices.push("饮食备注字段无效，已恢复为空。");
    const profile: Profile = {
      budget: budget.success ? budget.data : null,
      currency: currency.success ? currency.data : "¥",
      excludedIngredients,
      favoriteIngredients: favorites,
      dietaryNotes: dietaryNotes.success ? dietaryNotes.data : "",
    };
    const checkedProfile = ProfileSchema.safeParse(profile);
    if (!checkedProfile.success) notices.push("部分偏好数据超出支持范围，请重新核对忌口。");

    const mood = MoodSchema.safeParse(saved.mood ?? initialState.mood);
    const context = ContextSchema.safeParse(saved.context ?? "");
    const refinement = ContextSchema.safeParse(saved.refinement ?? "");
    if (!mood.success) notices.push("心情字段无效，已恢复默认心情。");
    if (!context.success) notices.push("情境字段无效，已恢复为空。");
    if (!refinement.success) notices.push("微调字段无效，已恢复为空。");

    const history: HistoryEntry[] = [];
    if (saved.history !== undefined && !Array.isArray(saved.history)) {
      notices.push("历史记录格式无效，已恢复为空。");
    } else if (Array.isArray(saved.history)) {
      for (const entry of saved.history.slice(0, 100)) {
        const parsed = HistoryEntrySchema.safeParse(entry);
        if (parsed.success) history.push(parsed.data);
        else notices.push("无效历史记录已移除。");
      }
      if (saved.history.length > 100) notices.push("历史记录超过 100 条，仅恢复最近 100 条。");
    }

    return {
      menu: MenuSchema.safeParse({ items: menuItems }).success ? { items: menuItems } : initialState.menu,
      profile: checkedProfile.success ? checkedProfile.data : profile,
      mood: mood.success ? mood.data : initialState.mood,
      context: context.success ? context.data : "",
      refinement: refinement.success ? refinement.data : "",
      rejectedDishIds: [],
      history,
      recoveryNotice: [...new Set(notices)].join(" "),
    };
  } catch {
    return { ...initialState, recoveryNotice: "本机存档无法读取，已恢复默认设置；请重新核对忌口。" };
  }
}

export function mergeMenuItems(existing: Dish[], incoming: Dish[]): Dish[] {
  const ids = new Set<string>();
  return [...existing, ...incoming].map((dish) => {
    if (ids.has(dish.id)) {
      const replacement = { ...dish, id: createUniqueId("scan", ids) };
      return replacement;
    }
    ids.add(dish.id);
    return dish;
  });
}

export function recordDishFeedback(state: AppState, dish: Dish, feedback: "liked" | "rejected"): AppState {
  const history = state.history.map((entry) => entry.dish.id === dish.id && !entry.feedback
    ? { ...entry, feedback }
    : entry);
  if (feedback === "rejected") {
    return {
      ...state,
      history,
      rejectedDishIds: [...new Set([...state.rejectedDishIds, dish.id])],
    };
  }
  return { ...state, history };
}

function readSavedState(): AppState {
  try {
    const result = readStorageValue(window.localStorage, STORAGE_KEY);
    const state = parseStoredState(result.value);
    return { ...state, recoveryNotice: [state.recoveryNotice, result.notice].filter(Boolean).join(" ") };
  } catch {
    return { ...initialState, recoveryNotice: "无法访问本机存储；已使用默认设置，请重新核对并保存忌口。" };
  }
}

export function useMoodMenuStore() {
  const [state, setState] = useState<AppState>(initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(readSavedState());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let notice = "";
    try {
      notice = writeStorageValue(window.localStorage, STORAGE_KEY, serializeStoredState(state));
    } catch {
      notice = "无法访问本机存储；更改仅在当前页面暂时有效，请重新核对忌口。";
    }
    if (notice && !state.recoveryNotice.includes(notice)) {
      setState((current) => ({ ...current, recoveryNotice: [current.recoveryNotice, notice].filter(Boolean).join(" ") }));
    }
  }, [ready, state]);

  const update = useCallback((patch: Partial<AppState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  return { state, update, ready };
}

export { parseIngredientInput };
export type { HistoryEntry };
