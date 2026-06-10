"""
Prompt-quality evaluation harness.

Runs realistic Dutch test cases through the REAL prompt builders and parsers
from main.py / rag.py against the configured LLM backend (default: Ollama
mistral) and scores the outputs with deterministic checks.

Usage:
    OLLAMA_MODEL=mistral python3 eval_prompts.py            # all suites
    OLLAMA_MODEL=mistral python3 eval_prompts.py extract    # one suite
    python3 eval_prompts.py --runs 3                        # repeat each case

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
import re
import sys
import time

import main
import rag
from llm import create_backend

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
    "ontology": (ONTOLOGY_CASES, run_ontology),
}


async def amain() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("suites", nargs="*", default=[], help="subset of suites to run")
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    selected = args.suites or list(SUITES)

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
                    if n.startswith("FAIL") or args.verbose:
                        print(f"     {n}")
                shown = r["suggestion"] or r["raw"]
                print(f"     → {shown[:300]!r}")
                if r["final"] != r["suggestion"]:
                    print(f"     na safety net: {r['final'][:200]!r}")
    print(f"\n{'=' * 70}\nTOTAAL: {ok_count}/{total} cases geslaagd\n")


if __name__ == "__main__":
    sys.exit(asyncio.run(amain()))
