"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { mergeMenuItems, recordDishFeedback, useMoodMenuStore, type HistoryEntry } from "@/lib/store";
import { DishSchema, type Dish, type Mood } from "@/lib/schemas";
import { createId } from "@/lib/ids";
import { compressImage } from "@/lib/image";
import { parseIngredientInput } from "@/lib/ingredients";
import { photoPickerProps } from "@/lib/photo-picker";

type View = "home" | "menu" | "preferences" | "context" | "recommendations" | "history";
type Candidate = { dish: Dish; score: number; reasons: string[] };
type Result = { recommendation: Candidate | null; candidates: Candidate[]; reason: string };

const nav: { id: View; label: string; icon: string }[] = [
  { id: "home", label: "首页", icon: "⌂" },
  { id: "menu", label: "我的菜单", icon: "▤" },
  { id: "preferences", label: "饮食偏好", icon: "♡" },
  { id: "context", label: "此刻情境", icon: "☼" },
  { id: "recommendations", label: "为我推荐", icon: "✳" },
  { id: "history", label: "点单记忆", icon: "◷" },
];

const demoMenu: Dish[] = [
  { id: "demo-noodle", name: "番茄鸡蛋面", description: "汤面", price: 26, currency: "¥", ingredients: ["番茄", "鸡蛋", "小麦"], ingredientsKnown: true, spicyLevel: "none", confidence: 1, verifiedByUser: true },
  { id: "demo-tofu", name: "香菇豆腐煲", description: "砂锅热菜", price: 32, currency: "¥", ingredients: ["豆腐", "香菇"], ingredientsKnown: true, spicyLevel: "mild", confidence: 1, verifiedByUser: true },
  { id: "demo-beef", name: "红烧牛肉饭", description: "米饭套餐", price: 42, currency: "¥", ingredients: ["牛肉", "米饭"], ingredientsKnown: true, spicyLevel: "none", confidence: 1, verifiedByUser: true },
  { id: "demo-salad", name: "田园蔬菜沙拉", description: "清爽时蔬", price: 29, currency: "¥", ingredients: ["生菜", "玉米"], ingredientsKnown: true, spicyLevel: "none", confidence: 1, verifiedByUser: true },
];

const moods: Mood[] = ["想吃点暖的", "清爽轻盈", "犒劳自己", "快速填饱", "随心看看"];

function formatPrice(dish: Dish) {
  return dish.price === null ? "价格未知" : `${dish.currency}${dish.price}`;
}

