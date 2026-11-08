"""Build words.json from the hand-written word files, checked against Lexique.

Usage: python3 tools/build_words.py <Lexique383.tsv> [N]   (N = max vocab words; default: all)

Reads data/candidates.tsv (from select_candidates.py) and data/words_*.txt.
- Nouns without an explicit display get their article from Lexique's gender.
- Adjectives without a display get "masc / fem" from Lexique.
- Every display starting with an article (le/la/un/une, or l'... (m)/(f)) is
  checked against Lexique's noun genders. Prefix a display with "!" to skip.
Exits non-zero on errors; prints warnings for likely-confusing duplicates.
"""
import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
VOWELS = "aeiouyàâäéèêëîïôöûüœ"
H_ASPIRE = {"honte", "hasard", "héros", "haut", "haine", "hall", "hibou", "huit", "hauteur", "hache"}
ARTICLE_RE = re.compile(r"^(le|la|les|un|une) |^l'")
MANUAL_ADJ = {"orange", "marron", "violet / violette"}


def word_type(cgram, lemma, fr):
    """noun / verb / adj / other, used by the app's settings toggles."""
    if ARTICLE_RE.match(fr):
        return "noun"
    if cgram == "VER":
        return "verb" if fr == lemma or fr.startswith(("se ", "s'")) or fr.startswith(lemma + " ") else "adj"
    if cgram == "ADJ" or fr in MANUAL_ADJ:
        return "adj"
    if " / " in fr and fr != "un / une":
        return "adj"
    return "other"


LIGATURES = {"oeil": "œil", "coeur": "cœur", "soeur": "sœur", "oeuvre": "œuvre", "oeuf": "œuf"}


def fix_lig(s):
    for a, b in LIGATURES.items():
        s = re.sub(rf"\b{a}\b", b, s)
    return s


def article(word, gender):
    w = word.lower()
    if (w[0] in VOWELS or (w[0] == "h" and w not in H_ASPIRE)):
        return f"l'{word} ({gender})"
    return f"{'le' if gender == 'm' else 'la'} {word}"


def say_text(fr):
    s = re.sub(r"\([^)]*\)", "", fr)
    s = s.replace(" / ", ", ").replace("?", "").replace("!", "")
    return re.sub(r"\s+", " ", s).strip(" ,")


def split_hint(text):
    """'urge (avoir envie de = to feel like)' -> ('urge', ['avoir envie de = to feel like']).
    Bracketed parts are hints: they would give the answer away on the front of the card."""
    hints = re.findall(r"\(([^)]*)\)", text)
    clean = re.sub(r"\s*\([^)]*\)", "", text)
    clean = re.sub(r"\s+([,;])", r"\1", clean)
    clean = re.sub(r"\s{2,}", " ", clean).strip(" ,;")
    return clean, hints


def _plain(s):
    return "".join(ch for ch in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(ch) != "Mn")


def drop_answer_glosses(text, answer):
    """'coffee, café' for le café -> ('coffee', ['café']): a translation that is just the French
    word gives the answer away, so it moves to the back (only if another translation remains)."""
    parts = re.split(r"(\s*[,;]\s*)", text)          # keep separators
    glosses, seps = parts[0::2], parts[1::2]
    keep = [i for i, g in enumerate(glosses) if _plain(g.strip()) != answer]
    if not keep or len(keep) == len(glosses):
        return text, []
    moved = [glosses[i].strip() for i in range(len(glosses)) if i not in keep]
    out = glosses[keep[0]]
    for i in keep[1:]:
        out += seps[i - 1] + glosses[i]
    return out.strip(), moved


def move_hints_to_back(card):
    en, en_h = split_hint(card["en"])
    nl, nl_h = split_hint(card["nl"])
    if card.get("type") != "conj":
        answer = _plain(re.sub(r"^(le|la|les|l')\s*|\s*\(.*?\)", "", card["fr"].split(" / ")[0]).strip())
        en, en_moved = drop_answer_glosses(en, answer)
        nl, nl_moved = drop_answer_glosses(nl, answer)
        also = list({_plain(g): g for g in reversed(en_moved + nl_moved)}.values())[::-1]  # éclair/eclair once
        if also:
            en_h.append("also: " + ", ".join(also))
    card["en"], card["nl"] = en, nl
    hint = "; ".join(en_h) or "; ".join(nl_h)
    if hint:
        card["hint"] = hint
    return card


