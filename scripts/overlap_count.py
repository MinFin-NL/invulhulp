#!/usr/bin/env python3
"""
Hoeveel overtypen er in een dossier zit, en waar het zit.

Telt voor drie typische projecttypes hoeveel vragen er gelden en welk deel
daarvan voor te vullen is uit een eerder formulier (via crossFormMappings.json),
en zoekt de vragen die terugkomen in veel formulieren: de vragen naar
persoonsgegevens en de andere scankenmerken, en de voorbladvelden.

    python3 scripts/overlap_count.py            # de werkboom
    python3 scripts/overlap_count.py main       # een git-ref, voor een vóór/na

Het projecttype bepaalt welke formulieren gelden, met dezelfde regels als de
app (`applicability` in index.json, zie src/utils/toepassingsscan.ts): een
formulier zonder regel geldt altijd, een advisory-regel telt mee als
"mogelijk relevant". "Voor te vullen" betekent: de vraag is het doel van een
mapping (copy of synthesize) waarvan het bronformulier ook geldt en eerder in
de dossiervolgorde staat. Zie docs/werkplan-kompas.md §1.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FORMS = 'public/forms'


def read(ref: str | None, rel: str) -> str:
    if ref is None:
        return (ROOT / rel).read_text(encoding='utf-8')
    return subprocess.run(
        ['git', 'show', f'{ref}:{rel}'], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout


def load(ref: str | None):
    index = json.loads(read(ref, f'{FORMS}/index.json'))
    forms = [f for f in index['forms'] if not f.get('placeholder')]
    configs = {f['id']: json.loads(read(ref, f"{FORMS}/{f.get('file', f['id'] + '.json')}")) for f in forms}
    mappings = json.loads(read(ref, f'{FORMS}/crossFormMappings.json'))
    return forms, configs, mappings


def load_facts(ref: str | None) -> list[tuple[str, list[tuple[str, str]]]]:
    """The facts in src/facts/vocabulaire.ts as (kind, questions): read from the
    source, so a ref from before the fact layer simply has none."""
    try:
        src = read(ref, 'src/facts/vocabulaire.ts')
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []
    body = src[src.index('export const FEITEN'):]
    facts = []
    for chunk in body.split("soort: '")[1:]:
        kind = chunk.split("'", 1)[0]
        vragen = chunk.split('vragen:', 1)[1] if 'vragen:' in chunk else ''
        refs = re.findall(r"q\('([^']+)', '([^']+)'\)", vragen)
        facts.append((kind, refs))
    return facts


def questions(config: dict) -> list[dict]:
    return [q for s in config.get('sections', []) for ss in s.get('subsections', []) for q in ss.get('questions', [])]


# ---------------------------------------------------------------- projecttypes
KENMERKEN = ['persoonsgegevens', 'besluit_over_personen', 'algoritme_of_ai', 'ai_verordening_in_scope',
             'gebruikersinterface', 'eigen_dataset', 'raakt_burgers']


def kenmerken(**true: bool) -> dict[str, bool]:
    return {k: bool(true.get(k, False)) for k in KENMERKEN}


PROJECT_TYPES = [
    ('IT zonder persoonsgegevens/AI', kenmerken(gebruikersinterface=True)),
    ('IT met persoonsgegevens', kenmerken(gebruikersinterface=True, persoonsgegevens=True)),
    ('AI-systeem dat over burgers beslist', {k: True for k in KENMERKEN}),
]


def applies(form: dict, k: dict[str, bool]) -> bool:
    rule = form.get('applicability')
    if not rule:
        return True
    return all(any(k[x] for x in group) for group in rule['allOf'])


# ---------------------------------------------------------------- herhaalde vragen
# Startpunt, geen oordeel: een treffer kan een andere vraag over hetzelfde
# onderwerp zijn (bijv. "welke maatregelen voor persoonsgegevens"). Lees de lijst.
REPEATED = {
    'persoonsgegevens': re.compile(
        r'(worden|wordt|zijn) (er )?(\w+ )?persoonsgegevens|persoonsgegevens (worden|wordt)|welke (\w+ )?(\(bijzondere\) )?persoonsgegevens|'
        r'categorie(ën)? (van )?persoonsgegevens|verwerk(t|ing) (van )?persoonsgegevens',
        re.I),
    'algoritme_of_ai': re.compile(r'\b(ai|kunstmatige intelligentie|algoritme)\b.*\?|wordt er (een )?(ai|algoritme)', re.I),
    'cloud': re.compile(r'\bcloud', re.I),
    'gebruikersinterface': re.compile(r'gebruikersinterface|website|webapplicatie|mobiele app', re.I),
    'eigen_dataset': re.compile(r'\bdataset|databron|gegevensbron', re.I),
}

VOORBLAD = {
    'naam project': re.compile(r'naam (van (het|de) )?(project|systeem|ai-systeem|toepassing|initiatief|iv-verzoek)|projectnaam', re.I),
    'directie/afdeling': re.compile(r'\b(directie|afdeling|organisatieonderdeel)\b', re.I),
    'opdrachtgever': re.compile(r'opdrachtgever', re.I),
    'opsteller': re.compile(r'opsteller|ingevuld door|auteur', re.I),
    'contactpersoon': re.compile(r'contactpersoon', re.I),
}


def main(argv: list[str]) -> None:
    ref = argv[1] if len(argv) > 1 and argv[1] not in ('.', '') else None
    forms, configs, mappings = load(ref)
    facts = load_facts(ref)
    order = {f['id']: i for i, f in enumerate(forms)}
    qcount = {f['id']: len(questions(configs[f['id']])) for f in forms}

    print(f"Bron: {ref or 'werkboom'} — {len(forms)} formulieren, {sum(qcount.values())} vragen, "
          f"{len(mappings)} mappings, {len(facts)} feiten\n")

    # Projecttypes. Through a fact a question is fillable when the scan
    # establishes it (the scan comes before every form), or when the same fact
    # is asked in an earlier form that also applies.
    print(f"{'Projecttype':40} {'Formulieren':>11} {'Vragen':>7} {'Voor te vullen':>15} {'waarvan copy':>13} {'via feiten':>11}")
    for label, k in PROJECT_TYPES:
        active = [f['id'] for f in forms if applies(f, k)]
        aset = set(active)
        total = sum(qcount[f] for f in active)
        prefill_any, prefill_copy = set(), set()
        for m in mappings:
            t, s = m['targetFormId'], m['sourceFormId']
            if t in aset and s in aset and order[s] < order[t]:
                prefill_any.add((t, m['targetQuestionId']))
                if m.get('mode') == 'copy':
                    prefill_copy.add((t, m['targetQuestionId']))
        via_facts = set()
        for kind, refs in facts:
            for f, qid in refs:
                if f not in aset:
                    continue
                if kind == 'scan' or any(g in aset and order[g] < order[f] for g, _ in refs):
                    via_facts.add((f, qid))
        prefill_any |= via_facts
        prefill_copy |= via_facts
        pct = lambda n: f'{n} ({round(100 * n / total)}%)' if total else '0'
        print(f'{label:40} {len(active):>11} {total:>7} {pct(len(prefill_any)):>15} {pct(len(prefill_copy)):>13} {len(via_facts):>11}')

    targets = {(m['targetFormId'], m['targetQuestionId']) for m in mappings}
    qs = qcount.get('quickscan', 0)
    qs_pref = len({m['targetQuestionId'] for m in mappings
                   if m['targetFormId'] == 'quickscan' and order.get(m['sourceFormId'], 99) < order['quickscan']})
    qs_facts = len({qid for kind, refs in facts for f, qid in refs
                    if f == 'quickscan' and (kind == 'scan' or any(order[g] < order['quickscan'] for g, _ in refs))})
    print(f"\nQuickscan: {qs_pref + qs_facts} van {qs} vragen voor te vullen uit een eerder formulier of de scan")

    def report(title: str, patterns: dict[str, re.Pattern]):
        print(f'\n## {title}')
        for name, pat in patterns.items():
            hits = [(f['id'], q['id'], q.get('text', '')) for f in forms for q in questions(configs[f['id']])
                    if pat.search(q.get('text', ''))]
            mapped = sum(1 for f, q, _ in hits if (f, q) in targets)
            print(f"- {name}: {len(hits)} vragen in {len({f for f, _, _ in hits})} formulieren, {mapped} gemapt")
            for f, q, text in hits:
                mark = '·' if (f, q) in targets else ' '
                print(f"    {mark} {f:20} {q:28} {text[:90]}")

    report('Vragen die een scankenmerk herhalen (· = al doel van een mapping)', REPEATED)
    report('Voorbladvelden (· = al doel van een mapping)', VOORBLAD)


if __name__ == '__main__':
    main(sys.argv)
