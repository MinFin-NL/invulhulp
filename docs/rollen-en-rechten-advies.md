# Advies: fijnmaziger rollen en rechten

Status: **advies / grotendeels nog niet geïmplementeerd**. Dit document beschrijft
welke rollen er ontbreken gegeven het huidige formulierenaanbod, hoe ze zich
verhouden tot de bestaande dossier-grants, en in welke volgorde je ze zou invoeren.

> **Wat er inmiddels wél is: scope-rollen.** Er bestaat één laag-B-achtige rol,
> `projectmanagement`, die het *formulierenaanbod* inperkt: `auth.SCOPE_ROLES` in de
> backend, een `roles`-blok in `public/forms/index.json`, en filtering in
> `loadFormRegistry()`. Wie de rol niet heeft, ziet alles; de standaard verandert
> dus niet. Belangrijke afbakening: dit is **menu-inperking, geen autorisatie**. Het
> gate't geen enkel endpoint; een dossier delen met iemand geeft nog steeds toegang
> tot de antwoorden op elk formulier. Voor echte rechten blijft §4 (capabilities)
> staan. En let op §7: de rol somt formulieren expliciet op in plaats van ze uit
> `domains` af te leiden, omdat een projectleider nu eenmaal vijf domeinen doorkruist.
> Dat is houdbaar bij een handvol rollen, niet bij twintig.

## 1. Wat er nu is

Er zijn vandaag **twee autorisatielagen**, en die staan los van elkaar:

| Laag | Waar | Waarden | Wat het regelt |
| --- | --- | --- | --- |
| Realm-rollen (organisatiebreed) | `backend/auth.py` (`APP_ROLES`), Keycloak-realm | `gebruiker`, `beheerder` | Mag je inloggen; mag je gebruikers beheren (`require_admin` → `/api/admin/users/*`) |
| Dossier-grants (per dossier) | `backend/dossierstore.py` (`ROLE_ORDER`) | `viewer` < `editor` < `owner` | Wie mag dit ene dossier lezen, invullen, delen/verwijderen (`resolve_session_access`) |

Daar zit precies één grofmazige knop in: `isAdmin` (checkbox in
`src/components/UserManagement.vue`, boolean in `admin_users.py`). Iedere
niet-beheerder is functioneel identiek: elke gebruiker mag elk formulier in een
dossier waar hij editor op is invullen, ondertekenen en exporteren.

## 2. Wat het formulierenaanbod eigenlijk vraagt

Er staan 18 formulieren in `public/forms/index.json`, verdeeld over 6 fasen
(`track`) en 5 domeinen (`domains`):

| Domein | Formulieren | Vakinhoudelijke eigenaar in de praktijk |
| --- | --- | --- |
| `privacy` | prescandpia, dpia, verwerkingsregister, datasetregistratie, dataethiek, (aiia, restrisico) | FG / Privacy Officer |
| `beveiliging` | quickscan (BIO), psa, restrisico | CISO / security officer |
| `ai` | aiia, iama, euaiact, modelcard, algoritmeregister | Algoritme-/AI-adviseur |
| `data` | datakwaliteit, datasetregistratie, dataethiek, psa, modelcard | Data steward / CDO-office |
| `project` | intake, aanbiedingsformulier, ppm, psa, restrisico, toegankelijkheid | Projectleider, architect, portfolio |

Die rollen staan al **letterlijk in de formulieren zelf**: `dpia.json` vraagt om
het FG-advies, `restrisico.json` Deel D om een expliciet acceptatiebesluit,
`aanbiedingsformulier.json` om de opdrachtgever, `psa.json` om de architect. De
applicatie kent die rollen alleen niet: ze zijn vrije tekst in een antwoordveld
in plaats van een identiteit met rechten.

Dat levert drie concrete gaten op:

1. **Geen adviesrol.** Een FG moet een DPIA kunnen inzien en van commentaar
   voorzien zonder mede-invuller (editor) te worden. Nu is de keuze: viewer
   (kan niets bijdragen) of editor (kan alles overschrijven).
2. **Geen besluitrol.** Restrisico-acceptatie en het aanbiedingsformulier zijn
   besluiten van iemand anders dan de invuller. Nu kan de invuller zijn eigen
   restrisico accepteren.
3. **Geen publicatierol.** Het algoritmeregister en de toegankelijkheidsverklaring
   gaan naar buiten. Publiceren is een organisatiebesluit, geen dossieractie.

