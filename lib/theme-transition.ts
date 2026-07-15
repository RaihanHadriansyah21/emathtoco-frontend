'use client';

const THEME_TRANSITION_CLASS = 'theme-transitioning';
const THEME_TRANSITION_DURATION_MS = 360;

let themeTransitionTimer: number | null = null;

export function startThemeTransition(duration = THEME_TRANSITION_DURATION_MS) {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  root.classList.add(THEME_TRANSITION_CLASS);

  if (themeTransitionTimer) {
    window.clearTimeout(themeTransitionTimer);
  }

  themeTransitionTimer = window.setTimeout(() => {
    root.classList.remove(THEME_TRANSITION_CLASS);
    themeTransitionTimer = null;
  }, duration);
}

export function runWithThemeTransition(callback: () => void, duration = THEME_TRANSITION_DURATION_MS) {
  if (typeof window === 'undefined') {
    callback();
    return;
  }

  startThemeTransition(duration);
  window.requestAnimationFrame(callback);
}
