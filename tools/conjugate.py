"""Generate conjugation cards (présent, passé composé, futur simple) for data/verbs.txt.

French forms come from Lexique (infover codes like "ind:pre:1s", "ind:fut:3p",
"par:pas"). English and Dutch fronts are built from the base forms in verbs.txt.
Used by build_words.py.
"""
import csv
from collections import defaultdict
from pathlib import Path

VOWELS = "aeiouyàâéèêëîïôûœh"
PERSONS = ["1s", "2s", "3s", "1p", "2p", "3p"]
TENSES = {"pres": "présent", "pc": "passé composé", "fut": "futur simple"}
EN_PRON = {"1s": "I", "2s": "you (informal)", "3s": "he / she", "1p": "we", "2p": "you (plural / formal)", "3p": "they"}
NL_PRON = {"1s": "ik", "2s": "jij", "3s": "hij / zij", "1p": "wij", "2p": "jullie", "3p": "zij"}
NL_AUX = {
    "h": {"1s": "heb", "2s": "hebt", "3s": "heeft", "pl": "hebben"},
    "z": {"1s": "ben", "2s": "bent", "3s": "is", "pl": "zijn"},
}
NL_ZAL = {"1s": "zal", "2s": "zult", "3s": "zal", "pl": "zullen"}
# English verbs that don't follow "base / 3sg / past / will + base".
EN_SPECIAL = {
    "be": {"pres": {"1s": "am", "3s": "is", "*": "are"}, "pc": {"1s": "was", "3s": "was", "*": "were"}, "fut": "will be"},
    "can": {"fut": "will be able to"},
    "must": {"fut": "will have to"},
}


def _pl(p):
    return p if p in ("1s", "2s", "3s") else "pl"


# Lexique sometimes attaches a wrong code to a frequent spelling (e.g. "essayer"
# tagged as ind:pre:2p), so a form is only accepted if its ending fits.
ENDINGS = {
    "ind:pre:2s": ("s", "x"),
    "ind:pre:1p": ("ons", "sommes"),
    "ind:pre:2p": ("ez", "êtes", "faites", "dites"),
    "ind:pre:3p": ("ent", "ont"),
    "ind:fut:1s": ("ai",), "ind:fut:2s": ("as",), "ind:fut:3s": ("a",),
    "ind:fut:1p": ("ons",), "ind:fut:2p": ("ez",), "ind:fut:3p": ("ont",),
}


