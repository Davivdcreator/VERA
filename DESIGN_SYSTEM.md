# VERA — Design System Specification

**Product:** Infrastructure Intelligence command center for public administration.
**Tone:** Serious, calm, trustworthy, data-dense but uncluttered. A civic / emergency-operations console — not a consumer dashboard.
**Stack:** Vite 6 · React 18 · TypeScript · Tailwind v4 (`@tailwindcss/vite`) · `lucide-react` icons · `recharts` · OSM Buildings (2D + 3D maps).
**Theme:** Dark-first (sits behind maps and data viz). No light theme in scope.

This document is the single source of truth. Every value is exact. Implement with zero guesswork.

---

## 0. Design Principles (the lens)

1. **One accent, used sparingly.** Cyan-teal (`--color-accent`) is reserved for the single most important interactive/active element in any view. Status colors carry semantic meaning and are never used decoratively.
2. **Calm by default, loud only on signal.** Critical/offline red is the loudest thing on screen and appears only when something is actually critical. If everything glows, nothing reads.
3. **Surface elevation = information depth.** Background layers communicate hierarchy. Never stack two surfaces of the same elevation against each other without a border.
4. **Data is the hero.** Chrome recedes (low-contrast borders, muted labels); numbers and map content come forward (high-contrast text, mono figures).
5. **Generous internal rhythm, tight external density.** Cards breathe inside (16–20px padding); the grid between them is efficient (16–24px gaps).
6. **Numbers are monospaced and tabular.** All telemetry, KPIs, coordinates, counts, and timestamps use the mono stack with `font-variant-numeric: tabular-nums` so figures don't jitter when they update live.
7. **Motion is informational, never decorative.** 120–200ms ease for state; a slow 2s pulse only on the live indicator and critical states.

---

## 1. Typography

### 1.1 Font families

- **Primary (UI + display):** Avenir.
  Stack: `"Avenir Next", "Avenir", "Nunito Sans", ui-sans-serif, system-ui, sans-serif`
  Avenir/Avenir Next ship on macOS. For cross-platform parity load **Nunito Sans** (geometric humanist, closest free match to Avenir) from Google Fonts: weights 400/600/700/800.
  `<link rel="preconnect" href="https://fonts.googleapis.com">`
  `<link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">`
- **Monospace (data/telemetry/numerics):**
  Stack: `"JetBrains Mono", "SF Mono", "Roboto Mono", ui-monospace, "Cascadia Code", Menlo, monospace`
  Optional Google Fonts load of **JetBrains Mono** 400/500/700. Always pair with `font-variant-numeric: tabular-nums`.

### 1.2 Type scale

Base = 16px. Sizes in px. Weights map to Avenir Next / Nunito Sans (400 Regular, 600 SemiBold, 700 Bold, 800 ExtraBold).

| Token        | Use                                   | Size | Line-height   | Weight | Letter-spacing | Case      |
|--------------|---------------------------------------|------|---------------|--------|----------------|-----------|
| `display`    | Hero number / page-level metric       | 40px | 44px (1.1)    | 800    | -0.02em        | —         |
| `h1`         | Page title (top bar brand area)       | 28px | 34px (1.2)    | 700    | -0.01em        | —         |
| `h2`         | Panel / section title                 | 20px | 28px (1.4)    | 700    | -0.01em        | —         |
| `h3`         | Card title / sub-section              | 16px | 22px (1.375)  | 600    | 0              | —         |
| `body-lg`    | Emphasized body, lead paragraph       | 16px | 24px (1.5)    | 400    | 0              | —         |
| `body`       | Default UI text                       | 14px | 20px (1.43)   | 400    | 0              | —         |
| `caption`    | Secondary/meta text, table cells      | 13px | 18px (1.38)   | 400    | 0              | —         |
| `overline`   | Section labels, KPI labels, legends   | 11px | 14px (1.27)   | 700    | 0.08em         | UPPERCASE |
| `data-lg`    | KPI value (mono)                      | 32px | 36px (1.125)  | 700    | -0.01em        | tabular   |
| `data`       | Inline metric / table number (mono)   | 14px | 18px (1.29)   | 500    | 0              | tabular   |
| `data-sm`    | Coordinates, timestamps, telemetry    | 12px | 16px (1.33)   | 500    | 0              | tabular   |

