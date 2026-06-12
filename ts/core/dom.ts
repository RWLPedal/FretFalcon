// ts/core/dom.ts
// Thin DOM helpers.  Keep SMALL — this is a convenience layer, not a framework.
// No `style` prop — inline styles are allowed only for computed geometry (positions,
// canvas sizes); everything else should be a CSS class.

const SVG_NS = 'http://www.w3.org/2000/svg';

type EventsMap = { [E in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[E]) => void };

interface ElProps {
  class?: string | string[];
  text?: string;
  attrs?: Record<string, string>;
  dataset?: Record<string, string>;
  on?: EventsMap;
}

/**
 * Create a typed HTML element with optional class, text content, attributes,
 * dataset entries, and event listeners.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: ElProps,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);

  if (props) {
    if (props.class) {
      const classes = Array.isArray(props.class) ? props.class : props.class.split(' ');
      e.classList.add(...classes.filter(Boolean));
    }
    if (props.text != null) e.textContent = props.text;
    if (props.attrs) {
      for (const [k, v] of Object.entries(props.attrs)) e.setAttribute(k, v);
    }
    if (props.dataset) {
      for (const [k, v] of Object.entries(props.dataset)) e.dataset[k] = v;
    }
    if (props.on) {
      for (const [event, handler] of Object.entries(props.on)) {
        if (handler) e.addEventListener(event, handler as EventListener);
      }
    }
  }

  for (const child of children) {
    e.append(child);
  }

  return e;
}

/**
 * Create a typed SVG element with optional attributes.
 * Promoted from circle_of_fifths_view.ts.
 */
export function svgEl<T extends SVGElement>(
  tag: string,
  attrs: Record<string, string> = {},
  ...children: SVGElement[]
): T {
  const e = document.createElementNS(SVG_NS, tag) as T;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const child of children) e.appendChild(child);
  return e;
}

/** Create a DocumentFragment from a list of nodes or strings. */
export function frag(...children: (Node | string)[]): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const child of children) f.append(child);
  return f;
}
