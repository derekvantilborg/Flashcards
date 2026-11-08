# Mots: French vocab flashcards

A tiny web app for learning the ~3000 most useful French words (A1 → B1/B2).
Meant to be added to the iPhone Home Screen from Safari.

- Front: English (big) and Dutch. Tap to flip and see the French.
- Swipe **right** if you knew it, **left** if you didn't (or use the ✓ / ✗ buttons, or ← / → keys).
- The French is read aloud when you flip a card (switch off in settings); 🔊 replays it. Uses the phone's built-in French voice.
- Progress is stored on the device (localStorage). No account, no server.
- ⚙︎ Focus: study only the position & time words, the 25 core verbs or the top 100 verbs (`data/sets.txt`).
- ⚙︎ settings: switch nouns, verbs, adjectives and "other" (adverbs, phrases, numbers) on or off, pick
  conjugation tenses (présent, passé composé, futur simple) and turn sound effects off.

## Conjugations

The 100 most common verbs (`data/verbs.txt`) get one card per tense and person, e.g. "you (informal) are /
jij bent" → *tu es*. A verb's conjugation cards unlock once you know the verb, and new verbs wait until those are solid. French
forms come from Lexique (`tools/conjugate.py` checks the ending of every form); the English and Dutch base
forms are in `data/verbs.txt`.

## How the spaced repetition works

Every card has a level from 1 to 10, and each level waits longer before the card comes back:
1 min, 5 min, 10 min, 1 hour, 1 day, 3 days, 1 week, 16 days, 35 days, 75 days.

- Wrong when due → level 1. Right when due → one level up. Extra practice *before* a card is due changes nothing,
  right or wrong (except levels 1–2, which still move up).
- A new card you already know starts at level 4, so it still has to pass the 1-hour and 1-day checks.
- A card counts as **learned** from level 5.
- New cards only come in while fewer than 8 cards are below level 3, alternating between a *verb track*
  (verbs and their conjugations) and everything else.
- A verb's conjugations unlock once the verb reaches level 3, and **no new verb is introduced until every
  conjugation of the verbs you've started has reached level 4**, so the most common verbs are mastered first.
- About 1 in 12 cards is a surprise review of something you've already learned.

Progress from the first version (7 boxes) is converted automatically.

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