**Rules**
- `overline` is the only uppercase style. Use it for every KPI label, legend label, and panel eyebrow.
- All `data*` tokens use the mono stack + `font-variant-numeric: tabular-nums`.
- Never go below 11px. Never use weight 400 on dark below 13px for primary content (contrast/legibility).
- Body copy max line length ~72ch.

---

## 2. Color Palette

All values are exact hex, tuned for a dark, map-backed console. Contrast ratios noted are against the stated surface.

### 2.1 Surfaces / canvas (3+ elevations)

| Token              | Hex       | Use                                                            |
|--------------------|-----------|---------------------------------------------------------------|
| `surface-0`        | `#070B14` | App canvas / behind everything (deepest). Body background.    |
| `surface-1`        | `#0D1320` | Default panel & card background (the working plane).          |
| `surface-2`        | `#131B2C` | Raised elements: table header, KPI card, popover, inputs.     |
| `surface-3`        | `#1B2538` | Highest: hover rows, active segmented item, tooltips, menus.  |
| `surface-overlay`  | `#0B1120E6`| Scrim over maps for chrome bars (90% alpha) — `rgba(11,17,32,.90)`. |

### 2.2 Borders / edges

| Token            | Hex / value       | Use                                              |
|------------------|-------------------|--------------------------------------------------|
| `border-subtle`  | `#1C2740`         | Hairline dividers, default card border.          |
| `border-default` | `#283655`         | Standard component border (inputs, buttons).     |
| `border-strong`  | `#3A4C72`         | Hover/emphasis border, focus base ring color.    |
| `border-accent`  | `#1FB6C9`         | Active/selected border (accent at full).         |

### 2.3 Text

| Token            | Hex       | On surface | Contrast | Use                                   |
|------------------|-----------|------------|----------|---------------------------------------|
| `text-primary`   | `#E8EEF7` | surface-1  | ~14.8:1  | Headings, primary values.             |
| `text-secondary` | `#A9B6CC` | surface-1  | ~8.2:1   | Body, labels.                         |
| `text-muted`     | `#6B7A96` | surface-1  | ~4.6:1   | Meta, captions, placeholder, disabled-adjacent. |
| `text-inverse`   | `#070B14` | accent/bright| ~AAA   | Text on accent/bright button fills.   |
| `text-disabled`  | `#46546F` | surface-1  | —        | Disabled labels only (not body text). |

> `text-muted` clears WCAG AA (4.5:1) for normal text on `surface-1`. Do not use it on `surface-2`/`surface-3` for body copy — step up to `text-secondary` there.

### 2.4 Brand + accent

| Token             | Hex       | Use                                                  |
|-------------------|-----------|------------------------------------------------------|
| `brand`           | `#2E7DF6` | VERA brand blue — wordmark, brand chrome, links.     |
| `brand-hover`     | `#4C92FF` | Brand hover state.                                   |
| `accent`          | `#22C7DB` | THE accent — primary action, active nav, live data, focus glow. Cyan-teal. |
| `accent-hover`    | `#3FD7E9` | Accent hover.                                        |
| `accent-pressed`  | `#16A6B8` | Accent active/pressed.                               |
| `accent-soft`     | `#22C7DB1F`| Accent tint fill (12% alpha) — selected backgrounds. |

> Brand blue and accent cyan are deliberately distinct: brand = identity/navigation chrome, accent = the live, actionable now. Don't blur the two.

### 2.5 Semantic — infrastructure state

The core domain vocabulary. Each has a solid color, a soft tint (for fills/badges), and a meaning. Tints are `<hex>` at 16% alpha.

| Token                 | Hex       | Soft (16%)    | Meaning                                  |
|-----------------------|-----------|---------------|------------------------------------------|
| `status-operational`  | `#2FBF71` | `#2FBF7129`   | Functioning, no action needed.           |
| `status-degraded`     | `#E0A33E` | `#E0A33E29`   | Partial capacity / at-risk / monitor.    |
| `status-offline`      | `#E5484D` | `#E5484D29`   | Offline / critical / repair-first.       |
| `status-unknown`      | `#7C8AA5` | `#7C8AA529`   | No data / stale / unverified.            |

