# Brainstormnotitie — BelastingAdviseur AI

**Datum:** 14 maart 2026
**Aanwezig:** Sanne (productowner), Mark (data science), Joost (juridisch), Femke (UX)
**Notulist:** Femke

## Opdrachtgever en contactgegevens

- **Opdrachtgever:** Belastingdienst
- **Directie / afdeling:** Directie Particulieren, team Digitale Dienstverlening
- **Contactpersoon (aanspreekpunt voor dit verzoek):** Anouk de Wit, IT-architect
- **E-mailadres contactpersoon:** anouk.dewit@belastingdienst.nl
- **Telefoonnummer contactpersoon:** 06-21458877

## Aanleiding

Veel burgers begrijpen hun belastingaanslag niet en bellen de BelastingTelefoon met dezelfde standaardvragen. Dit leidt tot lange wachttijden en hoge kosten. Sanne pitcht het idee voor een AI-assistent die in begrijpelijke taal uitleg geeft bij specifieke posten op de aanslag. Het verzoek draagt bij aan de wettelijke taak van de Belastingdienst om burgers begrijpelijk te informeren en moet de druk op de BelastingTelefoon en de bijbehorende kosten verlagen.

## Beoogd doel

Een chat-assistent op MijnBelastingdienst die op basis van de individuele aanslag van een burger uitleg op maat geeft. De gebruiker kan vragen stellen als "waarom moet ik dit jaar meer betalen dan vorig jaar" of "wat is de heffingskorting waar ik recht op heb".

## Doelgroep

Particuliere burgers met een Nederlandse belastingaanslag, primair de groep die nu naar de BelastingTelefoon belt (geschat 1,2 miljoen unieke bellers per jaar). Niet bedoeld voor ondernemers of fiscaal adviseurs.

## Eerste gedachten over data

- We hebben toegang nodig tot de aanslaggegevens van de ingelogde burger (BSN, inkomensgegevens, aftrekposten).
- Het model moet getraind of gegrond worden op de actuele belastingwetgeving en de toelichtingen die de Belastingdienst zelf publiceert.
- Voor de generatieve component overwegen we een commercieel LLM (Azure OpenAI) of een gehoste open-source variant.

## Eerste zorgen

- **Privacy:** verwerking van BSN en inkomensgegevens vraagt om een volledige DPIA.
- **Hallucinatie:** een onjuist antwoord over belastingplicht kan grote financiële gevolgen hebben voor burgers — Joost wil een mechanisme om altijd door te verwijzen naar de officiële bron.
- **Aansprakelijkheid:** wie is verantwoordelijk als de assistent een verkeerd advies geeft?

## Aanmelding bij het intakeboard

- **Typering van de aanvraag:** regulier dienstverlening — het betreft een verbetering van de bestaande digitale dienstverlening aan burgers via MijnBelastingdienst, geen tijdelijk project.
- **Doelgroep en omvang:** particuliere burgers met een Nederlandse belastingaanslag, primair de circa 1,2 miljoen unieke bellers van de BelastingTelefoon per jaar.
- **Urgentie en deadline:** de directie wil een werkend prototype voor de interne demo in Q3 2026; livegang op MijnBelastingdienst is voorzien vóór de aangiftecampagne van 2027. De prescan DPIA moet daarom uiterlijk juni 2026 zijn afgerond.
- **Afhankelijkheden:** afronding van de prescan DPIA, de RAG-implementatie op de wetgeving, en de koppeling met het bestaande aanslagensysteem en MijnBelastingdienst.
- **Benodigde resources:** circa 2 data scientists, 1 architect en 1 UX-ontwerper gedurende 6 maanden, plus de verbruikskosten van Azure OpenAI. Grove kostenraming voor de initiatieffase: € 100.000.
- **Financiering / budget:** centraal budget bij CDIO (innovatiemiddelen Digitale Dienstverlening).

## Overwogen alternatieven

- Uitbreiding van de statische FAQ op de website — afgewezen omdat die geen uitleg op maat per individuele aanslag kan geven.
- Opschaling van de bezetting van de BelastingTelefoon — afgewezen vanwege de structureel hoge kosten.
- Een AI-assistent met menselijke fallback (doorverwijzing naar de BelastingTelefoon) — gekozen richting.

## Volgende stappen

1. Mark maakt een technische schets van de architectuur (RAG-aanpak op wetgeving + tooling voor opvragen aanslaggegevens).
2. Joost start een prescan DPIA om te bepalen of een volledige DPIA verplicht is.
3. Sanne plant een kickoff-meeting met FG, CISO en juridische afdeling voor begin april.
