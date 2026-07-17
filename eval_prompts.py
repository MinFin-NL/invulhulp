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
    "smooth": (SMOOTH_CASES, run_smooth),
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