> "Offline" and "critical/danger" share the same red intentionally — in this domain they are the same alarm. `status-degraded` and `warning` likewise share amber.

### 2.6 Semantic — feedback (info/success/warning/danger)

| Token        | Hex       | Soft (16%)    | Use                                  |
|--------------|-----------|---------------|--------------------------------------|
| `info`       | `#3B9EFF` | `#3B9EFF29`   | Neutral system messages, tips.       |
| `success`    | `#2FBF71` | `#2FBF7129`   | Confirmations (= operational green). |
| `warning`    | `#E0A33E` | `#E0A33E29`   | Cautions (= degraded amber).         |
| `danger`     | `#E5484D` | `#E5484D29`   | Errors, destructive (= offline red). |

### 2.7 Data-viz categorical palette (6 swatches)

Ordered for max perceptual separation on dark. Use in this order for series 1→6. All ≥3:1 against `surface-1`.

| # | Token        | Hex       |
|---|--------------|-----------|
| 1 | `viz-1`      | `#22C7DB` | (teal / accent family) |
| 2 | `viz-2`      | `#6E8BFF` | (indigo) |
| 3 | `viz-3`      | `#E0A33E` | (amber) |
| 4 | `viz-4`      | `#C77DFF` | (violet) |
| 5 | `viz-5`      | `#5FD08A` | (green) |
| 6 | `viz-6`      | `#FF8A6B` | (coral) |

### 2.8 Priority "heat" ramp (sequential, low → critical)

For prioritization choropleths / heat overlays / priority columns. 5 stops, perceptually increasing intensity.

| Stop | Token            | Hex       | Label     |
|------|------------------|-----------|-----------|
| 1    | `heat-1`         | `#1E3A5F` | Low       |
| 2    | `heat-2`         | `#2E6F8E` | Moderate  |
| 3    | `heat-3`         | `#E0A33E` | Elevated  |
| 4    | `heat-4`         | `#E2742F` | High      |
| 5    | `heat-5`         | `#E5484D` | Critical  |

> Cold blue → warm amber → red reads intuitively as "escalating priority." Use `heat-5` only for genuine critical; reserve its visual weight.

---

## 3. Tokens — Tailwind v4 `@theme`

Paste into `src/index.css` (replacing the placeholder body styles). Tailwind v4 generates utilities from these (`bg-surface-1`, `text-status-offline`, `rounded-card`, etc.).

