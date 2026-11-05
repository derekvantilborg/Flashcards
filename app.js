// Mots: French vocab flashcards with Leitner-style spaced repetition.
//
// Every word you have seen has a box (1-7) and a due time.
//   wrong          -> box 1 (comes back in about a minute)
//   right          -> one box up; higher boxes wait longer (minutes -> days -> weeks)
//   new + right    -> straight to box 3 (you already knew it)
// Next card: the most overdue word from the lowest box. New words only come in
// while fewer than POOL_SIZE words are still being learned (box 1-2). Now and
// then a word you already know shows up early, to keep it fresh.
//
// Settings choose which word types are shown. Conjugation cards (one per verb,
// tense and person) only unlock once the verb's own vocab card is learned.

const STORE_KEY = 'mots-progress-v1';
const SETTINGS_KEY = 'mots-settings-v1';
const DEFAULT_SETTINGS = { noun: true, verb: true, adj: true, other: true, pres: true, pc: false, fut: false, sound: true };
const MIN = 60e3, DAY = 864e5;
const INTERVALS = [0, 1 * MIN, 10 * MIN, 1 * DAY, 3 * DAY, 8 * DAY, 21 * DAY, 45 * DAY];
const MAX_BOX = INTERVALS.length - 1;
const LEARNED_BOX = 3;
const POOL_SIZE = 10;
const RECENT = 3;
const REVIEW_CHANCE = 0.08;

const $ = (id) => document.getElementById(id);
const card = $('card'), inner = $('inner');

let words = [];
let state = load();
let settings = loadSettings();
let current = null;
let recent = [];
let revealed = false;
let busy = false;

// ---------- storage ----------

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.p) return s;
  } catch (e) { /* ignore */ }
  return { p: {}, day: '', today: 0 };
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// ---------- scheduling ----------

// Vocab cards are keyed by their French text (so old progress keeps working);
// conjugation cards have an id like "être|pres|1s".
const key = (w) => w.id || w.fr;
const prog = (w) => state.p[key(w)];
const isLearned = (fr) => state.p[fr] && state.p[fr].b >= LEARNED_BOX;

// Is this card type switched on in settings? (ignores the verb-unlock rule)
function typeOn(w) {
  return w.type === 'conj' ? settings.verb && settings[w.tense] : settings[w.type] !== false;
}

const enabled = (w) => typeOn(w) && (w.type !== 'conj' || isLearned(w.verb));

function pick() {
  const now = Date.now();
  const pool = words.filter(enabled);
  if (!pool.length) return null;
  const seen = pool.filter(prog);
  const notRecent = (w) => !recent.includes(key(w));

  if (Math.random() < REVIEW_CHANCE) {
    const known = seen.filter((w) => prog(w).b >= LEARNED_BOX && notRecent(w));
    if (known.length) return { w: known[Math.floor(Math.random() * known.length)], mode: 'review' };
  }

  const due = seen.filter((w) => prog(w).d <= now && notRecent(w));
  if (due.length) {
    due.sort((a, b) => prog(a).b - prog(b).b || prog(a).d - prog(b).d);
    return { w: due[0], mode: 'due' };
  }

  const learning = seen.filter((w) => prog(w).b < LEARNED_BOX).length;
  // New cards alternate between vocab and (unlocked) conjugations.
  const freshVocab = pool.find((w) => w.type !== 'conj' && !prog(w));
  const freshConj = pool.find((w) => w.type === 'conj' && !prog(w));
  const fresh = freshConj && (!freshVocab || state.nextConj) ? freshConj : freshVocab;
  if (fresh && learning < POOL_SIZE) return { w: fresh, mode: 'new' };

  // Nothing due and the learning pool is full: practise whatever is due soonest.
  const ahead = seen.filter(notRecent).sort((a, b) => prog(a).d - prog(b).d);
  if (ahead.length) return { w: ahead[0], mode: 'ahead' };
  return fresh ? { w: fresh, mode: 'new' } : { w: seen[0], mode: 'ahead' };
}

function grade(correct) {
  const now = Date.now();
  const { w, mode } = current;
  const p = state.p[key(w)] || { b: 0, d: 0 };
  if (mode === 'new') state.nextConj = w.type !== 'conj';

  if (!correct) {
    p.b = 1;
  } else if (mode === 'new') {
    p.b = LEARNED_BOX;
  } else if (mode === 'review' && p.d > now) {
    // Early surprise review of a known word: keep its schedule.
  } else {
    p.b = Math.min(p.b + 1, MAX_BOX);
  }
  if (!(correct && mode === 'review' && p.d > now)) p.d = now + INTERVALS[p.b];

  state.p[key(w)] = p;
  if (state.day !== todayStr()) { state.day = todayStr(); state.today = 0; }
  state.today++;
  save();

  recent.push(key(w));
  if (recent.length > RECENT) recent.shift();
}

