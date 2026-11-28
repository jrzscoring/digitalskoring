import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PORTAL_ACCESS_PASSCODE,
  buildEventShareUrl,
  buildStationShareUrl,
  courtIdFromCourtLetter,
  detectClientDeviceLabel,
  formatFirebaseAuthError,
  getAccountArenaId,
  isFullJuriUnlockedForMode,
  isJudgeIdAllowedForMode,
  isOwnAccountArenaId,
  isSuperAdminEmail,
  parseScannedQrPayload,
  parseStationShareLink,
  resolveCourtForArenaId,
  resolvePortalLoginInput,
  resolvePortalModeAfterGoogleLogin,
  resolveTargetAppView,
  shouldShowLimitedModeNotice,
  validateOfficialProfileInput,
  verifyPortalPasscode,
} from './authSession';

test('resolvePortalLoginInput enters guest mode on empty input, full mode on 211096, and rejects wrong password', () => {
  assert.deepEqual(resolvePortalLoginInput(''), { ok: true, mode: 'guest' });
  assert.deepEqual(resolvePortalLoginInput('   '), { ok: true, mode: 'guest' });
  assert.deepEqual(resolvePortalLoginInput('211096'), { ok: true, mode: 'full' });
  assert.deepEqual(resolvePortalLoginInput(' 211096 '), { ok: true, mode: 'full' });

  const bad = resolvePortalLoginInput('999999');
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.ok(bad.error);
  }
});

test('verifyPortalPasscode validates exact 211096 login password', () => {
  assert.equal(PORTAL_ACCESS_PASSCODE, '211096');
  assert.deepEqual(verifyPortalPasscode('211096'), { valid: true });
  assert.deepEqual(verifyPortalPasscode(' 211096 '), { valid: true });

  const empty = verifyPortalPasscode('   ');
  assert.equal(empty.valid, false);
  assert.ok(empty.error);

  const wrong = verifyPortalPasscode('123456');
  assert.equal(wrong.valid, false);
  assert.ok(wrong.error);
});

test('isFullJuriUnlockedForMode and isJudgeIdAllowedForMode restrict guest mode to Juri 1 only', () => {
  assert.equal(isFullJuriUnlockedForMode('locked'), false);
  assert.equal(isFullJuriUnlockedForMode('guest'), false);
  assert.equal(isFullJuriUnlockedForMode('full'), true);

  assert.equal(isJudgeIdAllowedForMode(1, 'guest'), true);
  assert.equal(isJudgeIdAllowedForMode(2, 'guest'), false);
  assert.equal(isJudgeIdAllowedForMode(3, 'guest'), false);
  assert.equal(isJudgeIdAllowedForMode(10, 'guest'), false);

  for (let jid = 1; jid <= 10; jid += 1) {
    assert.equal(isJudgeIdAllowedForMode(jid, 'full'), true);
  }

  assert.equal(resolvePortalModeAfterGoogleLogin('locked'), 'guest');
  assert.equal(resolvePortalModeAfterGoogleLogin('guest'), 'guest');
  assert.equal(resolvePortalModeAfterGoogleLogin('full'), 'full');

  assert.equal(
    shouldShowLimitedModeNotice({ userUid: 'uid-1', isFullJuriUnlocked: false, acknowledgedUid: null }),
    true
  );
  assert.equal(
    shouldShowLimitedModeNotice({ userUid: 'uid-1', isFullJuriUnlocked: false, acknowledgedUid: 'uid-1' }),
    false
  );
  assert.equal(
    shouldShowLimitedModeNotice({ userUid: 'uid-1', isFullJuriUnlocked: true, acknowledgedUid: null }),
    false
  );
  assert.equal(
    shouldShowLimitedModeNotice({ userUid: null, isFullJuriUnlocked: false, acknowledgedUid: null }),
    false
  );
});

