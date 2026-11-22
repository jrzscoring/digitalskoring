import type { AppView } from '../types/silat';

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
  msFullscreenElement?: Element | null;
  msExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

export const AUTO_FULLSCREEN_VIEWS: ReadonlySet<AppView> = new Set<AppView>([
  'scoreboard',
  'juri',
]);

export function shouldAutoFullscreenView(view: AppView): boolean {
  return AUTO_FULLSCREEN_VIEWS.has(view);
}

export function getFullscreenElement(
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined
): Element | null {
  if (!doc) return null;
  const fsDoc = doc as FullscreenDocument;
  return (
    fsDoc.fullscreenElement ??
    fsDoc.webkitFullscreenElement ??
    fsDoc.msFullscreenElement ??
    null
  );
}

export function isDocumentFullscreen(doc?: Document): boolean {
  return Boolean(getFullscreenElement(doc));
}

export function isFullscreenSupported(
  target?: HTMLElement | null,
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined
): boolean {
  if (!doc) return false;
  const fsDoc = doc as FullscreenDocument;
  const el = (target ?? doc.documentElement) as FullscreenElement | null | undefined;
  if (!el) return false;
  const hasRequest = Boolean(
    el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen
  );
  if (!hasRequest) return false;
  if (typeof fsDoc.fullscreenEnabled === 'boolean') return fsDoc.fullscreenEnabled;
  if (typeof fsDoc.webkitFullscreenEnabled === 'boolean') return fsDoc.webkitFullscreenEnabled;
  return true;
}

export async function enterFullscreen(
  target?: HTMLElement | null,
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined
): Promise<boolean> {
  if (!doc) return false;
  if (isDocumentFullscreen(doc)) return true;
  const el = (target ?? doc.documentElement) as FullscreenElement | null | undefined;
  if (!el) return false;

  try {
    if (typeof el.requestFullscreen === 'function') {
      await el.requestFullscreen();
      return isDocumentFullscreen(doc);
    }
    if (typeof el.webkitRequestFullscreen === 'function') {
      await el.webkitRequestFullscreen();
      return isDocumentFullscreen(doc);
    }
    if (typeof el.msRequestFullscreen === 'function') {
      await el.msRequestFullscreen();
      return isDocumentFullscreen(doc);
    }
    return false;
  } catch {
    return false;
  }
}

export async function exitFullscreen(
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined
): Promise<boolean> {
  if (!doc) return false;
  if (!isDocumentFullscreen(doc)) return true;
  const fsDoc = doc as FullscreenDocument;

  try {
    if (typeof fsDoc.exitFullscreen === 'function') {
      await fsDoc.exitFullscreen();
      return !isDocumentFullscreen(doc);
    }
    if (typeof fsDoc.webkitExitFullscreen === 'function') {
      await fsDoc.webkitExitFullscreen();
      return !isDocumentFullscreen(doc);
    }
    if (typeof fsDoc.msExitFullscreen === 'function') {
      await fsDoc.msExitFullscreen();
      return !isDocumentFullscreen(doc);
    }
    return false;
  } catch {
    return false;
  }
}

export async function toggleFullscreen(
  target?: HTMLElement | null,
  doc?: Document
): Promise<boolean> {
  if (isDocumentFullscreen(doc)) {
    return exitFullscreen(doc);
  }
  return enterFullscreen(target, doc);
}

export function subscribeFullscreenChange(
  onChange: (isFullscreen: boolean) => void,
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined
): () => void {
  if (!doc) return () => {};
  const handler = () => {
    onChange(isDocumentFullscreen(doc));
  };
  doc.addEventListener('fullscreenchange', handler);
  doc.addEventListener('webkitfullscreenchange', handler);
  doc.addEventListener('MSFullscreenChange', handler);
  return () => {
    doc.removeEventListener('fullscreenchange', handler);
    doc.removeEventListener('webkitfullscreenchange', handler);
    doc.removeEventListener('MSFullscreenChange', handler);
  };
}
