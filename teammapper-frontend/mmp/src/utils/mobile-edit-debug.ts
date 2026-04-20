/**
 * Diagnostic helpers for issue #1249 (cannot edit node text on Android Chrome
 * and iOS Safari). Toggled per-session so real devices can remote-debug
 * without opening DevTools — an on-screen overlay prints the event log.
 *
 * Enable with `?mobileEditDebug=1` or `localStorage.mobileEditDebug = '1'`.
 * Hypothesis A/B: `?mobileEditSkipPrevent=1` skips `preventDefault()` on the
 * touchstart that enters edit mode, in case it was suppressing the soft
 * keyboard via the mobile user-gesture gate.
 */

const FLAG_DEBUG = 'mobileEditDebug';
const FLAG_SKIP_PREVENT = 'mobileEditSkipPrevent';
const MAX_ENTRIES = 40;
const PANEL_ID = 'mobile-edit-debug-panel';

interface LogEntry {
  time: string;
  msg: string;
  data?: Record<string, unknown>;
}

const entries: LogEntry[] = [];
let panel: HTMLDivElement | null = null;

const readFlag = (name: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).get(name) === '1') {
      return true;
    }
    return window.localStorage?.getItem(name) === '1';
  } catch {
    return false;
  }
};

export const isMobileEditDebugEnabled = (): boolean => readFlag(FLAG_DEBUG);

export const shouldSkipEditPreventDefault = (): boolean =>
  readFlag(FLAG_SKIP_PREVENT);

const mountPanel = (): HTMLDivElement | null => {
  if (typeof document === 'undefined') return null;
  if (panel) return panel;
  const el = document.createElement('div');
  el.id = PANEL_ID;
  el.style.cssText = [
    'position:fixed',
    'bottom:0',
    'left:0',
    'right:0',
    'max-height:40vh',
    'overflow:auto',
    'background:rgba(0,0,0,0.85)',
    'color:#0f0',
    'font:10px/1.2 monospace',
    'padding:4px 6px',
    'z-index:2147483647',
    'white-space:pre-wrap',
    'word-break:break-all',
    'pointer-events:auto',
  ].join(';');
  document.body.appendChild(el);
  panel = el;
  return panel;
};

const renderPanel = (): void => {
  if (!panel) return;
  panel.textContent = entries
    .slice()
    .reverse()
    .map(e => `${e.time} ${e.msg}${e.data ? ' ' + JSON.stringify(e.data) : ''}`)
    .join('\n');
};

export const mobileEditDebugLog = (
  msg: string,
  data?: Record<string, unknown>
): void => {
  if (!isMobileEditDebugEnabled()) return;
  const entry: LogEntry = {
    time: new Date().toISOString().slice(11, 23),
    msg,
    data,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  try {
    console.debug('[mobile-edit]', msg, data ?? '');
  } catch {
    // console may be unavailable in some exotic webviews
  }
  if (!panel) mountPanel();
  renderPanel();
};
