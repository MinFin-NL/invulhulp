"""
Prompt-quality evaluation harness.

Runs realistic Dutch test cases through the REAL prompt builders and parsers
from main.py / rag.py against the configured LLM backend (default: Ollama
mistral) and scores the outputs with deterministic checks.

Usage:
    OLLAMA_MODEL=mistral python3 backend/eval_prompts.py            # all suites
    OLLAMA_MODEL=mistral python3 backend/eval_prompts.py extract    # one suite
    python3 backend/eval_prompts.py --runs 3                        # repeat each case
    PERSONA_MODEL=qwen3:8b JUDGE_MODEL=mistral-small3.1:24b \
        python3 backend/eval_prompts.py interview --verbose         # interview spike (not in "all")

Each case reports two verdicts:
    raw   — what the model produced (after XML parse, before the safety net)
    final — after main._validate_suggestion (what the user actually sees)
The "raw" score is the honest measure of model/prompt quality; the safety net
can blank a bad answer but never repair it.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time

import main
import rag
import textdedup
from llm import OllamaBackend, create_backend

backend = create_backend()


# ---------------------------------------------------------------------------
# Shared source documents (realistic notulen / brainstorm material)
# ---------------------------------------------------------------------------

NOTULEN = """\
Notulen projectoverleg Slimme Documentstromen — 14 mei 2026

Aanwezig: Anouk de Wit (projectleider, Belastingdienst), Joris van Dam \
(data scientist, CDIO-office), Fatima el Amrani (privacy officer), \
Stef Bakker (architect).

1. Opening
Anouk opent de vergadering. De notulen van 23 april worden vastgesteld.

2. Stand van zaken
Joris licht toe dat het classificatiemodel (DocFlow-ML, gebouwd op een \
open-source taalmodel) inmiddels op de O-omgeving draait. Het model wijst \
binnenkomende burgerbrieven automatisch toe aan een behandelteam. Het gaat \
om circa 40.000 brieven per maand. De nauwkeurigheid op de testset is 91%.

3. Privacy en gegevens
Fatima merkt op dat de brieven naam, adres, BSN en soms medische of \
financiële gegevens van burgers bevatten. Er is nog geen DPIA uitgevoerd; \
dit moet vóór de pilot zijn afgerond. Besluit: de DPIA wordt uiterlijk \
30 juni 2026 opgeleverd door het privacy-team.

4. Vervolg
De pilot start op 1 september 2026 bij de directie Particulieren, mits de \
DPIA is afgerond. Stef werkt het architectuurplaatje uit vóór het volgende \
overleg. Contactpersoon voor dit traject is Anouk de Wit, bereikbaar via \
anouk.dewit@belastingdienst.nl en 06-21458877.

Actiepunten:
- DPIA opleveren (privacy-team, 30 juni 2026)
- Architectuurschets (Stef Bakker, volgend overleg)
"""

BRAINSTORM = """\
Brainstormnotitie 'Slimme Documentstromen' — eerste gedachten

Waarom doen we dit? De afhandeling van burgerbrieven duurt nu gemiddeld \
8 werkdagen, vooral doordat het sorteren en doorzetten handmatig gebeurt. \
Met automatische classificatie verwachten we de doorlooptijd te halveren \
en medewerkers te ontlasten van repetitief werk.

Risico's die we zien: verkeerde toewijzing van gevoelige brieven \
(bijv. bezwaarschriften), te veel vertrouwen op het model zonder \
menselijke controle, en datakwaliteit van het scanproces.

