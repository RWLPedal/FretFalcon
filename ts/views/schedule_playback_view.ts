import { Interval } from '../schedule/schedule';
import { formatDuration } from '../time_utils';
import { getViewIconByFeatureType } from '../panels/panel_registry';

const FALLBACK_FEATURE_ICON = 'piano';
const NO_FEATURE_ICON = 'arrow_downward';

/**
 * Renders the live schedule playback panel.
 *
 * Layout:
 *   .playback-head             — schedule title + subtitle (total · intervals · groups)
 *   .playback-group-section    — colored wrapper (top border, bottom border)
 *     .playback-group-header   — group name | NOW PLAYING | feature badge (top-right)
 *     .playback-current-section — large time display + task name
 *   .playback-session-section  — segmented session bar + elapsed/total time
 *   .playback-controls         — ‹ Edit | ↺ | ⏮ | ⏸(large) | ⏭ | counter
 *   .playback-upcoming-section — UP NEXT list
 */
export class SchedulePlaybackView {
  private headEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private subtitleEl!: HTMLElement;
  private groupSectionEl!: HTMLElement;
  private groupHeaderEl!: HTMLElement;
  private groupNameEl!: HTMLElement;
  private featureBadgeEl!: HTMLElement;
  private timeDisplayEl!: HTMLElement;
  private taskNameEl!: HTMLElement;
  private sessionBarEl!: HTMLElement;
  private sessionProgressEl!: HTMLElement;
  private intervalCounterEl!: HTMLElement;
  private upcomingListEl!: HTMLElement;
  private totalTimerEl!: HTMLElement;

  // Buttons exposed for external wiring
  public pauseBtn!: HTMLButtonElement;
  public prevBtn!: HTMLButtonElement;
  public nextBtn!: HTMLButtonElement;
  public restartBtn!: HTMLButtonElement;
  public editBtn!: HTMLButtonElement;

  constructor(container: HTMLElement) {
    this.render(container);
  }