```css
@import "tailwindcss";

@theme {
  /* ---- Fonts ---- */
  --font-sans: "Avenir Next", "Avenir", "Nunito Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", "Roboto Mono", ui-monospace, "Cascadia Code", Menlo, monospace;

  /* ---- Surfaces ---- */
  --color-surface-0: #070B14;
  --color-surface-1: #0D1320;
  --color-surface-2: #131B2C;
  --color-surface-3: #1B2538;
  --color-surface-overlay: rgba(11, 17, 32, 0.90);

  /* ---- Borders ---- */
  --color-border-subtle: #1C2740;
  --color-border-default: #283655;
  --color-border-strong: #3A4C72;
  --color-border-accent: #1FB6C9;

  /* ---- Text ---- */
  --color-text-primary: #E8EEF7;
  --color-text-secondary: #A9B6CC;
  --color-text-muted: #6B7A96;
  --color-text-inverse: #070B14;
  --color-text-disabled: #46546F;

  /* ---- Brand + accent ---- */
  --color-brand: #2E7DF6;
  --color-brand-hover: #4C92FF;
  --color-accent: #22C7DB;
  --color-accent-hover: #3FD7E9;
  --color-accent-pressed: #16A6B8;
  --color-accent-soft: rgba(34, 199, 219, 0.12);

  /* ---- Status: infrastructure state ---- */
  --color-status-operational: #2FBF71;
  --color-status-operational-soft: rgba(47, 191, 113, 0.16);
  --color-status-degraded: #E0A33E;
  --color-status-degraded-soft: rgba(224, 163, 62, 0.16);
  --color-status-offline: #E5484D;
  --color-status-offline-soft: rgba(229, 72, 77, 0.16);
  --color-status-unknown: #7C8AA5;
  --color-status-unknown-soft: rgba(124, 138, 165, 0.16);

  /* ---- Feedback ---- */
  --color-info: #3B9EFF;
  --color-info-soft: rgba(59, 158, 255, 0.16);
  --color-success: #2FBF71;
  --color-success-soft: rgba(47, 191, 113, 0.16);
  --color-warning: #E0A33E;
  --color-warning-soft: rgba(224, 163, 62, 0.16);
  --color-danger: #E5484D;
  --color-danger-soft: rgba(229, 72, 77, 0.16);

  /* ---- Data-viz categorical ---- */
  --color-viz-1: #22C7DB;
  --color-viz-2: #6E8BFF;
  --color-viz-3: #E0A33E;
  --color-viz-4: #C77DFF;
  --color-viz-5: #5FD08A;
  --color-viz-6: #FF8A6B;

  /* ---- Priority heat ramp ---- */
  --color-heat-1: #1E3A5F;
  --color-heat-2: #2E6F8E;
  --color-heat-3: #E0A33E;
  --color-heat-4: #E2742F;
  --color-heat-5: #E5484D;

  /* ---- Radii ---- */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;    /* default control radius (buttons, inputs, badges) */
  --radius-lg: 12px;   /* cards / panels */
  --radius-xl: 16px;   /* large feature panels, map chrome container */
  --radius-pill: 9999px;

  /* ---- Shadows / elevation ---- */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.40);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.45);
  --shadow-lg: 0 12px 32px rgba(0,0,0,0.55);
  --shadow-overlay: 0 8px 24px rgba(0,0,0,0.60);
  --shadow-focus: 0 0 0 3px rgba(34,199,219,0.35);
  --shadow-glow-accent: 0 0 16px rgba(34,199,219,0.30);
  --shadow-glow-critical: 0 0 16px rgba(229,72,77,0.35);
}

@layer base {
  html, body, #root { height: 100%; }
  body {
    margin: 0;
    background: var(--color-surface-0);
    color: var(--color-text-primary);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  /* tabular numerics everywhere a mono class is used */
  .tabular { font-variant-numeric: tabular-nums; }
}
```

### 3.1 Spacing scale (4px base)

Use Tailwind's default scale; these are the sanctioned steps for this product.

| Token | px  | Primary use                              |
|-------|-----|------------------------------------------|
| `0.5` | 2   | icon-to-text micro gap                   |
| `1`   | 4   | tight inline gaps                        |
| `1.5` | 6   | badge padding (y)                        |
| `2`   | 8   | control inner gap, badge padding (x)     |
| `3`   | 12  | compact card padding, button padding (x) |
| `4`   | 16  | default card padding, grid gap (mobile)  |
| `5`   | 20  | comfortable card padding                 |
| `6`   | 24  | panel padding, grid gap (desktop)        |
| `8`   | 32  | section spacing                          |
| `10`  | 40  | page gutters                             |
| `12`  | 48  | major section breaks                     |

### 3.2 Radii / border widths

- Radii: see `@theme` (`xs 4 / sm 6 / md 8 / lg 12 / xl 16 / pill`).
- Border widths: `1px` hairline (default, all chrome), `1.5px` for focus ring base, `2px` only for active segmented control / selected map panel outline. Never thicker.

### 3.3 Elevation usage map

| Elevation     | Shadow         | Applied to                                  |
|---------------|----------------|---------------------------------------------|
| Flat          | none           | Inline cards inside a panel, table.         |
| Raised        | `shadow-sm`    | KPI cards, inputs.                          |
| Floating      | `shadow-md`    | Map chrome overlays, side panels.           |
| Overlay       | `shadow-overlay`| Dropdowns, popovers, tooltips, menus.      |
| Modal         | `shadow-lg`    | Dialogs (native `<dialog>` element).        |

---

## 4. Component Specs