// ---------- rendering ----------

function render() {
  const active = words.filter(typeOn);
  const learned = active.filter((w) => prog(w) && prog(w).b >= LEARNED_BOX).length;
  $('learned').textContent = `${learned} / ${active.length} learned`;
  const today = state.day === todayStr() ? state.today : 0;
  $('today').textContent = `${today} today`;
}

// Bracketed hints like "(a fact)" or "(m)" are shown smaller than the word itself.
function setText(el, text, splitAlts = false) {
  el.replaceChildren();
  // "il est allé / elle est allée": put each multi-word alternative on its own line.
  const alts = text.split(' / ');
  if (splitAlts && alts.length === 2 && alts.every((a) => a.includes(' '))) {
    const first = document.createElement('div');
    const second = document.createElement('div');
    setText(first, alts[0]);
    setText(second, alts[1]);
    el.append(first, second);
    return;
  }
  for (const part of text.split(/(\([^)]*\))/)) {
    if (!part) continue;
    if (part.startsWith('(')) {
      const span = document.createElement('span');
      span.className = 'paren';
      span.textContent = part;
      el.append(span);
    } else {
      el.append(part);
    }
  }
}

const COLORS = 6;
let lastColor = -1;

// Each word gets its own colour; never the same colour twice in a row.
function colorFor(word) {
  let h = 0;
  for (const ch of word) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  let c = h % COLORS;
  if (c === lastColor) c = (c + 1) % COLORS;
  lastColor = c;
  return c;
}

function show(next) {
  current = next;
  revealed = false;
  document.body.classList.remove('revealed');
  document.body.classList.toggle('empty', !next);
  if (!next) {
    card.classList.remove('flipped', 'is-new');
    $('tag-front').textContent = '';
    setText($('en'), 'No cards to show');
    setText($('nl'), 'Turn on a word type in settings (⚙︎)');
    $('hint').textContent = '';
    render();
    return;
  }

  // Unflip instantly so the new card's answer never flashes.
  inner.classList.add('instant');
  card.classList.remove('flipped');
  card.style.transition = 'none';
  card.style.transform = '';
  setStamps(0);
  setText($('en'), next.w.en);
  setText($('nl'), next.w.nl);
  setText($('fr'), next.w.fr, true);
  $('tag-front').textContent = next.w.tag || '';
  $('tag-back').textContent = next.w.tag || '';
  card.classList.toggle('is-new', next.mode === 'new');
  for (let i = 0; i < COLORS; i++) card.classList.remove(`c${i}`);
  card.classList.add(`c${colorFor(key(next.w))}`);
  void card.offsetWidth;
  inner.classList.remove('instant');

  card.classList.remove('enter');
  void card.offsetWidth;
  card.classList.add('enter');

  $('hint').textContent = 'Tap to reveal';
  render();
}

function flip() {
  if (!current) return;
  revealed = !revealed;
  card.classList.toggle('flipped', revealed);
  document.body.classList.toggle('revealed', revealed);
  $('hint').textContent = revealed ? '← wrong   ·   right →' : 'Tap to reveal';
}

function setStamps(dx) {
  const t = Math.min(Math.abs(dx) / 100, 1);
  card.querySelector('.stamp.yes').style.opacity = dx > 0 ? t : 0;
  card.querySelector('.stamp.no').style.opacity = dx < 0 ? t : 0;
}

function flyOut(correct) {
  if (busy || !revealed) return;
  busy = true;
  const dir = correct ? 1 : -1;
  setStamps(dir * 100);
  card.classList.remove('enter');
  card.style.transition = 'transform .28s ease-in';
  card.style.transform = `translate(${dir * 130}vw, 40px) rotate(${dir * 24}deg)`;
  if (correct && settings.sound) chime();
  grade(correct);
  setTimeout(() => {
    busy = false;
    show(pick());
  }, 260);
}

// ---------- reward sound ----------

// A quick harp swirl up a C major chord, synthesised so there is no audio file.
// iOS only allows audio after a touch, so the context is created/resumed on
// the first touch (see pointerdown below).
let audio = null;

function audioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audio) audio = new AC();
  if (audio.state === 'suspended') audio.resume();
  return audio;
}

