import { useCallback, useEffect, useRef, useState } from 'react';
import {
  enterFullscreen,
  exitFullscreen,
  isDocumentFullscreen,
  isFullscreenSupported,
  subscribeFullscreenChange,
  toggleFullscreen as toggleDocumentFullscreen,
} from '../utils/fullscreen';

export function useFullscreenState() {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => isDocumentFullscreen());

  useEffect(() => {
    setIsFullscreen(isDocumentFullscreen());
    return subscribeFullscreenChange((next) => {
      setIsFullscreen(next);
    });
  }, []);

  const toggleFullscreen = useCallback(() => toggleDocumentFullscreen(), []);

  return {
    isFullscreen,
    isSupported: isFullscreenSupported(),
    enterFullscreen: () => enterFullscreen(),
    exitFullscreen: () => exitFullscreen(),
    toggleFullscreen,
  };
}

/**
 * Automatically enters browser fullscreen when `enabled` is true (e.g. monitor / juri panels).
 * Attempts immediate fullscreen entry and arms a one-time user-gesture fallback if the browser
 * blocks non-gesture fullscreen (such as direct URL loads or refreshes). If the user explicitly
 * exits fullscreen (via Escape or toggle), auto re-entry pauses until leaving and re-entering.
 */
export function useAutoFullscreen(enabled: boolean) {
  const { isFullscreen, isSupported, toggleFullscreen } = useFullscreenState();
  const wasFullscreenRef = useRef<boolean>(isDocumentFullscreen());
  const userDismissedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled) {
      userDismissedRef.current = false;
      wasFullscreenRef.current = isDocumentFullscreen();
      return;
    }

    let cancelled = false;
    userDismissedRef.current = false;
    wasFullscreenRef.current = isDocumentFullscreen();

    let gestureCleanup: (() => void) | null = null;

    const detachGestureFallback = () => {
      if (gestureCleanup) {
        gestureCleanup();
        gestureCleanup = null;
      }
    };

    const attachGestureFallback = () => {
      if (gestureCleanup || typeof document === 'undefined') return;

      const onGesture = (event: Event) => {
        if (cancelled || userDismissedRef.current || isDocumentFullscreen()) {
          detachGestureFallback();
          return;
        }
        if (event instanceof KeyboardEvent && event.key === 'Escape') {
          return;
        }
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-fullscreen-ignore="true"]')) {
          return;
        }
        void enterFullscreen().then((entered) => {
          if (entered) {
            wasFullscreenRef.current = true;
            detachGestureFallback();
          }
        });
      };

      document.addEventListener('pointerdown', onGesture, true);
      document.addEventListener('keydown', onGesture, true);
      gestureCleanup = () => {
        document.removeEventListener('pointerdown', onGesture, true);
        document.removeEventListener('keydown', onGesture, true);
      };
    };

    const unsubscribe = subscribeFullscreenChange((nextIsFullscreen) => {
      if (nextIsFullscreen) {
        wasFullscreenRef.current = true;
        detachGestureFallback();
      } else if (wasFullscreenRef.current) {
        wasFullscreenRef.current = false;
        userDismissedRef.current = true;
        detachGestureFallback();
      }
    });

    if (!isDocumentFullscreen()) {
      void enterFullscreen().then((entered) => {
        if (cancelled) return;
        if (entered) {
          wasFullscreenRef.current = true;
          detachGestureFallback();
        } else if (!userDismissedRef.current) {
          attachGestureFallback();
        }
      });
    }

    return () => {
      cancelled = true;
      unsubscribe();
      detachGestureFallback();
    };
  }, [enabled]);

  return {
    isFullscreen,
    isSupported,
    toggleFullscreen,
  };
}
