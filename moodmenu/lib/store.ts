"use client";

import { useCallback, useEffect, useState } from "react";
import { MenuSchema, ProfileSchema, type Dish, type Menu, type Profile } from "./schemas";

export type HistoryEntry = {
  id: string;
  dish: Dish;
  reason: string;
  mood: string;
  createdAt: string;
  feedback?: "liked" | "rejected";
};

export type AppState = {
  menu: Menu;
  profile: Profile;
  mood: string;
  context: string;
  refinement: string;
  rejectedDishIds: string[];
  history: HistoryEntry[];
};

const STORAGE_KEY = "moodmenu.v1";

const initialState: AppState = {
  menu: { items: [] },
  profile: {
    budget: null,
    currency: "¥",
    excludedIngredients: [],
    favoriteIngredients: [],
    dietaryNotes: "",
  },
  mood: "随心看看",
  context: "",
  refinement: "",
  rejectedDishIds: [],
  history: [],
};

export function parseStoredState(raw: string | null): AppState {
  try {
    const saved: unknown = JSON.parse(raw ?? "null");
    if (!saved || typeof saved !== "object") return initialState;
    const value = saved as Partial<AppState>;
    const menu = MenuSchema.safeParse(value.menu);
    const profile = ProfileSchema.safeParse(value.profile);
    if (!menu.success || !profile.success) return initialState;
    return {
      ...initialState,
      ...value,
      menu: menu.data,
      profile: profile.data,
      rejectedDishIds: Array.isArray(value.rejectedDishIds) ? value.rejectedDishIds.filter((id): id is string => typeof id === "string") : [],
      history: Array.isArray(value.history) ? value.history : [],
    };
  } catch {
    return initialState;
  }
}

function readSavedState(): AppState {
  if (typeof window === "undefined") return initialState;
  return parseStoredState(localStorage.getItem(STORAGE_KEY));
}

export function useMoodMenuStore() {
  const [state, setState] = useState<AppState>(initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(readSavedState());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  const update = useCallback((patch: Partial<AppState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  return { state, update, ready };
}
