# Shell UI — Lab Blueprint / Industrial Label

Date: 2026-08-11

## What changed

Restrained restyle of **teacher + student platform shells only** (not game package HTML).

- Cool off-white / gray canvas with subtle cross / + grid background
- Primary accent: **cyan** (`#0c8aad`); canary yellow reserved for CTA / emphasis chips
- Black compact “label” tags for role / meta / catalog chips
- Thin 1px rules, small radius (4–6px), near-zero shadows
- Monospace + tabular nums for scores, counts, timers, ability totals
- Ability score badge framed as ink label + cyan underline; process/result bands keep semantic colors with sharper frames
- Panel corner brackets via CSS `::before` / `::after` (no extra DOM)
- Student-play chrome (FAB, chips, overlay) aligned; iframe game internals untouched

## Tokens (`design-tokens.css` / `.edu-shell`)

| Token | Value | Role |
| --- | --- | --- |
| `--edu-primary` | `#0c8aad` | Cyan accent |
| `--edu-primary-dark` | `#096f8c` | Hover / dark |
| `--edu-primary-soft` | `rgba(12,138,173,0.10)` | Soft fill |
| `--edu-accent` | `#e6c200` | Canary CTA only |
| `--edu-bg` | `#eef1f4` | Cool canvas |
| `--edu-surface` | `#fbfcfd` | Panels |
| `--edu-ink` | `#0e141b` | Label tags |
| `--edu-grid` / `--edu-grid-cross` | low-opacity cyan | Blueprint grid |
| `--radius-sm/md` | `4px` / `6px` | Sharp corners |
| `--font-mono` / `--font-label` | Cascadia / Sarasa / JetBrains… | Scores & labels |

## Pages covered

- `platform.html`, `teacher.html`, `teacher-login.html`
- `student.html`, `student-join.html`, `student-play.html` (chrome only)
- `strategy-summary-demo.html` (inherits shell tokens)
- Shared: `platform-shell.css`, `design-tokens.css` (also consumed by `agent-shell.css`)

## Out of scope (intentionally unchanged)

- `data/runtime/packages/*/game.html` and sample game HTML
- JS behavior / dual-pane layout structure (`min-height: 0`, split grid)
- Agent tool logic; only shared tokens trickle into Agent tab styling
- No giant vertical type, neon full-bleed yellow, shard collages, purple-on-white, or cream+terracotta looks
