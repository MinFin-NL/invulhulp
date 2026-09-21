# Cross-form connecties

Overzicht van alle koppelingen tussen formulieren. Antwoorden uit het bronformulier verschijnen automatisch als suggestie bij de betreffende vraag in het doelformulier.

Een koppeling heeft een **modus**:

| Modus | Wat er gebeurt | Wanneer |
|---|---|---|
| `copy` | Het antwoord wordt **letterlijk overgenomen**, en bij het openen van het doelformulier automatisch ingevuld zolang de vraag nog leeg is. Geen AI. Werkt ook voor keuzevragen en tabellen. | De twee vragen stellen dezelfde vraag |
| `synthesize` (standaard) | Het bronantwoord staat naast de vraag; met **✦ AI-suggestie** herschrijft het model het naar de context van de doelvraag. Alleen bij tekstvragen. | De vragen raken elkaar, maar vragen iets anders |

Een `copy`-koppeling naar een keuzevraag waarvan het bronantwoord geen geldige optie is (of een tabel met andere kolommen) vult niets in — dan toont het paneel alleen het bronantwoord ter informatie.

**Totaal: 276 koppelingen** verdeeld over 58 formulierparen, waarvan 45 in `copy`-modus.

> De per-paar secties hieronder beschrijven de oorspronkelijke koppelingen; de tellingen erin zijn
> niet allemaal bijgewerkt. De koppelingen van de zeven formulieren die in juli 2026 zijn
> toegevoegd staan gebundeld in [§ Nieuwe formulieren](#nieuwe-formulieren-juli-2026) onderaan;
> de IAMA-koppelingen staan in [§ IAMA](#iama-augustus-2026), die van de IHH-toets in
> [§ IHH-toets](#ihh-toets-augustus-2026) en die van de cloudtoets in
> [§ Cloudtoets](#cloudtoets-augustus-2026).
> `public/forms/crossFormMappings.json` is de bron van waarheid.

---

## Workflow-overzicht

```
Intake
  ├── → Aanbiedingsformulier → PPM Projectplan → PSA
  │                                    └── → DPIA ←──┐
  │                                    └── → AIIA ←──┤
  └── → PPM Projectplan                              │
                                                      │
Quickscan BIO2 → Prescan DPIA ──────────────────────→ DPIA ↔ AIIA
```

---

## Intake → Aanbiedingsformulier (18 koppelingen)

De twee formulieren zijn op hun gedeelde velden op elkaar afgestemd: die worden
letterlijk overgenomen en staan al ingevuld zodra je het aanbiedingsformulier
opent. Alleen de vragen die het aanbiedingsformulier écht anders stelt gaan via
AI-synthese.

**Automatisch overgenomen (`copy`)**

| Bronvraag (Intake) | Doelvraag (Aanbiedingsformulier) |
|---|---|
| Directie / afdeling(en) | Directie / Afdeling(en) |
| Naam contactpersoon | Contactpersoon |
| E-mailadres contactpersoon | E-mailadres |
| Telefoonnummer contactpersoon | Telefoonnummer |
| Naam opdrachtgever | Naam opdrachtgever |
| Aanleiding | Aanleiding |
| Doelstelling | Doelstelling (strategische context) |
| Mogelijke oplossingen | Mogelijke oplossingen |
| Afhankelijkheden met andere activiteiten/projecten | Afhankelijkheden |
| Risico's (tabel) | Risico's |
| Beoogde start-/einddatum | Beoogde start- / einddatum |
| Globale raming van de kosten | Raming projectkosten *(alleen ter info — keuzevraag)* |
| Benodigde resources | Benodigde resources *(alleen ter info — andere tabelkolommen)* |

**Via AI-synthese (`synthesize`)**

| Bronvraag (Intake) | Doelvraag (Aanbiedingsformulier) |
|---|---|
| Omschrijving van het IV-verzoek | Naam project |
| Mogelijke impact | Mogelijke impact op gebruikers, processen en organisatie |
| Mogelijke impact + Mogelijke oplossingen | Mogelijke impact op technische systemen & aspecten |
| Beoogde start-/einddatum + Aanleiding | Is het project tijdgevoelig? |
| Kostenraming + Benodigde resources | Is er budget nodig voor de initiatiefase? |

---

## Intake → PPM Projectplan (5 koppelingen)

Doelvragen volgen het PPM-Projectplan 2.0 (september 2026).

| Bronvraag (Intake) | Doelvraag (PPM Projectplan) |
|---|---|
| Omschrijving van het IV-verzoek + Aanleiding | 1.1 Aanleiding |
| Doelstelling | 1.2 Doelstelling |
| Omschrijving van het IV-verzoek + Mogelijke oplossingen | 2.2 Projectscope |
| Relatie en/of afhankelijkheid met andere activiteiten of projecten | 2.4 Afhankelijkheden |
| Globale raming van de kosten + Type budget | 5.2 Kosten – eenmalig & beheer |

---

## Aanbiedingsformulier → PPM Projectplan (12 koppelingen)

**Automatisch overgenomen (`copy`)**

| Bronvraag (Aanbiedingsformulier) | Doelvraag (PPM Projectplan) |
|---|---|
| Naam project | Naam project (voorblad) |
| Afhankelijkheden | 2.4 Afhankelijkheden |

**Via AI-synthese (`synthesize`)**

| Bronvraag (Aanbiedingsformulier) | Doelvraag (PPM Projectplan) |
|---|---|
| Aanleiding | 1.1 Aanleiding |
| Doelstelling (strategische context) | 1.2 Doelstelling |
| Mogelijke oplossingen | 1.3 Overwogen opties en argumentatie voor gekozen optie |
| Risico's | 2.3 Beperkingen en aannames |
| Beoogde start- / einddatum | 4.2 Fasering |
| Beoogde start- / einddatum | 4.3 Planning |
| Kwantitatieve baten + Kwalitatieve baten | 5.1 Baten – kwalitatief & kwantitatief |
| Raming projectkosten + Financiering + Onderhoudskosten | 5.2 Kosten – eenmalig & beheer |
| Mogelijke impact op gebruikers, processen en organisatie | 7.3 Impact op gebruikers, processen en organisatie |
| Mogelijke impact op technische systemen & aspecten | 7.3 Impact op technische systemen & aspecten |

---

## PPM Projectplan → PSA (4 koppelingen)

| Bronvraag (PPM Projectplan) | Doelvraag (PSA) |
|---|---|
| Aanleiding + Doelstelling | Aanleiding en doelstelling |
| Projectscope | Projectafbakening |
| Stakeholders | Betrokken organisatieonderdelen |
| Afhankelijkheden | De relatie met andere projecten |

---

## PPM Projectplan → DPIA (2 koppelingen)

| Bronvraag (PPM Projectplan) | Doelvraag (DPIA) |
|---|---|
| Aanleiding | Beknopte omschrijving van het project |
| Doelstelling | Aanleiding voor dit voorstel |

---

## PSA → DPIA (2 koppelingen)

| Bronvraag (PSA) | Doelvraag (DPIA) |
|---|---|
| Gegevensmodel | Welke categorieën persoonsgegevens worden verwerkt? |
| Privacy | Doeleinden van alle gegevensverwerkingen |

---

## PSA → AIIA (2 koppelingen)

| Bronvraag (PSA) | Doelvraag (AIIA) |
|---|---|
| Functionele beschrijving | Beschrijving van het beoogde doel en verwachte resultaten van het AI-systeem |
| Algoritmeregister | Beschrijving van het AI-systeem (techniek, data, type algoritme) |

---

## Quickscan BIO2 → Prescan DPIA (2 koppelingen)

| Bronvraag (Quickscan BIO2) | Doelvraag (Prescan DPIA) |
|---|---|
| Welke (bijzondere) persoonsgegevens worden verwerkt? | Welke typen persoonsgegevens worden mogelijk verwerkt? |
| Naam van het proces of informatiesysteem + Onderbouwing van de classificatie | Beschrijving van de verwerking of het geheel van verwerkingen |

---

## Quickscan BIO2 → DPIA (2 koppelingen)

| Bronvraag (Quickscan BIO2) | Doelvraag (DPIA) |
|---|---|
| Naam van het proces of informatiesysteem + Door welke systemen wordt de informatie verwerkt | Beknopte omschrijving van het project |
| Wie zijn de ketenpartners? | Betrokken partijen met AVG-rol per partij |

---

## Prescan DPIA → DPIA (5 koppelingen)

| Bronvraag (Prescan DPIA) | Doelvraag (DPIA) |
|---|---|
| Beschrijving van de verwerking of het geheel van verwerkingen | Beknopte omschrijving van het project |
| Verwerkingsdoelen | Doeleinden van alle gegevensverwerkingen |
| Wettelijke grondslag (artikel 6 lid 1 AVG) | Motivering van de gekozen rechtsgrond |
| Geautomatiseerde besluitvorming met rechtsgevolg | (Semi-)geautomatiseerde besluitvorming of profilering |
| Evaluatie/scoring + Monitoring + Bijzondere gegevens + Kwetsbare groepen | Mogelijke negatieve gevolgen voor rechten en vrijheden van betrokkenen |

---

## AIIA → DPIA (21 koppelingen)

| Bronvraag (AIIA) | Doelvraag (DPIA) |
|---|---|
| Beschrijving van het beoogde doel en verwachte resultaten | Beknopte omschrijving van het project |
| Aanleiding voor de inzet van het AI-systeem | Aanleiding voor dit voorstel |
| Beschrijving AI-systeem + Aanleiding | Doeleinden van alle gegevensverwerkingen |
| Communicatie AI-gegenereerde output aan eindgebruikers | Verwerkingsdoeleinden gecommuniceerd aan betrokkenen? |
| Rolverdeling + Gebruikers en betrokkenen | Betrokken partijen met AVG-rol per partij |
| Externe hosting — onder welke voorwaarden? | Verwerkersovereenkomst afgesloten met externe verwerkers? |
| Geconsulteerde stakeholders + Feedback van kwetsbare groepen | Overleg gevoerd met betrokkenen of hun vertegenwoordigers? |
| Beschrijving AI-systeem (techniek, data, algoritme) | (Semi-)geautomatiseerde besluitvorming of profilering |
| Externe hosting — onder welke voorwaarden? | Gebruik van cloudoplossing of big data-verwerkingen |
| Wettelijke grondslag + Grondrechtelijke bepalingen | Relevante wet- en regelgeving |
| Opslag en bewaartermijn inputdata + Bewaartermijn outputdata | Bewaartermijnen per categorie persoonsgegevens |
| Opslag en bewaartermijn inputdata + Opslag en versiebeheer model | Toezicht op bewaartermijnen en vernietiging |
| Wettelijke grondslag + Grondrechtelijke bepalingen | Motivering van de gekozen rechtsgrond |
| Dataminimalisatie: is de gebruikte data noodzakelijk? | Is de verwerking van persoonsgegevens noodzakelijk? |
| Proportionaliteit + Proportionaliteit en subsidiariteit persoonsgegevens | Proportionaliteit van de inbreuk op persoonlijke levenssfeer |
| Overwogen alternatieven + Proportionaliteit | Subsidiariteit: zijn minder ingrijpende alternatieven onderzocht? |
| Bezwaar- en beroepsprocedures voor betrokkenen | Hoe kunnen betrokkenen hun AVG-rechten uitoefenen? |
| Impact op grondrechten + Rechten die kunnen worden geschonden | Mogelijke negatieve gevolgen voor rechten en vrijheden van betrokkenen |
| Toegangsbeheer + Logging en monitoring + Onbevoegde toegang + Beveiliging vertrouwelijke informatie | Technische maatregelen om risico's te mitigeren |
| Aanvullende maatregelen + Testen risicobeheersmaatregelen | Organisatorische maatregelen |
| Testen risicobeheersmaatregelen | Resterende risico's na implementatie maatregelen |

---

## DPIA → AIIA (23 koppelingen)

| Bronvraag (DPIA) | Doelvraag (AIIA) |
|---|---|
| Beknopte omschrijving van het project | Beschrijving van het beoogde doel en verwachte resultaten van het AI-systeem |
| Aanleiding voor dit voorstel | Aanleiding voor de inzet van het AI-systeem |
| (Semi-)geautomatiseerde besluitvorming of profilering | Beschrijving van het AI-systeem (techniek, data, type algoritme) |
| Subsidiariteit: zijn minder ingrijpende alternatieven onderzocht? | Welke alternatieven zijn overwogen (inclusief niet-AI-oplossingen)? |
| Betrokken partijen met AVG-rol | Rolverdeling (ontwikkelaar, opdrachtgever, projectleider, beheerders) |
| Betrokken partijen met AVG-rol | Gebruikers en betrokkenen |
| Overleg gevoerd met betrokkenen? | Geconsulteerde stakeholders |
| Negatieve gevolgen voor rechten en vrijheden van betrokkenen | Impact van het AI-systeem op grondrechten van burgers |
| Relevante wet- en regelgeving + Motivering rechtsgrond | Wettelijke grondslag voor de inzet van het AI-systeem |
| Negatieve gevolgen voor rechten en vrijheden van betrokkenen | Rechten die kunnen worden geschonden bij incorrect functioneren |
| Noodzakelijkheid verwerking + Proportionaliteit | Proportionaliteit ten opzichte van doelstellingen |
| Organisatorische maatregelen | Aanvullende maatregelen voor verantwoord gebruik |
| Verwerkersovereenkomst + Cloudgebruik | Externe hosting — onder welke voorwaarden? |
| Technische maatregelen (versleuteling, toegangscontrole, logging) | Toegangsbeheer |
| Technische maatregelen | Logging en monitoring |
| Noodzakelijkheid verwerking persoonsgegevens | Dataminimalisatie: is de gebruikte data noodzakelijk? |
| Proportionaliteit | Proportionaliteit en subsidiariteit van de gegevensverwerking |
| Organisatorische maatregelen + Resterende risico's | Testen risicobeheersmaatregelen |
| Technische maatregelen | Voorkomen van onbevoegde toegang |
| Verwerkingsdoeleinden gecommuniceerd aan betrokkenen? | Communicatie AI-gegenereerde output aan eindgebruikers |
| Uitoefening AVG-rechten door betrokkenen | Bezwaar- en beroepsprocedures voor betrokkenen |
| Bewaartermijnen persoonsgegevens | Opslag en bewaartermijn inputdata |
| Bewaartermijnen persoonsgegevens | Bewaartermijn outputdata |

---

## Nieuwe formulieren (juli 2026)

De zeven formulieren die in juli 2026 zijn toegevoegd — Restrisico-acceptatie, Datakwaliteit-assessment,
Dataset-registratie, Data-ethiektoets, Algoritmeregister-publicatie, Verwerkingsregister en
Toegankelijkheidsverklaring — zijn met **65 koppelingen** aan de bestaande formulieren gehangen.
Dat is bewust: nul koppelingen was destijds het meetbare symptoom dat een formulier niet in het
dossiermodel paste (zie [`sporen-en-roadmap.md`](sporen-en-roadmap.md) §3).

| Doelformulier | Bronnen | Koppelingen |
|---|---|---|
| Verwerkingsregister | DPIA (10), PSA (1) | 11 |
| Algoritmeregister-publicatie | AIIA (13), Model Card (5), Datakwaliteit (1) | 19 |
| Restrisico-acceptatie | DPIA (5), AIIA (2), Intake (1), Aanbiedingsformulier (1) | 9 |
| Data-ethiektoets | AIIA (5), DPIA (4) | 9 |
| Datakwaliteit-assessment | AIIA (5), PSA (1) | 6 |
| Dataset-registratie | PSA (3), AIIA (2), DPIA (1), Verwerkingsregister (1) | 7 |
| Toegankelijkheidsverklaring | AIIA (1), PSA (1) | 2 |

De zwaartepunten volgen de inhoudelijke logica: het **Verwerkingsregister** vult zich vrijwel geheel
uit de DPIA (doeleinden, categorieën, ontvangers, doorgifte, bewaartermijnen, maatregelen — de
artikel 30-elementen staan daar al), en de **Algoritmeregister-publicatie** uit de AIIA en de Model
Card, met als voornaamste bewerking het herschrijven naar begrijpelijke taal voor een openbaar
register. De **Toegankelijkheidsverklaring** heeft er maar twee: zij gaat over de gebruikersinterface
en deelt inhoudelijk weinig met de risico- en privacy-instrumenten.

Twee koppelingen lopen tussen de nieuwe formulieren onderling: Datakwaliteit → Dataset-registratie
(kwaliteitsoordeel en beperkingen) en Verwerkingsregister → Dataset-registratie (grondslag).

---

## IAMA (augustus 2026)

Het IAMA (Impact Assessment Mensenrechten en Algoritmes) stond met 83 vragen volledig los: nul
koppelingen, in geen van beide richtingen. Dat is nu rechtgezet met **60 koppelingen**, alle in
`synthesize`-modus — het IAMA stelt zijn vragen in mensenrechtentermen, dus antwoorden uit de AIIA
en de DPIA moeten daarheen worden herschreven en kunnen niet letterlijk worden overgenomen.

**IAMA als doelformulier (52 koppelingen)**

| Bronformulier | Koppelingen | Zwaartepunt |
|---|---|---|
| AIIA | 44 | Aanleiding en doel (1.1), publieke waarden (1.2), verantwoordelijkheden (1.4), totstandkoming en kwaliteit van het algoritme (2.x), gebruikscontext en rol van de medewerker (3.x), grondrechten en de afwegingen in 4.x |
| DPIA | 8 | Wettelijke grondslag (1.3), verwerkingslocatie (3.1.4), betrokkenen en hun risico's (3.5), ernst van de inbreuk (4.3), subsidiariteit/proportionaliteit (4.4–4.5), restrisico's |

**IAMA als bronformulier (22 koppelingen)**

| Doelformulier | Koppelingen | Zwaartepunt |
|---|---|---|
| Algoritmeregister-publicatie | 8 | Doel, proces, geraakte groepen, grondslag, grondrechten, menselijke tussenkomst, monitoring, beperkingen — steeds herschreven naar begrijpelijke taal |
| Restrisico-acceptatie | 4 | Restrisico's voor betrokkenen, baten, overwogen alternatieven |
| Data-ethiektoets | 3 | Geraakte betrokkenen, het "niet doen"-scenario, blijvend dilemma |
| AIIA | 3 | Grondrechtenimpact, proportionaliteit, human in the loop |
| DPIA | 2 | Subsidiariteit en proportionaliteit |
| AI-systeemregistratie (Model Card) | 2 | Bekende beperkingen en bias-risico's |

---

## IHH-toets (augustus 2026)

De Informatiehuishoudingstoets bij IV-verzoeken hangt met **12 koppelingen** aan de rest van het
dossier. Het zwaartepunt ligt in deel A: de algemene gegevens en de bewaarcontext staan elders al,
en de achttien toetsvragen zelf gaan over functionaliteit van de beoogde applicatie — die kan geen
ander formulier beantwoorden.

**IHH-toets als doelformulier (10 koppelingen)**

| Bronformulier | Koppelingen | Zwaartepunt |
|---|---|---|
| Intake | 4 | Topdesk-nummer, opdrachtgever en contactpersoon (`copy`); omschrijving IV-verzoek → de betrokken processen |
| PSA | 3 | Processen → de betrokken processen; informatiebeveiliging en logging/monitoring als onderbouwing bij vraag 17 en 18 |
| Aanbiedingsformulier | 1 | Projectnaam (`copy`) |
| DPIA | 1 | Bewaartermijnen → hoe lang de overheidsinformatie te bewaren is |
| Quickscan BIO2 | 1 | Vertrouwelijkheidsclassificatie → rubricering |

**IHH-toets als bronformulier (2 koppelingen)**

| Doelformulier | Koppelingen | Zwaartepunt |
|---|---|---|
| Dataset-registratie | 1 | Bewaartermijn en archiveringslocatie → bewaartermijn en wat er daarna gebeurt |
| Verwerkingsregister | 1 | Autorisatie-, toegangs- en loggingmaatregelen → beveiligingsmaatregelen (art. 30/32 AVG) |

De koppelingen naar de keuzevragen (rubricering, vraag 17 en 18) staan in `copy`-modus zonder dat
de bronwaarde een geldige optie is: het paneel toont het bronantwoord dan ter informatie naast de
vraag, wat hier precies de bedoeling is — de IHH-professional leest de PSA-tekst mee bij het
beantwoorden, maar de keuze blijft aan de invuller.

---

## Cloudtoets (augustus 2026)

De cloudtoets (Handreiking gebruik clouddienst) hangt met **14 koppelingen** aan het dossier. De
zwaartepunten zijn de gegevensverwerking — rubricering, basisregistratie en bijzondere
persoonsgegevens staan al in de Quickscan BIO2 en de prescan DPIA — en de exitstrategie, die de
PSA al beschrijft.

**Cloudtoets als doelformulier (13 koppelingen)**

| Bronformulier | Koppelingen | Zwaartepunt |
|---|---|---|
| Prescan DPIA | 4 | Vorm van cloud, basisregistratie en bijzondere persoonsgegevens (`copy`); doorgifte buiten de EER en het doorgiftemechanisme |
| Quickscan BIO2 | 4 | Rubricering en bijzondere persoonsgegevens (`copy`); de opsomming van persoonsgegevens → de explain; vervolgstappen |
| Intake | 3 | Topdesk-nummer → identificatie, directie/afdeling → naam proces (`copy`); omschrijving en aanleiding → korte beschrijving |
| PSA | 2 | Aanleiding en technologielaag → korte beschrijving; exit-strategie → exitstrategie cloudbeleid |

**Cloudtoets als bronformulier (1 koppeling)**

| Doelformulier | Koppelingen | Zwaartepunt |
|---|---|---|
| Quickscan BIO2 | 1 | Type clouddienst, type service en de uitkomst van de toets → de toelichting op de cloudoplossing |

De koppeling van de prescan DPIA naar de vraag over doorgifte staat bewust in `copy`-modus zonder
dat de bronwaarde een geldige optie is: de vragen zijn tegengesteld geformuleerd (doorgifte buiten
de EER versus verwerking binnen de EER of onder een passend mechanisme), dus het paneel toont het
bronantwoord alleen ter informatie en de invuller kiest zelf. Hetzelfde geldt voor de rubricering
uit de Quickscan BIO2, die als niveau is vastgelegd en hier als ja/nee-vraag terugkomt.

Ook nieuw: `Cloudtoets` is als optie toegevoegd aan de vraag welke assessments aan een
restrisico-acceptatie ten grondslag liggen (Restrisico-acceptatie 1.1).
