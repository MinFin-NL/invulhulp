# Verantwoording inzet van generatieve AI in de PoC Invulhulp

**Verantwoording i.h.k.v. het Overheidsbreed Standpunt Generatieve AI, getoetst aan het stappenplan uit de bijbehorende handreiking**

Dit document verantwoordt het gebruik van generatieve AI in deze Proof of
Concept (PoC). Voor een beknopte samenvatting, zie
[`DISCLAIMER.md`](../DISCLAIMER.md).

## Beschrijving van de PoC en de rol van AI

Deze repository is een PoC voor een invulhulp: een webapplicatie die
overheidsmedewerkers helpt bij het invullen van compliance-formulieren rond een
project of systeem, zoals de DPIA, het AI Impact Assessment, de IAMA, de
Quickscan BIO2 en de EU AI Act-checklist. Zie de [`README.md`](../README.md)
voor de actuele opzet en onderdelen.

Generatieve AI speelt hier op **twee** manieren een rol, en dit document
behandelt ze apart:

1. **AI bij het bouwen.** De code is grotendeels gegenereerd met de
   AI-assistant Claude Code (Anthropic). AI is ingezet voor codegeneratie,
   refactoring en review. Achtergrond en ontwerpkeuzes staan in
   [`docs/`](.) en [`ARCHITECTURE.md`](../ARCHITECTURE.md).
2. **AI in de applicatie.** De invulhulp gebruikt zelf een taalmodel: AI Modus
   haalt antwoorden uit geüploade brondocumenten (retrieval-augmented
   generation), de app verbetert vrije tekst op verzoek en combineert antwoorden
   over formulieren heen. Standaard draait het model lokaal via Ollama, zodat
   er geen gegevens de machine verlaten; met `AZURE_OPENAI_ENDPOINT` gebruikt
   de app Azure OpenAI.

**Verantwoordelijkheid voor commits.** Ga ervan uit dat elke commit in deze
repository met behulp van Claude Code tot stand is gekomen, ook als dat niet
apart in de commit staat. De persoon die de commit maakt, blijft
verantwoordelijk voor de inhoud: die heeft de wijziging beoordeeld en
goedgekeurd voordat die in de repository is opgenomen. De mens blijft
eindverantwoordelijk; de AI is een hulpmiddel.

**Menselijke tussenkomst in de applicatie.** Een AI-suggestie is altijd een
voorstel. De gebruiker ziet per antwoord de citaten uit de brondocumenten en
of het antwoord daarin terug te vinden is (`answerSources`, getoond in het
bronnenpaneel), en kan elk antwoord aanpassen of verwerpen. Het risico dat de
invuller een "stempelmachine" wordt, is uitgewerkt in
[`systeemanalyse-invulhulp-in-het-stelsel.md`](systeemanalyse-invulhulp-in-het-stelsel.md)
en [`ontwerprichting-betekenisvolle-tussenkomst.md`](ontwerprichting-betekenisvolle-tussenkomst.md).

**Gegevens.** Gebruikers uploaden eigen brondocumenten in een dossier. Die
kunnen persoonsgegevens of vertrouwelijke informatie bevatten; de app kan dat
niet uitsluiten.

**Scope-grens.** Deze verantwoording betreft uitsluitend de PoC en de pilots
daarvan. Gebruik in productie valt **buiten de huidige scope** en vereist
aanvullende toetsing, waaronder een beoordeling tegen de BIO (Baseline
Informatiebeveiliging Overheid) en een DPIA (Data Protection Impact
Assessment).

## Verantwoording per stappenplan

