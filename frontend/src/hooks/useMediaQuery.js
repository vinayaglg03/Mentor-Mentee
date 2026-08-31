import { useCallback, useSyncExternalStore } from 'react';

// Reads a CSS media query from JavaScript, and keeps up when it changes.
//
// Used where a component has to behave differently, not merely look different:
// the sidebar is a drawer below 768px and needs a focus trap and an inert
// closed state, neither of which CSS can express.
//
// useSyncExternalStore rather than useState + useEffect, because matchMedia is
// exactly the external store it exists for - no first-render flash, and no
// setState during an effect.

export const useMediaQuery = (query) => {
  const subscribe = useCallback((notify) => {
    const media = window.matchMedia(query);
    media.addEventListener('change', notify);
    return () => media.removeEventListener('change', notify);
  }, [query]);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // Server snapshot: there is no viewport during a build, and the wide
    // layout is the safer assumption.
    () => false,
  );
};
