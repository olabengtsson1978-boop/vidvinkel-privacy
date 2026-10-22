'use strict';

// Liten server utan beroenden: serverar webbappen/widgeten och ett API
// (GET /api/check?url=...) som hämtar sidan och letar efter PHP-tecken.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const { detect } = require('./detect');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

// Fel med text som kan visas för användaren som den är.
function userError(message) {
  return Object.assign(new Error(message), { userFacing: true });
}

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') ||
    v6.startsWith('fe80') || v6.startsWith('ff');
}

// Slår upp värdnamnet och vägrar interna adresser, så att API:t inte kan
// användas för att nå tjänster i serverns eget nät.
async function resolvePublic(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host, family: net.isIP(host) }]
    : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw userError('Den här adressen går inte att kontrollera.');
  }
  return addrs[0];
}

function normalizeUrl(input) {
  let raw = String(input || '').trim();
  if (!raw) throw userError('Skriv in adressen till en webbplats, till exempel wordpress.org.');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let url;
  try { url = new URL(raw); } catch { url = null; }
  if (!url || !['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
    throw userError('Det där ser inte ut som en webbadress. Skriv till exempel wordpress.org.');
  }
  return url;
}

async function fetchOnce(url) {
  const addr = await resolvePublic(url.hostname);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.get(url, {
      timeout: TIMEOUT_MS,
      // Ansluter till den redan kontrollerade adressen (skydd mot DNS-rebinding).
      lookup: (_host, opts, cb) => (opts && opts.all
        ? cb(null, [addr]) : cb(null, addr.address, addr.family)),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; php-check/1.0)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_BYTES) { res.destroy(); return; }
        chunks.push(c);
      });
      const done = () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.on('end', done);
      res.on('close', done);
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error(), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
  });
}

async function check(input) {
  let url = normalizeUrl(input);
  let res;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    res = await fetchOnce(url);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      url = normalizeUrl(new URL(res.headers.location, url).href);
      continue;
    }
    break;
  }
  const result = detect({ headers: res.headers, html: res.body, finalUrl: url.href });
  return { url: url.href, status: res.status, ...result };
}

// Gör om tekniska felkoder till något en vanlig användare förstår.
function friendlyError(err) {
  switch (err.code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'Vi hittade ingen webbplats med den adressen. Kontrollera stavningen.';
    case 'ETIMEDOUT':
      return 'Webbplatsen svarade inte. Försök igen om en stund.';
    case 'ECONNREFUSED':
    case 'ECONNRESET':
      return 'Webbplatsen gick inte att nå just nu. Försök igen om en stund.';
  }
  if (err.userFacing) return err.message;
  if (/CERT|SSL|TLS/i.test(err.code || '')) {
    return 'Webbplatsen har ett problem med sin säkra anslutning, så vi kunde inte läsa den.';
  }
  return 'Vi kunde inte läsa webbplatsen. Försök igen om en stund.';
}

function sendJson(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, 'http://localhost');

  if (reqUrl.pathname === '/api/check') {
    try {
      sendJson(res, 200, await check(reqUrl.searchParams.get('url')));
    } catch (err) {
      sendJson(res, 400, { error: friendlyError(err) });
    }
    return;
  }

  const file = reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname.slice(1);
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('Hittades inte'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`\nPHP-koll är igång! Öppna http://localhost:${PORT} i din webbläsare.\nStäng det här fönstret för att stänga av programmet.\n`));
}

module.exports = { check, isPrivateAddress };