States given as: default → hover → active/pressed → focus-visible → disabled. Focus-visible is **always** `box-shadow: var(--shadow-focus)` (3px accent ring) — keyboard accessible, never removed.

### 4.1 App shell

**Left sidebar nav**
- Width: `240px` expanded · `64px` collapsed (icon-only). Full height.
- Background `surface-1`, right border `1px border-subtle`.
- Padding: `16px` horizontal, `12px` top section gap.
- Brand block at top: 56px tall, VERA mark + wordmark (`h3`, weight 700), accent dot.
- Nav item: height `40px`, radius `md`, padding `0 12px`, icon 18px (lucide) + label `body`.
  - default: `text-secondary`, transparent bg.
  - hover: bg `surface-2`, `text-primary`.
  - active: bg `accent-soft`, left 2px `accent` rail (inset, full item height), `text-primary`, icon `accent`.
  - focus-visible: `shadow-focus`.
- Section label between groups: `overline`, `text-muted`, `12px` top padding.

**Top bar**
- Height `56px`, background `surface-1`, bottom border `1px border-subtle`, padding `0 24px`.
- Sticky (`position: sticky; top:0; z-index: 30`).
- Left: page/region label. Right: live clock (mono `data-sm`), global status pill, user/menu.
- Layout: flex, `align-items:center`, `justify-content:space-between`.

### 4.2 KPI / stat card

- Background `surface-2`, border `1px border-subtle`, radius `lg`, padding `20px`, `shadow-sm`.
- Min-height `108px`. Flex column, `gap 8px`.
- **Label:** `overline`, `text-muted`.
- **Value:** `data-lg` (mono, weight 700, tabular), `text-primary`.
- **Delta row:** `data-sm` mono + 14px trend icon (lucide `ArrowUpRight`/`ArrowDownRight`).
  - Positive-good → `status-operational`; negative-bad → `status-offline`; neutral → `text-muted`.
  - **Encode direction with icon + sign + color (never color alone)** — colorblind-safe.
- Optional status accent: left 3px rail in the relevant `status-*` color when the KPI represents a single asset's state.
- Hover (if interactive/clickable): border → `border-default`, cursor pointer, `transition 150ms`.

### 4.3 Generic panel / card with header

- Background `surface-1`, border `1px border-subtle`, radius `lg`, overflow hidden.
- **Header:** height `48px`, padding `0 16px`, bottom border `1px border-subtle`, bg `surface-1`.
  - Title `h3` `text-primary` left; optional actions/menu right (ghost icon buttons).
  - Optional eyebrow `overline` `text-muted` above title for grouping.
- **Body:** padding `16px` (or `20px` for breathing room), `text-secondary`.
- **Footer (optional):** height `48px`, top border `1px border-subtle`, right-aligned actions.

### 4.4 Buttons

Shared: radius `md`, font `body` weight 600, height `36px` (md) / `30px` (sm) / `44px` (lg), icon 16px with `8px` gap, `transition 150ms ease`, focus-visible `shadow-focus`. Horizontal padding: `14px` (md).

| Variant     | Default                                              | Hover                       | Active                  | Disabled                              |
|-------------|------------------------------------------------------|-----------------------------|-------------------------|---------------------------------------|
| **Primary** | bg `accent`, text `text-inverse`                     | bg `accent-hover`           | bg `accent-pressed`     | bg `surface-3`, text `text-disabled`, no shadow |
| **Secondary**| bg `surface-2`, text `text-primary`, border `1px border-default` | bg `surface-3`, border `border-strong` | bg `surface-2`          | text `text-disabled`, border `border-subtle` |
| **Ghost**   | transparent, text `text-secondary`                   | bg `surface-2`, text `text-primary` | bg `surface-3`          | text `text-disabled`                  |
| **Danger**  | bg `danger`, text `#FFFFFF`                           | bg `#F05559`                | bg `#C93B40`            | bg `surface-3`, text `text-disabled`  |

- Primary is the **one** action per view. If two primaries compete, demote one to secondary.
- Icon-only button: square `36×36`, radius `md`, ghost styling, `aria-label` required.
- Min touch target 44×44 (use invisible padding on `sm` buttons in touch contexts).

