import { volumeManager } from '../../sounds/volume_manager';

export class VolumeControl {
  /** The inline wrapper (just the icon button). Append this into your toolbar. */
  readonly el: HTMLElement;

  private readonly popup: HTMLElement;

  constructor() {
    const { wrap, popup } = this.build();
    this.el    = wrap;
    this.popup = popup;
  }

  private build(): { wrap: HTMLElement; popup: HTMLElement } {
    const wrap = document.createElement('div');
    wrap.classList.add('vol-ctrl');

    const btn = document.createElement('button');
    btn.classList.add('topbar-icon-button', 'vol-ctrl-btn');
    btn.title = 'Volume';
    const icon = document.createElement('span');
    icon.classList.add('material-icons');
    btn.appendChild(icon);
    wrap.appendChild(btn);

    const popup = document.createElement('div');
    popup.classList.add('vol-ctrl-popup');
    popup.setAttribute('hidden', '');
    document.body.appendChild(popup);

    const titleBar = document.createElement('div');
    titleBar.classList.add('vol-ctrl-popup-title');
    titleBar.textContent = 'Volume';
    popup.appendChild(titleBar);

    const body = document.createElement('div');
    body.classList.add('vol-ctrl-popup-body');

    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.min   = '0';
    slider.max   = '1';
    slider.step  = '0.05';
    slider.value = String(volumeManager.getVolume());
    slider.classList.add('vol-ctrl-slider');

    const pct = document.createElement('span');
    pct.classList.add('vol-ctrl-pct');
    pct.textContent = `${Math.round(volumeManager.getVolume() * 100)}%`;

    body.appendChild(slider);
    body.appendChild(pct);
    popup.appendChild(body);

    const updateIcon = (v: number) => {
      if (v === 0)      icon.textContent = 'volume_off';
      else if (v < 0.5) icon.textContent = 'volume_down';
      else              icon.textContent = 'volume_up';
    };
    updateIcon(volumeManager.getVolume());

    const positionPopup = () => {
      const rect = btn.getBoundingClientRect();
      const pw   = popup.offsetWidth || 170;
      let left   = rect.left + rect.width / 2 - pw / 2;
      left       = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      popup.style.left   = `${left}px`;
      popup.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (popup.hasAttribute('hidden')) {
        popup.removeAttribute('hidden');
        positionPopup();
      } else {
        popup.setAttribute('hidden', '');
      }
    });

    slider.addEventListener('input', () => {
      volumeManager.setVolume(parseFloat(slider.value));
    });

    volumeManager.onChange((v) => {
      slider.value    = String(v);
      pct.textContent = `${Math.round(v * 100)}%`;
      updateIcon(v);
    });

    popup.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => popup.setAttribute('hidden', ''));

    return { wrap, popup };
  }
}
