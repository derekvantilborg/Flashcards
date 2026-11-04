"""Pick the most frequent French content words from Lexique 3.83.

Usage: python3 tools/select_candidates.py <Lexique383.tsv> <out.tsv> [N]

Output columns: rank, lemma, cgram, gender, number, fem, score
- gender: m / f / mf (both) for nouns, blank otherwise
- number: p if the noun only occurs in plural (e.g. "gens")
- fem: feminine singular form for adjectives (e.g. petit -> petite)
Frequencies: mix of film subtitles (spoken French) and books, weighted to spoken.
"""
import csv
import sys
from collections import defaultdict

KEEP = {"NOM", "VER", "AUX", "ADJ", "ADV"}
# Grammar-ish words better learned in context than on a flashcard.
STOP = {
    "ne", "pas", "y", "en", "plus", "si", "là", "-là", "ci", "-ci", "non", "oui",
    "alors", "ainsi", "comme", "o", "s", "ah", "eh", "oh", "hein", "euh",
}


def main(src, out, n):
    lemma_info = {}  # (lemma, cgram) -> score
    noun_genders = defaultdict(set)
    noun_numbers = defaultdict(set)
    adj_fem = {}  # lemma -> (freq, ortho)

    with open(src, encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            cg = row["cgram"]
            if cg not in KEEP:
                continue
            lem = row["lemme"]
            if len(lem) < 2 or lem in STOP:
                continue
            films = float(row["freqlemfilms2"] or 0)
            books = float(row["freqlemlivres"] or 0)
            score = 0.6 * films + 0.4 * books
            key = (lem, "VER" if cg == "AUX" else cg)
            lemma_info[key] = max(lemma_info.get(key, 0), score)

            if cg == "NOM":
                if row["genre"]:
                    noun_genders[lem].add(row["genre"])
                if row["nombre"]:
                    noun_numbers[lem].add(row["nombre"])
            elif cg == "ADJ" and row["genre"] == "f" and row["nombre"] == "s":
                fr = float(row["freqfilms2"] or 0) + float(row["freqlivres"] or 0)
                if lem not in adj_fem or fr > adj_fem[lem][0]:
                    adj_fem[lem] = (fr, row["ortho"])

    # One entry per lemma: keep its most frequent part of speech.
    best = {}
    for (lem, cg), score in lemma_info.items():
        if lem not in best or score > best[lem][1]:
            best[lem] = (cg, score)

    ranked = sorted(best.items(), key=lambda kv: -kv[1][1])[:n]
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["rank", "lemma", "cgram", "gender", "number", "fem", "score"])
        for i, (lem, (cg, score)) in enumerate(ranked, 1):
            gender = number = fem = ""
            if cg == "NOM":
                g = noun_genders.get(lem, set())
                gender = "mf" if g == {"m", "f"} else "".join(g)
                if noun_numbers.get(lem) == {"p"}:
                    number = "p"
            elif cg == "ADJ" and lem in adj_fem and adj_fem[lem][1] != lem:
                fem = adj_fem[lem][1]
            w.writerow([i, lem, cg, gender, number, fem, f"{score:.1f}"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1200)