function chime() {
  const ac = audioCtx();
  if (!ac) return;
  const t = ac.currentTime;
  // C5 E5 G5 C6 E6 G6, 35 ms apart: plucked triangle tone with two soft overtones.
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
  notes.forEach((freq, i) => {
    const start = t + i * 0.035;
    for (const [mult, vol] of [[1, 0.09], [2, 0.027], [3, 0.009]]) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq * mult;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(vol, start + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.8);
      osc.connect(gain).connect(ac.destination);
      osc.start(start);
      osc.stop(start + 0.85);
    }
  });
}

// ---------- pronunciation ----------

let voice = null;

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const score = (v) =>
    (v.lang.toLowerCase().replace('_', '-') === 'fr-fr' ? 2 : 0) +
    (/premium|enhanced|amélioré/i.test(v.name) ? 3 : 0) +
    (v.localService ? 0.5 : 0);
  const fr = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('fr'));
  voice = fr.sort((a, b) => score(b) - score(a))[0] || null;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  if (voice) u.voice = voice;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

// ---------- input ----------

let start = null;
let dragging = false;

card.addEventListener('pointerdown', (e) => {
  if (busy || e.target.closest('.speak')) return;
  audioCtx(); // unlock audio during a real touch so the chime can play later
  start = { x: e.clientX, y: e.clientY, t: performance.now() };
  dragging = false;
  card.setPointerCapture(e.pointerId);
});

card.addEventListener('pointermove', (e) => {
  if (!start) return;
  const dx = e.clientX - start.x, dy = e.clientY - start.y;
  if (!dragging && Math.abs(dx) > 10) dragging = true;
  if (!dragging || !revealed) return;
  card.classList.remove('enter');
  card.style.transition = 'none';
  card.style.transform = `translate(${dx}px, ${dy * 0.2}px) rotate(${dx / 18}deg)`;
  setStamps(dx);
});

function endDrag(e, cancelled) {
  if (!start) return;
  const dx = e.clientX - start.x;
  const speed = Math.abs(dx) / (performance.now() - start.t);
  const wasDrag = dragging;
  start = null;
  dragging = false;

  if (!wasDrag) {
    if (!cancelled) flip();
    return;
  }
  if (revealed && !cancelled && (Math.abs(dx) > card.offsetWidth * 0.3 || (Math.abs(dx) > 40 && speed > 0.6))) {
    flyOut(dx > 0);
  } else {
    card.style.transition = 'transform .25s ease-out';
    card.style.transform = '';
    setStamps(0);
  }
}

card.addEventListener('pointerup', (e) => endDrag(e, false));
card.addEventListener('pointercancel', (e) => endDrag(e, true));

$('speak').addEventListener('pointerdown', (e) => e.stopPropagation());
$('speak').addEventListener('click', (e) => {
  e.stopPropagation();
  speak(current.w.say);
});
$('btn-yes').addEventListener('click', () => flyOut(true));
$('btn-no').addEventListener('click', () => flyOut(false));

document.addEventListener('keydown', (e) => {
  if (!current || sheetOpen()) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!busy) flip(); }
  else if (e.key === 'ArrowRight') flyOut(true);
  else if (e.key === 'ArrowLeft') flyOut(false);
  else if (e.key === 's' && revealed) speak(current.w.say);
});

// ---------- settings ----------

const sheet = $('sheet');
const sheetOpen = () => sheet.classList.contains('open');

function syncSettingsUI() {
  for (const box of sheet.querySelectorAll('input[data-key]')) box.checked = !!settings[box.dataset.key];
  $('tenses').classList.toggle('off', !settings.verb);
}

function openSettings() {
  syncSettingsUI();
  sheet.hidden = false;
  void sheet.offsetWidth;
  sheet.classList.add('open');
}

function closeSettings() {
  sheet.classList.remove('open');
  setTimeout(() => { sheet.hidden = true; }, 250);
  // If the current card is now switched off (or there was none), move on.
  if (!current || !enabled(current.w)) show(pick());
  else render();
}

sheet.addEventListener('change', (e) => {
  const k = e.target.dataset.key;
  if (!k) return;
  settings[k] = e.target.checked;
  saveSettings();
  syncSettingsUI();
  render();
});
$('gear').addEventListener('click', openSettings);
$('sheet-done').addEventListener('click', closeSettings);
sheet.querySelector('.sheet-backdrop').addEventListener('click', closeSettings);

// ---------- start ----------

fetch('words.json')
  .then((r) => r.json())
  .then((data) => {
    words = data;
    show(pick());
  });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
