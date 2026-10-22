'use strict';

// Ren analysfunktion: tar emot svarshuvuden och HTML och returnerar
// en bedömning av om sidan är byggd i PHP.

const PHP_CMS = [
  { re: /wordpress/i, name: 'WordPress' },
  { re: /joomla/i, name: 'Joomla' },
  { re: /drupal/i, name: 'Drupal' },
  { re: /typo3/i, name: 'TYPO3' },
  { re: /magento/i, name: 'Magento' },
  { re: /prestashop/i, name: 'PrestaShop' },
  { re: /mediawiki/i, name: 'MediaWiki' },
  { re: /phpbb/i, name: 'phpBB' },
  { re: /craft cms/i, name: 'Craft CMS' },
  { re: /processwire/i, name: 'ProcessWire' },
  { re: /concrete ?(5|cms)/i, name: 'Concrete CMS' },
  { re: /opencart/i, name: 'OpenCart' },
  { re: /contao/i, name: 'Contao' },
];

const PHP_COOKIES = [
  { re: /^PHPSESSID=/i, name: 'PHPSESSID' },
  { re: /^laravel_session=/i, name: 'laravel_session (Laravel)' },
  { re: /^XSRF-TOKEN=.*laravel/i, name: 'Laravel XSRF-TOKEN' },
  { re: /^ci_session=/i, name: 'ci_session (CodeIgniter)' },
  { re: /^CAKEPHP=/i, name: 'CAKEPHP' },
  { re: /^symfony=/i, name: 'symfony' },
  { re: /^wordpress_|^wp-settings-/i, name: 'WordPress-cookie' },
];

function detect({ headers, html, finalUrl }) {
  const signals = [];
  const add = (weight, text) => signals.push({ weight, text });
  const h = (name) => headers[name.toLowerCase()];

  const powered = [].concat(h('x-powered-by') || []).join(', ');
  if (/php/i.test(powered)) add(100, `X-Powered-By: ${powered}`);

  const server = [].concat(h('server') || []).join(', ');
  if (/php/i.test(server)) add(80, `Server: ${server}`);

  for (const cookie of [].concat(h('set-cookie') || [])) {
    const hit = PHP_COOKIES.find((c) => c.re.test(cookie.trim()));
    if (hit) add(90, `Cookie: ${hit.name}`);
  }

  if (/\.php(\?|$)/i.test(new URL(finalUrl).pathname + '?')) {
    add(90, `Adressen slutar på .php (${finalUrl})`);
  }

  if (h('x-pingback') && /xmlrpc\.php/i.test(h('x-pingback'))) {
    add(80, 'X-Pingback pekar på xmlrpc.php (WordPress)');
  }
  if (/wp-json/i.test([].concat(h('link') || []).join(' '))) {
    add(70, 'Link-header till wp-json (WordPress)');
  }

  const gen = /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']generator["']/i.exec(html);
  if (gen) {
    const cms = PHP_CMS.find((c) => c.re.test(gen[1]));
    if (cms) add(80, `Generator-tagg: ${gen[1]} (${cms.name} är byggt i PHP)`);
  }

  if (/\/wp-(content|includes)\//i.test(html)) {
    add(70, 'Sökvägar till /wp-content/ eller /wp-includes/ (WordPress)');
  }

  const phpLinks = new Set();
  const linkRe = /(?:href|src|action)=["']([^"'#]+?\.php)(?:[?#][^"']*)?["']/gi;
  let m;
  while ((m = linkRe.exec(html)) && phpLinks.size < 5) phpLinks.add(m[1]);
  if (phpLinks.size) {
    add(Math.min(30 + phpLinks.size * 10, 60),
      `Länkar till .php-filer: ${[...phpLinks].join(', ')}`);
  }

  const best = signals.reduce((max, s) => Math.max(max, s.weight), 0);
  const confidence = signals.length ? Math.min(100, best + (signals.length - 1) * 5) : 0;
  let verdict;
  if (confidence >= 80) verdict = 'yes';
  else if (confidence >= 40) verdict = 'likely';
  else verdict = 'no';

  signals.sort((a, b) => b.weight - a.weight);
  return { verdict, confidence, signals: signals.map((s) => s.text) };
}

module.exports = { detect };