### 4.5 Status badge / pill

- Shape: radius `pill`, height `22px`, padding `2px 10px`, inline-flex, `gap 6px`, `caption` weight 600.
- Leading **8px dot** in the status color (always present — dot + text label, never color-only).
- Color set by state:

| State        | Text color           | Background              | Dot                   |
|--------------|----------------------|-------------------------|-----------------------|
| Operational  | `status-operational` | `status-operational-soft` | `status-operational` |
| Degraded     | `status-degraded`    | `status-degraded-soft`  | `status-degraded`     |
| Offline      | `status-offline`     | `status-offline-soft`   | `status-offline`      |
| Unknown      | `status-unknown`     | `status-unknown-soft`   | `status-unknown`      |

- Critical/offline pill may add a slow `pulse` on the dot (2s, opacity 1→0.4→1) when it represents a live alarm.
- Count badge variant (numeric): mono `data-sm`, same pill, tabular nums.

### 4.6 Segmented control / tabs (2D ↔ 3D map switch)

**Segmented control** (used to switch a map panel between 2D and 3D)
- Container: bg `surface-2`, border `1px border-default`, radius `md`, padding `2px`, height `32px`, inline-flex.
- Segment: radius `sm`, padding `0 12px`, `caption` weight 600, `transition 150ms`.
  - inactive: `text-secondary`, transparent.
  - hover (inactive): `text-primary`.
  - active: bg `surface-3`, `text-primary`, `2px` inset `accent` underline OR full `accent-soft` fill with `accent` text — pick one and use consistently (recommended: `accent-soft` fill, `accent` text).
  - focus-visible: `shadow-focus`.
- Labels: `2D` / `3D` (mono `data-sm` reads well for these). Optional lucide `Map` / `Box` icons at 14px.

**Tabs** (for switching panel content, e.g. "Priorities" / "Alerts" / "Log")
- Underline style: tab bar bottom border `1px border-subtle`. Tab: padding `0 4px 10px`, `body` weight 600.
  - inactive `text-muted`; hover `text-secondary`; active `text-primary` + `2px` `accent` underline flush to bar.
- Min 44px tap width; `role="tab"`, `aria-selected`, arrow-key roving tabindex.

### 4.7 Map-panel chrome

Container: `surface-1`, border `1px border-subtle`, radius `xl`, `overflow:hidden`, `shadow-md`, relative positioning. The map canvas fills it; chrome floats on top.

**Title bar (top overlay)**
- Absolute top, full width, height `44px`, bg `surface-overlay` (90% scrim), bottom border `1px border-subtle`, padding `0 14px`, flex space-between, `backdrop-filter: blur(8px)`.
- Left: title `h3` (e.g., "2D Tactical") + **live indicator** (see below).
- Right: segmented `2D/3D` control + ghost icon menu.

**Live indicator**
- 8px dot `accent` (or `status-operational` when feed healthy) with slow pulse (2s) + `overline` label `LIVE` `text-secondary`. If feed stale → dot `status-unknown`, label `STALE`.

**Legend (bottom-left overlay)**
- Card: bg `surface-overlay`, border `1px border-subtle`, radius `md`, padding `10px 12px`, `backdrop-filter: blur(8px)`, `shadow-overlay`, max-width `200px`.
- Title `overline` `text-muted`. Rows: 10px swatch (status or heat color) + `caption` label, `6px` row gap.
- For the priority heat overlay, render the 5-stop `heat-*` ramp as a continuous bar with Low/Critical end labels.

**Zoom / tilt controls (bottom-right or top-right overlay)**
- Vertical stack, bg `surface-overlay`, border `1px border-default`, radius `md`, `shadow-overlay`.
- Buttons: `32×32`, ghost, icon 16px (`Plus`/`Minus`/`Compass`/`Maximize2`), divider `1px border-subtle` between groups.
  - hover bg `surface-3`, active bg `surface-2`. focus-visible `shadow-focus`.
- 3D panel adds a **tilt** control (`Compass` / rotate). 2D panel hides tilt.

