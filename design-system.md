# Pixelup Labs launch dashboard: design system

The design system behind the launch brief and comment page (`brands-work-with-post.vercel.app`) and the DM generator. It follows the look of pixeluplabs.com: a pure black canvas, hairline structure, one blue accent, uppercase controls, and monospace meta labels.

## Principles

1. **Black canvas, hairline structure.** Layout is drawn with 1px dividers, not cards or shadows. Panels are only a step lighter than the page.
2. **One accent, used sparingly.** Blue marks the single primary action, the active state, and small markers. If two things on screen are blue, one of them probably shouldn't be.
3. **Square everything.** No border radius anywhere.
4. **Two voices of type.** A tight grotesk carries content. Uppercase sans (for controls) and monospace (for meta labels) carry the interface.
5. **Left rail for context, right side for content.** A fixed info column holds what something is and the main CTAs. The main column holds the work.

## Colour

| Token | Value | Use |
|---|---|---|
| `--bg` | `#000000` | Page background |
| `--panel` | `#141414` | Buttons, inputs, callouts, tag backgrounds |
| `--panel-2` | `#1B1B1B` | Hover state for panels |
| `--line` | `#1F1F1F` | Hairline dividers between rows and sections |
| `--line-2` | `#2E2E2E` | Outlines on chips and small buttons |
| `--text` | `#FFFFFF` | Primary text, headings |
| body copy | `#CFCFCF` | Long-form paragraphs inside sections |
| `--muted` | `#8F8F8F` | Secondary text, labels, inactive controls |
| hint | `#6B6B6B` | Helper text under inputs |
| placeholder | `#5E5E5E` | Input placeholders |
| `--blue` | `#1F3BF0` | Primary action, active state, markers |
| `--blue-hover` | `#3450FF` | Hover on blue elements |

The theme is dark only. Set `color-scheme: dark` and give `body` an explicit black background.

## Typography

| Role | Family | Weight | Notes |
|---|---|---|---|
| Display | Inter Tight | 500 | Headings and large content text |
| Body | Inter | 400 / 500 | Paragraphs, inputs, controls |
| Meta | JetBrains Mono | 400 | Section labels, counters, small action buttons, toasts |

Fallback stacks:

```css
--sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
--display: "Inter Tight", "Inter", system-ui, sans-serif;
--mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
```

### Scale

| Element | Size | Line height | Tracking |
|---|---|---|---|
| Page title (h1) | `clamp(2rem, 3.4vw, 2.6rem)` | 1.05 | -0.035em |
| Section title (h2) | `clamp(1.8rem, 3vw, 2.4rem)` | 1.05 | -0.03em |
| List item text | `clamp(1.25rem, 2.2vw, 1.8rem)` | 1.2 | -0.02em |
| Callout heading | 1.35rem | — | -0.02em |
| Sub-heading (h3) | 1.2rem | — | -0.015em |
| Body | 16px | 1.5 | 0 |
| Uppercase control | 0.85–0.92rem | — | 0, uppercase |
| Mono label | 0.76–0.8rem | — | 0.06–0.08em, uppercase |

Rules:
- Headings are sentence case, never all caps.
- Buttons, nav links, filter chips and tags are uppercase.
- Mono is only for meta: section labels, step counters, small actions, status.
- Write the brand as "Pixelup Labs" in copy, not "PIXELUP".

## Layout

- **Header:** `20px 30px` padding with a bottom hairline. Wordmark on the left, uppercase nav on the right.
- **Two-column body:** `grid-template-columns: minmax(0, 380px) minmax(0, 1fr)`, with the left column separated by a right hairline.
- **Gutter:** 30px horizontal padding on both columns.
- **Left rail:** intro (title and sub), then label/value rows, then CTAs pinned to the bottom with `margin-top: auto`. Sticky on desktop.
- **Sections in the main column:** `28px 0` padding, top hairline, and a two-column grid of `220px` label and `1fr` body, with a `40px` column gap.
- **Reading width:** body text capped at `68ch`, sub-copy at `34ch`.

### Breakpoints

| Width | Change |
|---|---|
| ≤ 860px | Layout collapses to one column, the rail stops being sticky, and nav hides |
| ≤ 760px | Section label and body stack |
| ≤ 640px | List item actions move below the text |

