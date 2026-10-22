'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { detect } = require('./detect');
const { isPrivateAddress } = require('./server');

const run = (headers, html = '', finalUrl = 'https://example.com/') =>
  detect({ headers, html, finalUrl });

test('X-Powered-By: PHP ger ja', () => {
  assert.strictEqual(run({ 'x-powered-by': 'PHP/8.2.1' }).verdict, 'yes');
});

test('PHPSESSID-cookie ger ja', () => {
  assert.strictEqual(run({ 'set-cookie': ['PHPSESSID=abc; path=/'] }).verdict, 'yes');
});

test('WordPress-generator ger ja', () => {
  const html = '<meta name="generator" content="WordPress 6.6">';
  assert.strictEqual(run({}, html).verdict, 'yes');
});

test('enstaka .php-länk ger troligen', () => {
  assert.strictEqual(run({}, '<a href="/contact.php">Kontakt</a>').verdict, 'likely');
});

test('inga tecken ger nej', () => {
  const r = run({ server: 'nginx', 'x-powered-by': 'Express' }, '<html></html>');
  assert.strictEqual(r.verdict, 'no');
  assert.strictEqual(r.confidence, 0);
});

test('interna adresser blockeras', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1']) {
    assert.ok(isPrivateAddress(ip), ip);
  }
  assert.ok(!isPrivateAddress('93.184.216.34'));
});

test('svaren förklaras på vanlig svenska utan dubbletter', () => {
  const html = '<meta name="generator" content="WordPress 6.6"><img src="/wp-content/a.png">';
  const r = run({ 'x-pingback': 'https://example.com/xmlrpc.php' }, html);
  const wp = r.reasons.filter((x) => /WordPress/.test(x.text));
  assert.strictEqual(wp.length, 1);
  assert.strictEqual(wp[0].details.length, 3);
});