test('isSuperAdminEmail requires exact verified email match', () => {
  assert.equal(isSuperAdminEmail('dmenterior@gmail.com', true), true);
  assert.equal(isSuperAdminEmail('DMENTERIOR@GMAIL.COM', true), true);
  assert.equal(isSuperAdminEmail('dmenterior@gmail.com', false), false);
  assert.equal(isSuperAdminEmail('other@gmail.com', true), false);
  assert.equal(isSuperAdminEmail(null, true), false);
});

test('courtIdFromCourtLetter and resolveTargetAppView map station routes cleanly', () => {
  assert.equal(courtIdFromCourtLetter('A'), 'gelanggang-a');
  assert.equal(courtIdFromCourtLetter('C'), 'gelanggang-c');
  assert.equal(resolveTargetAppView('Sekretaris', false), 'landing');
  assert.equal(resolveTargetAppView('Sekretaris', true), 'sekretaris');
  assert.equal(resolveTargetAppView('Dewan', true), 'dewan');
  assert.equal(resolveTargetAppView('Timer', true), 'timer');
  assert.equal(resolveTargetAppView('Juri', true), 'juri');
  assert.equal(resolveTargetAppView('Scoreboard', true), 'scoreboard');
});

test('detectClientDeviceLabel parses browser and OS concisely', () => {
  assert.equal(
    detectClientDeviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36'),
    'Chrome · Windows'
  );
  assert.equal(
    detectClientDeviceLabel('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1'),
    'Safari · iPadOS'
  );
  assert.equal(detectClientDeviceLabel(''), 'Perangkat Resmi');
});

test('formatFirebaseAuthError translates Firebase Auth codes into clear Indonesian guidance', () => {
  assert.match(formatFirebaseAuthError({ code: 'auth/popup-blocked' }), /Popup login diblokir/i);
  assert.match(formatFirebaseAuthError({ code: 'auth/popup-closed-by-user' }), /ditutup/i);
  assert.match(formatFirebaseAuthError({ code: 'auth/network-request-failed' }), /Koneksi internet/i);
});

test('validateOfficialProfileInput validates name, field lengths, and arena ID format', () => {
  const validOwn = validateOfficialProfileInput({
    displayName: 'Raden Wijaya',
    licenseNumber: 'SK-IPSI-NAS-2026-001',
    contingentOrigin: 'PB IPSI',
    preferredRole: 'Sekretaris',
    preferredCourt: 'A',
    connectionMode: 'own',
  });
  assert.equal(validOwn.valid, true);
  assert.deepEqual(validOwn.errors, {});

  const badJoin = validateOfficialProfileInput({
    displayName: 'A',
    preferredRole: 'Juri',
    preferredCourt: 'B',
    preferredJudgeNumber: 2,
    connectionMode: 'join',
    targetArenaId: 'arena invalid space!',
  });
  assert.equal(badJoin.valid, false);
  assert.ok(badJoin.errors.displayName);
  assert.ok(badJoin.errors.targetArenaId);
});

test('getAccountArenaId, isOwnAccountArenaId, and resolveCourtForArenaId isolate events per Google UID', () => {
  const uidA = 'userAlpha123456789';
  const uidB = 'userBeta987654321';

  const arenaA1 = getAccountArenaId(uidA, 'A');
  const arenaA2 = getAccountArenaId(uidA, 'B');
  const arenaB1 = getAccountArenaId(uidB, 'A');

  assert.equal(arenaA1, 'arena-userAlpha123');
  assert.equal(arenaA2, 'arena-userAlpha123-b');
  assert.equal(arenaB1, 'arena-userBeta9876');
  assert.notEqual(arenaA1, arenaB1);

  assert.equal(isOwnAccountArenaId(arenaA1, uidA), true);
  assert.equal(isOwnAccountArenaId(arenaA2, uidA), true);
  assert.equal(isOwnAccountArenaId(arenaB1, uidA), false);
  assert.equal(isOwnAccountArenaId('gelanggang-a', uidA), false);

  assert.equal(resolveCourtForArenaId(arenaA1, uidA), 'A');
  assert.equal(resolveCourtForArenaId(arenaA2, uidA), 'B');
  assert.equal(resolveCourtForArenaId('gelanggang-c', null), 'C');
  assert.equal(resolveCourtForArenaId(arenaB1, uidA), null);
});