Eerste gedachten over mitigatie: elke toewijzing onder de 85% zekerheid \
gaat naar een mens; steekproefsgewijze controle van 5% van alle \
toewijzingen; maandelijkse bias-rapportage.
"""

DOCS = [
    main.ExtractDocument(name="notulen-2026-05-14.txt", content=NOTULEN),
    main.ExtractDocument(name="brainstorm.txt", content=BRAINSTORM),
]
SOURCE_TEXT = NOTULEN + "\n" + BRAINSTORM

ONVOLDOENDE = "onvoldoende informatie"


# ---------------------------------------------------------------------------
# Check helpers — each returns (passed: bool, note: str)
# ---------------------------------------------------------------------------

def check_equals(expected: str):
    def c(raw_suggestion: str):
        ok = raw_suggestion.strip() == expected
        return ok, f"verwacht exact '{expected}'"
    return c


def check_refusal(raw_suggestion: str):
    s = raw_suggestion.strip().lower()
    ok = s == "" or ONVOLDOENDE in s
    return ok, "verwacht 'Onvoldoende informatie...'"


def check_contains_all(*needles: str):
    def c(raw_suggestion: str):
        low = raw_suggestion.lower()
        missing = [n for n in needles if n.lower() not in low]
        return not missing, f"mist: {missing}" if missing else "alle kernfeiten aanwezig"
    return c


def check_not_contains(*needles: str):
    def c(raw_suggestion: str):
        low = raw_suggestion.lower()
        leaked = [n for n in needles if n.lower() in low]
        return not leaked, f"gelekt: {leaked}" if leaked else "geen lekkage"
    return c


def check_no_label_prefix(raw_suggestion: str):
    bad = bool(re.match(r"^\s*[\w /]{1,40}:\s", raw_suggestion)) and not raw_suggestion.lower().startswith("onvoldoende")
    return not bad, "antwoord begint met een 'Label:'-prefix" if bad else "geen label-prefix"


def check_option_verbatim(options: list[str], expected: list[str]):
    def c(raw_suggestion: str):
        # every expected option must appear verbatim; no invented options
        missing = [o for o in expected if o not in raw_suggestion]
        return not missing, f"opties niet woordelijk aanwezig: {missing}" if missing else "optie(s) woordelijk"
    return c


def check_max_occurrences(needle: str, n: int):
    def c(raw_suggestion: str):
        count = raw_suggestion.lower().count(needle.lower())
        return count <= n, f"'{needle}' komt {count}x voor (max {n})"
    return c


def check_max_words(n: int):
    def c(raw_suggestion: str):
        words = len(raw_suggestion.split())
        return words <= n, f"{words} woorden (max {n})"
    return c


def check_min_words(n: int):
    def c(raw_suggestion: str):
        words = len(raw_suggestion.split())
        return words >= n, f"{words} woorden (min {n})"
    return c


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

EXTRACT_CASES = [
    dict(
        id="email-present",
        question="E-mailadres contactpersoon",
        question_type="text", field_format="email",
        checks=[check_equals("anouk.dewit@belastingdienst.nl")],
    ),
    dict(
        id="phone-present",
        question="Telefoonnummer contactpersoon",
        question_type="text", field_format="phone",
        checks=[check_contains_all("06"), check_not_contains("anouk"), check_max_words(3)],
    ),
    dict(
        id="shorttext-name",
        question="Naam contactpersoon",
        question_type="text", field_format="shorttext",
        checks=[check_contains_all("Anouk de Wit"), check_no_label_prefix, check_max_words(8)],
    ),
    dict(
        id="shorttext-absent",
        question="Naam van de externe leverancier",
        question_type="text", field_format="shorttext",
        checks=[check_refusal],
    ),
    dict(
        id="date-present",
        question="Geplande startdatum van de pilot",
        question_type="text", field_format="date",
        checks=[check_contains_all("1 september 2026"), check_max_words(6)],
    ),
    dict(
        id="longtext-doel",
        question="Omschrijving van het IV-verzoek (doelstelling / noodzaak / probleemstelling)",
        question_type="text", field_format="",
        checks=[
            check_contains_all("classificat", "brieven"),
            check_not_contains("eerste gedachten", "actiepunt", "fragment 1", "=== "),
            check_no_label_prefix,
            check_min_words(40),
        ],
    ),
    dict(
        id="longtext-risico",
        question="Welke risico's zijn er geïdentificeerd en welke maatregelen zijn voorzien om deze te beperken?",
        question_type="text", field_format="",
        checks=[
            check_contains_all("85%", "steekproef"),
            check_not_contains("eerste gedachten over mitigatie:"),
            check_min_words(40),
        ],
    ),
    dict(
        id="longtext-absent",
        question="Hoe is de exitstrategie en contractbeëindiging met de cloudleverancier geregeld?",
        question_type="text", field_format="",
        checks=[check_refusal],
    ),
    dict(
        id="radio-choice",
        question="Classificatie van de aanvraag",
        question_type="radio", field_format="",
        options=["Regulier dienstverlening", "Project portfolioproces", "Innovatie portfolioproces"],
        # Pilot/innovatietraject → 'Innovatie portfolioproces' is verdedigbaar;
        # we eisen vooral: precies één optie, woordelijk.
        checks=[check_option_verbatim([], []), check_max_words(4)],
    ),
    dict(
        id="checkbox-choice",
        question="Welke soorten persoonsgegevens worden verwerkt?",
        question_type="checkbox", field_format="",
        options=["NAW-gegevens", "BSN", "Medische gegevens", "Financiële gegevens", "Biometrische gegevens"],
        checks=[
            check_option_verbatim(
                ["BSN", "Medische gegevens", "Financiële gegevens"],
                ["BSN", "Medische gegevens", "Financiële gegevens"],
            ),
            check_not_contains("Biometrische"),
        ],
    ),
]

IMPROVE_CASES = [
    dict(
        id="improve-clumsy",
        question_context="Omschrijving van het IV-verzoek",
        text=(
            "we willen een ai systeem wat brieven gaat sorteren omdat dat nu "
            "best wel lang duurt, het duurt nu 8 dagen ofzo en dat moet sneller "
            "en de mensen die het nu doen die kunnen dan ander werk doen"
        ),
        checks=[
            check_contains_all("8"),
            check_not_contains("91%", "40.000", "besluit"),  # mag geen feiten toevoegen
            check_min_words(20),
        ],
    ),
    dict(
        id="improve-keeps-markdown",
        question_context="Omschrijving van het IV-verzoek",
        text=(
            "het systeem gaat **persoonsgegevens** verwerken van burgers, dat "
            "is *bijzonder gevoelig* dus daar moeten we best wel goed op letten "
            "en de bewaartermijn is 5 jaar ofzo"
        ),
        checks=[
            # vet- en cursief-opmaak blijven behouden ("5" niet gecheckt:
            # modellen schrijven getallen soms uit, net als bij improve-clumsy)
            check_contains_all("**persoonsgegevens**", "*bijzonder"),
            # spreektaal moet weg — vangt ook een verbatim echo van de invoer
            check_not_contains("ofzo", "best wel"),
            check_not_contains("AVG-artikel", "DPIA verplicht"),  # geen nieuwe claims
        ],
    ),
    dict(
        id="improve-keeps-facts",
        question_context="Doelgroep en omvang toekomstige gebruikers",
        text=(
            "De doelgroep is de directie Particulieren, daar werken ongeveer "
            "120 behandelaars die de brieven nu handmatig sorteren."
        ),
        checks=[
            check_contains_all("Particulieren", "120"),
            check_max_words(60),
        ],
    ),
]

SYNTH_CASES = [
    dict(
        id="synth-dpia-risico",
        target_question=(
            "Beschrijf de risico's voor de rechten en vrijheden van betrokkenen "
            "en de beheersmaatregelen (DPIA)."
        ),
        source_questions={
            "q1": "Omschrijving van het IV-verzoek",
            "q2": "Welke risico's zijn er geïdentificeerd?",
        },
        source_answers={
            "q1": (
                "Het project Slimme Documentstromen zet een classificatiemodel in "
                "om circa 40.000 burgerbrieven per maand automatisch toe te wijzen "
                "aan behandelteams. De brieven bevatten naam, adres, BSN en soms "
                "medische of financiële gegevens."
            ),
            "q2": (
                "Verkeerde toewijzing van gevoelige brieven, overmatig vertrouwen "
                "op het model zonder menselijke controle, en beperkte datakwaliteit "
                "van het scanproces. Mitigatie: toewijzingen onder 85% zekerheid "
                "gaan naar een mens, 5% steekproefcontrole en maandelijkse "
                "bias-rapportage."
            ),
        },
        checks=[
            check_contains_all("BSN", "85%"),
            check_not_contains("bronvraag", "antwoord:"),
            check_min_words(50),
        ],
    ),
]

SMOOTH_CASES = [
    dict(
        id="smooth-dedup",
        section_title="Doel en aanpak",
        context_answers=[],
        answers=[
            dict(
                question_id="q1",
                question_text="Omschrijving van het IV-verzoek",
                answer=(
                    "Het project Slimme Documentstromen zet het classificatiemodel "
                    "DocFlow-ML in om circa 40.000 burgerbrieven per maand automatisch "
                    "toe te wijzen aan behandelteams. De afhandeling van burgerbrieven "
                    "duurt nu gemiddeld 8 werkdagen doordat het sorteren handmatig "
                    "gebeurt; met automatische classificatie wordt de doorlooptijd "
                    "naar verwachting gehalveerd."
                ),
            ),
            dict(
                question_id="q2",
                question_text="Wat is de aanleiding van het project?",
                answer=(
                    "De aanleiding is dat de afhandeling van burgerbrieven op dit "
                    "moment gemiddeld 8 werkdagen duurt, omdat het sorteren en "
                    "doorzetten van de circa 40.000 brieven per maand handmatig "
                    "gebeurt. Het project Slimme Documentstromen wil daarom een "
                    "classificatiemodel inzetten om binnenkomende burgerbrieven "
                    "automatisch toe te wijzen aan behandelteams, zodat de "
                    "doorlooptijd wordt gehalveerd."
                ),
            ),
            dict(
                question_id="q3",
                question_text="Welke omvang heeft de verwerking?",
                answer=(
                    "De verwerking betreft circa 40.000 burgerbrieven per maand die "
                    "automatisch worden toegewezen aan behandelteams. De afhandeling "
                    "duurt nu gemiddeld 8 werkdagen en het project verwacht de "
                    "doorlooptijd met automatische classificatie te halveren."
                ),
            ),
        ],
        # Every unique fact survives at least once and repetition shrinks. The
        # volume may legitimately appear twice: q3 asks for it directly, and
        # q1's project description reasonably states it too. The input has 3.
        checks_joined=[
            check_contains_all("40.000", "8 werkdagen"),
            check_max_occurrences("40.000", 2),
            check_max_occurrences("gehalveerd", 2),
            check_not_contains("zie boven", "zoals eerder genoemd"),
        ],
    ),
    dict(
        id="smooth-no-hallucination",
        section_title="Risico's",
        context_answers=[
            dict(
                question_id="c1",
                question_text="Omschrijving van het IV-verzoek",
                answer=(
                    "Het project Slimme Documentstromen wijst met het model DocFlow-ML "
                    "circa 40.000 burgerbrieven per maand automatisch toe aan "
                    "behandelteams."
                ),
            ),
        ],
        answers=[
            dict(
                question_id="q1",
                question_text="Welke risico's zijn geïdentificeerd?",
                answer=(
                    "De geïdentificeerde risico's zijn verkeerde toewijzing van "
                    "gevoelige brieven zoals bezwaarschriften, overmatig vertrouwen "
                    "op het model zonder menselijke controle, en beperkte "
                    "datakwaliteit van het scanproces. Het model DocFlow-ML wijst "
                    "circa 40.000 burgerbrieven per maand automatisch toe aan "
                    "behandelteams."
                ),
            ),
            dict(
                question_id="q2",
                question_text="Welke beheersmaatregelen zijn voorzien?",
                answer=(
                    "Toewijzingen met minder dan 85% zekerheid gaan naar een "
                    "medewerker, 5% van alle toewijzingen wordt steekproefsgewijs "
                    "gecontroleerd en er komt een maandelijkse bias-rapportage."
                ),
            ),
        ],
        # q1 repeats the context fact and should shrink; q2 is already tight —
        # ideally omitted (unchanged), but a cosmetic rewrite is acceptable as
        # long as it keeps every fact and doesn't grow.
        checks_joined=[
            check_contains_all("85%", "bezwaarschriften"),
            check_not_contains("gpt", "95%", "2027", "dpia"),
        ],
        expect_tight={"q2": ["85%", "5%", "maandelijkse"]},
    ),
    # The failure this pass exists for: a whole paragraph from an earlier
    # section restated at the tail of two later answers. The duplicated
    # paragraph must disappear entirely, not be shortened or summarized.
    # The context answer opens with 500+ chars of unrelated text on purpose —
    # the repeated paragraph only becomes visible with _SMOOTH_CONTEXT_CHARS
    # large enough to carry whole paragraphs, which is half of the fix.
    dict(
        id="smooth-alinea-dup",
        section_title="Uitvoering en beheer",
        context_answers=[
            dict(
                question_id="c1",
                question_text="Omschrijving van het IV-verzoek",
                answer=(
                    "Het project Slimme Documentstromen wijst met het model DocFlow-ML "
                    "circa 40.000 burgerbrieven per maand automatisch toe aan "
                    "behandelteams. De brieven komen binnen via het centrale "
                    "scanstraatproces en worden na classificatie in de bestaande "
                    "zaaksystemen geplaatst, waar behandelaars ze op de gebruikelijke "
                    "manier afhandelen. Het verzoek betreft uitsluitend de "
                    "classificatiestap; de opslag, de archivering en de "
                    "antwoordbrieven blijven ongewijzigd. De verwachte oplevering is "
                    "het vierde kwartaal, aansluitend op de vervanging van de "
                    "scanstraat.\n\n"
                    "De besluitvorming over het project ligt bij de stuurgroep "
                    "Informatievoorziening, die maandelijks bijeenkomt onder "
                    "voorzitterschap van de directeur Bedrijfsvoering. De stuurgroep "
                    "beslist over scope, budget en oplevermomenten en rapporteert per "
                    "kwartaal aan de Bestuursraad. Wijzigingen in de scope worden pas "
                    "doorgevoerd nadat de stuurgroep daarover een formeel besluit heeft "
                    "genomen."
                ),
            ),
        ],
        answers=[
            dict(
                question_id="q1",
                question_text="Hoe is het project georganiseerd?",
                answer=(
                    "Het projectteam bestaat uit een productowner, twee data-engineers "
                    "en een informatieanalist, en werkt in sprints van twee weken vanuit "
                    "de afdeling Dienstverlening.\n\n"
                    "De besluitvorming over het project ligt bij de stuurgroep "
                    "Informatievoorziening, die maandelijks bijeenkomt onder "
                    "voorzitterschap van de directeur Bedrijfsvoering. De stuurgroep "
                    "beslist over scope, budget en oplevermomenten en rapporteert per "
                    "kwartaal aan de Bestuursraad. Wijzigingen in de scope worden pas "
                    "doorgevoerd nadat de stuurgroep daarover een formeel besluit heeft "
                    "genomen."
                ),
            ),
            dict(
                question_id="q2",
                question_text="Hoe wordt het beheer na oplevering belegd?",
                answer=(
                    "Na oplevering gaat het model in beheer bij het team Applicatiebeheer, "
                    "dat de modelprestaties bewaakt en jaarlijks een hertraining uitvoert.\n\n"
                    "De besluitvorming over het project ligt bij de stuurgroep "
                    "Informatievoorziening, die maandelijks bijeenkomt onder "
                    "voorzitterschap van de directeur Bedrijfsvoering. De stuurgroep "
                    "beslist over scope, budget en oplevermomenten en rapporteert per "
                    "kwartaal aan de Bestuursraad."
                ),
            ),
        ],
        # The stuurgroep paragraph already stands in the context answer, so it
        # may not survive anywhere in this section; the unique facts of both
        # answers must remain.
        checks_joined=[
            check_contains_all("productowner", "twee weken", "Applicatiebeheer", "hertraining"),
            check_not_contains(
                "voorzitterschap", "Bestuursraad", "formeel besluit", "zie boven",
            ),
            check_max_occurrences("stuurgroep", 1),
            check_max_words(90),
        ],
    ),
]

# The paragraph the smoothing pass has to notice, and two answers that talk
# about the same project without repeating it.
_STUURGROEP = (
    "De besluitvorming over het project ligt bij de stuurgroep Informatievoorziening, "
    "die maandelijks bijeenkomt onder voorzitterschap van de directeur Bedrijfsvoering. "
    "De stuurgroep beslist over scope, budget en oplevermomenten en rapporteert per "
    "kwartaal aan de Bestuursraad."
)
_DECOY_A = (
    "Voor de verwerking is een verwerkersovereenkomst gesloten met de leverancier van "
    "de scanstraat. De bewaartermijn van gescande brieven bedraagt zeven jaar."
)
_DECOY_B = (
    "De gebruikers zijn behandelaars bij vier regiokantoren. Zij krijgen een training "
    "van een dagdeel voordat het systeem in gebruik wordt genomen."
)


def _check_selection():
    batch = ["Het projectteam werkt in sprints van twee weken.\n\n" + _STUURGROEP]
    candidates = [("d1", _DECOY_A), ("c1", "Inleiding op het verzoek.\n\n" + _STUURGROEP), ("d2", _DECOY_B)]
    picked = [qid for qid, _ in textdedup.select_context(batch, candidates, 4000, 1000)]
    return picked == ["c1"], f"context-selectie koos {picked} (verwacht ['c1'])"


def _check_extract_keeps_repeat():
    text = _DECOY_A + "\n\n" + _STUURGROEP
    targets = [textdedup.shingles(textdedup.normalize_words(_STUURGROEP))]
    kept = textdedup.extract_paragraphs(text, targets, budget=len(_STUURGROEP) + 20)
    ok = "Bestuursraad" in kept and "bewaartermijn" not in kept
    return ok, "paragraaf-extract houdt de herhaalde alinea, niet de kop van de tekst"


def _check_scores():
    near = textdedup.relevance(
        "De besluitvorming ligt bij de stuurgroep Informatievoorziening, die maandelijks "
        "bijeenkomt onder voorzitterschap van de directeur Bedrijfsvoering.",
        [textdedup.shingles(textdedup.normalize_words(_STUURGROEP))],
    )
    far = textdedup.relevance(_DECOY_B, [textdedup.shingles(textdedup.normalize_words(_STUURGROEP))])
    return near > 0.4 and far < 0.1, f"bijna-woordelijk {near:.2f} vs. ongerelateerd {far:.2f}"


def _check_budget():
    candidates = [(f"q{i}", _STUURGROEP + " " + _DECOY_A) for i in range(20)]
    picked = textdedup.select_context([_STUURGROEP], candidates, 2000, 1000)
    total = sum(len(t) for _, t in picked)
    return total <= 2000, f"{total} tekens context (max 2000)"


DEDUP_CASES = [
    dict(id="dedup-selectie", checks=[_check_selection]),
    dict(id="dedup-extract", checks=[_check_extract_keeps_repeat]),
    dict(id="dedup-scores", checks=[_check_scores]),
    dict(id="dedup-budget", checks=[_check_budget]),
]


def _big_section_answers(n: int) -> list[dict]:
    """A section far larger than one LLM call can take: n answers of ~800 chars,
    each repeating the same governance paragraph the first answer introduces."""
    repeated = (
        "De besluitvorming over het project ligt bij de stuurgroep Informatievoorziening, "
        "die maandelijks bijeenkomt onder voorzitterschap van de directeur Bedrijfsvoering "
        "en per kwartaal rapporteert aan de Bestuursraad. "
    )
    unique = (
        "Onderdeel {i} van de uitvoering betreft {topic}. Hiervoor is een werkinstructie "
        "opgesteld die door het team wordt gevolgd en jaarlijks wordt herzien. De "
        "verantwoordelijkheid ligt bij de afdeling Dienstverlening, die hierover in het "
        "kwartaalverslag rapporteert. "
    )
    topics = [
        "de inrichting van de scanstraat", "het beheer van de trainingsdata",
        "de logging van classificatiebesluiten", "de terugkoppeling aan behandelaars",
        "het bijhouden van de foutmarge", "de archivering van brieven",
    ]
    return [
        dict(
            question_id=f"g{i}",
            question_text=f"Beschrijf onderdeel {i} van de uitvoering.",
            answer=(unique.format(i=i, topic=topics[i % len(topics)]) * 2 + repeated).strip(),
        )
        for i in range(n)
    ]


SMOOTH_FORM_CASES = [
    # The regression this suite exists for: one call per section made this form
    # exceed the request cap, so the backend rejected it and the client silently
    # left every answer untouched.
    dict(
        id="smooth-groot",
        sections=[
            dict(title="Doel en aanpak", answers=[
                dict(
                    question_id="c1",
                    question_text="Omschrijving van het IV-verzoek",
                    answer=(
                        "Het project Slimme Documentstromen wijst met het model DocFlow-ML "
                        "circa 40.000 burgerbrieven per maand automatisch toe aan behandelteams."
                    ),
                ),
            ]),
            dict(title="Uitvoering en beheer", answers=_big_section_answers(30)),
        ],
        min_batches=4,
    ),
]


ONTOLOGY_CASES = [
    dict(
        id="ontology-notulen",
        doc_name="notulen-2026-05-14.txt",
        content=NOTULEN,
        expect_people=["Anouk de Wit", "Joris van Dam", "Fatima el Amrani", "Stef Bakker"],
        expect_systems=["DocFlow-ML"],
        expect_decision_date="2026-06-30",
    ),
]


# ---------------------------------------------------------------------------
# Interview spike (werkplan-kompas stap 4, fase 0)
#
# docs/interviewmodus-socratisch-gesprek.md §10–11: a persona eval, no UI and
# no endpoint. The interviewer prompt below is a CANDIDATE and lives here on
# purpose — per §12 it only moves to main.py once this suite says the model
# neither steers nor misses the applicability facts. A second model plays the
# project lead from a persona sheet; a third judges every question for steering.
#
# Proposals are made per toepassingsscan question (src/utils/toepassingsscan.ts,
# SCAN_VERSION '2'), because phase 1 routes them to that question for the user
# to confirm (§9.1, brake 2) — the conversation never sets a kenmerk itself.
# ---------------------------------------------------------------------------

# Option ids per scan question, and which options make the kenmerk true.
# Hand copy of SCAN_QUESTIONS; keep in step with it.
SCAN_OPTIONS: dict[str, list[str]] = {
    "pg": ["ja", "nee", "onbekend"],
    "gedrag": ["rangschikt", "genereert", "leert", "herkent", "ingekocht", "geen"],
    "besluit": ["neemt", "hulpmiddel", "nee", "onbekend"],
    "oplevering": ["website", "webapp", "app", "intranet", "backoffice", "api", "data", "infra"],
    "dataset": ["ja", "nee", "onbekend"],
    "doelgroep": ["burgers", "bedrijven", "medewerkers", "intern"],
}
SCAN_KENMERK: dict[str, tuple[str, set[str]]] = {
    "pg": ("persoonsgegevens", {"ja"}),
    "gedrag": ("algoritme_of_ai", {"rangschikt", "genereert", "leert", "herkent", "ingekocht"}),
    "besluit": ("besluit_over_personen", {"neemt", "hulpmiddel"}),
    "oplevering": ("gebruikersinterface", {"website", "webapp", "app", "intranet"}),
    "dataset": ("eigen_dataset", {"ja"}),
    "doelgroep": ("raakt_burgers", {"burgers", "bedrijven"}),
}

INTERVIEW_BUDGET = 14  # questions; the six scan questions should need far fewer

INTERVIEW_SYSTEM_PROMPT = """\
Je bent interviewer voor de invulhulp van het Ministerie van Financiën. Je voert een kort \
startgesprek met een projectleider over zijn of haar IV-project. Het doel: de projectleider \
vertelt zelf wat het systeem is en doet, zodat duidelijk wordt hoe de zes scanvragen hieronder \
beantwoord moeten worden. Jij vult niets in. Jij vraagt; de projectleider vertelt en bevestigt \
straks zelf elk voorstel.

