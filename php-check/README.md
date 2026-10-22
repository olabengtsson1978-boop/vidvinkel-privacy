# PHP-kollen (phpkollen.se)

Ta reda på om en webbplats är byggd i PHP. Skriv in en adress, tryck på **Kontrollera**,
och få svaret på vanlig svenska.

## Använd den

Gå till **https://phpkollen.se**, skriv in en adress, till exempel `wordpress.org`, och tryck på
**Kontrollera**. Inget behöver installeras.

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
hemsida, eller skicka den till den som sköter hemsidan, så får besökarna en egen liten PHP-kollen-ruta.

## Publicera på phpkollen.se (Cloudflare)

Tjänsten körs på Cloudflare Workers. Det kostar normalt ingenting och kräver ingen egen server.

**1. Lägg phpkollen.se i Cloudflare** (hoppa över om domänen redan ligger där)
1. Logga in på dash.cloudflare.com och välj **Add a domain**. Skriv `phpkollen.se` och välj gratisplanen.
2. Cloudflare visar två *namnservrar*. Logga in där du köpte domänen och byt till dem.
3. Vänta tills Cloudflare säger att domänen är aktiv. Det kan ta några timmar.

**2. Koppla koden**
1. I Cloudflare: **Workers & Pages → Create → Import a repository**, och välj det här GitHub-repot.
2. Ange **Root directory**: `php-check`. Låt byggkommandot vara tomt och använd
   `npx wrangler deploy` som deploy-kommando.
3. Spara. Cloudflare publicerar tjänsten och kopplar den till phpkollen.se automatiskt
   (det står i `wrangler.toml`).

Varje gång ändringar läggs in på huvudgrenen publiceras de på nytt av sig själv.

**Bra att veta**
- Gratisplanen tillåter 100 000 kontroller per dag, och mycket kort beräkningstid per kontroll.
  Skulle stora sidor ibland ge fel kan Cloudflares billigaste betalplan behövas.
- Vill du att `www.phpkollen.se` också ska fungera: lägg till den under **Settings → Domains & Routes**
  för workern, eller gör en omdirigering till phpkollen.se under domänens **Rules**.

---

## För utvecklare

```sh
cd php-check
npm install
npm run dev          # kör lokalt i Cloudflares miljö, http://localhost:8787
npm test
npm run deploy       # publicera direkt från datorn (kräver inloggning: npx wrangler login)
```

Filer:

| Fil | Innehåll |
| --- | --- |
| `worker.mjs` | Cloudflare Worker: tar emot `/api/check`, hämtar sidan, felhantering, spärr och cache |
| `detect.js` | Letar efter PHP-spår i svarshuvuden och HTML |
| `version.js` | När PHP-versionerna slutar få säkerhetsuppdateringar |
| `public/` | Webbsidan och widgeten (serveras direkt av Cloudflare) |
| `wrangler.toml` | Cloudflare-inställningar: domän, spärr för antal kontroller |

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

Vid fel: HTTP 400 (eller 429 vid för många kontroller) med `{ "error": "<begriplig förklaring>" }`.

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

### Spärr och cache

Varje besökare (IP-adress) får göra 20 kontroller per minut; ändras i `wrangler.toml` under
`[[ratelimits]]`. Samma adress kontrolleras högst en gång per fem minuter, därefter används
Cloudflares cache (fungerar bara på den egna domänen, inte på `*.workers.dev`).

### Säkerhet

Cloudflare tillåter inte anrop från en Worker till interna nät eller direkt till IP-adresser.
Koden stoppar dessutom uppenbart interna adresser (localhost, 10/8, 192.168/16, 169.254/16, `.local` m.fl.,
även efter omdirigering) med ett begripligt besked. Högst 512 kB av varje sida läses, tidsgränsen är 8 s
och högst 5 omdirigeringar följs.
