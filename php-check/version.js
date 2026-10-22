'use strict';

// När PHP-versionerna slutar få säkerhetsuppdateringar.
// Källa: https://www.php.net/supported-versions.php — uppdatera när nya versioner släpps.
const SECURITY_ENDS = {
  '8.5': '2029-12-31',
  '8.4': '2028-12-31',
  '8.3': '2027-12-31',
  '8.2': '2026-12-31',
  '8.1': '2025-12-31',
  '8.0': '2023-11-26',
};
const OLDEST_LISTED = 8.0;
const SOON_DAYS = 183;

// Linux-distributioner lagar säkerhetshål i äldre versioner utan att höja
// versionsnumret, t.ex. "PHP/7.4.3-4ubuntu2.24" eller "PHP/8.1.2-1ubuntu2.20".
const DISTRO_RE = /ubuntu|deb\d|\+deb|\.el\d|el\d+_|remi|sury|cpanel|cloudlinux|plesk/i;

function findVersion(text) {
  const m = /PHP\/(\d+)\.(\d+)(?:\.(\d+))?(\S*)/i.exec(text || '');
  if (!m) return null;
  return {
    full: `${m[1]}.${m[2]}${m[3] ? '.' + m[3] : ''}`,
    branch: `${m[1]}.${m[2]}`,
    backported: DISTRO_RE.test(m[4]),
  };
}

function formatDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('sv-SE', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

// status: 'ok' (underhålls), 'soon' (slutar underhållas inom ett halvår),
// 'eol' (underhålls inte längre).
function versionStatus(text, now = new Date()) {
  const v = findVersion(text);
  if (!v) return null;

  const ends = SECURITY_ENDS[v.branch];
  let status;
  let message;
  if (ends) {
    const daysLeft = (new Date(ends + 'T23:59:59Z') - now) / 864e5;
    if (daysLeft < 0) {
      status = 'eol';
      message = `PHP ${v.branch} slutade få säkerhetsuppdateringar ${formatDate(ends)}. ` +
        'Nya säkerhetshål i den här versionen lagas inte längre.';
    } else if (daysLeft < SOON_DAYS) {
      status = 'soon';
      message = `PHP ${v.branch} får säkerhetsuppdateringar till och med ${formatDate(ends)}. ` +
        'Planera en uppdatering redan nu.';
    } else {
      status = 'ok';
      message = `PHP ${v.branch} får säkerhetsuppdateringar till och med ${formatDate(ends)}.`;
    }
  } else if (parseFloat(v.branch) < OLDEST_LISTED) {
    status = 'eol';
    message = `PHP ${v.branch} är en mycket gammal version som inte har fått säkerhetsuppdateringar på flera år.`;
  } else {
    status = 'ok';
    message = `PHP ${v.branch} är en ny version som fortfarande underhålls.`;
  }

  if (v.backported && status !== 'ok') {
    message += ' Webbhotellet verkar dock använda en Linux-version som själv lagar säkerhetshål i ' +
      'äldre PHP, så risken kan vara mindre än det låter. Fråga webbhotellet för att vara säker.';
  }
  return { version: v.full, branch: v.branch, status, securityEnds: ends || null, backported: v.backported, message };
}

module.exports = { versionStatus };
