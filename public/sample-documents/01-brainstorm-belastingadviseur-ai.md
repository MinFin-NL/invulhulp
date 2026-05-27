# Brainstormnotitie — BelastingAdviseur AI

**Datum:** 14 maart 2026
**Aanwezig:** Sanne (productowner), Mark (data science), Joost (juridisch), Femke (UX)
**Notulist:** Femke

## Aanleiding

Veel burgers begrijpen hun belastingaanslag niet en bellen de BelastingTelefoon met dezelfde standaardvragen. Dit leidt tot lange wachttijden en hoge kosten. Sanne pitcht het idee voor een AI-assistent die in begrijpelijke taal uitleg geeft bij specifieke posten op de aanslag.

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

## Volgende stappen

1. Mark maakt een technische schets van de architectuur (RAG-aanpak op wetgeving + tooling voor opvragen aanslaggegevens).
2. Joost start een prescan DPIA om te bepalen of een volledige DPIA verplicht is.
3. Sanne plant een kickoff-meeting met FG, CISO en juridische afdeling voor begin april.