def main(lexique, n):
    # Genders of every noun spelling in Lexique (to check manual displays too).
    genders = defaultdict(set)
    with open(lexique, encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            # Some singular rows have no gender (e.g. "maison"); the plural row
            # does, so also collect genders per lemma.
            if row["cgram"] == "NOM" and row["genre"]:
                genders[fix_lig(row["ortho"])].add(row["genre"])
                genders[fix_lig(row["lemme"])].add(row["genre"])

    cand = {}
    with open(DATA / "candidates.tsv", encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            cand[row["lemma"]] = row

    errors, warnings, words = [], [], []

    def check_gender(fr, where):
        for part in fr.split(" / "):
            m = re.match(r"^(le|la|un|une) ([^\s(]+)", part)
            if m:
                exp = "m" if m.group(1) in ("le", "un") else "f"
                word = m.group(2)
            else:
                m = re.match(r"^l'([^\s(]+) \((m|f)\)", part)
                if not m:
                    continue
                word, exp = m.group(1), m.group(2)
            if word not in genders:
                warnings.append(f"{where}: '{part}' gender not verifiable in Lexique")
            elif exp not in genders[word]:
                errors.append(f"{where}: '{part}' is {exp}, Lexique says {sorted(genders[word])}")

    for path in sorted(DATA.glob("words_*.txt")):
        for ln, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip() or line.startswith("#"):
                continue
            where = f"{path.name}:{ln}"
            parts = [p.strip() for p in line.split(" | ")]
            if len(parts) not in (3, 4) or not all(parts[:3]):
                errors.append(f"{where}: bad line: {line}")
                continue
            lemma, en, nl = parts[:3]
            disp = parts[3] if len(parts) == 4 else ""
            skip_check = disp.startswith("!")
            disp = disp.lstrip("!")

            if lemma == "+":
                if not disp:
                    errors.append(f"{where}: manual entry needs a display")
                    continue
                fr = disp
            else:
                c = cand.get(lemma)
                if not c:
                    errors.append(f"{where}: '{lemma}' not in candidates.tsv")
                    continue
                if disp:
                    fr = disp
                elif c["cgram"] == "NOM":
                    if c["number"] == "p":
                        fr = f"les {lemma}"
                    elif c["gender"] in ("m", "f"):
                        fr = article(fix_lig(lemma), c["gender"])
                    else:
                        errors.append(f"{where}: noun '{lemma}' gender '{c['gender']}' needs a display")
                        continue
                elif c["cgram"] == "ADJ" and c["fem"]:
                    fr = f"{lemma} / {c['fem']}"
                else:
                    fr = lemma
            fr = fix_lig(fr)
            if not skip_check:
                check_gender(fr, where)
            cg = cand[lemma]["cgram"] if lemma != "+" else ""
            words.append({"fr": fr, "en": en, "nl": nl, "say": say_text(fr), "_lemma": lemma,
                          "type": word_type(cg, lemma, fr), "_where": where})

    # Duplicates: same French is an error; same English or Dutch front is confusing.
    for key, level in (("fr", errors), ("en", warnings), ("nl", warnings)):
        seen = defaultdict(list)
        for w in words:
            seen[w[key].lower()].append(w["_where"])
        for k, locs in seen.items():
            if len(locs) > 1:
                level.append(f"duplicate {key} '{k}': {', '.join(locs)}")
    # Same front (en + nl both identical first meaning) would be indistinguishable.
    fronts = defaultdict(list)
    for w in words:
        fronts[(w["en"].split(",")[0].split("(")[0].strip().lower(),
                w["nl"].split(",")[0].split("(")[0].strip().lower())].append(f"{w['fr']} [{w['_where']}]")
    for k, v in fronts.items():
        if len(v) > 1:
            warnings.append(f"same front {k}: {'; '.join(v)}")

    # Conjugation cards; each verb must be in the first n vocab words (it unlocks them).
    sys.path.insert(0, str(ROOT / "tools"))
    import conjugate
    conj, conj_errors = conjugate.build(lexique, DATA / "verbs.txt")
    errors.extend(conj_errors)
    # A conjugation card unlocks from its verb's vocab card, whose text can differ
    # from the lemma ("asseoir" -> "s'asseoir"), so link them by display text.
    verb_card = {w["_lemma"]: w for w in words[:n] if w["_lemma"] != "+" and w["type"] == "verb"}
    for c in conj:
        lemma = c["verb"]
        if lemma not in verb_card:
            errors.append(f"verbs.txt: '{lemma}' is not one of the first {n} vocab verbs")
            continue
        c["verb"] = verb_card[lemma]["fr"]
        c["tag"] = c["tag"].replace(lemma, re.sub(r"\s*\(.*?\)", "", c["verb"]), 1)
        c["_lemma"] = lemma

    # Focus sets (data/sets.txt).
    by_fr = {w["fr"]: w for w in words[:n]}
    for line in (DATA / "sets.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        name, items = line.split(":", 1)
        for item in (x.strip() for x in items.split(",")):
            if name == "prep":
                if item not in by_fr:
                    errors.append(f"sets.txt: '{item}' is not a card")
                    continue
                by_fr[item].setdefault("sets", []).append(name)
                by_fr[item]["type"] = "other"
            else:
                if item not in verb_card:
                    errors.append(f"sets.txt: verb '{item}' has no vocab card")
                    continue
                verb_card[item].setdefault("sets", []).append(name)
                for c in conj:
                    if c.get("_lemma") == item:
                        c.setdefault("sets", []).append(name)
    for c in conj:
        c.pop("_lemma", None)

    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"{len(words)} words total, {len(errors)} errors, {len(warnings)} warnings")
    if errors:
        sys.exit(1)

    out = [{k: v for k, v in w.items() if k not in ("_where", "_lemma")} for w in words[:n]]
    types = defaultdict(int)
    for w in out:
        types[w["type"]] += 1
    cards = [move_hints_to_back(c) for c in out + conj]
    same = defaultdict(list)
    for c in cards:
        same[(c["en"].lower(), c["nl"].lower())].append(c["fr"])
    dupes = {k: v for k, v in same.items() if len(v) > 1}
    print(f"{len(dupes)} fronts shared by more than one card once hints are hidden")
    (ROOT / "data" / "same_fronts.txt").write_text(
        "\n".join(f"{en} / {nl}: {' | '.join(frs)}" for (en, nl), frs in sorted(dupes.items())) + "\n", encoding="utf-8")
    (ROOT / "words.json").write_text(json.dumps(cards, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"wrote words.json: {len(out)} words {dict(types)} ({len(words) - len(out)} in reserve) "
          f"+ {len(conj)} conjugation cards")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 99999)
