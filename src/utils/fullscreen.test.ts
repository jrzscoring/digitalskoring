import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enterFullscreen,
  exitFullscreen,
  isDocumentFullscreen,
  isFullscreenSupported,
  shouldAutoFullscreenView,
  subscribeFullscreenChange,
  toggleFullscreen,
} from './fullscreen.ts';

function createMockFullscreenDom({ rejectRequest = false, webkitOnly = false } = {}) {
  const listeners = new Map<string, Set<() => void>>();

  const emit = (eventName: string) => {
    listeners.get(eventName)?.forEach((fn) => fn());
  };

  const docEl: Record<string, unknown> = {};
  const doc: Record<string, unknown> = {
    documentElement: docEl,
    fullscreenElement: null,
    fullscreenEnabled: true,
    addEventListener(eventName: string, fn: () => void) {
      if (!listeners.has(eventName)) listeners.set(eventName, new Set());
      listeners.get(eventName)!.add(fn);
    },
    removeEventListener(eventName: string, fn: () => void) {
      listeners.get(eventName)?.delete(fn);
    },
  };

  if (webkitOnly) {
    doc.webkitFullscreenElement = null;
    doc.webkitFullscreenEnabled = true;
    docEl.webkitRequestFullscreen = async () => {
      if (rejectRequest) throw new Error('Gesture required');
      doc.webkitFullscreenElement = docEl;
      emit('webkitfullscreenchange');
    };
    doc.webkitExitFullscreen = async () => {
      doc.webkitFullscreenElement = null;
      emit('webkitfullscreenchange');
    };
  } else {
    docEl.requestFullscreen = async () => {
      if (rejectRequest) throw new Error('Gesture required');
      doc.fullscreenElement = docEl;
      emit('fullscreenchange');
    };
    doc.exitFullscreen = async () => {
      doc.fullscreenElement = null;
      emit('fullscreenchange');
    };
  }

  return {
    doc: doc as unknown as Document,
    docEl: docEl as unknown as HTMLElement,
  };
}

test('shouldAutoFullscreenView returns true only for scoreboard and juri', () => {
  assert.equal(shouldAutoFullscreenView('scoreboard'), true);
  assert.equal(shouldAutoFullscreenView('juri'), true);
  assert.equal(shouldAutoFullscreenView('landing'), false);
  assert.equal(shouldAutoFullscreenView('sekretaris'), false);
  assert.equal(shouldAutoFullscreenView('dewan'), false);
  assert.equal(shouldAutoFullscreenView('timer'), false);
});

test('enterFullscreen, exitFullscreen, and toggleFullscreen manage standard DOM state', async () => {
  const { doc, docEl } = createMockFullscreenDom();

  assert.equal(isFullscreenSupported(docEl, doc), true);
  assert.equal(isDocumentFullscreen(doc), false);

  const entered = await enterFullscreen(docEl, doc);
  assert.equal(entered, true);
  assert.equal(isDocumentFullscreen(doc), true);

  const exited = await exitFullscreen(doc);
  assert.equal(exited, true);
  assert.equal(isDocumentFullscreen(doc), false);

  const toggledIn = await toggleFullscreen(docEl, doc);
  assert.equal(toggledIn, true);
  assert.equal(isDocumentFullscreen(doc), true);

  const toggledOut = await toggleFullscreen(docEl, doc);
  assert.equal(toggledOut, true);
  assert.equal(isDocumentFullscreen(doc), false);
});

test('enterFullscreen and subscribeFullscreenChange support Safari webkit prefix', async () => {
  const { doc, docEl } = createMockFullscreenDom({ webkitOnly: true });
  const observed: boolean[] = [];
  const unsubscribe = subscribeFullscreenChange((state) => observed.push(state), doc);

  assert.equal(isFullscreenSupported(docEl, doc), true);
  assert.equal(await enterFullscreen(docEl, doc), true);
  assert.equal(isDocumentFullscreen(doc), true);
  assert.equal(await exitFullscreen(doc), true);
  assert.equal(isDocumentFullscreen(doc), false);
  assert.deepEqual(observed, [true, false]);

  unsubscribe();
});

test('enterFullscreen resolves safely to false when browser blocks fullscreen', async () => {
  const { doc, docEl } = createMockFullscreenDom({ rejectRequest: true });
  const entered = await enterFullscreen(docEl, doc);
  assert.equal(entered, false);
  assert.equal(isDocumentFullscreen(doc), false);
});
