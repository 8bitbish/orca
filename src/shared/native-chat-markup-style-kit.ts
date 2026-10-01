// The built-in style kit every chat preview document (```widget, ```html, ```svg)
// carries, on desktop and mobile, so a reply can look polished with classes alone.
// Static CSS only. Font faces stay per platform: Vite inlines desktop's Geist.
//
// Every selector sits in :where(), so the kit has zero specificity and any CSS the
// reply writes wins. Colors come from the app tokens baked into the frame (light
// and dark follow the html.dark class); the c1-c6 series slots are a
// colorblind-checked categorical palette, stepped per theme. The vocabulary is
// documented for agents in skill-guides/visualize.md; keep the two in step.
//
//   text     title subtitle muted small label caption num
//   layout   stack row spread grid(--min) compare panel
//   cards    card card.accent card-head icon kv kv.total divider delta.positive|negative
//   status   badge[.accent|.positive|.negative|.warning] note[.accent|.positive|.warning|.negative]
//   series   c1-c6 legend swatch
//   gantt    gantt(--cols) gantt-scale gantt-row gantt-track bar(--from,--to)
//   screens  device[.landscape|.portrait] screen block pill[.outline]
//   marks    annotated guide-h guide-v measure-h measure-v; SVG: overlay guide measure arrowhead measure-label

