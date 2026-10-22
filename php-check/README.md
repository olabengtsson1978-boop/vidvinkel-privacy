# PHP-koll

Ta reda på om en webbplats är byggd i PHP. Skriv in en adress, tryck på **Kontrollera**,
och få svaret på vanlig svenska.

## Kom igång (ingen teknisk kunskap behövs)

1. **Ladda ner** den här mappen till din dator.
2. **Dubbelklicka** på startfilen:
   - Windows: `Starta PHP-koll (Windows).bat`
   - Mac: `Starta PHP-koll (Mac).command`
     (första gången: högerklicka på filen, välj **Öppna** och sedan **Öppna** igen)
3. Din webbläsare öppnas med PHP-koll. Skriv in en adress, till exempel `wordpress.org`.

Saknas programmet Node.js på datorn öppnas en sida där du kan ladda ner det.
Välj versionen märkt **LTS**, installera den och dubbelklicka på startfilen igen.

Ett svart fönster öppnas också. Det är själva programmet. Låt det vara öppet medan du
använder PHP-koll och stäng det när du är klar.

## Vad betyder svaren?

| Svar | Betydelse |
| --- | --- |
| **Ja, den är byggd i PHP** | Vi hittade tydliga tecken på PHP. |
| **Troligen byggd i PHP** | Vi hittade vissa tecken, men kan inte vara helt säkra. |
| **Vi hittade inga tecken på PHP** | Troligen byggd med något annat, men den kan också dölja att den använder PHP. |

Visar webbplatsen vilken PHP-version den använder får du också veta om versionen är
**uppdaterad**, **behöver uppdateras snart** eller är **föråldrad** (får inga säkerhetsuppdateringar längre).

Under svaret står varför vi kom fram till det. Den som vill kan klicka på
**Visa tekniska detaljer** för att se exakt vad som hittades.

## Rutan till din egen hemsida

Längst ner på sidan finns en färdig kod och en knapp, **Kopiera koden**. Klistra in koden på din
hemsida, eller skicka den till den som sköter hemsidan, så får besökarna en egen liten PHP-koll-ruta.
Observera att rutan bara fungerar så länge PHP-koll är igång på en dator eller server som besökarna når.

---

## För utvecklare

```sh
npm start            # http://localhost:3000 (ändra med PORT=8080)
npm test
```

Kräver Node 18+, inga beroenden.

### API

`GET /api/check?url=example.com`

```json
{
  "url": "https://example.com/",
  "status": 200,
  "verdict": "yes | likely | no",
  "confidence": 100,
  "reasons": [
    { "text": "Webbplatsen talar själv om att den använder PHP.", "details": ["X-Powered-By: PHP/8.2.1"] }
  ],
  "php": {
    "version": "8.1.2", "branch": "8.1", "status": "ok | soon | eol",
    "securityEnds": "2025-12-31", "backported": false, "message": "<förklaring>"
  }
}
```

`php` är `null` om versionen inte syns. Datumen för när versionerna slutar underhållas ligger i
`version.js` och behöver uppdateras när nya PHP-versioner släpps (se php.net/supported-versions.php).

Vid fel: HTTP 400 med `{ "error": "<begriplig förklaring>" }`.

### Widget

```html
<script src="https://DIN-SERVER/widget.js" defer></script>
<div class="php-check-widget"></div>
<!-- eller för en fast adress: -->
<div class="php-check-widget" data-url="wordpress.org"></div>
```

Widgeten anropar API:t på samma server som `widget.js` laddades från (kan ändras med `data-api`)
och ritas i en Shadow DOM, så sidans CSS påverkar den inte.

### Vad som letas efter

- `X-Powered-By`/`Server` som nämner PHP
- PHP-cookies: `PHPSESSID`, `laravel_session`, `ci_session`, `CAKEPHP` m.fl.
- Adress som slutar på `.php`, länkar och formulär till `.php`-filer
- PHP-baserade CMS: WordPress, Joomla, Drupal, TYPO3, Magento m.fl. (generator-tagg, `wp-content`, `X-Pingback`)

### Säkerhet

Servern vägrar adresser som pekar på interna nät (localhost, 10/8, 192.168/16, 169.254/16 m.fl.,
även efter omdirigering) och begränsar svarsstorlek (1 MB), tid (8 s) och antal omdirigeringar (5).
