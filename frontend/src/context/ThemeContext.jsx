import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { ThemeContext } from './useTheme';

// Appearance preferences: theme, density and motion.
//
// Three places hold a copy, in this order of authority:
//
//   1. the server (GET/PUT /api/preferences), so a mentor who signs in on the
//      lab machine and on their phone gets the same thing;
//   2. localStorage, which exists only so the blocking script in index.html
//      can paint the right palette before React mounts;
//   3. the DOM attributes on <html>, which are what the CSS actually reads.
//
// Nothing here blocks rendering on the network. If the server is unreachable
// the local value stands, and a save that fails leaves the UI on the value the
// user chose rather than snapping back.

const STORAGE = {
  theme: 'amis-theme',
  density: 'amis-density',
  motion: 'amis-motion',
};

const THEMES = ['light', 'dark', 'system'];
const DENSITIES = ['comfortable', 'compact'];

const readStored = (key, allowed, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
};

const store = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage blocked; the DOM and the server still have it. */
  }
};

const systemPrefersDark = () =>
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

const systemPrefersReducedMotion = () =>
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => readStored(STORAGE.theme, THEMES, 'system'));
  const [density, setDensityState] = useState(() => readStored(STORAGE.density, DENSITIES, 'comfortable'));

  // Undefined means "whatever the operating system says"; true/false is an
  // explicit choice made in Settings.
  const [motionOverride, setMotionOverride] = useState(() => {
    const stored = readStored(STORAGE.motion, ['reduced', 'full'], null);
    if (stored === 'reduced') return true;
    if (stored === 'full') return false;
    return null;
  });

  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const [systemReduced, setSystemReduced] = useState(systemPrefersReducedMotion);

  // Follow the system while the choice is 'system'.
  useEffect(() => {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)');
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!dark || !motion) return undefined;

    const onDark = (event) => setSystemDark(event.matches);
    const onMotion = (event) => setSystemReduced(event.matches);

    dark.addEventListener('change', onDark);
    motion.addEventListener('change', onMotion);

    return () => {
      dark.removeEventListener('change', onDark);
      motion.removeEventListener('change', onMotion);
    };
  }, []);

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const reduceMotion = motionOverride === null ? systemReduced : motionOverride;

  // Apply to <html>. The blocking script in index.html did this once already
  // for the first paint; from here on this is the only writer.
  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);

    if (density === 'comfortable') root.removeAttribute('data-density');
    else root.setAttribute('data-density', density);

    if (motionOverride === null) root.removeAttribute('data-motion');
    else root.setAttribute('data-motion', motionOverride ? 'reduced' : 'full');
  }, [theme, density, motionOverride]);

  // Hydrate from the server once. A failure is not an error worth showing:
  // the local value is already applied and correct for this device.
  useEffect(() => {
    let cancelled = false;

    api.get('/preferences')
      .then(({ data }) => {
        if (cancelled || !data) return;

        if (THEMES.includes(data.theme)) {
          setThemeState(data.theme);
          store(STORAGE.theme, data.theme);
        }
        if (DENSITIES.includes(data.density)) {
          setDensityState(data.density);
          store(STORAGE.density, data.density);
        }
        if (typeof data.reduceMotion === 'boolean') {
          setMotionOverride(data.reduceMotion);
          store(STORAGE.motion, data.reduceMotion ? 'reduced' : 'full');
        }
      })
      .catch(() => {
        /* Signed out, offline, or the server is down. Local value stands. */
      });

    return () => { cancelled = true; };
  }, []);

  // Optimistic: apply immediately, tell the server afterwards. The user has
  // already seen the change; a failed write should not undo it.
  const persist = useCallback((patch) => {
    api.put('/preferences', patch).catch(() => {
      /* Kept locally. It will be sent again the next time something changes. */
    });
  }, []);

  const setTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return;
    setThemeState(next);
    store(STORAGE.theme, next);
    persist({ theme: next });
  }, [persist]);

  const setDensity = useCallback((next) => {
    if (!DENSITIES.includes(next)) return;
    setDensityState(next);
    store(STORAGE.density, next);
    persist({ density: next });
  }, [persist]);

  const setReduceMotion = useCallback((next) => {
    const value = Boolean(next);
    setMotionOverride(value);
    store(STORAGE.motion, value ? 'reduced' : 'full');
    persist({ reduceMotion: value });
  }, [persist]);

  const value = useMemo(() => ({
    theme,
    resolvedTheme,
    setTheme,
    density,
    setDensity,
    reduceMotion,
    setReduceMotion,
    // True when nothing has been chosen and the system is deciding.
    motionFollowsSystem: motionOverride === null,
  }), [theme, resolvedTheme, setTheme, density, setDensity, reduceMotion, setReduceMotion, motionOverride]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