function AppShell() {
  const { state, update, ready } = useMoodMenuStore();
  const [view, setView] = useState<View>("home");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [excludedInput, setExcludedInput] = useState("");
  const [favoriteInput, setFavoriteInput] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [ingredientDrafts, setIngredientDrafts] = useState<Record<string, string>>({});
  const photoInput = useRef<HTMLInputElement>(null);
  const current = result?.recommendation?.dish;

  async function recognizePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    let compressionFailures = 0;
    setPhotoError("");
    if (!files.length) return;
    if (files.length > 5) {
      setPhotoError("一次最多上传 5 张菜单照片。");
      event.target.value = "";
      return;
    }
    if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setPhotoError("仅支持 JPG、PNG 或 WebP 图片。");
      event.target.value = "";
      return;
    }
    setBusy(true);
    try {
      const prepared = await Promise.all(files.map((file) => compressImage(file)));
      compressionFailures = prepared.filter(({ failed }) => failed).length;
      const uploadFiles = prepared.map(({ file }) => file);
      if (uploadFiles.some((file) => file.size > 5 * 1024 * 1024)
        || uploadFiles.reduce((sum, file) => sum + file.size, 0) > 10 * 1024 * 1024) {
        throw new Error("压缩后的照片仍超过限制（单张 5 MB，合计 10 MB）。");
      }
      const formData = new FormData();
      uploadFiles.forEach((file) => formData.append("photos", file));
      const response = await fetch("/api/menu", { method: "POST", body: formData });
      const payload = await response.json() as { menu?: { items?: Dish[] }; error?: string; omittedUnclear?: number; discardedCount?: number };
      if (!response.ok) throw new Error(payload.error ?? "菜单识别失败。");
      const parsed = DishSchema.array().safeParse(payload.menu?.items);
      if (!parsed.success) throw new Error("识别结果格式不正确。");
      update({ menu: { items: mergeMenuItems(state.menu.items, parsed.data) } });
      setNotice(parsed.data.length === 0
        ? `没有清晰到足以确认的菜品文字，模糊内容未加入菜单。请重拍或手动录入。${compressionFailures ? " 部分照片压缩失败，已回退原图。" : ""}`
        : `已读取 ${parsed.data.length} 道清晰菜单文字${payload.omittedUnclear ? `，另有 ${payload.omittedUnclear} 项模糊内容未加入` : ""}${payload.discardedCount ? `，${payload.discardedCount} 项格式不完整已丢弃` : ""}；请逐项核对后再使用。${compressionFailures ? " 部分照片压缩失败，已回退原图。" : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "菜单识别失败。";
      setPhotoError(`${message}${compressionFailures ? " 部分照片压缩失败，已回退原图。" : ""}`);
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function getRecommendation(excludedDishIds: string[] = []) {
    setBusy(true);
    setView("recommendations");
    setNotice("");
    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dishes: state.menu.items,
          profile: state.profile,
          mood: state.mood,
          context: state.context,
          refinement: state.refinement,
          rejectedDishIds: state.rejectedDishIds,
          excludedDishIds,
        }),
      });
      const payload = await response.json() as Result | { error: string };
      if (!response.ok || !("recommendation" in payload)) throw new Error("error" in payload ? payload.error : "推荐暂时不可用。");
      const next = payload as Result;
      setResult(next);
      if (next.recommendation) {
        const entry: HistoryEntry = {
          id: `${Date.now()}-${next.recommendation.dish.id}`,
          dish: next.recommendation.dish,
          reason: next.recommendation.reasons.join("；"),
          mood: state.mood,
          createdAt: new Date().toISOString(),
        };
        update({ history: [entry, ...state.history].slice(0, 100) });
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "推荐暂时不可用。");
    } finally {
      setBusy(false);
    }
  }

  function chooseCandidate(candidate: Candidate) {
    const entry: HistoryEntry = {
      id: `${Date.now()}-${candidate.dish.id}`,
      dish: candidate.dish,
      reason: candidate.reasons.join("；"),
      mood: state.mood,
      createdAt: new Date().toISOString(),
    };
    setResult((previous) => previous ? { ...previous, recommendation: candidate, reason: "从已过滤的安全候选中切换。" } : previous);
    update({ history: [entry, ...state.history].slice(0, 100) });
  }

  function recordFeedback(feedback: "liked" | "rejected") {
    if (!current) return;
    const updatedState = recordDishFeedback(state, current, feedback);
    if (feedback === "rejected") {
      update(updatedState);
      void getRecommendation([current.id]);
      return;
    }
    update(updatedState);
    setNotice("已记录这份喜欢。");
  }

  function updateDish(id: string, patch: Partial<Dish>) {
    update({ menu: { items: state.menu.items.map((dish) => dish.id === id ? { ...dish, ...patch, verifiedByUser: true } : dish) } });
  }

  function commitIngredients(dish: Dish, value: string) {
    updateDish(dish.id, {
      ingredients: parseIngredientInput(value),
      ingredientsKnown: parseIngredientInput(value).length > 0,
    });
    setIngredientDrafts((drafts) => {
      const next = { ...drafts };
      delete next[dish.id];
      return next;
    });
  }

  function addManualDish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = manualName.trim();
    if (!name) return;
    const parsedPrice = manualPrice.trim() ? Number(manualPrice) : null;
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setNotice("价格需为 0 或更大的数字，未知时请留空。");
      return;
    }
    const dish: Dish = {
      id: createId("manual"),
      name,
      description: "",
      price: parsedPrice,
      currency: state.profile.currency,
      ingredients: [],
      ingredientsKnown: false,
      spicyLevel: "unknown",
      confidence: 1,
      verifiedByUser: true,
    };
    update({ menu: { items: [...state.menu.items, dish] } });
    setManualName("");
    setManualPrice("");
    setNotice("已加入手动录入的菜品；未提供的信息仍保持未知。");
  }

  function addListValue(key: "excludedIngredients" | "favoriteIngredients", value: string, clear: () => void) {
    const item = value.trim();
    if (!item) return;
    update({ profile: { ...state.profile, [key]: [...new Set([...state.profile[key], item])] } });
    clear();
  }

  if (!ready) return <div className="loading-screen">正在打开你的菜单…</div>;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("home")} aria-label="回到首页">
          <span className="brand-mark">m.</span><span>MoodMenu<small>一餐一心情</small></span>
        </button>
        <div className="nav-label">你的空间</div>
        <nav className="side-nav">
          {nav.map((item) => <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)}>
            <span className="nav-icon">{item.icon}</span>{item.label}{item.id === "menu" && state.menu.items.length > 0 && <span className="nav-count">{state.menu.items.length}</span>}
          </button>)}
        </nav>
        <div className="sidebar-note"><span>✦</span><p>从真实菜单出发，<br />只推荐你能确认的。</p><small>你的数据只保存在本机浏览器</small></div>
        <div className="sidebar-footer">M O O D M E N U <span>✳</span> 2026</div>
      </aside>

      <section className="main-column">
        <header className="topbar"><span className="today-label">YOUR LITTLE FOOD COMPANION</span><span className="local-badge"><i /> 本机记忆已开启</span></header>
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}
        {view === "home" && state.recoveryNotice && <div className="notice storage-notice" role="status">{state.recoveryNotice}</div>}

        {view === "home" && <div className="page home-page">
          <div className="hero">
            <div className="hero-copy"><span className="eyebrow">给此刻的你，一点好胃口</span><h1>今天的心情，<br /><em>想吃点什么？</em></h1>
              <p>从你手边的真实菜单开始。告诉我你的偏好，让这一餐更合心意。</p>
              <button className="primary-button" onClick={() => setView("menu")}>添加一份菜单 <span>↗</span></button>
              <div className="hero-footnote"><span>01</span> 拍下菜单　·　告诉我心情　·　找到心头好</div>
            </div>
            <div className="hero-art" aria-hidden="true"><div className="sun-disc" /><div className="plate"><div className="food"><i /><i /><i /><i /><i /></div></div><div className="leaf leaf-one" /><div className="leaf leaf-two" /><span className="art-note">慢慢吃<br />刚刚好</span></div>
            <div className="hero-index">THE DAILY<br />MENU <b>✳</b></div>
          </div>

          <div className="section-heading"><div><span className="eyebrow">THE FIRST LITTLE STEP</span><h2>先告诉我一点点</h2></div><span className="section-count">01 — 03</span></div>
          <div className="quick-grid">
            <button className="quick-card" onClick={() => setView("menu")}><span className="quick-icon peach">▤</span><span className="quick-copy"><b>添加你的菜单</b><small>{state.menu.items.length ? `${state.menu.items.length} 道菜已准备好` : "拍照识别，或手动录入"}</small></span><span className="arrow">↗</span></button>
            <button className="quick-card" onClick={() => setView("preferences")}><span className="quick-icon sage">♡</span><span className="quick-copy"><b>设定饮食偏好</b><small>{state.profile.excludedIngredients.length ? `${state.profile.excludedIngredients.length} 项避开` : "忌口、预算、喜欢的食材"}</small></span><span className="arrow">↗</span></button>
            <button className="quick-card" onClick={() => setView("context")}><span className="quick-icon lavender">☼</span><span className="quick-copy"><b>说说现在的心情</b><small>{state.mood} · 随时可以改变</small></span><span className="arrow">↗</span></button>
          </div>
          <div className="home-bottom"><div><span className="eyebrow">A GENTLE REMINDER</span><p>过敏原信息不完整时，请直接向餐厅确认。<br />识别和推荐都不是食品安全保证。</p></div><span className="flower-mark">✳</span></div>
        </div>}

        {view === "menu" && <div className="page">
          <div className="page-title"><span className="eyebrow">YOUR REAL MENU</span><h1>把菜单，交给我看看</h1><p>拍摄餐厅菜单，识别后可逐项校对、修改或删除。模糊的内容不会被猜出来。</p></div>
          <section className="upload-card">
            <input ref={photoInput} className="visually-hidden" type="file" {...photoPickerProps} onChange={recognizePhotos} />
            <span className="upload-icon">↑</span><h2>{busy ? "正在读取菜单…" : "拍照或上传菜单照片"}</h2><p>支持 JPG、PNG、WebP · 最多 5 张 · 单张 ≤ 5 MB</p>
            <button className="primary-button" disabled={busy} onClick={() => photoInput.current?.click()}>{busy ? "请稍等" : "选择照片"} <span>↗</span></button>
            {photoError && <p className="inline-error" role="alert">{photoError}</p>}
            <div className="privacy-caption">照片仅用于这次识别，不会作为公共示例菜单展示。</div>
          </section>
          <div className="manual-row"><div><span className="eyebrow">OR ADD IT YOURSELF</span><h2>手动录入一道菜</h2></div>
            <form className="manual-form" onSubmit={addManualDish}><input aria-label="菜名" placeholder="菜名" value={manualName} onChange={(e) => setManualName(e.target.value)} maxLength={120} required /><input aria-label="价格" placeholder="价格（可留空）" type="number" min="0" step="0.01" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} /><button className="outline-button" type="submit">＋ 添加</button></form>
          </div>
          <div className="demo-banner"><div><span className="eyebrow">SEPARATE SAMPLE MENU</span><b>只想先试试？使用独立示例菜单</b><small>演示菜品全部明确标记为示例，绝非照片识别结果。</small></div><button className="outline-button" onClick={() => { update({ menu: { items: demoMenu } }); setNotice("已载入独立的示例菜单，不是照片识别结果。"); }}>载入示例菜单 ↗</button></div>
          <section className="menu-list-section"><div className="section-heading"><div><span className="eyebrow">CHECK BEFORE YOU CHOOSE</span><h2>菜单上的菜 <span className="count-pill">{state.menu.items.length}</span></h2></div>{state.menu.items.length > 0 && <button className="text-button" onClick={() => { update({ menu: { items: [] } }); setResult(null); }}>清空菜单</button>}</div>
            {state.menu.items.length === 0 ? <div className="empty-card"><span>▤</span><b>你的菜单还空空的</b><small>上传照片、手动录入，或选择上方的独立示例菜单。</small></div> : <div className="dish-table">
              <div className="table-head"><span>菜品 / 核对信息</span><span>价格</span><span>操作</span></div>
              {state.menu.items.map((dish) => <div className="dish-row" key={dish.id}><div className="dish-name-cell"><input aria-label="菜名" value={dish.name} onChange={(e) => updateDish(dish.id, { name: e.target.value })} maxLength={120} /><small>{dish.ingredientsKnown ? `食材：${dish.ingredients.join("、") || "待核对"}` : "食材未知 · 请向餐厅确认"}{dish.confidence < 0.75 ? " · 识别信心较低，请核对" : ""}</small><div className="ingredient-edit"><input aria-label="食材列表" value={ingredientDrafts[dish.id] ?? dish.ingredients.join(", ")} onChange={(e) => setIngredientDrafts((drafts) => ({ ...drafts, [dish.id]: e.target.value }))} onBlur={(e) => commitIngredients(dish, e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitIngredients(dish, e.currentTarget.value); } }} placeholder="补充食材（逗号分隔，未知留空）" /><select aria-label="辣度" value={dish.spicyLevel} onChange={(e) => updateDish(dish.id, { spicyLevel: e.target.value as Dish["spicyLevel"] })}><option value="unknown">辣度未知</option><option value="none">不辣</option><option value="mild">微辣</option><option value="medium">中辣</option><option value="hot">很辣</option></select></div></div><div><input className="price-input" aria-label="菜品价格" type="number" min="0" step="0.01" placeholder="未知" value={dish.price ?? ""} onChange={(e) => updateDish(dish.id, { price: e.target.value ? Number(e.target.value) : null })} /></div><button className="delete-button" aria-label={`删除${dish.name}`} onClick={() => update({ menu: { items: state.menu.items.filter((item) => item.id !== dish.id) } })}>删除</button></div>)}
            </div>}
            {state.menu.items.length > 0 && <div className="safety-note">⚠ 菜单文字和配料可能有遗漏。请人工核实；这不是过敏原安全保证。</div>}
          </section>
        </div>}

        {view === "preferences" && <div className="page">
          <div className="page-title"><span className="eyebrow">A LITTLE MORE ABOUT YOU</span><h1>让喜欢和忌口，<br />都有被听见的地方</h1><p>这些偏好只保存在你的设备上，也会在每次推荐前硬性过滤。</p></div>
          <section className="form-card"><label className="field-label" htmlFor="budget">每餐预算上限</label><p className="field-hint">开启后，只有明确标注价格且不超预算的菜品会进入推荐。</p><div className="budget-row"><select value={state.profile.currency} aria-label="货币单位" onChange={(e) => update({ profile: { ...state.profile, currency: e.target.value } })}><option>¥</option><option>$</option><option>€</option><option>元</option></select><input id="budget" type="number" min="0" step="1" placeholder="不设预算" value={state.profile.budget ?? ""} onChange={(e) => update({ profile: { ...state.profile, budget: e.target.value ? Number(e.target.value) : null } })} /><span>每餐</span></div>
            <div className="field-divider" /><label className="field-label">需要避开的食材</label><p className="field-hint">只有菜单里明确标注的食材能用于过滤，未注明的配料无法保证。</p><div className="token-form"><input value={excludedInput} onChange={(e) => setExcludedInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addListValue("excludedIngredients", excludedInput, () => setExcludedInput("")); } }} placeholder="输入食材，例如：花生" /><button className="outline-button" onClick={() => addListValue("excludedIngredients", excludedInput, () => setExcludedInput(""))}>＋ 添加</button></div><div className="token-list">{state.profile.excludedIngredients.map((item) => <button className="token danger-token" key={item} onClick={() => update({ profile: { ...state.profile, excludedIngredients: state.profile.excludedIngredients.filter((v) => v !== item) } })}>{item} <span>×</span></button>)}</div>
            <div className="field-divider" /><label className="field-label">喜欢的食材</label><div className="token-form"><input value={favoriteInput} onChange={(e) => setFavoriteInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addListValue("favoriteIngredients", favoriteInput, () => setFavoriteInput("")); } }} placeholder="输入喜欢的食材，例如：番茄" /><button className="outline-button" onClick={() => addListValue("favoriteIngredients", favoriteInput, () => setFavoriteInput(""))}>＋ 添加</button></div><div className="token-list">{state.profile.favoriteIngredients.map((item) => <button className="token" key={item} onClick={() => update({ profile: { ...state.profile, favoriteIngredients: state.profile.favoriteIngredients.filter((v) => v !== item) } })}>{item} <span>×</span></button>)}</div>
            <div className="field-divider" /><label className="field-label" htmlFor="diet-notes">其他饮食习惯</label><textarea id="diet-notes" className="notes-area" maxLength={500} placeholder="例如：今天想吃清淡一点（只作为参考，不会替代硬性忌口）" value={state.profile.dietaryNotes} onChange={(e) => update({ profile: { ...state.profile, dietaryNotes: e.target.value } })} /><div className="safety-note">对严重过敏、交叉接触或无法明确确认的配料，请直接联系餐厅。我们不会声称任何一道菜一定安全。</div>
          </section>
        </div>}

        {view === "context" && <div className="page">
          <div className="page-title"><span className="eyebrow">HOW ARE YOU, REALLY?</span><h1>说说此刻，<br /><em>是什么心情</em></h1><p>心情和小小的当下情境可以改变偏好，但不会覆盖你的饮食限制。</p></div>
          <section className="form-card mood-card"><span className="field-label">此刻最想要的感觉</span><div className="mood-options">{moods.map((mood, index) => <button key={mood} className={state.mood === mood ? "mood-option selected" : "mood-option"} onClick={() => update({ mood })}><span>{["♨", "❋", "✧", "◷", "♡"][index]}</span>{mood}{state.mood === mood && <i>✓</i>}</button>)}</div>
            <div className="field-divider" /><label className="field-label" htmlFor="context-note">补充一点情境（选填）</label><p className="field-hint">只会作为温和的排序参考，不会变成硬性健康或安全判断。</p><textarea id="context-note" className="notes-area" maxLength={240} placeholder="比如：下雨了，想吃热乎的；午休时间比较短…" value={state.context} onChange={(e) => update({ context: e.target.value })} /><div className="context-tip"><span>✳</span><p>天气只是可选参考。天气服务失效时，推荐仍会照常进行。</p></div>
          </section>
          <button className="primary-button page-cta" onClick={() => void getRecommendation()}>按此刻的心情推荐 <span>↗</span></button>
        </div>}

        {view === "recommendations" && <div className="page">
          <div className="page-title"><span className="eyebrow">MADE FOR THIS MOMENT</span><h1>今天，为你挑一道</h1><p>心情：{state.mood}{state.context ? ` · ${state.context}` : ""}　<span className="dot-divider">/</span>　硬性限制优先于所有偏好</p></div>
          {busy && <div className="empty-card loading-card"><span>✳</span><b>正在认真挑选…</b><small>先过滤硬性限制，再从真实候选中排序。</small></div>}
          {!busy && result?.recommendation && <section className="recommendation-card"><div className="rec-kicker"><span>✳ 今日这份心意</span><span>来自你的真实菜单</span></div><h2>{result.recommendation.dish.name}</h2><div className="rec-price">{formatPrice(result.recommendation.dish)}</div><p className="rec-reason">{result.recommendation.reasons.join(" · ")}</p><div className="rec-tags"><span>{state.mood}</span>{result.recommendation.dish.spicyLevel === "unknown" && <span>辣度未知</span>}{!result.recommendation.dish.ingredientsKnown && <span>配料未知</span>}</div><div className="allergen-warning"><b>关于过敏原</b><p>菜单可能没有列出全部配料或交叉接触信息。请向餐厅确认；此推荐不是安全保证。</p></div><div className="feedback-actions"><button className="primary-button" onClick={() => recordFeedback("liked")}>这道我喜欢 ♡</button><button className="outline-button" onClick={() => recordFeedback("rejected")}>换一道 ↗</button></div><p className="fallback-note">{result.reason}</p></section>}
          {!busy && result && !result.recommendation && <div className="empty-card"><span>☼</span><b>这次没有合适的候选</b><small>{result.reason}</small><button className="outline-button" onClick={() => setView("menu")}>核对菜单</button></div>}
          {!busy && !result && <div className="empty-card"><span>✳</span><b>还没有开始今天的挑选</b><small>准备好菜单和偏好后，我们再一起看看。</small><button className="primary-button" onClick={() => void getRecommendation()}>开始推荐 ↗</button></div>}
          {result?.candidates && result.candidates.length > 1 && <div className="other-candidates"><span className="eyebrow">ALSO ON YOUR MENU</span><div>{result.candidates.filter((candidate) => candidate.dish.id !== current?.id).slice(0, 4).map((candidate) => <button key={candidate.dish.id} onClick={() => chooseCandidate(candidate)}><span>{candidate.dish.name}</span><small>{formatPrice(candidate.dish)}</small></button>)}</div></div>}
          <section className="refine-card"><label htmlFor="refinement" className="field-label">还想微调一下？</label><p className="field-hint">说说你现在的口味。预算和忌口仍会优先保留。</p><div className="refine-row"><input id="refinement" value={state.refinement} maxLength={240} onChange={(e) => update({ refinement: e.target.value })} placeholder="比如：微辣就好，或想吃点热的" onKeyDown={(e) => { if (e.key === "Enter") void getRecommendation(); }} /><button className="outline-button" disabled={busy} onClick={() => void getRecommendation()}>重新挑选 ↗</button></div></section>
        </div>}

        {view === "history" && <div className="page">
          <div className="page-title"><span className="eyebrow">A LITTLE FOOD MEMORY</span><h1>每一餐，都是一点点了解</h1><p>浏览过的推荐和你的反馈都会留在本机，帮下一次的选择慢慢更合心意。</p></div>
          <section className="history-summary"><div><b>{state.history.length}</b><span>次推荐记录</span></div><div><b>{state.profile.favoriteIngredients.length}</b><span>份喜欢的食材</span></div><div><b>{state.rejectedDishIds.length}</b><span>已避开的菜品</span></div></section>
          {state.history.length === 0 ? <div className="empty-card"><span>◷</span><b>还没有点单记忆</b><small>获得第一份推荐后，记录会出现在这里。</small><button className="primary-button" onClick={() => setView("recommendations")}>去看看菜单 ↗</button></div> : <div className="history-list">{state.history.map((entry) => <article key={entry.id} className="history-item"><span className="history-date">{new Date(entry.createdAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}</span><div><b>{entry.dish.name}</b><small>{entry.mood} · {formatPrice(entry.dish)}</small><p>{entry.reason}</p></div><span className={`feedback-mark ${entry.feedback ?? ""}`}>{entry.feedback === "liked" ? "喜欢" : entry.feedback === "rejected" ? "不喜欢" : "已推荐"}</span></article>)}</div>}
          <button className="text-button clear-memory" onClick={() => { update({ history: [], rejectedDishIds: [] }); setResult(null); }}>清除本机记录与长期记忆</button>
        </div>}

        <footer className="page-footer"><span>用一点点心意，找到此刻的刚刚好。</span><span>过敏原请向餐厅确认 · 不作安全保证</span></footer>
      </section>
      <nav className="mobile-nav" aria-label="主导航">{nav.map((item) => <button key={item.id} className={view === item.id ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => setView(item.id)}><span>{item.icon}</span><small>{item.id === "preferences" ? "偏好" : item.id === "recommendations" ? "推荐" : item.id === "history" ? "记忆" : item.id === "context" ? "心情" : item.id === "menu" ? "菜单" : "首页"}</small></button>)}</nav>
    </main>
  );
}

export default function Home() {
  return <AppShell />;
}