De zes scanvragen (id: vraag, met de opties):
- pg: Komen er in dit project gegevens voor die, ook indirect, naar een persoon te herleiden zijn? \
Ook personeelsnummers, IP-adressen, logging, pseudoniemen en gegevens over eigen medewerkers tellen mee.
  ja | nee | onbekend
- gedrag: Wat doet het systeem? Meerdere opties mogelijk. Een scoringsregel in een spreadsheet telt net zo goed mee als een taalmodel.
  rangschikt (rangschikt, scoort of prioriteert mensen of zaken) | genereert (maakt tekst, beeld, geluid of code) | \
leert (leert van data of past zijn gedrag aan) | herkent (herkent patronen, beelden, spraak of tekst) | \
ingekocht (bevat een ingekochte component die als slim of AI wordt aangeprezen) | \
geen (volgt alleen vaste, door mensen opgeschreven regels)
- besluit: Ondersteunt of vervangt het systeem een besluit of beoordeling over een persoon? \
Bijvoorbeeld een aanvraag toekennen of afwijzen, selecteren voor controle, een risico-inschatting of het beoordelen van medewerkers.
  neemt (neemt zo'n besluit of bereidt het voor) | hulpmiddel (alleen als hulpmiddel bij een menselijk oordeel) | nee | onbekend
- oplevering: Wat levert het project op? Meerdere opties mogelijk.
  website (publieke website of webformulier) | webapp (besloten webapplicatie achter een login) | app (mobiele app) | \
intranet | backoffice (software zonder webinterface) | api (API of koppelvlak) | \
data (dataproduct, dataset of model zonder eigen interface) | infra (infrastructuur of hardware)
- dataset: Beheert het project een eigen dataset, of levert het zelf gegevens aan anderen? \
Alleen gegevens van een ander systeem tonen telt niet mee.
  ja | nee | onbekend
- doelgroep: Wie merkt straks iets van de werking van het systeem? Meerdere opties mogelijk.
  burgers | bedrijven (bedrijven of instellingen buiten de rijksoverheid) | \
medewerkers (medewerkers van het ministerie of andere overheden) | intern (niemand buiten het projectteam)

Wat je mag doen:
1. Open vragen stellen: wat, wie, hoe, wat gebeurt er als.
2. Doorvragen op een abstract antwoord: "burgers" wordt "welke burgers?".
3. Een concreet geval voorleggen als vraag, zonder het antwoord erin.
4. Spiegelen: herhalen wat de projectleider zelf zei en vragen of je het goed begrijpt.
5. Twee eerdere antwoorden van de projectleider naast elkaar leggen als ze lijken te botsen.
6. Afsluiten als elke scanvraag een voorstel heeft.

Harde regels:
1. Stel nooit zelf een antwoord voor op een scanvraag. Dus niet: "Er worden dus geen persoonsgegevens \
verwerkt?", "Het is toch geen AI?", "Ik neem aan dat burgers er niets van merken?". Vraag het open.
2. Eén vraag per beurt, kort en in gewone taal. Noem geen optie-id's.
3. "Weet ik niet" is een goed antwoord. Praat de projectleider niet naar ja of nee. Stel dan de optie \
onbekend voor, of doe geen voorstel als die optie er niet is.
4. Doe alleen een voorstel als de projectleider het zelf heeft gezegd. Het citaat is een letterlijk \
stuk uit een antwoord van de projectleider, woord voor woord gekopieerd, nooit uit je eigen vraag \
en nooit een samenvatting.
5. Het citaat moet het antwoord zelf dragen. Zegt de projectleider niets over een scanvraag, doe dan \
geen voorstel maar vraag ernaar.
6. Doe een voorstel zodra de projectleider het antwoord heeft gegeven; wacht er niet mee tot het einde. \
Stel je volgende vraag over een scanvraag die nog geen voorstel heeft.
7. Geen juridisch oordeel en geen moraal.
8. Herhaal geen voorstel dat er al staat, tenzij de projectleider iets anders zegt.

Antwoord precies in dit formaat, en sluit elke tag af:
<voorstel vraag="pg" optie="ja">letterlijk citaat</voorstel>
(nul of meer voorstellen; bij meerdere opties voor één vraag: één tag per optie)
<vraag>je volgende vraag aan de projectleider</vraag>
<waarvoor>id van de scanvraag waar deze vraag bij hoort</waarvoor>

Ben je klaar, of is het je laatste beurt, zet dan na je laatste voorstellen alleen <klaar/>."""

PERSONA_SYSTEM_PROMPT = """\
Je speelt een projectleider bij het Ministerie van Financiën. Een interviewer stelt je vragen over \
je project. Alles wat je weet, staat in de projectbeschrijving hieronder.

Regels:
1. Antwoord in één tot drie korte zinnen, in spreektaal en in je eigen woorden.
2. Beantwoord alleen wat er gevraagd wordt. Vertel niet uit jezelf alles wat in de beschrijving staat.
3. Staat iets niet in de beschrijving, zeg dan dat je het niet weet. Verzin niets.
4. Schrijf alleen je eigen antwoord op deze ene vraag, geen vragen of beurten van de interviewer.
5. {karakter}

Geef alleen je antwoord, zonder aanhalingstekens, namen of uitleg.

Projectbeschrijving:
{beschrijving}"""

STURING_JUDGE_PROMPT = """\
Je beoordeelt de vragen van een interviewer in een gesprek met een projectleider. Het gesprek moet \
uitwijzen hoe zes scanvragen beantwoord worden: komen er persoonsgegevens voor; wat doet het systeem \
(rangschikken, genereren, leren, herkennen, ingekochte AI, of alleen vaste regels); ondersteunt het een \
besluit over personen; wat levert het project op; beheert het een eigen dataset; en wie merkt iets van \
de werking.

De interviewer mag vragen, doorvragen, een concreet geval voorleggen en spiegelen (herhalen wat de \
projectleider zelf zei). Hij mag nooit zelf een antwoord op een van die zes scanvragen voorstellen of \
veronderstellen.

Sturend is een vraag die een antwoord op een scanvraag veronderstelt dat de projectleider nog niet zelf \
gaf, of die de projectleider naar één antwoord duwt. Voorbeelden: "Er worden dus geen persoonsgegevens \
verwerkt?", "Het is toch geen AI?", "Ik neem aan dat burgers er niets van merken?", "Dat is dus gewoon \
een hulpmiddel, toch?".

Niet sturend: een open vraag, ook als die voortbouwt op wat de projectleider zei; een neutrale \
ja/nee-vraag zonder voorkeur, zoals "Worden er gegevens van personen opgeslagen?"; een concreet geval als \
vraag, zoals "Wat gebeurt er met iemand die geen DigiD heeft?"; spiegelen van wat de projectleider zelf zei.

Geef voor elke vraag van de interviewer één regel, in volgorde:
<oordeel nr="1">open</oordeel>
<oordeel nr="2">sturend</oordeel><reden>één zin: welk antwoord de vraag veronderstelt</reden>"""

INTERVIEW_CASES = [
    dict(
        id="interview-afsprakenplanner",
        karakter=(
            "Je denkt eerst dat het alleen om bedrijfsgegevens gaat en zegt dat ook. Pas als iemand vraagt "
            "wat er precies in het formulier wordt ingevuld, noem je de contactpersoon met naam, "
            "e-mailadres en telefoonnummer."
        ),
        beschrijving="""\
Project: online afsprakenplanner voor fysieke controles bij de Douane.
- Wat het is: een publiek webformulier waarmee bedrijven (expediteurs, importeurs) zelf een tijdslot boeken voor de fysieke controle van een zending.
- Wie ermee werkt: medewerkers van die bedrijven boeken; douaneambtenaren zien de planning.
- Wat er in het formulier wordt ingevuld: bedrijfsnaam, EORI-nummer, en naam, e-mailadres en telefoonnummer van de contactpersoon.
- Hoe het werkt: wie het eerst boekt, krijgt het tijdslot. Vaste regels die het team zelf heeft opgeschreven. Geen slimme functies en geen scores.
- Beslissingen: de planner beslist niets over personen of bedrijven. Welke zending gecontroleerd wordt, is al eerder besloten in een ander systeem.
- Gegevens: de afspraken worden opgeslagen in het bestaande zaaksysteem van de Douane. Het project beheert zelf geen database en levert geen gegevens aan anderen.
- Wie er iets van merkt: de bedrijven die boeken, en de douaneambtenaren.""",
        golden={
            "persoonsgegevens": True, "algoritme_of_ai": False, "besluit_over_personen": False,
            "gebruikersinterface": True, "eigen_dataset": False, "raakt_burgers": True,
        },
    ),
    dict(
        id="interview-bezwaarprioritering",
        karakter=(
            "Je praat abstract ('het is een slimme tool', 'het gaat om burgers'). Je zegt uit jezelf: "
            "'Het systeem beslist niks, dat doet de behandelaar.' Concreet word je pas als er doorgevraagd wordt."
        ),
        beschrijving="""\
Project: prioritering van bezwaarschriften bij de Belastingdienst.
- Wat het is: een besloten webapplicatie achter een login, voor behandelaars van bezwaarschriften.
- Hoe het werkt: elk binnenkomend bezwaar krijgt een urgentiescore. Die score komt uit een model dat getraind is op afgehandelde bezwaren van de afgelopen vijf jaar. De werklijst staat op volgorde van die score en behandelaars pakken het bovenste bezwaar eerst.
- Beslissingen: de behandelaar beslist over het bezwaar zelf, niet het systeem. Het systeem bepaalt wel de volgorde waarin bezwaren worden opgepakt.
- Gegevens: de bezwaarschriften bevatten naam, BSN en de inhoud van het bezwaar. Het team beheert een eigen trainingsset met de historische bezwaren.
- Wie er iets van merkt: de behandelaars werken ermee. Burgers die bezwaar maken merken het aan hoe snel hun bezwaar wordt opgepakt.""",
        golden={
            "persoonsgegevens": True, "algoritme_of_ai": True, "besluit_over_personen": True,
            "gebruikersinterface": True, "eigen_dataset": True, "raakt_burgers": True,
        },
    ),
    dict(
        id="interview-opslagmigratie",
        karakter=(
            "Je bent inschikkelijk: als de interviewer iets veronderstelt of voorstelt over iets wat je niet "
            "zeker weet, ga je erin mee ('ja, dat zal wel'). Over wat er op de shares staat, weet je echt niets."
        ),
        beschrijving="""\
Project: migratie van het centrale opslagcluster (fileshares) naar nieuwe hardware in het eigen datacenter.
- Wat het is: een infrastructuurproject. Er komt geen nieuwe applicatie en geen scherm; de shares verhuizen naar nieuwe opslag.
- Hoe het werkt: kopiëren met standaard migratiesoftware, volgens een vast schema. Niets slims.
- Beslissingen: het systeem beslist niets over mensen.
- Gegevens: je weet niet wat er op de shares staat. Het zijn bestanden van allerlei afdelingen en het team kijkt niet naar de inhoud. Het team beheert alleen de opslag, geen eigen dataset, en levert niets aan anderen.
- Wie er iets van merkt: alleen medewerkers van het ministerie, als hun schijf een avond niet bereikbaar is.""",
        golden={
            "persoonsgegevens": "onbekend", "algoritme_of_ai": False, "besluit_over_personen": False,
            "gebruikersinterface": False, "eigen_dataset": False, "raakt_burgers": False,
        },
    ),
]


# ---------------------------------------------------------------------------
# Runners
# ---------------------------------------------------------------------------

async def run_extract(case: dict) -> dict:
    req = main.ExtractRequest(
        documents=DOCS,
        target_question=case["question"],
        options=case.get("options", []),
        question_type=case["question_type"],
        field_format=case["field_format"],
        form_context=(
            "Intake-formulier voor IV-verzoeken bij het Ministerie van Financiën: "
            "beschrijft doel, doelgroep, risico's en benodigde middelen van een "
            "nieuw informatievoorzieningstraject."
        ),
    )
    system_prompt = main._build_extract_system_prompt(
        req.question_type, req.field_format, req.form_context
    )
    t0 = time.monotonic()
    raw = await backend.chat(system_prompt, main._extract_user_message(req))
    dt = time.monotonic() - t0
    suggestion, rationale = main._parse_synthesize(raw)
    final = main._validate_suggestion(
        suggestion, req.field_format, req.target_question, req.options, SOURCE_TEXT
    )
    return score(case, raw, suggestion, final, rationale, dt)


async def run_improve(case: dict) -> dict:
    req = main.ImproveRequest(text=case["text"], question_context=case["question_context"])
    t0 = time.monotonic()
    raw = await backend.chat(main.SYSTEM_PROMPT, main._improve_user_message(req))
    dt = time.monotonic() - t0
    suggestion, rationale = main._parse_improve(raw, case["text"])
    return score(case, raw, suggestion, suggestion, rationale, dt)


async def run_synth(case: dict) -> dict:
    req = main.SynthesizeRequest(
        source_answers=case["source_answers"],
        source_questions=case["source_questions"],
        target_question=case["target_question"],
    )
    t0 = time.monotonic()
    raw = await backend.chat(main.SYNTHESIZE_SYSTEM_PROMPT, main._synthesize_user_message(req))
    dt = time.monotonic() - t0
    suggestion, rationale = main._parse_synthesize(raw)
    return score(case, raw, suggestion, suggestion, rationale, dt)


async def run_smooth(case: dict) -> dict:
    req = main.SmoothRequest(
        section_title=case["section_title"],
        answers=[main.SmoothAnswer(**a) for a in case["answers"]],
        context_answers=[main.SmoothAnswer(**a) for a in case["context_answers"]],
    )
    originals = {a.question_id: a.answer for a in req.answers}
    t0 = time.monotonic()
    raw = await backend.chat(main.SMOOTH_SYSTEM_PROMPT, main._smooth_user_message(req))
    dt = time.monotonic() - t0
    final = main._parse_smooth(raw, originals)

    notes, passed = [], []

    def add(ok: bool, note: str):
        passed.append(ok)
        notes.append(("PASS " if ok else "FAIL ") + note)

    joined = "\n\n".join(final[qid] for qid in originals)
    for chk in case["checks_joined"]:
        ok, note = chk(joined)
        add(ok, note)
    for qid in originals:
        add(bool(final[qid].strip()), f"antwoord {qid} niet leeg")
        add(len(final[qid]) <= 1.5 * len(originals[qid]), f"antwoord {qid} niet gegroeid")
    for qid, needles in case.get("expect_tight", {}).items():
        if final[qid] == originals[qid]:
            add(True, f"antwoord {qid} ongewijzigd (weggelaten)")
        else:
            kept = all(n.lower() in final[qid].lower() for n in needles)
            add(kept and len(final[qid]) <= len(originals[qid]),
                f"antwoord {qid} herschreven zonder feitverlies of groei")
    # The suite's dedup goal only counts if something actually changed.
    add(any(final[qid] != originals[qid] for qid in originals) or not case.get("checks_joined"),
        "minstens één antwoord herschreven")
    return {
        "id": case["id"], "ok": all(passed), "time": dt, "notes": notes,
        "raw": raw[:600], "suggestion": joined[:600], "final": joined[:600],
    }


async def run_dedup(case: dict) -> dict:
    """LLM-free: pins the deterministic context selection in textdedup. Runs in
    milliseconds, so every threshold constant has a regression net."""
    notes, passed = [], []

    def add(ok: bool, note: str):
        passed.append(ok)
        notes.append(("PASS " if ok else "FAIL ") + note)

    t0 = time.monotonic()
    for check in case["checks"]:
        ok, note = check()
        add(ok, note)
    return {
        "id": case["id"], "ok": all(passed), "time": time.monotonic() - t0,
        "notes": notes, "raw": "", "suggestion": "", "final": "",
    }


async def run_smooth_form(case: dict) -> dict:
    """Whole-form smoothing: batching is asserted directly, then the real run
    must return every question id it was given."""
    req = main.SmoothFormRequest(
        sections=[
            main.SmoothSectionInput(
                title=s["title"], answers=[main.SmoothAnswer(**a) for a in s["answers"]]
            )
            for s in case["sections"]
        ]
    )
    originals = {a.question_id: a.answer.strip() for s in req.sections for a in s.answers}
    notes, passed = [], []

    def add(ok: bool, note: str):
        passed.append(ok)
        notes.append(("PASS " if ok else "FAIL ") + note)

    batches = main._smooth_batches(req.sections)
    add(len(batches) >= case["min_batches"],
        f"{len(batches)} batches (min {case['min_batches']})")
    oversize = [
        b for b in batches
        if len(b.answers) > 1 and sum(len(a.answer) for a in b.answers) > main._SMOOTH_BATCH_CHARS
    ]
    add(not oversize, f"{len(oversize)} batches boven het tekenbudget")
    add(all(len(b.answers) <= main._SMOOTH_MAX_BATCH_ANSWERS for b in batches),
        "geen batch met te veel antwoorden")
    batched_ids = {a.question_id for b in batches for a in b.answers}
    add(batched_ids == set(originals), "elk antwoord zit in een batch")

    t0 = time.monotonic()
    final = await main._smooth_form(req)
    dt = time.monotonic() - t0

    add(set(final) == set(originals), "elk vraag-ID staat in het eindresultaat")
    add(all(final.get(qid, "").strip() for qid in originals), "geen leeg antwoord")
    add(all(len(final[qid]) <= 1.5 * len(originals[qid]) for qid in originals),
        "geen antwoord gegroeid")
    changed = sum(1 for qid in originals if final[qid] != originals[qid])
    add(changed > 0, f"{changed}/{len(originals)} antwoorden herschreven")
    # The governance paragraph starts in all 30 answers. Batching removes most
    # of it (~9 survive), but not down to one: answers in different batches only
    # see the earliest answers as context, so each batch tends to keep its own
    # copy. Squeezing that last factor out is the deterministic duplicate map's
    # job, not batching's — this bar guards the win we actually have.
    before = sum(a["answer"].lower().count("bestuursraad")
                 for s in case["sections"] for a in s["answers"])
    joined = "\n\n".join(final[qid] for qid in originals)
    after = joined.lower().count("bestuursraad")
    add(after <= before // 2, f"'Bestuursraad': {before}x → {after}x (max {before // 2})")

    return {
        "id": case["id"], "ok": all(passed), "time": dt, "notes": notes,
        "raw": "", "suggestion": joined[:600], "final": joined[:600],
    }


async def run_ontology(case: dict) -> dict:
    t0 = time.monotonic()
    onto = await rag.extract_ontology(case["doc_name"], case["content"], backend.chat)
    dt = time.monotonic() - t0
    notes, passed = [], []

    def add(ok: bool, note: str):
        passed.append(ok)
        notes.append(("PASS " if ok else "FAIL ") + note)

    add(not onto.get("_parse_error"), "geldige JSON")
    people = " ".join((onto.get("entiteiten") or {}).get("personen") or [])
    for p in case["expect_people"]:
        add(p.lower() in people.lower(), f"persoon '{p}' gevonden")
    systems = " ".join((onto.get("entiteiten") or {}).get("systemen") or [])
    for s in case["expect_systems"]:
        add(s.lower() in systems.lower(), f"systeem '{s}' gevonden")
    decisions = json.dumps(onto.get("besluiten") or [], ensure_ascii=False)
    add(case["expect_decision_date"] in decisions or "30 juni" in decisions,
        "besluit-datum DPIA gevonden")
    add(bool(onto.get("samenvatting")), "samenvatting aanwezig")
    return {
        "id": case["id"], "ok": all(passed), "time": dt,
        "notes": notes, "raw": json.dumps(onto, ensure_ascii=False)[:600],
        "suggestion": "", "final": "",
    }


_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_VOORSTEL_RE = re.compile(
    r"""<voorstel\s+vraag=["']([^"']+)["']\s+optie=["']([^"']+)["']\s*>(.*?)</voorstel>""",
    re.DOTALL | re.IGNORECASE,
)
_KLAAR_RE = re.compile(r"<klaar\s*/?>", re.IGNORECASE)
# Models often leave <vraag> unclosed and go straight on to <waarvoor>: take the
# text up to the next tag. Counted separately, it is layout, not content.
_VRAAG_OPEN_RE = re.compile(r"<vraag>(.*?)(?=<|$)", re.DOTALL | re.IGNORECASE)
# Phrasings that often carry a presumed answer. Listed for a human read, never
# scored: "dus …?" also opens a legitimate mirror.
_STURING_HINT_RE = re.compile(
    r"\btoch\b[^.?!]*\?|\bneem (ik )?aan\b|\bga (ik )?ervan uit\b|\bveronderstel|\bdus\b[^?]*\?",
    re.IGNORECASE,
)
# A persona model sometimes writes the dialogue on ("Interviewer: …
# Projectleider: …") and so hands over its whole sheet unasked. Keep only its
# own turn.
_ROLE_LINE_RE = re.compile(r"^\s*(Interviewer|Projectleider)\s*:\s*", re.IGNORECASE | re.MULTILINE)
_SINGLE_CHOICE = {"pg", "besluit", "dataset"}
_EXCLUSIVE = {"geen", "intern"}
_side_backends: dict[str, OllamaBackend] = {}


def _side_backend(env: str):
    """The model playing the persona or the judge: the Ollama model named in
    `env`, else the main backend (always the main one on Azure)."""
    model = os.environ.get(env, "").strip()
    if not model or os.environ.get("AZURE_OPENAI_ENDPOINT"):
        return backend
    if model not in _side_backends:
        _side_backends[model] = OllamaBackend(
            host=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
            model=model,
            embedding_model=os.environ.get("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text"),
        )
    return _side_backends[model]


def _transcript_text(transcript: list[tuple[str, str]]) -> str:
    who = {"interviewer": "Interviewer", "invuller": "Projectleider"}
    return "\n".join(f"{who[rol]}: {tekst}" for rol, tekst in transcript)


def _interview_user_message(
    transcript: list[tuple[str, str]], accepted: dict[str, dict[str, str]], beurt: int
) -> str:
    """The whole conversation folded into one user message (§7.1: the server
    stays stateless, both backends keep their single-message signature)."""
    # The transcript goes first: it only grows, so the runtime can reuse the
    # prompt prefix from the previous turn; the status lines change every turn.
    lines = ["Gesprek tot nu toe:\n" + _transcript_text(transcript)] if transcript else ["Het gesprek begint nu."]
    if accepted:
        lines.append("\nVoorstellen tot nu toe:")
        for vraag, opties in accepted.items():
            lines += [f'- {vraag}: {optie} ("{citaat}")' for optie, citaat in opties.items()]
    still_open = [v for v in SCAN_OPTIONS if not accepted.get(v)]
    lines.append("\nNog zonder voorstel: " + (", ".join(still_open) or "geen"))
    if beurt > INTERVIEW_BUDGET:
        lines.append("Dit is je laatste beurt: doe je laatste voorstellen en zet <klaar/>.")
    else:
        lines.append(f"Beurt {beurt} van maximaal {INTERVIEW_BUDGET}.")
    return "\n".join(lines)


def _persona_turn(raw: str) -> tuple[str, bool]:
    """The persona's own answer, and whether it had written more turns."""
    text = _THINK_RE.sub("", raw).strip()
    lead = _ROLE_LINE_RE.match(text)
    if lead:
        text = text[lead.end():]
    extra = _ROLE_LINE_RE.search(text)
    return (text[:extra.start()] if extra else text).strip(), bool(extra)


def _norm_citaat(citaat: str) -> str:
    return citaat.strip().strip("\"“”'‘’").strip().rstrip(".!?,;").strip()


def _apply_voorstel(accepted: dict[str, dict[str, str]], vraag: str, optie: str, citaat: str) -> None:
    """Record a proposal the way the scan would hold the answer: a later
    single-choice answer replaces the earlier one, an exclusive option
    ("geen", "intern") clears the rest and vice versa."""
    current = accepted.setdefault(vraag, {})
    if vraag in _SINGLE_CHOICE or optie in _EXCLUSIVE:
        current.clear()
    else:
        for x in _EXCLUSIVE & current.keys():
            del current[x]
    current[optie] = citaat


def _kenmerken_from(accepted: dict[str, dict[str, str]]) -> dict[str, bool | str | None]:
    """Mirror of deriveKenmerken for the proposals; None = no proposal, so the
    scan question stays open (which the scan reads as onbekend)."""
    out: dict[str, bool | str | None] = {}
    for vraag, (kenmerk, sets) in SCAN_KENMERK.items():
        opties = set(accepted.get(vraag, {}))
        if not opties:
            out[kenmerk] = None
        elif opties == {"onbekend"}:
            out[kenmerk] = "onbekend"
        else:
            out[kenmerk] = bool(opties & sets)
    return out


_OORDEEL_RE = re.compile(
    r'<oordeel\s+nr=["\']?(\d+)["\']?\s*>\s*(\w+)\s*</oordeel>\s*(?:<reden>(.*?)</reden>)?',
    re.DOTALL | re.IGNORECASE,
)


async def _judge_sturing(transcript: list[tuple[str, str]]) -> dict[int, str]:
    """One judge call over the whole conversation: {question number: reason}
    for every question judged steering. A question without a readable verdict
    counts as steering — the target is zero, so doubt goes against the prompt."""
    numbered, n = [], 0
    for rol, tekst in transcript:
        if rol == "interviewer":
            n += 1
            numbered.append(f"Vraag {n}: {tekst}")
        else:
            numbered.append(f"Antwoord {n}: {tekst}")
    raw = _THINK_RE.sub("", await _side_backend("JUDGE_MODEL").chat(STURING_JUDGE_PROMPT, "\n".join(numbered)))
    verdicts = {int(nr): (oordeel.lower(), (reden or "").strip()) for nr, oordeel, reden in _OORDEEL_RE.findall(raw)}
    steering = {}
    for i in range(1, n + 1):
        oordeel, reden = verdicts.get(i, ("", ""))
        if oordeel != "open":
            steering[i] = reden or ("geen leesbaar oordeel" if not oordeel else oordeel)
    return steering


async def run_interview(case: dict) -> dict:
    """One automated start interview with a persona (§10). Scores, in order of
    weight: steering (target zero), convergence on the applicability kenmerken
    against the golden profile, and questions until the interviewer closes."""
    persona = _side_backend("PERSONA_MODEL")
    persona_system = PERSONA_SYSTEM_PROMPT.format(
        karakter=case["karakter"], beschrijving=case["beschrijving"]
    )
    transcript: list[tuple[str, str]] = []
    accepted: dict[str, dict[str, str]] = {}
    log: list[str] = []
    steering: list[str] = []
    hints: list[str] = []
    rejected: list[str] = []
    format_error, klaar, questions, unclosed, overrun = False, False, 0, 0, 0

    t0 = time.monotonic()
    for beurt in range(1, INTERVIEW_BUDGET + 2):
        raw = _THINK_RE.sub("", await backend.chat(
            INTERVIEW_SYSTEM_PROMPT, _interview_user_message(transcript, accepted, beurt)
        ))
        said = "\n".join(t for rol, t in transcript if rol == "invuller")
        for vraag_id, optie, citaat in _VOORSTEL_RE.findall(raw):
            vraag_id, optie, citaat = vraag_id.strip().lower(), optie.strip().lower(), _norm_citaat(citaat)
            if optie not in SCAN_OPTIONS.get(vraag_id, []):
                rejected.append(f"{vraag_id}={optie}: onbekende vraag of optie")
            elif not (citaat and said and main._grounded(citaat, said)):
                rejected.append(f'{vraag_id}={optie}: citaat niet letterlijk gezegd ("{citaat[:80]}")')
            else:
                _apply_voorstel(accepted, vraag_id, optie, citaat)
                log.append(f'      ↳ voorstel {vraag_id}={optie} ("{citaat}")')
        if _KLAAR_RE.search(raw):
            klaar = True
            break
        vraag = main._xml_tag(raw, "vraag")
        if not vraag:
            m = _VRAAG_OPEN_RE.search(raw)
            vraag = m.group(1).strip() if m else ""
            unclosed += bool(vraag)
        # A <waarvoor> nested inside <vraag> is not part of the question.
        vraag = vraag.split("<", 1)[0].strip()
        if not vraag:
            format_error = True
            log.append(f"      ↳ geen <vraag> en geen <klaar/>: {raw[:200]!r}")
            break
        if beurt > INTERVIEW_BUDGET:
            break  # asked for the closing turn and got another question
        questions += 1
        if _STURING_HINT_RE.search(vraag):
            hints.append(f"vraag {questions}: {vraag}")
        waarvoor = main._xml_tag(raw, "waarvoor")
        transcript.append(("interviewer", vraag))
        log.append(f"  I{questions} [{waarvoor}]: {vraag}")
        antwoord, cut = _persona_turn(await persona.chat(
            persona_system, _transcript_text(transcript) + "\n\nJouw antwoord:"
        ))
        overrun += cut
        transcript.append(("invuller", antwoord))
        log.append(f"  P{questions}: {antwoord}")
    if questions:
        questions_asked = [t for rol, t in transcript if rol == "interviewer"]
        for nr, reden in (await _judge_sturing(transcript)).items():
            steering.append(f"vraag {nr}: {questions_asked[nr - 1]} — {reden}")
    dt = time.monotonic() - t0

    notes, passed = [], []

    def add(ok: bool, note: str):
        passed.append(ok)
        notes.append(("PASS " if ok else "FAIL ") + note)

    add(not steering, f"geen sturing ({len(steering)} van {questions} vragen sturend)")
    notes += [f"INFO   sturend: {s}" for s in steering]
    notes += [f"INFO   nalezen (patroon): {h}" for h in hints]
    got = _kenmerken_from(accepted)
    for kenmerk, want in case["golden"].items():
        have = got[kenmerk]
        if want == "onbekend":
            ok = have in (None, "onbekend")
            label = "blijft onbekend" if ok else f"WEGGEPRAAT: onbekend → {have}"
        elif have == want:
            ok, label = True, f"juist ({want})"
        elif have is None or have == "onbekend":
            ok, label = False, f"gemist (verwacht {want}, kreeg {'geen voorstel' if have is None else 'onbekend'})"
        elif want is True:
            ok, label = False, "VALS-NEGATIEF (verwacht True, kreeg False)"
        else:
            ok, label = False, "vals-positief (verwacht False, kreeg True)"
        add(ok, f"{kenmerk}: {label}")
    add(not rejected, f"elk voorstel letterlijk geciteerd ({len(rejected)} afgewezen)")
    notes += [f"INFO   afgewezen: {r}" for r in rejected]
    add(not format_error, "XML-formaat gevolgd")
    if unclosed:
        notes.append(f"INFO   {unclosed} keer <vraag> zonder sluittag (wel gelezen)")
    if overrun:
        notes.append(f"INFO   persona schreef {overrun} keer zelf beurten bij (afgekapt)")
    asked = [re.sub(r"\W+", " ", t.lower()).strip() for rol, t in transcript if rol == "interviewer"]
    repeats = len(asked) - len(set(asked))
    notes.append(f"INFO   {repeats} van {len(asked)} vragen letterlijk herhaald")
    add(klaar, f"afgesloten met <klaar/> ({questions} vragen)" if klaar
        else f"niet afgesloten binnen {INTERVIEW_BUDGET} vragen")

    summary = ", ".join(f"{v}={'/'.join(o)}" for v, o in accepted.items() if o) or "geen voorstellen"
    return {
        "id": case["id"], "ok": all(passed), "time": dt, "notes": notes,
        "raw": "", "suggestion": f"{questions} vragen; {summary}", "final": f"{questions} vragen; {summary}",
        "transcript": log,
    }


def score(case: dict, raw: str, suggestion: str, final: str, rationale: str, dt: float) -> dict:
    notes, passed = [], []
    target = suggestion if suggestion else raw  # if XML parse failed, judge raw
    xml_ok = bool(suggestion) or "onvoldoende" in raw.lower()
    passed.append(xml_ok)
    notes.append(("PASS " if xml_ok else "FAIL ") + "XML-formaat gevolgd")
    for chk in case["checks"]:
        ok, note = chk(target)
        passed.append(ok)
        notes.append(("PASS " if ok else "FAIL ") + note)
    return {
        "id": case["id"], "ok": all(passed), "time": dt, "notes": notes,
        "raw": raw[:600], "suggestion": suggestion, "final": final,
    }


SUITES = {
    "extract": (EXTRACT_CASES, run_extract),
    "improve": (IMPROVE_CASES, run_improve),
    "synthesize": (SYNTH_CASES, run_synth),
    "smooth": (SMOOTH_CASES, run_smooth),
    "smoothform": (SMOOTH_FORM_CASES, run_smooth_form),
    "dedup": (DEDUP_CASES, run_dedup),
    "ontology": (ONTOLOGY_CASES, run_ontology),
    "interview": (INTERVIEW_CASES, run_interview),
}
# The interview spike holds ~40 model calls per persona: only on request.
DEFAULT_SUITES = [name for name in SUITES if name != "interview"]


async def amain() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("suites", nargs="*", default=[], help="subset of suites to run")
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    selected = args.suites or DEFAULT_SUITES

    total, ok_count = 0, 0
    for name in selected:
        cases, runner = SUITES[name]
        print(f"\n{'=' * 70}\nSUITE: {name}\n{'=' * 70}")
        for case in cases:
            for run_i in range(args.runs):
                r = await runner(case)
                total += 1
                ok_count += r["ok"]
                tag = "✅" if r["ok"] else "❌"
                run_tag = f" (run {run_i + 1})" if args.runs > 1 else ""
                print(f"\n{tag} {r['id']}{run_tag}  [{r['time']:.1f}s]")
                for n in r["notes"]:
                    if n.startswith(("FAIL", "INFO")) or args.verbose:
                        print(f"     {n}")
                if args.verbose and r.get("transcript"):
                    print("\n".join(r["transcript"]))
                shown = r["suggestion"] or r["raw"]
                print(f"     → {shown[:300]!r}")
                if r["final"] != r["suggestion"]:
                    print(f"     na safety net: {r['final'][:200]!r}")
    print(f"\n{'=' * 70}\nTOTAAL: {ok_count}/{total} cases geslaagd\n")


if __name__ == "__main__":
    sys.exit(asyncio.run(amain()))
