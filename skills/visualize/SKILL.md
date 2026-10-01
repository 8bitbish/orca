---
name: visualize
description: >-
  Draw a static inline visual in an Orca Chat UI reply with a ```widget fence:
  option cards with costs, comparisons, timelines and schedules, Gantt bars,
  screen layouts with measurements, before/after panels, and simple flows. Also
  show Orca projects as live chips (an orca-worktree: link) and live project
  cards (a ```project-card fence) with reply buttons. Use when a picture would
  beat prose, or whenever a reply names or updates an Orca project, and the
  session is running in Orca's Chat UI (ORCA_STRUCTURED_SESSION is set). Outside
  Orca's Chat UI, use Mermaid or prose.
---

# Visualize

Orca's Chat UI renders a ```widget fence in your reply as a styled, static visual, the way
Claude.ai renders its own widgets. The fence holds an HTML fragment written with a small
class vocabulary that the preview already styles for the app's light and dark themes.

## First, check where you are running

A widget only renders in Orca's Chat UI. Anywhere else the reader sees a block of HTML.
Check once per session, before your first widget:

```sh
printf '%s\n' "${ORCA_STRUCTURED_SESSION:-}"
```

(In PowerShell, read `$env:ORCA_STRUCTURED_SESSION` instead.)

- Prints `1`: you are in Orca's Chat UI. Widgets render.
- Prints nothing, but `ORCA_PANE_KEY` or `ORCA_TERMINAL_HANDLE` is set: you are in an
  Orca terminal pane, which the user can switch between terminal and chat views at any
  time, so nothing tells you which view is showing. Use a widget only when the user asked
  for one or said they are in the chat view. Otherwise use Mermaid or prose.
- Neither: you are not in Orca. Never emit a widget; use Mermaid or prose.

## When a visual beats prose

- Options with costs or trade-offs (cards with prices, a total, a delta).
- Side-by-side comparisons and before/after.
- Timelines, schedules and plans (a Gantt bar chart over dated columns).
- Screen layouts, spacing and measurements (device frames, guides, arrows).
- Small flows and status overviews.

Skip it for a single fact, a short list, code, or anything the reader will copy as text.
Always put a one-line takeaway in prose next to the widget; the widget supports the
answer, it does not replace it.

## Rules

- Static only. Scripts, event handlers, forms, iframes, links out and remote images or
  fonts are stripped, and the frame blocks all network. Inline `data:` images are allowed.
- Use the classes below; reach for inline `style` only for sizes and positions (widths,
  `--from`/`--to`, `top`/`left`). Do not set colors or fonts yourself; the classes follow
  the app theme in light and dark.
- Keep it compact: one idea per widget, at most about 560px tall (taller content scrolls).
- Write the fence only once you know its content; it renders when the fence closes.

## Class vocabulary

Text: `title`, `subtitle`, `muted`, `small`, `label` (uppercase meta), `caption` (muted line
under a figure), `num` (tabular figures). Plain `h1`-`h4`, `p`, `hr` and `table` are styled.

Layout: `stack` (vertical, 8px gap), `row` (wrapping horizontal), `spread` (with `row`: ends
apart), `grid` (responsive card grid; set `style="--min:220px"` to change the column floor),
`compare` (side-by-side panels), `panel` (one column of `compare`, centered, with a `label`
on top and a `caption` below).

Cards: `card`; `card accent` is the recommended one (accent border). Inside a card:
`card-head` (an `icon` + label + optional `badge`, pushed right), `title`, `subtitle`,
`kv` rows (`<div class="kv"><span>Hotel</span><span>£390</span></div>`, value
right-aligned), `kv total` (bold total), `hr` or `divider`, and `delta positive` /
`delta negative`.

Badges: `badge` (neutral), `badge accent`, `badge positive`, `badge negative`,
`badge warning`.

Callouts: `note`, `note accent`, `note positive`, `note warning`, `note negative`.

Series colors: `c1`-`c6` (a colorblind-checked categorical palette; assign in order, one per
entity). Used by `swatch` and `bar`.

Legend: `legend` holding `<span><i class="swatch c1"></i>Label</span>` items.

