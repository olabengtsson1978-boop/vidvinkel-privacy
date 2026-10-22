import test from 'node:test';
import assert from 'node:assert';
import worker, { isPrivateAddress, normalizeUrl } from './worker.mjs';

// Låtsaswebb: adress → svar. Ersätter fetch så att testerna inte behöver internet.
function fakeWeb(pages) {
  globalThis.fetch = async (url, opts) => {
    assert.strictEqual(opts.redirect, 'manual');
    const page = pages[String(url)];
    if (!page) throw new TypeError('fetch failed');
    if (page.throws) throw page.throws;
    const headers = new Headers();
    for (const [k, v] of Object.entries(page.headers || {})) {
      for (const one of [].concat(v)) headers.append(k, one);
    }
    return new Response(page.body || '', { status: page.status || 200, headers });
  };
}

const env = { ASSETS: { fetch: async () => new Response('sidan') } };
const ctx = { waitUntil() {} };
const api = async (url, e = env) => {
  const res = await worker.fetch(new Request('https://phpkollen.se/api/check?url=' + encodeURIComponent(url)), e, ctx);
  return { code: res.status, data: await res.json() };
};

test('följer omdirigering och hittar PHP', async () => {
  fakeWeb({
    'https://exempel.se/': { status: 301, headers: { location: '/index.php' } },
    'https://exempel.se/index.php': {
      headers: { 'x-powered-by': 'PHP/8.1.2', 'set-cookie': ['a=1', 'PHPSESSID=x; path=/'] },
      body: '<meta name="generator" content="WordPress 6.6">',
    },
  });
  const { code, data } = await api('exempel.se');
  assert.strictEqual(code, 200);
  assert.strictEqual(data.url, 'https://exempel.se/index.php');
  assert.strictEqual(data.verdict, 'yes');
  assert.strictEqual(data.php.branch, '8.1');
  assert.ok(data.reasons.some((r) => r.details.includes('Cookie: PHPSESSID')));
});

test('webbplats utan PHP', async () => {
  fakeWeb({ 'https://exempel.se/': { headers: { server: 'nginx' }, body: '<html></html>' } });
  const { data } = await api('exempel.se');
  assert.strictEqual(data.verdict, 'no');
  assert.strictEqual(data.php, null);
});

test('begripliga felmeddelanden', async () => {
  fakeWeb({
    'https://saknas.se/': { status: 530 },
    'https://seg.se/': { throws: Object.assign(new Error('timeout'), { name: 'TimeoutError' }) },
    'https://trasig.se/': { throws: new TypeError('fetch failed') },
  });
  assert.match((await api('saknas.se')).data.error, /hittade ingen webbplats/);
  assert.match((await api('seg.se')).data.error, /svarade inte/);
  assert.match((await api('trasig.se')).data.error, /kunde inte läsa/);
  assert.match((await api('')).data.error, /Skriv in adressen/);
  assert.match((await api('hej')).data.error, /ser inte ut som en webbadress/);
});

test('interna adresser blockeras, även efter omdirigering', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1']) {
    assert.ok(isPrivateAddress(ip), ip);
  }
  assert.ok(!isPrivateAddress('93.184.216.34'));
  assert.throws(() => normalizeUrl('http://169.254.169.254/'));
  assert.throws(() => normalizeUrl('http://router.local/'));
  fakeWeb({ 'https://exempel.se/': { status: 302, headers: { location: 'http://127.0.0.1/' } } });
  assert.match((await api('exempel.se')).data.error, /går inte att kontrollera/);
});

test('för många kontroller ger ett vänligt besked', async () => {
  const limited = { ...env, RATE_LIMITER: { limit: async () => ({ success: false }) } };
  const { code, data } = await api('exempel.se', limited);
  assert.strictEqual(code, 429);
  assert.match(data.error, /Vänta en minut/);
});

test('allt annat än API:t lämnas till de statiska filerna', async () => {
  const res = await worker.fetch(new Request('https://phpkollen.se/'), env, ctx);
  assert.strictEqual(await res.text(), 'sidan');
});
