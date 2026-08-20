# 🎨 BETIX — Design System & Branding Guidelines

> **Status note (added later)**: this document is the original, pre-build design plan. The design system that actually shipped (Phase 2, see [`phase2_synthesis.md`](./phase2_synthesis.md)) uses OKLCH color tokens and CSS variables defined in `globals.css` (`--color-safe`, `--color-value`, `--color-risky`, `--color-live`, etc.) rather than the raw Tailwind slate/blue palette and hex values below. Kept as a historical record of the original visual direction — for the actual current tokens, read `frontend/src/app/globals.css` directly.
>
> **Vision**: an immersive "Premium Dark" interface, inspired by high-frequency trading platforms and modern sports analytics dashboards. The goal is to inspire trust, speed, and expertise.

---

## 1. Visual Identity

### "Midnight Neon" Color Palette

A deep, dark base to reduce eye strain, contrasted with vibrant neon accents for data visualization.

#### 🌑 Surfaces (Backgrounds)
Deep grey levels (no pure black) for hierarchy.
- **Background Main**: `#0F172A` (Slate 900) — the app's main background.
- **Surface Card**: `#1E293B` (Slate 800) — card / bento item backgrounds.
- **Surface Overlay**: `#334155` (Slate 700) — modals, dropdowns.

#### ⚡ Brand Colors (Accents)
- **Primary (Betix Blue)**: `#3B82F6` (Blue 500) → primary action, links, logo.
- **Secondary (Deep Purple)**: `#6366F1` (Indigo 500) → gradients, premium features.

#### 📊 Semantic Colors (Data & Status)
- **Success / Win / Safe**: `#10B981` (Emerald 500) — win, safe prediction.
- **Warning / Draw / Medium**: `#F59E0B` (Amber 500) — draw, moderate risk.
- **Danger / Loss / Risky**: `#EF4444` (Red 500) — loss, high risk, error.

---

## 2. Typography

A single font family for maximum consistency and optimal number legibility.

**Font Family**: [Inter](https://fonts.google.com/specimen/Inter) (Google Fonts)
- **Weights**: 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold).
- **Numbers**: use `font-feature-settings: 'tnum'` (tabular numbers) to align scores and stats.

### Type Scale
- **H1 (Page Title)**: `text-3xl` / Bold / Tracking-tight
- **H2 (Section Title)**: `text-xl` / SemiBold
- **H3 (Card Title)**: `text-lg` / Medium
- **Body**: `text-sm` / Regular / Slate-400
- **Data/Score**: `text-2xl` / Bold / Tracking-widest

---

## 3. UI / UX Principles

### 🍱 Bento Grid Layout
The dashboard interface will be organized as a **modular (bento) grid**.
- Each piece of information (today's matches, stats, news) lives in a rectangular "cell".
- Allows high information density without clutter.
- Responsive by nature (blocks stack on mobile).

### 💎 Glassmorphism (Subtle)
Used for sticky headers, tooltips, and overlays.
- `backdrop-filter: blur(12px)`
- `bg-slate-900/80` (transparency)
- Subtle border: `border-white/10`

### 🔄 Micro-Interactions
- **Hover**: slight lift (`translate-y-[-2px]`) + glow (`ring-2 ring-primary/50`) on interactive cards.
- **Feedback**: ripple effect on buttons.

---

## 4. Component Library (Tailwind Classes)

### Buttons
- **Primary**: `bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg transition-all shadow-lg shadow-blue-500/20`
- **Secondary**: `bg-slate-700 hover:bg-slate-600 text-white font-medium px-4 py-2 rounded-lg transition-all`
- **Ghost**: `text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-2 rounded-lg transition-colors`

### Cards (Bento Item)
- **Base**: `bg-slate-800 rounded-xl border border-slate-700/50 p-5`
- **Interactive**: `hover:border-blue-500/50 hover:bg-slate-800/80 cursor-pointer transition-all`

### Badges / Tags
- **Safe**: `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider`
- **Risky**: `bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider`
- **Live**: `bg-red-600 text-white px-2 py-0.5 rounded text-xs font-bold animate-pulse`

---

## 5. Project Integration

### Files to modify
1. **`tailwind.config.ts`**: define the custom colors (`brand`, `surface`) and font family.
2. **`globals.css`**: import Inter, define the global body background.
3. **Components**: create `ui/Button.tsx`, `ui/Card.tsx`, `ui/Badge.tsx` applying these styles.
