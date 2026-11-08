import { FloatingViewManager } from "../panels/panel_host";
import {
  FLOATING_VIEW_WRAPPER_CLASS,
  FLOATING_VIEW_TITLEBAR_CLASS,
  FLOATING_VIEW_RESIZE_HANDLE_CLASS,
  GRID_UNIT,
} from "../panels/panel_wrapper";
import {
  LINK_OVERLAY_SVG_ID,
  LINK_ARROW_GROUP_CLASS,
} from "../panels/link_overlay";
import {
  SIDEBAR_CONTAINER_CLASS,
  SIDEBAR_LAYOUT_PICKER_CLASS,
  SIDEBAR_TOOLS_BAR_CLASS,
} from "../reference_page/sidebar_view";
import { brandLockupHtml } from "../branding";
import { MOBILE_STARTER_KEY } from "../screen_config/default_configs";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TourStep {
  key: string;
  target: () => Element | null;
  pad: number;
  placement: "right" | "left" | "top" | "bottom";
  gesture?: "drag" | "resize";
  light?: boolean;
  emphLinks?: boolean;
  last?: boolean;
  step: string;
  title: string;
  body: string;
}

interface OverlayRefs {
  wrap: HTMLElement;
  block: HTMLElement;
  spot: HTMLElement;
  tip: HTMLElement;
  arrow: HTMLElement;
  ghost: HTMLElement | null;
}

// ─── State ───────────────────────────────────────────────────────────────────

const Onb: {
  overlay: OverlayRefs | null;
  /** The steps of the tour in progress: DESKTOP_STEPS or MOBILE_STEPS. */
  steps: TourStep[];
  stepIdx: number;
  repositioner: (() => void) | null;
  keyHandler: ((e: KeyboardEvent) => void) | null;
  manager: FloatingViewManager | null;
} = {
  overlay: null,
  steps: [],
  stepIdx: 0,
  repositioner: null,
  keyHandler: null,
  manager: null,
};

/** The tabbed (mobile) layout has a different shell — tabs, not a sidebar and a
 *  board of panels — so it gets its own welcome copy and its own tour. */