Pages also respect safe areas with `viewport-fit=cover` and `env(safe-area-inset-*)` padding on `:root`.

## Shape and borders

- Border radius is `0` everywhere.
- Solid 1px `--line` for structure, solid 1px `--line-2` for outlined controls, and 1px dashed `--line-2` for inactive filter chips and segmented options.
- Blue left border (3px) marks a highlighted block, such as the go-live callout or the message preview.
- No drop shadows.

## Components

### Buttons

**Primary (blue):** full-width bar, `18px` padding, uppercase, label on the left and an 18px line icon on the right (`justify-content: space-between`). Background `--blue`, hover `--blue-hover`.

**Secondary (panel):** same shape as primary, with `--panel` background and `--panel-2` on hover.

**Small action:** mono, 0.76rem, uppercase, `9px 12px` padding, transparent with a `--line-2` outline and `--muted` text. Hover brightens the text and border. The copy variant uses a `--muted` outline with white text and turns blue on hover or when copied. Disabled actions sit at 40% opacity with a tooltip explaining why.

Use one primary button per view.

### Filter chips

Uppercase, 0.85rem, `9px 18px` padding, with a dashed `--line-2` border and `--muted` text. The active chip, set with `aria-pressed="true"`, is solid blue with white text.

### Segmented control

A two-up grid of options styled like chips, using hidden radio inputs. The checked option is solid blue.

### Label/value rows

A `<dl>` with a `110px` label column in `--muted` and a value column in white. Each row has `16px 30px` padding and a bottom hairline. This is used for metadata like Post, Live, Window and Do.

### Tag

A small uppercase label on a `--panel` background with a 6×4px blue marker in the bottom left, used for item categories.

### List item

A grid of `1fr auto`, with `26px 0` padding and a top hairline (and a bottom hairline on the last item). Text is in display type, with a tag below it and small actions on the right. The picked state adds a faint blue gradient from the left.

### Callout

A `--panel` background with a 3px blue left border and `20px 24px` padding. It holds a display-weight heading and muted supporting text inline.

### Numbered steps

A list with mono counters (`01`, `02`, …) in blue, in a 36px column beside the text.

### Bullets

A 6px blue square marker, 18px of left indent, and `8px 0` row padding.

### Example block (do / don't)

A `--panel` block in display type with a mono uppercase prefix. "Do" uses a blue prefix and white text. "Don't" uses a grey prefix and muted text.

### Inputs

A `--panel` background, no visible border at rest, `--line-2` border on hover, square corners and `14px 16px` padding.

### Message preview

A `--panel` block with a 3px blue left border, `28px` padding, display type at `clamp(1.1rem, 1.6vw, 1.3rem)` and `pre-wrap` whitespace.

### Toast

Fixed at the bottom centre with a `--panel` background and `--line-2` border. Mono uppercase text at 0.8rem. It fades and slides 16px up, then dismisses after about 1.8 seconds.

## Icons

18px inline SVG line icons with `stroke-width: 1.6`, `fill: none`, and `currentColor`. The set used is arrow up-right (external), chevron right (next), copy, refresh and send.

## Motion

- Toasts use a 0.2s ease. Hover changes are instant colour swaps.
- Scrolling to a picked item is smooth.
- Under `prefers-reduced-motion: reduce`, transitions and smooth scrolling are turned off.

## Accessibility

- Focus is shown as a 2px blue outline with a 2px offset, via `:focus-visible`.
- Filter chips use `aria-pressed`, and live areas use `aria-live="polite"`.
- Hidden items use the `hidden` attribute, backed by `[hidden] { display: none !important; }` so component display rules can't override it.
- Muted grey on black passes for secondary text. Avoid going darker than `#6B6B6B` for anything people need to read.

## Starter CSS

```css
:root {
  --bg: #000000;
  --panel: #141414;
  --panel-2: #1B1B1B;
  --line: #1F1F1F;
  --line-2: #2E2E2E;
  --text: #FFFFFF;
  --muted: #8F8F8F;
  --blue: #1F3BF0;
  --blue-hover: #3450FF;
  --sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --display: "Inter Tight", "Inter", system-ui, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 var(--sans); -webkit-font-smoothing: antialiased; }
:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
[hidden] { display: none !important; }
```

Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
```