// Cloudflare Worker för phpkollen.se. Sidan och widgeten i public/ serveras
// direkt av Cloudflare; hit kommer bara anrop till /api/check?url=...

import { detect } from './detect.js';

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;
const CACHE_SECONDS = 300;

// Fel med text som kan visas för användaren som den är.
function userError(message) {
  return Object.assign(new Error(message), { userFacing: true });
}

export function isPrivateAddress(ip) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
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

// Cloudflare stoppar själv anrop till interna nät; det här ger ett begripligt
// besked direkt för de uppenbara fallen.
function assertPublicHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const isIp = /^[\d.]+$/.test(host) || host.includes(':');
  if ((isIp && isPrivateAddress(host)) || host === 'localhost' ||
    /\.(localhost|local|internal|lan|home\.arpa)$/.test(host)) {
    throw userError('Den här adressen går inte att kontrollera.');
  }
}

export function normalizeUrl(input) {
  let raw = String(input || '').trim();
  if (!raw) throw userError('Skriv in adressen till en webbplats, till exempel wordpress.org.');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let url;
  try { url = new URL(raw); } catch { url = null; }
  if (!url || !['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
    throw userError('Det där ser inte ut som en webbadress. Skriv till exempel wordpress.org.');
  }
  assertPublicHost(url.hostname);
  return url;
}

// Läser högst MAX_BYTES av sidan; mer behövs inte och det håller nere tiden.
async function readStart(res) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { all.set(c, offset); offset += c.length; }
  return new TextDecoder().decode(all.subarray(0, MAX_BYTES));
}

function headersToObject(headers) {
  const out = {};
  for (const [k, v] of headers) if (k !== 'set-cookie') out[k] = v;
  const cookies = headers.getSetCookie ? headers.getSetCookie() : [];
  if (cookies.length) out['set-cookie'] = cookies;
  return out;
}

export async function check(input) {
  let url = normalizeUrl(input);
  let res;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PHP-kollen/1.0; +https://phpkollen.se)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      res.body?.cancel();
      url = normalizeUrl(new URL(location, url).href);
      continue;
    }
    break;
  }

  // Cloudflare svarar själv med 52x/530 när webbplatsen inte går att nå.
  if (res.status === 530) {
    res.body?.cancel();
    throw userError('Vi hittade ingen webbplats med den adressen. Kontrollera stavningen.');
  }
  if (res.status >= 520 && res.status <= 527) {
    res.body?.cancel();
    throw userError('Webbplatsen gick inte att nå just nu. Försök igen om en stund.');
  }

  const html = await readStart(res);
  const result = detect({ headers: headersToObject(res.headers), html, finalUrl: url.href });
  return { url: url.href, status: res.status, ...result };
}

// Gör om tekniska fel till något en vanlig användare förstår.
export function friendlyError(err) {
  if (err.userFacing) return err.message;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') {
    return 'Webbplatsen svarade inte. Försök igen om en stund.';
  }
  if (/dns|resolve|not found|ENOTFOUND/i.test(err.message || '')) {
    return 'Vi hittade ingen webbplats med den adressen. Kontrollera stavningen.';
  }
  return 'Vi kunde inte läsa webbplatsen. Försök igen om en stund.';
}

function json(code, data) {
  return new Response(JSON.stringify(data), {
    status: code,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

async function handleCheck(request, env, ctx) {
  // Begränsar hur många kontroller en besökare kan göra per minut, så att
  // tjänsten inte kan användas för att belasta andra webbplatser.
  if (env.RATE_LIMITER) {
    const ip = request.headers.get('cf-connecting-ip') || 'okänd';
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return json(429, { error: 'Du har gjort många kontroller på kort tid. Vänta en minut och försök igen.' });
    }
  }

  let target;
  try {
    target = normalizeUrl(new URL(request.url).searchParams.get('url'));
  } catch (err) {
    return json(400, { error: friendlyError(err) });
  }

  // Samma adress kontrolleras inte om och om igen inom fem minuter.
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(`https://phpkollen.se/__cache/check?u=${encodeURIComponent(target.href)}`);
  const cached = cache && await cache.match(cacheKey);
  if (cached) return json(200, await cached.json());

  try {
    const result = await check(target.href);
    if (cache) {
      ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(result), {
        headers: { 'Cache-Control': `max-age=${CACHE_SECONDS}` },
      })));
    }
    return json(200, result);
  } catch (err) {
    return json(400, { error: friendlyError(err) });
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/check') return handleCheck(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