Hieronder volgen we het globale stappenplan uit hoofdstuk 4 van de
[Overheidsbrede handreiking verantwoorde inzet van generatieve AI](https://open.overheid.nl/documenten/9c273b71-cebb-4e11-b06f-fa20f7b4b90e/file).

### 1) Doel en toepassingsgebied

De PoC heeft een breder doel dan alleen AI: we onderzoeken onder meer welke
formulieren op een project van toepassing zijn, hoe dubbel invullen te
voorkomen is (de koppelingen tussen formulieren) en hoe gebruikers met de
invulhulp werken. Dit document beperkt zich tot het AI-aspect daarvan.

*Doel (AI-aspect):*

- onderzoeken of we verantwoord met behulp van generatieve AI software kunnen
  bouwen die in lijn is met de standaarden en kaders van de Nederlandse
  overheid (o.a. het NLDD Designsysteem, WCAG 2.2 AA, de BIO), mede met behulp
  van de [overheidsskills](https://github.com/developer-overheid-nl/skills-marketplace);
- onderzoeken of een taalmodel invullers aantoonbaar helpt bij het opstellen
  van compliance-documenten, zonder dat het oordeel van de invuller verdwijnt.

*Toepassingsgebied:* de ontwikkeling van deze PoC en het gebruik ervan in
pilots. Niet in scope: gebruik in productie.

### 2) Zorg voor de juiste mensen en vaardigheden

De betrokken ontwikkelaars zijn niet op voorhand expert van alle formulieren en
kaders die de invulhulp ondersteunt. Een onderdeel van de PoC is juist om die
kennis op te bouwen door iets te bouwen. De inhoud van de formulieren volgt
waar mogelijk de officiële bron: de DPIA, Pre-scan DPIA en IAMA worden
gegenereerd uit de upstream-definities van MinBZK, en elk formulier legt vast
waar het vandaan komt en hoe trouw het die bron volgt (zie "Form lineage" in de
[`README.md`](../README.md)).

Om de juiste expertise te betrekken streven we ernaar zo veel mogelijk
betrokken partijen, waaronder privacy-, security- en AI-experts en de beheerders
van de bronformulieren, te laten meekijken met de PoC.

### 3) Creëer een (generatieve) AI-governance structuur

Het werk gebeurt in opdracht van CDIO. Als beleidsmatige leidraad gelden het
[Overheidsbreed standpunt voor de inzet van generatieve AI](https://open.overheid.nl/documenten/bc03ce31-0cf1-4946-9c94-e934a62ebe73/file)
en de bijbehorende
[handreiking](https://open.overheid.nl/documenten/9c273b71-cebb-4e11-b06f-fa20f7b4b90e/file).

Concrete governance-maatregelen:

- Elke commit geldt als met AI gegenereerd; de persoon die de commit maakt, is
  verantwoordelijk voor de inhoud (zie hierboven).
- Commits en pushes gebeuren alleen op uitdrukkelijk verzoek van de
  ontwikkelaar, nooit automatisch door de AI-assistant; dat is vastgelegd in de
  projectinstructies voor Claude Code.
- In de applicatie is een AI-antwoord altijd een voorstel met zichtbare bron;
  de gebruiker beslist.
- Voor transparantie is de code gepubliceerd onder een open licentie
  ([EUPL-1.2](../LICENSE)); reageren kan via GitHub-issues.

### 4) Risicoanalyse

Anders dan bij een PoC die AI alleen als bouwgereedschap gebruikt, bevat deze
applicatie zelf een generatief AI-component. Daarom gelden naast de risico's van
AI-ondersteund ontwikkelen ook de risico's van een AI-systeem dat
overheidsmedewerkers ondersteunt.

#### a. Voldoen aan de EU AI-verordening

*Bij het bouwen:* Claude Code is gereedschap; de verplichtingen vallen primair
op de aanbieder (Anthropic). Anthropic heeft de
[General Purpose AI Code of Practice](https://digital-strategy.ec.europa.eu/en/policies/contents-code-gpai)
van de EU ondertekend.

*In de applicatie:* de invulhulp ondersteunt het opstellen van documenten en
neemt geen besluiten over burgers of bedrijven.
De risicoclassificatie
volgens de AI-verordening, is waarschijnlijk een beperkt, dit is gecontroleerd met de
[beslishulp](https://github.com/MinBZK/ai-verordening-beslishulp). Omdat de gebruiker met door AI
gegenereerde tekst werkt, maakt de app herkenbaar welke antwoorden uit AI Modus
komen en op welke bronnen ze steunen (transparantie, artikel 50).

#### b. AVG en DPIA

Brondocumenten die gebruikers uploaden, kunnen persoonsgegevens bevatten. Bij
gebruik van een lokaal Ollama-model verlaten die de eigen omgeving niet; bij
Azure OpenAI gaan relevante tekstfragmenten naar de Azure-omgeving. Er is een 
DPIA en pre-scan DPIA gedaan voor de verweking op de Azure-omgeving. Organisaties
die deze code in productie willen nemen, dienen zelf te beoordelen welke
AVG-verplichtingen gelden, waaronder een DPIA.

#### c. BIO en beveiligingseisen

De PoC kent basismaatregelen: inloggen via Keycloak (OpenID Connect) met een
ondertekende sessiecookie, rollen per dossier (viewer, editor, owner) die elk
document-endpoint controleert, gitleaks als pre-commit-controle op geheimen, en
Dependabot voor dependency-updates. Gebruik in productie vereist een volledige
toetsing aan de geldende beveiligingseisen.

#### d. Datadeling met de AI-aanbieder

*Bij het bouwen:* het risico wordt beperkt doordat geen vertrouwelijke gegevens
of persoonsgegevens aan de AI-assistant worden gegeven. En daarnaast is de opt-out
voor modeltraining is aangezet.

*In de applicatie:* standaard draait het taalmodel lokaal en wordt niets
gedeeld. Bij Azure OpenAI gelden de voorwaarden van die dienst. Daar word
de data alleen verwerkt in de zogenoemde DataZone wat betekent alleen Europa.

#### e. Risico op "schijnzekerheid"

Een ingevuld formulier is geen compliance-garantie, ook niet als AI het
grotendeels heeft ingevuld. De officiële brondocumenten en de oordelen van
privacy-, security- en AI-experts zijn altijd leidend. Het grootste
inhoudelijke risico is dat invullers AI-voorstellen overnemen zonder ze te
toetsen; dat is uitgewerkt in de ontwerprichting over betekenisvolle
menselijke tussenkomst. Het team blijft zelf verantwoordelijk voor het voldoen
aan standaarden en richtlijnen.

#### f. Kwaliteitsrisico: onjuiste of onveilige gegenereerde code en antwoorden

*Code:* de persoon die commit, beoordeelt de wijziging. Daarnaast zijn er
geautomatiseerde tests (Vitest), typecontrole bij elke build (`vue-tsc`) en
pre-commit-controles.

*Antwoorden in de app:* elk AI-voorstel gaat door een deterministische
validatie die het formaat controleert. Korte feitelijke antwoorden (zoals
namen, data en nummers) die niet in de brondocumenten terug te vinden zijn,
worden weggelaten; bij langere antwoorden toont het bronnenpaneel een
waarschuwing als het antwoord niet in de bron terug te vinden is. Prompts en modellen worden beoordeeld met een
evaluatieset (`backend/eval_prompts.py`).

#### g. Auteursrecht op brondocumenten als input

Per gebruikte bron wordt nagegaan of die als input voor een AI-assistant
gebruikt mag worden. De bronnen van de formulieren staan met herkomst en, waar
nodig, licentie vermeld; overgenomen code van derden (zoals de beslishulp
AI-verordening, EUPL-1.2) staat in `vendor/` met de eigen licentie. Brondocumenten
die gebruikers uploaden, zijn hun eigen verantwoordelijkheid.

#### h. Uitlegbaarheid / gevaar op "black box"

De code, de prompts en de architectuur zijn openbaar en in voor mensen
leesbare vorm gepubliceerd (zie [`ARCHITECTURE.md`](../ARCHITECTURE.md)). In de
app is per AI-antwoord zichtbaar op welke passages uit de brondocumenten het
steunt. Hoe herkomst en logging verder vorm kunnen krijgen, staat in
[`herkomst-en-logging.md`](herkomst-en-logging.md).

#### i. AI-geletterdheid van betrokken medewerkers

Kennis over de inzet van AI-assistants wordt binnen het team gedeeld; deze
verantwoording wordt openbaar gepubliceerd. Gebruikers van de invulhulp moeten
weten dat AI-voorstellen fouten kunnen bevatten en getoetst moeten worden. Dit
door voldoende disclaimers in de tool zelf te plaatsen voor de gebruikers.

### 5) Generatieve AI inkopen of bouwen

#### a. Vendor lock-in

*Bij het bouwen:* op dit moment wordt uitsluitend Claude Code gebruikt. Dat is
een expliciet aandachtspunt voor een eventueel vervolg. De opgeleverde software
zelf (Vue/TypeScript en Python/FastAPI) heeft geen afhankelijkheid van die
AI-assistant; een andere assistant kan in een vervolg worden ingezet.

*In de applicatie:* de app ondersteunt twee uitwisselbare backends, een lokaal
open-weight-model via Ollama en Azure OpenAI. Welke wordt gebruikt, is een
configuratiekeuze.

#### b. Keuze voor de AI-assistant en het taalmodel

Voor het bouwen is gekozen voor Claude Code (Anthropic), een aanbieder die de EU
General Purpose AI Code of Practice heeft ondertekend. Voor de applicatie is
een lokaal model de standaard, zodat gegevens de eigen omgeving niet hoeven te
verlaten; Azure OpenAI is beschikbaar waar een groter model nodig is.
