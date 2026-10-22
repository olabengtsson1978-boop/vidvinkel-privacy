# PHP-koll

En enkel webbapp och inbäddningsbar widget som kontrollerar om en webbsida är byggd i PHP.

## Kör

```sh
cd php-check
npm start            # http://localhost:3000
npm test
```

Kräver Node 18+, inga beroenden. Porten kan ändras med `PORT=8080 npm start`.

## API

`GET /api/check?url=example.com`

```json
{
  "url": "https://example.com/",
  "status": 200,
  "verdict": "yes | likely | no",
  "confidence": 100,
  "signals": ["X-Powered-By: PHP/8.2.1"]
}
```

## Widget

```html
<script src="https://DIN-SERVER/widget.js" defer></script>
<div class="php-check-widget"></div>
<!-- eller för en fast adress: -->
<div class="php-check-widget" data-url="wordpress.org"></div>
```

Widgeten anropar API:t på samma server som `widget.js` laddades från (kan ändras med `data-api`).
Den ritas i en Shadow DOM, så den påverkas inte av sidans CSS.

## Vad som letas efter

- `X-Powered-By`/`Server` som nämner PHP
- PHP-cookies: `PHPSESSID`, `laravel_session`, `ci_session`, `CAKEPHP` m.fl.
- Adress som slutar på `.php`, länkar och formulär till `.php`-filer
- PHP-baserade CMS: WordPress, Joomla, Drupal, TYPO3, Magento m.fl. (generator-tagg, `wp-content`, `X-Pingback`)

Många sajter döljer dessa spår, så "inga tecken" är ingen garanti för att PHP saknas.

## Säkerhet

Servern hämtar godtyckliga adresser, så den vägrar adresser som pekar på interna nät
(localhost, 10/8, 192.168/16, 169.254/16 m.fl., även efter omdirigering) och begränsar
svarsstorlek (1 MB), tid (8 s) och antal omdirigeringar (5).
