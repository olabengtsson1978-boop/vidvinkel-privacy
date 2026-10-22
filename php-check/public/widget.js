/*
 * PHP-koll – inbäddningsbar widget.
 *
 *   <script src="https://DIN-SERVER/widget.js" defer></script>
 *   <div class="php-check-widget"></div>                         (formulär)
 *   <div class="php-check-widget" data-url="example.com"></div>  (fast adress)
 *
 * API-adressen hämtas från var skriptet laddades, eller från data-api.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var defaultApi = script ? new URL('.', script.src).href : '/';

  var LABELS = {
    yes: { text: 'Byggd i PHP', color: '#1a7f37', bg: '#dafbe1' },
    likely: { text: 'Troligen PHP', color: '#9a6700', bg: '#fff8c5' },
    no: { text: 'Inga tecken på PHP', color: '#57606a', bg: '#eaeef2' },
    error: { text: 'Kunde inte kontrolleras', color: '#cf222e', bg: '#ffebe9' },
  };

  var CSS =
    ':host{all:initial;display:block;font:14px/1.45 -apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2328}' +
    '.box{border:1px solid #d0d7de;border-radius:10px;padding:12px 14px;background:#fff;max-width:420px}' +
    '.title{font-weight:600;margin:0 0 8px;display:flex;align-items:center;gap:6px}' +
    '.logo{background:#777bb4;color:#fff;border-radius:5px;padding:0 5px;font-size:11px;font-weight:700}' +
    'form{display:flex;gap:6px}' +
    'input{flex:1;min-width:0;font:inherit;padding:6px 8px;border:1px solid #d0d7de;border-radius:6px}' +
    'button{font:inherit;padding:6px 12px;border:0;border-radius:6px;background:#777bb4;color:#fff;cursor:pointer}' +
    'button:disabled{opacity:.6;cursor:wait}' +
    '.result{margin-top:10px}' +
    '.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:600}' +
    '.meta{color:#57606a;font-size:12px;margin-top:4px;word-break:break-all}' +
    'ul{margin:6px 0 0;padding-left:18px;font-size:12px;color:#424a53}';

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    for (var k in attrs || {}) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    return node;
  }

  function renderResult(target, data) {
    target.textContent = '';
    var kind = data.error ? 'error' : data.verdict;
    var label = LABELS[kind];
    var badge = el('span', { class: 'badge' }, label.text);
    badge.style.color = label.color;
    badge.style.background = label.bg;
    target.appendChild(badge);

    if (data.error) {
      target.appendChild(el('div', { class: 'meta' }, data.error));
      return;
    }
    target.appendChild(el('div', { class: 'meta' },
      data.url + ' · säkerhet ' + data.confidence + ' %'));
    if (data.signals.length) {
      var list = el('ul');
      data.signals.forEach(function (s) { list.appendChild(el('li', null, s)); });
      target.appendChild(list);
    }
  }

  function check(api, url, target, button) {
    target.textContent = 'Kontrollerar…';
    if (button) button.disabled = true;
    fetch(api + 'api/check?url=' + encodeURIComponent(url))
      .then(function (r) { return r.json(); })
      .catch(function () { return { error: 'Kunde inte nå tjänsten.' }; })
      .then(function (data) {
        renderResult(target, data);
        if (button) button.disabled = false;
      });
  }

  function mount(host) {
    if (host.shadowRoot) return;
    var api = host.getAttribute('data-api') || defaultApi;
    if (api.slice(-1) !== '/') api += '/';
    var root = host.attachShadow({ mode: 'open' });
    var style = el('style', null, CSS);
    var box = el('div', { class: 'box' });
    var title = el('div', { class: 'title' });
    title.appendChild(el('span', { class: 'logo' }, 'php'));
    title.appendChild(document.createTextNode('Är sidan byggd i PHP?'));
    var result = el('div', { class: 'result' });
    box.appendChild(title);

    var fixedUrl = host.getAttribute('data-url');
    if (fixedUrl) {
      box.appendChild(result);
      check(api, fixedUrl, result);
    } else {
      var form = el('form');
      var input = el('input', { type: 'text', placeholder: 'example.com', 'aria-label': 'Webbadress', required: '' });
      var button = el('button', { type: 'submit' }, 'Kolla');
      form.appendChild(input);
      form.appendChild(button);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        check(api, input.value, result, button);
      });
      box.appendChild(form);
      box.appendChild(result);
    }
    root.appendChild(style);
    root.appendChild(box);
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.php-check-widget'), mount);
  }

  window.PhpCheckWidget = { init: init, mount: mount };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