Timeline / Gantt: `gantt` with `style="--cols:N"`, then one `gantt-scale` (N column
headers), then `gantt-row`s: a label `span` and a `gantt-track` holding
`<i class="bar c1" style="--from:1;--to:2.5">Label</i>`. `--from`/`--to` are in column
units and may be fractional.

Screens and measurements: `device landscape` or `device portrait` (a rounded screen
frame; set `aspect-ratio` inline for other shapes) with a `screen` inside; `block` (a
placeholder content block; set its height or width inline); `pill` (a button) and
`pill outline`. Add `annotated` to the frame, then position these absolutely inside it:
`guide-h` / `guide-v` (dashed guide lines) and `measure-h` / `measure-v` (a measurement
line with arrowheads at both ends; put its label in a child `<span>`). For angled arrows,
add `<svg class="overlay">` with an arrow `marker` and use the classes `measure`, `guide`,
`arrowhead` and `measure-label` on its shapes.

## Projects: chips and cards

Orca's Chat UI also draws the projects and workspaces Orca manages, live from the same
status the sidebar and `orca worktree ps` show. They follow the same "where you are running"
check above: use them only where widgets render.

When to use them:

- **Chip**: every time a reply names an Orca project or workspace. Prefer a chip to a bare name
  or a bullet list of names.
- **Card**: when the reply is an update about a project: what it is doing, what it needs.
- **Actions** on a card: only when the user has a decision to make. A plain status update has no
  actions.

### Chip

A markdown link with the `orca-worktree:` scheme:

```md
Pushed the fix to [orca-personal](orca-worktree:orca-personal/personal) and it is building.
```