## 3. Voorstel: drie lagen in plaats van twee

Houd de bestaande twee lagen, maar splits de bovenste en voeg een dunne
middelste laag toe.

```
Laag A  organisatierollen (Keycloak realm)  → wat mag je überhaupt in de app
Laag B  domeinrollen (Keycloak realm)       → op welke vakinhoud ben je adviseur/toetser
Laag C  dossier-grants (dossierstore.py)    → op welk dossier, in welke hoedanigheid
```

Regel: **laag B geeft nooit vanzelf toegang tot een dossier**, behalve leesrecht
binnen het eigen domein (zie §5). Toegang blijft per dossier belegd; laag B
bepaalt *wat* je in dat dossier extra mag (adviseren, aftekenen, publiceren).

### Laag A: organisatierollen

| Rol | Vervangt/nieuw | Rechten |
| --- | --- | --- |
| `gebruiker` | bestaand | Inloggen, eigen dossiers aanmaken, alle formulieren invullen waarop hij grant heeft |
| `platformbeheerder` | hernoemd `beheerder` | Gebruikersbeheer (`/api/admin/users`), rollen toekennen, Keycloak-koppeling |
| `functioneelbeheerder` | **nieuw** | Formulierenregistratie beheren: `index.json`, formulier-JSON's, `crossFormMappings.json`, beslishulp-regels. Nu impliciet "wie bij de repo kan" |
| `auditor` | **nieuw** | Leesrecht op *alle* dossiers + exportfunctie, geen schrijfrecht, geen gebruikersbeheer. Voor interne audit / concerncontrol / toezichthouder |

De splitsing beheerder → platform + functioneel is de belangrijkste: nu heeft
degene die formulierteksten wil aanpassen ook de macht om accounts aan te maken.

### Laag B: domeinrollen

Eén rol per domein-facet dat al in `index.json` staat, zodat de koppeling
rol → formulier data-gedreven blijft en niet hardgecodeerd:

| Rol | Domein (`domains`) | Formulieren waar hij adviseur/toetser op is |
| --- | --- | --- |
| `privacyadviseur` (FG/PO) | `privacy` | prescandpia, dpia, verwerkingsregister, datasetregistratie, dataethiek |
| `beveiligingsadviseur` (CISO) | `beveiliging` | quickscan, psa (beveiligingsdeel), restrisico |
| `aiadviseur` | `ai` | aiia, iama, euaiact, modelcard, algoritmeregister |
| `dataadviseur` (data steward) | `data` | datakwaliteit, datasetregistratie, dataethiek |
| `architect` | `project` + `beveiliging` | psa, ppm |

En twee rollen die niet aan een domein maar aan een *fase* hangen:

| Rol | Fase (`track`) | Rechten |
| --- | --- | --- |
| `portfolioregisseur` | `besluiten` | Aanbiedingsformulier beoordelen, dossiers over projecten heen inzien in de fase `besluiten` |
| `publicatiebeheerder` | `ingebruikname` | Algoritmeregister-publicatie en toegankelijkheidsverklaring vrijgeven/exporteren als definitief |

Bewust **niet** als rol opgenomen: risico-eigenaar / bestuurder die het
restrisico accepteert. Dat is een persoon per dossier, geen organisatierol;
die hoort in laag C als grant `goedkeurder` (§4).

### Laag C: dossier-grants uitbreiden

`ROLE_ORDER` is nu een strikte ladder (`viewer` 1 < `editor` 2 < `owner` 3) en
`resolve_session_access` doet `>=`-vergelijkingen. Twee toevoegingen die in die
ladder passen:

| Grant | Positie | Mag |
| --- | --- | --- |
| `adviseur` | tussen viewer en editor (1.5) | Lezen + opmerkingen plaatsen + adviesvelden invullen; geen gewone antwoorden wijzigen |
| `goedkeurder` | naast editor, niet erboven | Lezen + het besluitblok aftekenen (restrisico Deel D, aanbiedingsformulier); expliciet géén invulrecht op de rest |

⚠️ `goedkeurder` past *niet* in een lineaire ladder: het is meer dan viewer maar
minder dan editor op de meeste velden, en meer dan editor op één veld. Dat
betekent dat `ROLE_ORDER` als simpele `int`-vergelijking hierop stukloopt. Zie
§6; dit is de reden om de ladder te vervangen door een set capabilities voordat
je `goedkeurder` invoert. `adviseur` kan wél gewoon als 1.5 in de ladder, mits
schrijfrechten per veldtype worden gecontroleerd.