def load_forms(lexique, verbs):
    """verb -> {code: most frequent spelling with a plausible ending}."""
    best = defaultdict(dict)
    with open(lexique, encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            if row["cgram"] not in ("VER", "AUX") or row["lemme"] not in verbs:
                continue
            freq = float(row["freqfilms2"] or 0) + float(row["freqlivres"] or 0)
            for code in filter(None, row["infover"].split(";")):
                if code == "par:pas" and (row["genre"] not in ("m", "") or row["nombre"] not in ("s", "")):
                    continue
                if code in ENDINGS and not row["ortho"].endswith(ENDINGS[code]):
                    continue
                if code.startswith("ind:pre:") and row["ortho"] == row["lemme"] and row["lemme"] != "être":
                    continue  # an infinitive is never a present-tense form
                cur = best[row["lemme"]].get(code)
                if cur is None or freq > cur[0]:
                    best[row["lemme"]][code] = (freq, row["ortho"])
    return {v: {c: o for c, (_, o) in codes.items()} for v, codes in best.items()}


def load_verbs(path):
    verbs = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        p = [x.strip() for x in line.split("|")]
        keys = ["fr", "fr_aux", "en_base", "en_3sg", "en_past", "nl_inf", "nl_ik", "nl_jij", "nl_hij",
                "nl_pl", "nl_pp", "nl_aux", "nl_particle"]
        verbs.append(dict(zip(keys, p + [""] * (len(keys) - len(p)))))
    return verbs


def je(form):
    return f"j'{form}" if form[0].lower() in VOWELS else f"je {form}"


def fr_simple(form, p):
    """French for présent / futur: subject + form. Returns (display, spoken)."""
    if p == "1s":
        return je(form), je(form)
    if p == "3s":
        return f"il / elle {form}", f"il {form}, elle {form}"
    if p == "3p":
        return f"ils / elles {form}", f"ils {form}, elles {form}"
    subj = {"2s": "tu", "1p": "nous", "2p": "vous"}[p]
    return f"{subj} {form}", f"{subj} {form}"


def fr_pc(aux_form, pp, p, etre):
    """French passé composé. With être the participle agrees with the subject."""
    if not etre:
        disp, said = fr_simple(f"{aux_form} {pp}", p)
        return disp, said
    plural = "" if pp.endswith("s") else "s"
    disp = {
        "1s": f"je {aux_form} {pp}(e)",
        "2s": f"tu {aux_form} {pp}(e)",
        "3s": f"il {aux_form} {pp} / elle {aux_form} {pp}e",
        "1p": f"nous {aux_form} {pp}(e){plural}",
        "2p": f"vous {aux_form} {pp}(e)({plural})" if plural else f"vous {aux_form} {pp}(e)",
        "3p": f"ils {aux_form} {pp}{plural} / elles {aux_form} {pp}e{plural}",
    }[p]
    said = {
        "1s": f"je {aux_form} {pp}",
        "2s": f"tu {aux_form} {pp}",
        "3s": f"il {aux_form} {pp}, elle {aux_form} {pp}e",
        "1p": f"nous {aux_form} {pp}{plural}",
        "2p": f"vous {aux_form} {pp}",
        "3p": f"ils {aux_form} {pp}{plural}, elles {aux_form} {pp}e{plural}",
    }[p]
    return disp, said


def en_form(v, tense, p):
    sp = EN_SPECIAL.get(v["en_base"], {}).get(tense)
    if isinstance(sp, dict):
        return sp.get(p, sp["*"])
    if isinstance(sp, str):
        return sp
    if tense == "pres":
        return v["en_3sg"] if p == "3s" else v["en_base"]
    if tense == "pc":
        return v["en_past"]
    return f"will {v['en_base']}"


def nl_form(v, tense, p):
    if tense == "pres":
        f = {"1s": v["nl_ik"], "2s": v["nl_jij"], "3s": v["nl_hij"]}.get(p, v["nl_pl"])
        return f"{f} {v['nl_particle']}".strip()
    if tense == "pc":
        return f"{NL_AUX[v['nl_aux']][_pl(p)]} {v['nl_pp']}"
    return f"{NL_ZAL[_pl(p)]} {v['nl_inf']}"


def build(lexique, verbs_path):
    """Return (cards, errors). Cards are ordered tense first, then verb, then person."""
    verbs = load_verbs(verbs_path)
    forms = load_forms(lexique, {v["fr"] for v in verbs} | {"avoir", "être"})
    errors, cards = [], []
    for tense in TENSES:
        for v in verbs:
            f = forms.get(v["fr"], {})
            pp = f.get("par:pas")
            if v["fr_aux"] not in ("avoir", "être") or v["nl_aux"] not in NL_AUX:
                errors.append(f"{v['fr']}: bad auxiliary column")
                continue
            for p in PERSONS:
                if tense == "pc":
                    aux = forms[v["fr_aux"]].get(f"ind:pre:{p}")
                    if not (aux and pp):
                        errors.append(f"{v['fr']}: missing participle or auxiliary for {p}")
                        continue
                    fr, said = fr_pc(aux, pp, p, v["fr_aux"] == "être")
                else:
                    code = f"ind:{'pre' if tense == 'pres' else 'fut'}:{p}"
                    form = f.get(code)
                    if not form:
                        errors.append(f"{v['fr']}: no Lexique form for {code}")
                        continue
                    fr, said = fr_simple(form, p)
                cards.append({
                    "id": f"{v['fr']}|{tense}|{p}",
                    "fr": fr,
                    "en": f"{EN_PRON[p]} {en_form(v, tense, p)}",
                    "nl": f"{NL_PRON[p]} {nl_form(v, tense, p)}",
                    "say": said,
                    "type": "conj",
                    "verb": v["fr"],
                    "tense": tense,
                    "tag": f"{v['fr']} · {TENSES[tense]}",
                })
    return cards, errors