test('buildEventShareUrl appends arena query param and clears hash', () => {
  assert.equal(
    buildEventShareUrl('arena-userAlpha123', 'https://example.com/#/sekretaris'),
    'https://example.com/?arena=arena-userAlpha123'
  );
  assert.equal(
    buildEventShareUrl('arena-userAlpha123-b', 'https://example.com/?foo=1#/dewan'),
    'https://example.com/?foo=1&arena=arena-userAlpha123-b'
  );
});

test('buildStationShareUrl and parseStationShareLink support login-free Juri, Timer, Dewan, Monitor links while keeping Sekretaris protected', () => {
  const juriUrl = buildStationShareUrl(
    'arena-userAlpha123',
    'juri',
    'https://jrzscoring.github.io/digitalskoring/#/sekretaris'
  );
  assert.equal(
    juriUrl,
    'https://jrzscoring.github.io/digitalskoring/?arena=arena-userAlpha123&view=juri'
  );

  assert.deepEqual(parseStationShareLink('?arena=arena-userAlpha123&view=juri', ''), {
    isStationLink: true,
    arenaId: 'arena-userAlpha123',
    view: 'juri',
  });
  assert.deepEqual(parseStationShareLink('?arena=arena-userAlpha123&view=timer', ''), {
    isStationLink: true,
    arenaId: 'arena-userAlpha123',
    view: 'timer',
  });
  assert.deepEqual(parseStationShareLink('?arena=arena-userAlpha123&view=dewan', ''), {
    isStationLink: true,
    arenaId: 'arena-userAlpha123',
    view: 'dewan',
  });
  assert.deepEqual(parseStationShareLink('?arena=arena-userAlpha123&view=scoreboard', ''), {
    isStationLink: true,
    arenaId: 'arena-userAlpha123',
    view: 'scoreboard',
  });

  // Sekretaris or root landing links MUST NOT bypass Google Login
  assert.deepEqual(parseStationShareLink('?arena=arena-userAlpha123&view=sekretaris', ''), {
    isStationLink: false,
    arenaId: 'arena-userAlpha123',
    view: null,
  });
  assert.deepEqual(parseStationShareLink('?arena=arena-userAlpha123', ''), {
    isStationLink: false,
    arenaId: 'arena-userAlpha123',
    view: null,
  });
  assert.deepEqual(parseStationShareLink('?view=juri', ''), {
    isStationLink: false,
    arenaId: null,
    view: null,
  });
});

test('parseScannedQrPayload parses Event QR, Station QR, JSON QR, and raw Arena ID cleanly', () => {
  assert.deepEqual(
    parseScannedQrPayload('https://jrzscoring.github.io/digitalskoring/?arena=arena-xyz123'),
    { ok: true, arenaId: 'arena-xyz123', view: null }
  );
  assert.deepEqual(
    parseScannedQrPayload('https://jrzscoring.github.io/digitalskoring/?arena=arena-xyz123&view=dewan'),
    { ok: true, arenaId: 'arena-xyz123', view: 'dewan' }
  );
  assert.deepEqual(
    parseScannedQrPayload('https://jrzscoring.github.io/digitalskoring/?arena=arena-xyz123&view=sekretaris'),
    { ok: true, arenaId: 'arena-xyz123', view: null }
  );
  assert.deepEqual(
    parseScannedQrPayload('{"arenaId":"arena-xyz123","view":"scoreboard"}'),
    { ok: true, arenaId: 'arena-xyz123', view: 'scoreboard' }
  );
  assert.deepEqual(parseScannedQrPayload('arena-xyz123'), {
    ok: true,
    arenaId: 'arena-xyz123',
    view: null,
  });
  const bad = parseScannedQrPayload('https://example.com/no-arena');
  assert.equal(bad.ok, false);
});