## 4. Van rol naar recht: capabilities

Rollen zelf zeggen niets; de winst zit in wat je ermee gate't. Concreet
voorstel voor capabilities die vandaag ontbreken:

| Capability | Wie | Waar te gate'n |
| --- | --- | --- |
| `dossier.read.any` | `auditor` | `dossierstore.list_dossiers_for`, `resolve_session_access` |
| `dossier.advise` | grant `adviseur` + bijpassende domeinrol | Nieuwe opmerkingen-/adviesvelden |
| `form.signoff` | grant `goedkeurder` | Besluitblok restrisico/aanbiedingsformulier |
| `form.publish` | `publicatiebeheerder` | Export "definitief" van algoritmeregister + toegankelijkheidsverklaring |
| `registry.manage` | `functioneelbeheerder` | Toekomstig beheer-UI op `public/forms/*` |
| `users.manage` | `platformbeheerder` | `require_admin` (bestaand) |

De rolnamen blijven zo in Keycloak, de capabilities leven in één tabel in
`auth.py`. Voordeel: een nieuwe rol toevoegen = één regel in die tabel, geen
`if role == ...` verspreid over `main.py`.

## 5. Domeinrol → leesrecht (optioneel, wel aan te raden)

Een FG die pas een DPIA mag zien nadat iemand hem heeft uitgenodigd, mist per
definitie de dossiers die vergeten zijn hem uit te nodigen, en dat is juist het risico
dat je wilt afdekken. Voorstel: een domeinrol geeft **leesrecht op alle
dossiers waarin een formulier van dat domein is gestart**, afgeleid uit
`domains` in `index.json`. Adviseren blijft een expliciete grant.

Dit is een privacy-afweging op zichzelf (een FG ziet dan ook conceptdossiers).
Maak het daarom een instelling per organisatie, standaard **uit**, en log de
inzage.

## 6. Volgorde van invoeren

1. **Hernoem/splits `beheerder`** → `platformbeheerder` + `functioneelbeheerder`,
   en voeg `auditor` toe. Kleinste wijziging, grootste
   scheiding-der-machten-winst. Raakt `APP_ROLES`/`ADMIN_ROLE` in `auth.py`,
   `admin_users.py` (de `isAdmin` boolean wordt een rollenlijst),
   `UserManagement.vue` (checkbox → multiselect) en `authStore.ts`.
   Let op: de realm-JSON van de Keycloak-stack moet opnieuw geïmporteerd worden
   voordat nieuwe realm-rollen bestaan.
2. **Vervang `ROLE_ORDER` door capabilities.** Zolang toegang een `int`-ladder
   is, kun je geen rol maken die "meer op één veld, minder op de rest" mag.
   Doe dit vóór stap 3 en 4, anders bouw je twee keer.
3. **Grant `adviseur` + opmerkingenveld per vraag.** Levert de FG/CISO-review
   die de formulieren nu in vrije tekst nabootsen.
4. **Grant `goedkeurder` + besluitblok-gate** op restrisico en
   aanbiedingsformulier: invuller ≠ accepteerder wordt afdwingbaar.
5. **Domeinrollen** (`privacyadviseur` etc.) met alleen de zachte koppeling naar
   `domains`; leesrecht-op-domein (§5) als laatste, achter een schakelaar.
6. **`publicatiebeheerder`** zodra er een "definitief publiceren"-actie bestaat;
   nu is export nog gewoon een download.

## 7. Wat je bewust níét moet doen

- **Geen rol per formulier.** 18 formulieren × rollen is onbeheersbaar en loopt
  vast bij formulier 25. Het domein-facet (`domains`) is de juiste korrel.
- **Geen fase-rollen als toegangsrollen.** De fasen (`tracks.ts`) zijn een
  weergave van de levenscyclus, geen organisatie-indeling. Alleen
  `portfolioregisseur` en `publicatiebeheerder` hangen aan een fase, en die zijn
  dat in het echt ook.
- **Geen rechten in de formulier-JSON hardcoderen** vóór stap 2. Zet in
  `index.json` hooguit een `reviewDomains`-achtige verwijzing en laat `auth.py`
  bepalen wat dat betekent.
