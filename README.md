# Mots: French vocab flashcards

A tiny web app for learning the ~1000 most useful French words (A1 → B1).
Meant to be added to the iPhone Home Screen from Safari.

- Front: English (big) and Dutch. Tap to flip and see the French.
- Swipe **right** if you knew it, **left** if you didn't (or use the ✓ / ✗ buttons, or ← / → keys).
- 🔊 reads the French word aloud using the phone's built-in French voice.
- Progress is stored on the device (localStorage). No account, no server.
- ⚙︎ settings: switch nouns, verbs, adjectives and "other" (adverbs, phrases, numbers) on or off, pick
  conjugation tenses (présent, passé composé, futur simple) and turn sound effects off.

## Conjugations

The 50 most common verbs (`data/verbs.txt`) get one card per tense and person, e.g. "you (informal) are /
jij bent" → *tu es*. A verb's conjugation cards only unlock once you've learned the verb itself. French
forms come from Lexique (`tools/conjugate.py` checks the ending of every form); the English and Dutch base
forms are in `data/verbs.txt`.

## How the spaced repetition works

Every word has a box from 1 to 7. Wrong → box 1 (it comes back in about a minute). Right → one box up,
and each box waits longer before the word comes back: 1 min, 10 min, 1 day, 3 days, 8 days, 21 days, 45 days.
A new word you already know goes straight to box 3. New words are only added while fewer than 10 words
are still being learned (boxes 1–2), and about 1 in 12 cards is a surprise review of a word you already know.

## Word list

`words.json` is built from `data/words_*.txt` (one word per line, in the order they are introduced):

```
lemma | English | Dutch | French display (optional)
```

To change words, edit those files and rebuild:

```bash
python3 tools/build_words.py path/to/Lexique383.tsv
```

The build checks every article/gender against Lexique and flags duplicates. `tools/select_candidates.py`
produced the frequency-ranked candidate list (`data/candidates.tsv`).

**Data source:** word frequencies, genders and feminine forms come from
[Lexique 3.83](http://www.lexique.org) (New, Pallier et al.), licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The word list in this repository is a derived
work and is shared under the same license. English and Dutch translations were written for this project.

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.