**Selected panel emphasis:** the focused/active map panel gets a `1px border-accent` (or `2px` if needed) outline; the other stays `border-subtle`. Only one panel is "active" at a time.

### 4.8 Compact data-table row

- Table bg `surface-1`. Column gaps via cell padding, not borders.
- **Header row:** height `36px`, bg `surface-2`, `overline` `text-muted`, sticky top, bottom border `1px border-subtle`. Right-align numeric columns.
- **Body row:** height `40px`, padding `0 12px` per cell, bottom border `1px border-subtle`, `caption`/`body` `text-secondary`.
  - First cell (asset name): `text-primary` weight 600.
  - Numeric cells: mono `data` (tabular), `text-primary`.
  - Status cell: status pill (4.5) or bare colored dot + label.
  - hover: bg `surface-2`, cursor pointer.
  - selected: bg `accent-soft`, left 2px `accent` rail.
  - focus-visible (keyboard row nav): `shadow-focus` inset.
- Zebra: **off** (borders carry separation; zebra adds noise on dark). Density toggle optional: 40px (default) / 32px (compact).
- Right-most cell may hold a ghost icon button (row action) revealed on hover/focus.

---

## 5. Dashboard Layout

### 5.1 Page structure

```
┌────────────────────────────────────────────────────────────────────┐
│  TOP BAR  (56px)                                                     │
│  [VERA ▮]   Kyiv City / Kyiv Metropolitan Area   ·  ◷ 14:22:07  ● OPERATIONAL │
├──────────┬─────────────────────────────────────────────────────────┤
│          │  KPI STAT ROW  (4 cards, equal width, 24px gap)          │
│ SIDEBAR  │  [Assets]  [Critical]  [Avg ETA]  [Confidence]           │
│ 240px    ├─────────────────────────────────────────────────────────┤
│          │  MAP ROW  (2 equal columns, 24px gap, fills remaining h) │
│  Nav     │  ┌─────────────────────┐  ┌─────────────────────┐        │
│  items   │  │  2D TACTICAL  ●LIVE │  │  3D STRUCTURAL ●LIVE│        │
│          │  │  (OSM Buildings 2D) │  │  (OSM Buildings 3D) │        │
│          │  │  legend ▦  ⊕⊖       │  │  legend ▦  ⊕⊖ ◳     │        │
│          │  └─────────────────────┘  └─────────────────────┘        │
│          ├──────────────────────────────┬──────────────────────────┤
│          │  SIDE PANEL A                │  SIDE PANEL B             │
│          │  "Repair Priorities" table   │  "Live Alerts" feed       │
│          └──────────────────────────────┴──────────────────────────┘
└──────────┴─────────────────────────────────────────────────────────┘
```

### 5.2 Concrete grid

**App shell:** CSS grid, `grid-template-columns: 240px 1fr; grid-template-rows: 56px 1fr;` Top bar spans both columns (row 1). Sidebar is column 1 / row 2. Main content column 2 / row 2, `overflow-y:auto`.

**Main content** (column 2): vertical flex, `padding: 24px`, `gap: 24px`, `min-width:0`.

1. **KPI row** — `display:grid; grid-template-columns: repeat(4, 1fr); gap: 24px;` Fixed height (~108px content). Cards per §4.2.
   - Suggested KPIs: *Total Assets Monitored*, *Critical / Offline* (red accent rail), *Avg Repair ETA*, *Model Confidence %*.

2. **Map row** — `display:grid; grid-template-columns: 1fr 1fr; gap: 24px;` Height: `flex: 1 1 auto; min-height: 420px;` (grows to fill viewport). Two map panels per §4.7 — left **2D Tactical**, right **3D Structural**, each with its own chrome, live indicator, legend, and controls. Each panel `min-width:0; height:100%`.

3. **Support row** — `display:grid; grid-template-columns: 1.4fr 1fr; gap: 24px;` Height `~320px` (or `min-height:280px`).
   - **Panel A — Repair Priorities:** generic panel (§4.3) wrapping the compact data table (§4.8). Columns: `Asset` · `District` · `State` (pill) · `Priority` (heat-colored score, mono) · `Confidence` (mono %) · `ETA`. Sorted by priority desc.
   - **Panel B — Live Alerts:** generic panel with a vertical feed of status-badged events (timestamp mono `data-sm` + asset + state change). Scrollable.