  private render(container: HTMLElement): void {
    container.innerHTML = '';
    container.classList.add('schedule-playback-view');

    // ── Head: schedule title + subtitle ──────────────────────────────────────
    this.headEl = document.createElement('div');
    this.headEl.classList.add('playback-head');
    this.headEl.hidden = true;

    this.titleEl = document.createElement('h2');
    this.titleEl.classList.add('playback-title');

    this.subtitleEl = document.createElement('div');
    this.subtitleEl.classList.add('playback-subtitle');

    this.headEl.appendChild(this.titleEl);
    this.headEl.appendChild(this.subtitleEl);
    container.appendChild(this.headEl);

    // ── Group section: colored wrapper for header + time/task ─────────────────
    this.groupSectionEl = document.createElement('div');
    this.groupSectionEl.classList.add('playback-group-section');

    // Group header row (group name | NOW PLAYING | feature badge)
    this.groupHeaderEl = document.createElement('div');
    this.groupHeaderEl.classList.add('playback-group-header');
    this.groupHeaderEl.style.display = 'none';

    this.groupNameEl = document.createElement('span');
    this.groupNameEl.classList.add('playback-group-name');

    const nowPlayingLabel = document.createElement('span');
    nowPlayingLabel.classList.add('playback-now-playing-label');
    nowPlayingLabel.textContent = 'NOW PLAYING';

    this.featureBadgeEl = document.createElement('div');
    this.featureBadgeEl.classList.add('playback-feature-badge');
    this.featureBadgeEl.hidden = true;

    this.groupHeaderEl.appendChild(this.groupNameEl);
    this.groupHeaderEl.appendChild(nowPlayingLabel);
    this.groupHeaderEl.appendChild(this.featureBadgeEl);
    this.groupSectionEl.appendChild(this.groupHeaderEl);

    // Current interval: time + task name
    const currentSection = document.createElement('div');
    currentSection.classList.add('playback-current-section');

    const timeRow = document.createElement('div');
    timeRow.classList.add('playback-time-row');

    this.timeDisplayEl = document.createElement('div');
    this.timeDisplayEl.classList.add('playback-time-display');
    this.timeDisplayEl.textContent = '0:00';

    this.taskNameEl = document.createElement('div');
    this.taskNameEl.classList.add('playback-task-name');

    timeRow.appendChild(this.timeDisplayEl);
    timeRow.appendChild(this.taskNameEl);
    currentSection.appendChild(timeRow);
    this.groupSectionEl.appendChild(currentSection);

    container.appendChild(this.groupSectionEl);

    // ── Session bar ───────────────────────────────────────────────────────────
    const sessionSection = document.createElement('div');
    sessionSection.classList.add('playback-session-section');

    const sessionLabel = document.createElement('span');
    sessionLabel.classList.add('playback-session-label');
    sessionLabel.textContent = 'SESSION';

    const sessionBarWrapper = document.createElement('div');
    sessionBarWrapper.classList.add('playback-session-bar-wrapper');

    this.sessionProgressEl = document.createElement('div');
    this.sessionProgressEl.classList.add('playback-session-progress');

    this.sessionBarEl = document.createElement('div');
    this.sessionBarEl.classList.add('playback-session-segments');
    sessionBarWrapper.appendChild(this.sessionProgressEl);
    sessionBarWrapper.appendChild(this.sessionBarEl);

    this.totalTimerEl = document.createElement('span');
    this.totalTimerEl.classList.add('playback-total-timer');
    this.totalTimerEl.textContent = '0:00 / 0:00';

    sessionSection.appendChild(sessionLabel);
    sessionSection.appendChild(sessionBarWrapper);
    sessionSection.appendChild(this.totalTimerEl);
    container.appendChild(sessionSection);

    // ── Controls ──────────────────────────────────────────────────────────────
    const controls = document.createElement('div');
    controls.classList.add('playback-controls');

    this.editBtn = this._makeControlBtn('‹ Edit', 'Back to editor', 'playback-ctrl-btn', 'playback-edit-btn');
    this.restartBtn = this._makeControlBtn('↺', 'Restart interval', 'playback-ctrl-btn');
    this.prevBtn = this._makeControlBtn('⏮', 'Previous interval', 'playback-ctrl-btn');

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.type = 'button';
    this.pauseBtn.title = 'Play';
    this.pauseBtn.classList.add('playback-pause-btn');
    this.pauseBtn.innerHTML = '<span class="material-icons">play_arrow</span>';

    this.nextBtn = this._makeControlBtn('⏭', 'Next interval', 'playback-ctrl-btn');

    this.intervalCounterEl = document.createElement('span');
    this.intervalCounterEl.classList.add('playback-interval-counter');
    this.intervalCounterEl.textContent = '';

    controls.appendChild(this.editBtn);
    controls.appendChild(this.restartBtn);
    controls.appendChild(this.prevBtn);
    controls.appendChild(this.pauseBtn);
    controls.appendChild(this.nextBtn);
    controls.appendChild(this.intervalCounterEl);
    container.appendChild(controls);

    // ── Upcoming ──────────────────────────────────────────────────────────────
    const upcomingSection = document.createElement('div');
    upcomingSection.classList.add('playback-upcoming-section');

    const upcomingLabel = document.createElement('p');
    upcomingLabel.classList.add('playback-section-label');
    upcomingLabel.textContent = 'UP NEXT';

    this.upcomingListEl = document.createElement('ol');
    this.upcomingListEl.classList.add('playback-upcoming-list');

    upcomingSection.appendChild(upcomingLabel);
    upcomingSection.appendChild(this.upcomingListEl);
    container.appendChild(upcomingSection);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  setScheduleInfo(name: string, totalSec: number, intervalCount: number, groupCount: number): void {
    this.headEl.hidden = !name;
    this.titleEl.textContent = name;
    this.subtitleEl.textContent = name
      ? `${formatDuration(totalSec)} · ${intervalCount} intervals · ${groupCount} groups`
      : '';
  }

  setGroupContext(name: string, color: string): void {
    this.groupNameEl.textContent = name;
    this.groupHeaderEl.style.display = name ? '' : 'none';
    this.groupSectionEl.classList.toggle('playback-group-section--active', !!name);
    this.groupSectionEl.style.setProperty(
      '--current-group-color',
      name && color ? `var(${color})` : 'transparent',
    );
  }

  setCurrentFeature(typeName: string | null): void {
    this.featureBadgeEl.innerHTML = '';
    if (typeName) {
      const iconEl = document.createElement('span');
      iconEl.classList.add('material-icons');
      iconEl.textContent = getViewIconByFeatureType(typeName) ?? FALLBACK_FEATURE_ICON;
      const nameEl = document.createElement('span');
      nameEl.textContent = typeName;
      this.featureBadgeEl.appendChild(iconEl);
      this.featureBadgeEl.appendChild(nameEl);
      this.featureBadgeEl.hidden = false;
    } else {
      this.featureBadgeEl.hidden = true;
    }
  }

  setCurrentTime(seconds: number): void {
    this.timeDisplayEl.textContent = formatDuration(seconds);
  }

  setIntervalDuration(_seconds: number): void {}

  setCurrentTask(name: string): void {
    this.taskNameEl.textContent = name;
  }

  setPauseState(isRunning: boolean): void {
    const icon = isRunning ? 'pause' : 'play_arrow';
    this.pauseBtn.title = isRunning ? 'Pause' : 'Play';
    const iconEl = this.pauseBtn.querySelector<HTMLElement>('.material-icons');
    if (iconEl) iconEl.textContent = icon;
    this.pauseBtn.classList.toggle('playback-pause-btn--playing', isRunning);
  }

  setSessionSegments(segments: { fraction: number; color: string }[]): void {
    this.sessionBarEl.innerHTML = '';
    segments.forEach(({ fraction, color }) => {
      const seg = document.createElement('div');
      seg.classList.add('session-segment');
      seg.style.width = `${fraction * 100}%`;
      seg.style.backgroundColor = `var(${color})`;
      this.sessionBarEl.appendChild(seg);
    });
  }

  setIntervalCounter(current: number, total: number): void {
    this.intervalCounterEl.textContent = `${current}/${total}`;
  }

  setTotalTime(elapsed: number, total: number): void {
    this.totalTimerEl.textContent = `${formatDuration(elapsed)} / ${formatDuration(total)}`;
    if (total > 0) {
      this.sessionProgressEl.style.width = `${(elapsed / total) * 100}%`;
    }
  }

  setUpcoming(intervals: Interval[], isEndVisible: boolean): void {
    this.upcomingListEl.innerHTML = '';

    if (intervals.length === 0 && !isEndVisible) {
      const li = document.createElement('li');
      li.classList.add('playback-upcoming-empty');
      li.textContent = '(No upcoming tasks)';
      this.upcomingListEl.appendChild(li);
      return;
    }

    intervals.forEach((interval, i) => {
      const li = this._createUpcomingItem(
        (interval.task || '(Untitled)') + (interval.isIntroActive() ? ' (Warmup)' : ''),
        interval.duration,
        i === 0,
        interval.feature?.typeName ?? null,
      );
      this.upcomingListEl.appendChild(li);
    });

    if (isEndVisible) {
      const li = document.createElement('li');
      li.classList.add('playback-upcoming-item', 'playback-upcoming-end');
      const nameSpan = document.createElement('span');
      nameSpan.classList.add('playback-upcoming-name');
      nameSpan.textContent = 'END';
      li.appendChild(nameSpan);
      this.upcomingListEl.appendChild(li);
    }
  }

  private _createUpcomingItem(name: string, durationSeconds: number, isNext: boolean, featureTypeName: string | null): HTMLLIElement {
    const li = document.createElement('li');
    li.classList.add('playback-upcoming-item');

    if (isNext) {
      const badge = document.createElement('span');
      badge.classList.add('upcoming-next-badge');
      badge.textContent = 'NEXT';
      li.appendChild(badge);
    }

    const icon = document.createElement('span');
    icon.classList.add('playback-upcoming-icon', 'material-icons');
    icon.textContent = featureTypeName
      ? (getViewIconByFeatureType(featureTypeName) ?? FALLBACK_FEATURE_ICON)
      : NO_FEATURE_ICON;
    li.appendChild(icon);

    const nameSpan = document.createElement('span');
    nameSpan.classList.add('playback-upcoming-name');
    nameSpan.textContent = name;

    const durSpan = document.createElement('span');
    durSpan.classList.add('playback-upcoming-duration');
    durSpan.textContent = formatDuration(durationSeconds);

    li.appendChild(nameSpan);
    li.appendChild(durSpan);
    return li;
  }

  private _makeControlBtn(text: string, title: string, ...classes: string[]): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.title = title;
    btn.classList.add(...classes);
    return btn;
  }
}
