/**
 * Layout and console checks that run inside the page.
 *
 * These exist because the three bugs the owner reported from real play — a top bar sitting under
 * the orders panel, score text wrapping onto two lines, a camera that ran away when the window lost
 * focus — are all invisible to any assertion about game state. They are only visible in geometry.
 * So we measure geometry: rectangles that intersect, text nodes that occupy more than one line box,
 * panels whose edges fall outside the viewport.
 */

/** Panels that are laid out as chrome and must never sit on top of one another. */
export const PANELS = [
  "#topbar",
  "#help",
  "#stack",
  "#coach",
  "#bottombar",
  "#command",
  "#selinfo",
  "#minimap",
  "#log",
];

/** Text that has to stay on a single line. */
export const ONE_LINERS = [
  "#men0",
  "#men1",
  "#name0",
  "#name1",
  "#topbar .clash",
  "#coach .objective",
  "#coach .action",
  "#selinfo .who",
  "#selinfo .verdict",
  "#toast",
  ".card .name",
  ".card .count",
];

/**
 * Every pair of visible panels that intersect. Rectangles are shrunk by a pixel first so that
 * panels merely sharing an edge do not read as a collision.
 */
export function overlappingPanels(page, selectors) {
  return page.eval((sels) => {
    const seen = [];
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) continue;
        if (el.hidden) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        seen.push({ sel, el, x1: r.left, y1: r.top, x2: r.right, y2: r.bottom });
      }
    }
    const hits = [];
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length; j++) {
        const a = seen[i];
        const b = seen[j];
        // A panel sitting inside another one is layout, not collision.
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) - 1;
        const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) - 1;
        if (ox > 0 && oy > 0) {
          hits.push(`${a.sel} ∩ ${b.sel} (${Math.round(ox)}×${Math.round(oy)}px)`);
        }
      }
    }
    return hits;
  }, selectors);
}

/**
 * Text nodes that wrapped. A Range over a text node reports one client rect per line box, so more
 * than one rect means the browser broke the line.
 */
export function wrappedText(page, selectors) {
  return page.eval((sels) => {
    const bad = [];
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || el.hidden) continue;
        if (!el.getBoundingClientRect().width) continue;
        for (const node of el.childNodes) {
          if (node.nodeType !== 3 || !node.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const lines = range.getClientRects().length;
          if (lines > 1) bad.push(`${sel} "${node.textContent.trim()}" wrapped onto ${lines} lines`);
        }
      }
    }
    return bad;
  }, selectors);
}

/** Panels whose box escapes the viewport. */
export function offViewport(page, selectors) {
  return page.eval((sels) => {
    const bad = [];
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || el.hidden) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const out = [];
        if (r.left < -1) out.push(`left ${Math.round(r.left)}`);
        if (r.top < -1) out.push(`top ${Math.round(r.top)}`);
        if (r.right > innerWidth + 1) out.push(`right ${Math.round(r.right)} > ${innerWidth}`);
        if (r.bottom > innerHeight + 1) out.push(`bottom ${Math.round(r.bottom)} > ${innerHeight}`);
        if (out.length) bad.push(`${sel} escapes viewport: ${out.join(", ")}`);
      }
    }
    return bad;
  }, selectors);
}

/** Anything that scrolls sideways is a layout bug in a fixed-viewport game. */
export function horizontalOverflow(page) {
  return page.eval(() => {
    const bad = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) {
      bad.push(`document scrolls horizontally (${document.documentElement.scrollWidth} > ${innerWidth})`);
    }
    return bad;
  });
}

/** Run the whole geometry sweep and file every finding. */
export async function auditLayout(page, report, label) {
  const findings = [
    ...(await overlappingPanels(page, PANELS)),
    ...(await wrappedText(page, ONE_LINERS)),
    ...(await offViewport(page, PANELS)),
    ...(await horizontalOverflow(page)),
  ];
  report.check(`layout is clean at ${label}`, findings.length === 0, findings.join("; "));
  return findings;
}

export function auditConsole(page, report, label) {
  const errs = [...page.pageErrors, ...page.consoleErrors];
  report.check(`no console errors ${label}`, errs.length === 0, errs.slice(0, 4).join(" | "));
  return errs;
}