### 5.3 Responsive behavior

Breakpoints (Tailwind defaults): `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`.

| Viewport            | Behavior                                                                                          |
|---------------------|---------------------------------------------------------------------------------------------------|
| **≥ xl (1280+)**    | Full layout as drawn. Sidebar 240px expanded.                                                      |
| **lg (1024–1279)**  | Sidebar collapses to 64px icon rail. KPI row stays 4-up. Map row stays 2-up. Support row 2-up.    |
| **< lg (≤1023)**    | **Maps stack vertically** (1 column, each `min-height: 380px`). KPI row → 2×2 grid. Support panels stack (1 col). Sidebar becomes an off-canvas drawer (hamburger in top bar; overlay `surface-1`, scrim `rgba(0,0,0,.5)`). |
| **< sm (≤639)**     | KPI row → 1 column. Region label truncates to "Kyiv". Top-bar clock hidden, status pill kept. Map controls remain but legend collapses to a toggle button. |

**Gaps:** 24px desktop, **16px below lg**. **Page padding:** 24px desktop, **16px below sm**.

**Map panel rule:** never let a map render below `360px` tall (OSM Buildings 3D needs height to read). When stacked, give each its own scroll context; don't nest map gestures inside page scroll without a drag-handle/disable-on-scroll guard.

---

## 6. Accessibility checklist (WCAG 2.1 AA)

- **Contrast:** all text tokens verified ≥4.5:1 on their intended surface (see §2.3). Status text on its own soft tint ≥4.5:1 — verified. Large/`display` text ≥3:1 minimum (all exceed).
- **Never color-only:** status = dot + label; KPI delta = icon + sign + color; map legend always labeled; heat ramp labeled Low→Critical.
- **Focus visible:** every interactive element shows the 3px accent ring (`--shadow-focus`). Never `outline:none` without a replacement.
- **Keyboard:** sidebar nav, tabs (roving tabindex), segmented control (arrow keys), table rows (up/down + Enter), map controls (tab-reachable) all operable without a mouse.
- **Touch targets:** ≥44×44 in touch contexts (pad small controls).
- **Motion:** honor `prefers-reduced-motion` — disable the live/critical pulse and reduce transitions to opacity-only.
- **Semantics:** `<nav>`, `<main>`, `<table>` with `<th scope>`, `<dialog>` for modals, `aria-live="polite"` on the alerts feed and on KPI values that update live, `aria-label` on all icon-only buttons.
- **Maps:** provide a non-map fallback — the Repair Priorities table is the accessible equivalent of the map's priority data; ensure it conveys the same ranking.

---

## 7. Motion tokens

| Token            | Value                          | Use                                  |
|------------------|--------------------------------|--------------------------------------|
| `dur-fast`       | 120ms                          | hovers, micro-state                  |
| `dur-base`       | 160ms                          | most transitions                     |
| `dur-slow`       | 240ms                          | panel/drawer enter                   |
| `ease-standard`  | `cubic-bezier(0.2,0,0,1)`      | default                              |
| `pulse-live`     | 2s ease-in-out infinite (opacity 1→0.4→1) | live dot, critical alarm |

Gate all of the above behind `prefers-reduced-motion: reduce`.

---

## 8. Implementation notes

- Replace the current `src/index.css` placeholder block with the `@theme` in §3 (keeps the existing dark canvas intent, formalized).
- Icons: `lucide-react`, default stroke 1.75, sizes 14/16/18px as specified.
- Charts: `recharts` — feed series colors from `viz-1…6` in order; axis/grid lines `border-subtle`, tick labels `text-muted` `data-sm`; tooltips on `surface-3` with `shadow-overlay`.
- Numbers everywhere: apply `.tabular` (or `font-mono` + `tabular-nums`) so live updates don't reflow.
- Keep the accent rare. If a screen has more than ~3 cyan elements competing, something is mis-prioritized.
```