export const NATIVE_CHAT_MARKUP_STYLE_KIT_RULES = `
:root{--viz-1:#2a78d6;--viz-2:#eb6834;--viz-3:#1baf7a;--viz-4:#eda100;--viz-5:#e87ba4;--viz-6:#4a3aa7;--kit-surface:color-mix(in srgb,var(--foreground) 3%,var(--card,Canvas));--kit-line:color-mix(in srgb,var(--foreground) 12%,transparent);--kit-accent:var(--viz-1);--kit-positive:var(--status-success);--kit-negative:var(--destructive);--kit-warning:var(--status-warning);--kit-annotate:var(--viz-1)}
:root.dark{--viz-1:#3987e5;--viz-2:#d95926;--viz-3:#199e70;--viz-4:#c98500;--viz-5:#d55181;--viz-6:#9085e9}
:where(body){font:14px/1.5 'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:.01em}
:where(h1,h2,h3,h4){margin:0 0 8px;font-weight:600;line-height:1.3}
:where(h1){font-size:18px}:where(h2){font-size:16px}:where(h3,h4){font-size:14px}
:where(p){margin:0 0 8px}
:where(hr,.divider){border:0;border-top:1px solid var(--kit-line);margin:10px 0}
:where(table){border-collapse:collapse;width:100%;font-size:13px}
:where(th,td){padding:6px 10px;border-bottom:1px solid var(--kit-line);text-align:left}
:where(th){font-size:12px;font-weight:600;color:var(--muted-foreground)}
:where(.title){font-size:15px;font-weight:600;line-height:1.3}
:where(.subtitle,.muted){color:var(--muted-foreground)}
:where(.subtitle){font-size:13px}
:where(.small,.caption){font-size:12px}
:where(.caption){color:var(--muted-foreground);margin-top:6px}
:where(.label){font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted-foreground)}
:where(.num,.kv>:last-child,td.num){font-variant-numeric:tabular-nums}
:where(.stack){display:flex;flex-direction:column;gap:8px}
:where(.row){display:flex;flex-wrap:wrap;align-items:center;gap:8px}
:where(.spread){justify-content:space-between}
:where(.grid){display:grid;grid-template-columns:repeat(auto-fit,minmax(var(--min,180px),1fr));gap:12px}
:where(.compare){display:grid;grid-template-columns:repeat(auto-fit,minmax(var(--min,220px),1fr));gap:20px;align-items:start}
:where(.panel){display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0}
:where(.card){display:flex;flex-direction:column;gap:4px;padding:14px;border:1px solid var(--kit-line);border-radius:12px;background:var(--kit-surface);min-width:0}
:where(.card.accent){border:1.5px solid var(--kit-accent);background:color-mix(in srgb,var(--kit-accent) 6%,var(--kit-surface))}
:where(.card-head){display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-bottom:6px;font-size:13px;font-weight:500}
:where(.card-head>.badge){margin-left:auto}
:where(.icon){display:inline-flex;align-items:center;justify-content:center;flex:none;width:24px;height:24px;border-radius:6px;background:var(--muted);font-size:13px;line-height:1}
:where(.icon svg){width:14px;height:14px}
:where(.badge){display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;line-height:18px;white-space:nowrap;background:var(--muted);color:var(--muted-foreground)}
:where(.badge.accent){background:color-mix(in srgb,var(--kit-accent) 14%,transparent);color:var(--kit-accent)}
:where(.badge.positive){background:color-mix(in srgb,var(--kit-positive) 14%,transparent);color:var(--kit-positive)}
:where(.badge.negative){background:color-mix(in srgb,var(--kit-negative) 14%,transparent);color:var(--kit-negative)}
:where(.badge.warning){background:color-mix(in srgb,var(--kit-warning) 16%,transparent);color:var(--kit-warning)}
:where(.kv){display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:13px}
:where(.kv>:first-child){color:var(--muted-foreground)}
:where(.kv>:last-child){text-align:right}
:where(.kv.total){font-size:15px;font-weight:600}
:where(.kv.total>:first-child){color:inherit}
:where(.delta){font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
:where(.positive){color:var(--kit-positive)}
:where(.negative){color:var(--kit-negative)}
:where(.legend){display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--muted-foreground);margin:8px 0}
:where(.legend>*){display:inline-flex;align-items:center;gap:6px}
:where(.swatch){display:inline-block;font-style:normal;flex:none;width:10px;height:10px;border-radius:3px;background:var(--c,var(--muted-foreground))}
:where(.c1){--c:var(--viz-1)}:where(.c2){--c:var(--viz-2)}:where(.c3){--c:var(--viz-3)}:where(.c4){--c:var(--viz-4)}:where(.c5){--c:var(--viz-5)}:where(.c6){--c:var(--viz-6)}
:where(.gantt){display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 12px;align-items:center;font-size:12px}
:where(.gantt-scale){grid-column:2;display:grid;grid-template-columns:repeat(var(--cols,1),minmax(0,1fr));color:var(--muted-foreground);font-size:11px}
:where(.gantt-scale>*){padding-left:4px;border-left:1px solid var(--kit-line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
:where(.gantt-row){display:contents}
:where(.gantt-row>:first-child){color:var(--muted-foreground);white-space:nowrap}
:where(.gantt-track){position:relative;height:24px;background:linear-gradient(to right,var(--kit-line) 1px,transparent 1px) 0 0/calc(100% / var(--cols,1)) 100%}
:where(.bar){position:absolute;top:2px;bottom:2px;left:calc(var(--from,0) * 100% / var(--cols,1));width:calc((var(--to,1) - var(--from,0)) * 100% / var(--cols,1) - 2px);display:flex;align-items:center;padding:0 6px;box-sizing:border-box;border-radius:4px;border-left:3px solid var(--c,var(--kit-accent));background:color-mix(in srgb,var(--c,var(--kit-accent)) 32%,transparent);color:var(--foreground);font-size:11px;font-weight:500;font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
:where(.note){padding:10px 12px;border-radius:8px;border-left:3px solid var(--muted-foreground);background:var(--kit-surface);font-size:13px}
:where(.note.accent){border-color:var(--kit-accent);background:color-mix(in srgb,var(--kit-accent) 8%,transparent)}
:where(.note.positive){border-color:var(--kit-positive);background:color-mix(in srgb,var(--kit-positive) 8%,transparent);color:inherit}
:where(.note.warning){border-color:var(--kit-warning);background:color-mix(in srgb,var(--kit-warning) 10%,transparent)}
:where(.note.negative){border-color:var(--kit-negative);background:color-mix(in srgb,var(--kit-negative) 8%,transparent);color:inherit}
:where(.device){position:relative;box-sizing:border-box;width:100%;border:2px solid color-mix(in srgb,var(--foreground) 22%,transparent);border-radius:18px;padding:10px;background:var(--background)}
:where(.device.landscape){aspect-ratio:4/3}
:where(.device.portrait){aspect-ratio:9/19;max-width:180px}
:where(.screen){position:relative;display:flex;flex-direction:column;gap:8px;height:100%;box-sizing:border-box}
:where(.block){border-radius:8px;background:color-mix(in srgb,var(--foreground) 8%,transparent);min-height:36px}
:where(.pill){display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:6px 14px;border-radius:999px;background:var(--primary);color:var(--primary-foreground);font-size:13px;font-weight:500;white-space:nowrap}
:where(.pill.outline){background:transparent;color:var(--foreground);border:1px solid var(--kit-line)}
:where(.annotated){position:relative}
:where(.guide-h,.guide-v,.measure-h,.measure-v){position:absolute;box-sizing:border-box;color:var(--kit-annotate);pointer-events:none}
:where(.guide-h){height:0;border-top:1px dashed currentColor}
:where(.guide-v){width:0;border-left:1px dashed currentColor}
:where(.measure-h,.measure-v){display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;white-space:nowrap;line-height:1}
:where(.measure-h){height:0;border-top:1.5px solid currentColor}
:where(.measure-v){width:0;border-left:1.5px solid currentColor}
:where(.measure-h,.measure-v)>*{padding:1px 4px;border-radius:4px;background:var(--card,Canvas)}
:where(.measure-h)::before,:where(.measure-h)::after,:where(.measure-v)::before,:where(.measure-v)::after{content:'';position:absolute;border:4px solid transparent}
:where(.measure-h)::before{left:-1px;top:-4.75px;border-left:0;border-right:6px solid currentColor}
:where(.measure-h)::after{right:-1px;top:-4.75px;border-right:0;border-left:6px solid currentColor}
:where(.measure-v)::before{top:-1px;left:-4.75px;border-top:0;border-bottom:6px solid currentColor}
:where(.measure-v)::after{bottom:-1px;left:-4.75px;border-bottom:0;border-top:6px solid currentColor}
:where(.overlay){position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
:where(.guide){fill:none;stroke:var(--kit-annotate);stroke-width:1;stroke-dasharray:4 3}
:where(.measure){fill:none;stroke:var(--kit-annotate);stroke-width:1.5}
:where(.arrowhead){fill:var(--kit-annotate)}
:where(.measure-label){fill:var(--kit-annotate);font-size:11px;font-weight:600}
`