The target is `repo/workspace`, using the names `orca worktree list --json` shows (the repo's
`displayName`, then the workspace's `displayName` or branch), or a bare `repo` for its main
workspace, or a full worktree id (`repoId::path`). Percent-encode spaces (`My%20App/main`). The
chip shows the project's icon, name, workspace (unless it is the main one) and a live status
dot, and clicking it focuses that workspace. A target Orca does not know shows as plain text.

### Card

A fence whose language is `project-card`, holding strict JSON (no comments). Write
`project-card` as the whole info string: the chat reads only the first word of a fence's info
string, so ` ```widget project-card ` would render as a widget.

```project-card
{
  "worktree": "ImageReview/packaging",
  "note": "Testing a fix in fixtest.py",
  "ask": "The commit skipped the pre-commit hook. Fix pnpm first?",
  "actions": [
    { "label": "Fix pnpm first", "reply": "Fix pnpm in ImageReview/packaging, then re-run the pre-commit hook before committing", "style": "primary" },
    { "label": "Commit as is", "reply": "Keep the ImageReview/packaging commit without the hook; fix pnpm later" },
    { "label": "Reply…", "input": true }
  ]
}
```

- `worktree` (required): the same target a chip takes.
- `note`: your one-line summary. Shown as written.
- `ask`: what you need from the user, highlighted. Shown as written.
- `icon`: an emoji to use instead of the project's own icon. Usually leave it out: Orca uses the
  icon the sidebar shows for the repo, else its app icon when it finds one, else a coloured letter.
- `actions`: up to four. Each has a `label` (40 characters at most) and either a `reply` (the
  exact text it sends) or `"input": true` (a small text box for a free reply). `"style":
  "primary"` marks the recommended one.

The card draws its own status pill (Working, Needs you, Done, Idle, or Unverifiable when
Orca cannot reach the host) and a live line with the agent's current tool or last message, so do
not restate live status in `note`. The status keeps updating after the reply is sent; `note` and
`ask` do not.

Each action shows the exact text it will send. Clicking one sends that text into this chat as
the user's next message, as if they had typed it, and disables the card's actions. Nothing runs
on its own: you receive the message and act on it then. So write each `reply` as a complete
instruction that makes sense on its own, naming the project. Bad JSON or an unknown workspace
shows the fence as a code block.

## Examples

Options with costs, a legend and a schedule:

```widget
<div class="grid">
  <div class="card">
    <div class="card-head"><span class="icon">✈</span>Fly direct<span class="badge positive">Cheapest</span></div>
    <div class="title">Lisbon, 3 nights</div>
    <div class="subtitle">Tue 14 – Fri 17 Oct</div>
    <hr>
    <div class="kv"><span>Flights</span><span>£212</span></div>
    <div class="kv"><span>Hotel</span><span>£390</span></div>
    <hr>
    <div class="kv total"><span>Total</span><span>£602</span></div>
    <div class="delta positive">−£148 vs budget</div>
  </div>
  <div class="card accent">
    <div class="card-head"><span class="icon">🚆</span>Train + fly<span class="badge accent">Recommended</span></div>
    <div class="title">Porto then Lisbon</div>
    <div class="subtitle">Mon 13 – Fri 17 Oct</div>
    <hr>
    <div class="kv"><span>Travel</span><span>£222</span></div>
    <div class="kv"><span>Hotels</span><span>£470</span></div>
    <hr>
    <div class="kv total"><span>Total</span><span>£692</span></div>
    <div class="delta positive">−£58 vs budget</div>
  </div>
</div>
<div class="legend"><span><i class="swatch c1"></i>Travel</span><span><i class="swatch c2"></i>Porto</span><span><i class="swatch c3"></i>Lisbon</span></div>
<div class="gantt" style="--cols:5">
  <div class="gantt-scale"><span>Mon 13</span><span>Tue 14</span><span>Wed 15</span><span>Thu 16</span><span>Fri 17</span></div>
  <div class="gantt-row"><span>Fly direct</span><div class="gantt-track"><i class="bar c1" style="--from:1;--to:1.4">Fly</i><i class="bar c3" style="--from:1.4;--to:4.6">Lisbon</i><i class="bar c1" style="--from:4.6;--to:5">Fly</i></div></div>
  <div class="gantt-row"><span>Train + fly</span><div class="gantt-track"><i class="bar c1" style="--from:0;--to:0.4">Fly</i><i class="bar c2" style="--from:0.4;--to:2">Porto</i><i class="bar c3" style="--from:2.3;--to:4.6">Lisbon</i><i class="bar c1" style="--from:4.6;--to:5">Fly</i></div></div>
</div>
<div class="caption">Per person, from today's fares.</div>
```

Two screen sizes side by side, with guides and measurements:

```widget
<div class="compare">
  <div class="panel">
    <div class="label">Wide screen · iPad landscape</div>
    <div class="device landscape annotated">
      <div class="screen">
        <div class="block" style="height:44%"></div>
        <div class="row spread"><div class="block" style="min-height:10px;width:50%"></div><span class="pill">Add to list</span></div>
      </div>
      <div class="guide-h" style="left:0;right:0;top:calc(44% + 10px)"></div>
      <div class="measure-v" style="right:22px;top:10px;height:44%"><span>+50</span></div>
      <div class="measure-h" style="left:10px;width:46%;bottom:22px"><span>24 min</span></div>
    </div>
    <div class="caption">The button stays inline beside the text.</div>
  </div>
  <div class="panel">
    <div class="label">Narrow screen · Fold8 portrait</div>
    <div class="device portrait annotated">
      <div class="screen">
        <div class="block" style="height:34%"></div>
        <div class="block" style="min-height:10px;width:80%"></div>
        <span class="pill" style="margin-top:auto">Add to list</span>
      </div>
      <div class="guide-v" style="left:26px;top:0;bottom:0"></div>
      <div class="guide-v" style="right:26px;top:0;bottom:0"></div>
      <svg class="overlay" viewBox="0 0 176 376">
        <defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="arrowhead" d="M0 0L8 4L0 8z"/></marker></defs>
        <line class="measure" x1="10" y1="300" x2="26" y2="300" marker-start="url(#arrow)" marker-end="url(#arrow)"/>
        <text class="measure-label" x="18" y="292" text-anchor="middle">16</text>
      </svg>
    </div>
    <div class="caption">The button spans the width with 16pt margins.</div>
  </div>
</div>
```

A before/after note:

```widget
<div class="compare">
  <div class="card"><div class="label">Before</div><div class="title">3 requests</div><div class="subtitle">Profile, settings and avatar load one after another.</div></div>
  <div class="card accent"><div class="label">After</div><div class="title">1 request</div><div class="subtitle">One batched call; first paint 380 ms sooner.</div></div>
</div>
<div class="note positive">Cold start drops from 1.2 s to 0.8 s on the test device.</div>
```