function isTabbed(): boolean {
  return Onb.manager?.getStrategyKind() === "tabbed";
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function el(tag: string, cls?: string, html?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function $<T extends Element = Element>(
  sel: string,
  root: ParentNode = document,
): T | null {
  return root.querySelector<T>(sel);
}

function $all(sel: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(sel));
}

function panelByTitle(prefix: string): HTMLElement | null {
  return (
    $all(`.${FLOATING_VIEW_WRAPPER_CLASS}`).find((w) => {
      const h = w.querySelector<HTMLElement>(".floating-view-title-text");
      return !!h && h.textContent!.trim().startsWith(prefix);
    }) ?? null
  );
}

// ─── Tour Steps ───────────────────────────────────────────────────────────────

const DESKTOP_STEPS: TourStep[] = [
  {
    key: "nav",
    target: () => $(`.${SIDEBAR_CONTAINER_CLASS}`),
    pad: 0,
    placement: "right",
    step: "The library",
    title: "Everything lives in one canvas",
    body: "Browse <b>chords, scales, the circle of fifths</b> and practice tools from the sidebar. Each opens as its own panel on the board to the right.",
  },
  {
    key: "drag",
    target: () => {
      const p = panelByTitle("Chord") ?? $(`.${FLOATING_VIEW_WRAPPER_CLASS}`);
      return p?.querySelector(`.${FLOATING_VIEW_TITLEBAR_CLASS}`) ?? null;
    },
    pad: 4,
    placement: "right",
    gesture: "drag",
    step: "Arrange",
    title: "Drag panels anywhere",
    body: "Grab a panel by its <b>header</b> and slide it anywhere on the board. Your layout is saved automatically.",
  },
  {
    key: "resize",
    target: () => {
      const p = panelByTitle("Chord") ?? $(`.${FLOATING_VIEW_WRAPPER_CLASS}`);
      return p?.querySelector(`.${FLOATING_VIEW_RESIZE_HANDLE_CLASS}`) ?? null;
    },
    pad: 10,
    placement: "left",
    gesture: "resize",
    step: "Resize",
    title: "Pull the corner to resize",
    body: "Every panel scales — stretch it wide for a full view, shrink it down when you just need a reference.",
  },
  {
    key: "link",
    target: () => $(`#${LINK_OVERLAY_SVG_ID} .${LINK_ARROW_GROUP_CLASS}`),
    pad: 12,
    placement: "bottom",
    light: true,
    emphLinks: true,
    step: "Link",
    title: "Panels talk to each other",
    body: "This arrow connects the two panels. Drag a panel's <b>link handle</b> to another to sync their root keys — change one and everything follows.",
  },
  {
    key: "layout",
    target: () => $(`.${SIDEBAR_LAYOUT_PICKER_CLASS}`),
    pad: 6,
    placement: "right",
    step: "Layout",
    title: "Layouts &amp; presets",
    body: "Jump to a preset arrangement or save your own. Your layout is automatically remembered between sessions.",
  },
  {
    key: "tools",
    target: () => $(`.${SIDEBAR_TOOLS_BAR_CLASS}`),
    pad: 6,
    placement: "right",
    last: true,
    step: "Tools",
    title: "Save, settings &amp; focus",
    body: "Down here you can <b>save</b> your board to a file or <b>load</b> a previous board, open <b>settings</b> to fine-tune the app, and switch on <b>Zen mode</b> to clear distractions and just play.",
  },
];

// The tabbed layout's tour points at its shell (selectors: style/mobile.css). It
// leaves the open tabs alone — every target is there whatever is open, bar the link
// between two tabs, whose step is dropped when no two neighbours can be linked.
// These targets sit against the screen's edges, where a ring drawn AROUND them would
// hang off it: a negative pad draws the spotlight's ring just inside the target.
const EDGE_PAD = -3;

const MOBILE_STEPS: TourStep[] = [
  {
    key: "tabs",
    target: () => $(".tabbed-tab-strip"),
    pad: EDGE_PAD,
    placement: "top",
    step: "Tabs",
    title: "One tool per tab",
    body: "Each tool opens as a tab. <b>Tap</b> a tab to switch — or <b>swipe</b> the screen sideways. <b>Press and hold</b> a tab to move it.",
  },
  {
    key: "add",
    target: () => $(".tabbed-add-btn"),
    pad: EDGE_PAD,
    placement: "top",
    step: "Add",
    title: "Everything is under +",
    body: "<b>Chords, scales, triads</b> and the circle of fifths; a <b>metronome</b>, a timer, strumming patterns and backing tracks. Open as many as you like.",
  },
  {
    key: "link",
    target: () => $(".tabbed-link-connector"),
    pad: 2,
    placement: "top",
    step: "Link",
    title: "Tabs follow each other",
    body: "The link between two tabs makes one <b>follow the other's key</b> — change the scale and the chords next to it change too. Tap it to link or unlink.",
  },
  {
    key: "actions",
    target: () => $(".tabbed-top-bar-actions"),
    pad: EDGE_PAD,
    placement: "bottom",
    step: "This tab",
    title: "Controls for the tab you're on",
    body: "<b>Options</b> hides a tab's settings to give the fretboard the room, <b>rotate</b> turns a fretboard, and <b>×</b> closes the tab.",
  },
  {
    key: "menu",
    target: () => $(".tabbed-menu-btn"),
    pad: EDGE_PAD,
    placement: "bottom",
    last: true,
    step: "Menu",
    title: "Layouts &amp; settings",
    body: "Ready-made <b>starter layouts</b>, and <b>settings</b> for your instrument, tuning and theme. This tour is in here too, whenever you want it again.",
  },
];

/** A step can only be shown if what it points at is on screen. */
function hasTarget(step: TourStep): boolean {
  const target = step.target();
  if (!target) return false;
  const r = target.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** The tour for the live layout. The desktop tour builds the views its steps point
 *  at (openTourViews); the mobile one works with what is open, so it drops any step
 *  with nothing to point at and re-marks the last one. */
function stepsForLayout(): TourStep[] {
  if (!isTabbed()) return DESKTOP_STEPS;
  const steps = MOBILE_STEPS.filter(hasTarget);
  return steps.map((s, i) => ({ ...s, last: i === steps.length - 1 }));
}

// ─── Welcome Modal ────────────────────────────────────────────────────────────

function buildWelcome(): void {
  if ($(".onb-scrim")) return;

  const scrim = el("div", "onb-scrim");
  scrim.addEventListener("click", (e) => e.stopPropagation());

  const card = el("div", "onb-card");

  const hero = el("div", "onb-card-hero");
  hero.innerHTML = `
        <div class="onb-brand">${brandLockupHtml("lg")}</div>
        <h1 class="onb-headline">Helping you <em>see the fretboard with clarity</em>.</h1>
        <p class="onb-lede">Not a course and not a song library — a living board of chord shapes, scales and practice tools you arrange to fit whatever you're playing.</p>
    `;

  const tabbed = isTabbed();
  const feat = (icon: string, title: string, desc: string) => `
        <div class="onb-feat">
            <span class="material-icons onb-feat-icon">${icon}</span>
            <div>
                <div class="onb-feat-title">${title}</div>
                <div class="onb-feat-desc">${desc}</div>
            </div>
        </div>`;
  const feats = el("div", "onb-feats");
  feats.innerHTML = tabbed
    ? feat("tab", "One tool per tab", "Every reference fills the screen. Switch with a tap or a swipe, and open as many as you like.") +
      feat("sync_alt", "Link tabs by key", "Link neighbouring tabs so they share a root note — change the key once and everything follows.") +
      feat("timer", "Practice in place", "Metronome, timer and backing tracks are one tab away from your reference.")
    : feat("open_with", "Move &amp; resize freely", "Every reference is a panel. Drag it, scale it, build the layout that matches how you practice.") +
      feat("sync_alt", "Link panels by key", "Connect panels so they share a root note — change the key once and everything follows.") +
      feat("timer", "Practice in place", "Metronome, timer and backing tracks sit right alongside your reference, not in another tab.");

  const actions = el("div", "onb-actions");

  const startBtn = el(
    "button",
    "onb-btn-primary",
    tabbed ? "Take the 30-second tour" : "Take the 60-second tour",
  );
  startBtn.addEventListener("click", () => {
    closeWelcome();
    openTourViews(() => startTour());
  });

  const introLink = el(
    "a",
    "onb-btn-secondary",
    `Read intro<span class="material-icons">open_in_new</span>`,
  ) as HTMLAnchorElement;
  // dist/index.html is self-contained and also runs straight off disk, where a
  // root-relative link is dead — so fall back to the canonical origin there and
  // stay relative when hosted, which keeps local deploy previews honest.
  introLink.href =
    location.protocol === "file:" ? "https://fretfalcon.com/info/" : "/info/";
  introLink.target = "_blank";
  introLink.rel = "noopener noreferrer";

  const skipBtn = el("button", "onb-btn-ghost", "Explore on my own");
  skipBtn.addEventListener("click", closeWelcome);

  actions.appendChild(startBtn);
  actions.appendChild(introLink);
  actions.appendChild(skipBtn);

  card.appendChild(hero);
  card.appendChild(feats);
  card.appendChild(actions);
  scrim.appendChild(card);
  document.body.appendChild(scrim);
}

function closeWelcome(): void {
  $(".onb-scrim")?.remove();
}

// ─── Tour Views ───────────────────────────────────────────────────────────────

// Snap a pixel value to the nearest grid unit
function snap(px: number): number {
  return Math.round(px / GRID_UNIT) * GRID_UNIT;
}

function openTourViews(onReady: () => void): void {
  const manager = Onb.manager;
  if (!manager) {
    onReady();
    return;
  }

  // The mobile tour points at the shell, so it leaves the open tabs as they are.
  // Only an empty screen gets something to point at: the starter set of tabs.
  if (isTabbed()) {
    if (manager.getOpenInstanceIds().length === 0) {
      manager.loadNamedLayout(`default:${MOBILE_STARTER_KEY}`);
    }
    requestAnimationFrame(onReady);
    return;
  }

  const GAP = GRID_UNIT * 4; // 4 grid squares between panels
  const TOP = snap(60);
  const CIRCLE_X = snap(220);
  const CIRCLE_W = snap(360);
  const CHORD_X = snap(CIRCLE_X + CIRCLE_W + GAP);

  // Close any existing panels so the tour starts from a clean canvas
  manager.closeAllViews();

  // spawnView returns the instanceId immediately — no title search needed,
  // since view titles change asynchronously during render.
  const circleId = manager.spawnView("circle_of_fifths", {
    position: { x: CIRCLE_X, y: TOP },
  });
  const chordId = manager.spawnView("instrument_chord", {
    position: { x: CHORD_X, y: TOP },
  });

  const linkManager = manager.getLinkManager();
  if (circleId && chordId && linkManager) {
    linkManager.createLink(circleId, "right", chordId, "left");
  }

  // One rAF so panels have painted before the tour spotlight positions itself
  requestAnimationFrame(onReady);
}

// ─── Tour ─────────────────────────────────────────────────────────────────────

function startTour(): void {
  teardownTour();

  const wrap = el("div", "onb-tour-wrap");
  const block = el("div", "onb-block");
  const spot = el("div", "onb-spot");
  const tip = el("div", "onb-tip");
  const arrow = el("div", "onb-arrow");
  tip.appendChild(arrow);

  wrap.appendChild(block);
  wrap.appendChild(spot);
  wrap.appendChild(tip);
  document.body.appendChild(wrap);

  Onb.overlay = { wrap, block, spot, tip, arrow, ghost: null };

  Onb.steps = stepsForLayout();
  Onb.repositioner = () => {
    if (Onb.overlay) layoutStep(Onb.steps[Onb.stepIdx]);
  };
  window.addEventListener("resize", Onb.repositioner);

  Onb.keyHandler = onKey;
  document.addEventListener("keydown", Onb.keyHandler);

  gotoStep(0);
}

function gotoStep(i: number): void {
  if (!Onb.overlay) return;
  const steps = Onb.steps;
  if (!steps.length) {
    teardownTour();
    return;
  }
  const clamped = Math.max(0, Math.min(i, steps.length - 1));
  Onb.stepIdx = clamped;
  const s = steps[clamped];

  clearGesture();
  document.body.classList.remove("onb-links-emph");

  const { tip, spot } = Onb.overlay;

  // Build tip content
  const stepCount = `${clamped + 1} / ${steps.length}`;
  const dotsHtml = steps.map(
    (_, idx) =>
      `<span class="onb-dot${idx === clamped ? " active" : ""}"></span>`,
  ).join("");
  const backBtn =
    clamped > 0
      ? `<button class="onb-nav-btn onb-back-btn" data-dir="back">Back</button>`
      : "";
  const nextLabel = s.last ? "Finish" : "Next";

  tip.innerHTML = `
        <div class="onb-arrow"></div>
        <div class="onb-tip-header">
            <span class="onb-step-count">${stepCount} · <span class="onb-step-label">${s.step.toUpperCase()}</span></span>
            <button class="onb-skip-btn">SKIP TOUR ×</button>
        </div>
        <h2 class="onb-tip-title">${s.title}</h2>
        <p class="onb-tip-body">${s.body}</p>
        <div class="onb-tip-footer">
            <div class="onb-dots">${dotsHtml}</div>
            <div class="onb-nav-btns">
                ${backBtn}
                <button class="onb-nav-btn onb-next-btn" data-dir="next">${nextLabel}</button>
            </div>
        </div>
    `;

  // Re-query the arrow element after innerHTML replacement
  Onb.overlay.arrow = tip.querySelector(".onb-arrow") as HTMLElement;

  tip
    .querySelector(".onb-skip-btn")
    ?.addEventListener("click", () => teardownTour());
  tip.querySelector('[data-dir="next"]')?.addEventListener("click", () => {
    if (s.last) teardownTour();
    else gotoStep(Onb.stepIdx + 1);
  });
  tip
    .querySelector('[data-dir="back"]')
    ?.addEventListener("click", () => gotoStep(Onb.stepIdx - 1));

  spot.classList.toggle("onb-spot--light", !!s.light);

  layoutStep(s);

  if (s.emphLinks) document.body.classList.add("onb-links-emph");
  if (s.gesture) spawnGesture(s);
}

function layoutStep(s: TourStep): void {
  if (!Onb.overlay) return;
  const { spot, tip, arrow } = Onb.overlay;
  const target = s.target();

  let r: DOMRect;
  if (target) {
    r = target.getBoundingClientRect();
  } else {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    r = new DOMRect(vw / 2 - 100, vh / 2 - 60, 200, 120);
  }

  const pad = s.pad;
  spot.style.left = `${r.left - pad}px`;
  spot.style.top = `${r.top - pad}px`;
  spot.style.width = `${r.width + pad * 2}px`;
  spot.style.height = `${r.height + pad * 2}px`;

  placeTip(r, pad, s.placement, tip, arrow);
}

function placeTip(
  r: DOMRect,
  pad: number,
  preferredPlacement: string,
  tip: HTMLElement,
  arrow: HTMLElement,
): void {
  // The tip's real size: CSS narrows it on a small screen, and its height follows
  // its text. (The fallbacks are its desktop size, for a tip not yet laid out.)
  const TIP_W = tip.offsetWidth || 326;
  const TIP_H = tip.offsetHeight || 220;
  const MARGIN = 16;
  const ARROW_SIZE = 13;
  const GAP = 12;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const order = [preferredPlacement, "bottom", "top", "right", "left"];
  const unique = [...new Set(order)];
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(lo, v), Math.max(lo, hi));

  let placed = false;

  // First pass: a side where the tip fits centred on the target. Second pass: a side
  // where it fits once slid along that edge — on a phone the target is often in a
  // corner (the + button), where a centred tip would hang off the screen.
  for (const slide of [false, true]) {
    for (const side of unique) {
      let tx = 0,
        ty = 0;

      if (side === "right") {
        tx = r.right + pad + GAP;
        ty = r.top + r.height / 2 - TIP_H / 2;
      } else if (side === "left") {
        tx = r.left - pad - GAP - TIP_W;
        ty = r.top + r.height / 2 - TIP_H / 2;
      } else if (side === "bottom") {
        tx = r.left + r.width / 2 - TIP_W / 2;
        ty = r.bottom + pad + GAP;
      } else {
        tx = r.left + r.width / 2 - TIP_W / 2;
        ty = r.top - pad - GAP - TIP_H;
      }

      if (slide) {
        if (side === "top" || side === "bottom") tx = clamp(tx, MARGIN, vw - TIP_W - MARGIN);
        else ty = clamp(ty, MARGIN, vh - TIP_H - MARGIN);
      }

      if (
        tx >= MARGIN &&
        ty >= MARGIN &&
        tx + TIP_W <= vw - MARGIN &&
        ty + TIP_H <= vh - MARGIN
      ) {
        applyTipPosition(
          tip,
          arrow,
          tx,
          ty,
          side,
          r,
          pad,
          TIP_W,
          TIP_H,
          ARROW_SIZE,
        );
        placed = true;
        break;
      }
    }
    if (placed) break;
  }

  if (!placed) {
    // Clamp to viewport as last resort
    const tx = clamp(r.right + pad + GAP, MARGIN, vw - TIP_W - MARGIN);
    const ty = clamp(r.top, MARGIN, vh - TIP_H - MARGIN);
    applyTipPosition(
      tip,
      arrow,
      tx,
      ty,
      "right",
      r,
      pad,
      TIP_W,
      TIP_H,
      ARROW_SIZE,
    );
  }
}

function applyTipPosition(
  tip: HTMLElement,
  arrow: HTMLElement,
  tx: number,
  ty: number,
  side: string,
  r: DOMRect,
  pad: number,
  tipW: number,
  tipH: number,
  arrowSize: number,
): void {
  tip.style.left = `${tx}px`;
  tip.style.top = `${ty}px`;
  tip.dataset.placement = side;

  // Position arrow to point at target center
  const targetCx = r.left + r.width / 2;
  const targetCy = r.top + r.height / 2;

  if (side === "right") {
    arrow.style.left = `${-arrowSize / 2 - 1}px`;
    arrow.style.top = `${Math.min(Math.max(12, targetCy - ty - arrowSize / 2), tipH - arrowSize - 12)}px`;
    arrow.style.right = "";
    arrow.style.bottom = "";
  } else if (side === "left") {
    arrow.style.left = "";
    arrow.style.right = `${-arrowSize / 2 - 1}px`;
    arrow.style.top = `${Math.min(Math.max(12, targetCy - ty - arrowSize / 2), tipH - arrowSize - 12)}px`;
    arrow.style.bottom = "";
  } else if (side === "bottom") {
    arrow.style.top = `${-arrowSize / 2 - 1}px`;
    arrow.style.left = `${Math.min(Math.max(12, targetCx - tx - arrowSize / 2), tipW - arrowSize - 12)}px`;
    arrow.style.right = "";
    arrow.style.bottom = "";
  } else {
    arrow.style.bottom = `${-arrowSize / 2 - 1}px`;
    arrow.style.left = `${Math.min(Math.max(12, targetCx - tx - arrowSize / 2), tipW - arrowSize - 12)}px`;
    arrow.style.right = "";
    arrow.style.top = "";
  }
}

// ─── Gesture Ghost ────────────────────────────────────────────────────────────

function spawnGesture(s: TourStep): void {
  if (!Onb.overlay) return;
  clearGesture();

  const target = s.target();
  if (!target) return;

  const r = target.getBoundingClientRect();
  const ghost = el("div", "onb-ghost");

  if (s.gesture === "drag") {
    ghost.innerHTML = `<span class="material-icons">open_with</span>`;
    ghost.style.left = `${r.left + r.width / 2 - 13}px`;
    ghost.style.top = `${r.top + r.height / 2 - 13}px`;
    ghost.dataset.anim = "drag-x";
  } else {
    ghost.innerHTML = `<span class="material-icons">south_east</span>`;
    ghost.style.left = `${r.right - 20}px`;
    ghost.style.top = `${r.bottom - 20}px`;
    ghost.dataset.anim = "drag-diag";
  }

  document.body.appendChild(ghost);
  Onb.overlay.ghost = ghost;
}

function clearGesture(): void {
  Onb.overlay?.ghost?.remove();
  if (Onb.overlay) Onb.overlay.ghost = null;
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

function teardownTour(): void {
  if (!Onb.overlay) return;
  clearGesture();
  document.body.classList.remove("onb-links-emph");
  if (Onb.repositioner) window.removeEventListener("resize", Onb.repositioner);
  if (Onb.keyHandler) document.removeEventListener("keydown", Onb.keyHandler);
  Onb.overlay.wrap.remove();
  Onb.overlay = null;
  Onb.repositioner = null;
  Onb.keyHandler = null;
}

// ─── Keyboard ────────────────────────────────────────────────────────────────

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    teardownTour();
    return;
  }
  if (e.key === "ArrowRight") {
    const s = Onb.steps[Onb.stepIdx];
    if (s?.last) teardownTour();
    else gotoStep(Onb.stepIdx + 1);
    return;
  }
  if (e.key === "ArrowLeft") {
    gotoStep(Onb.stepIdx - 1);
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

export function initOnboarding(manager: FloatingViewManager): void {
  Onb.manager = manager;

  // Show on ?tutorial=true URL param
  if (new URLSearchParams(window.location.search).get("tutorial") === "true") {
    buildWelcome();
  }

  // Public API
  (window as any).Onb = {
    replay: () => {
      closeWelcome();
      buildWelcome();
    },
    startTour: () => {
      closeWelcome();
      openTourViews(() => startTour());
    },
    reset: () => {
      teardownTour();
      closeWelcome();
      buildWelcome();
    },
  };
}
