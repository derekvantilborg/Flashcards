// Mots: French vocab flashcards with Leitner-style spaced repetition.
//
// Every word you have seen has a box (1-7) and a due time.
//   wrong          -> box 1 (comes back in about a minute)
//   right          -> one box up; higher boxes wait longer (minutes -> days -> weeks)
//   new + right    -> straight to box 3 (you already knew it)
// Next card: the most overdue word from the lowest box. New words only come in
// while fewer than POOL_SIZE words are still being learned (box 1-2). Now and
// then a word you already know shows up early, to keep it fresh.

const STORE_KEY = 'mots-progress-v1';
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

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// ---------- scheduling ----------

const prog = (w) => state.p[w.fr];

function pick() {
  const now = Date.now();
  const seen = words.filter(prog);
  const notRecent = (w) => !recent.includes(w.fr);

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
  const fresh = words.find((w) => !prog(w));
  if (fresh && learning < POOL_SIZE) return { w: fresh, mode: 'new' };

  // Nothing due and the learning pool is full: practise whatever is due soonest.
  const ahead = seen.filter(notRecent).sort((a, b) => prog(a).d - prog(b).d);
  if (ahead.length) return { w: ahead[0], mode: 'ahead' };
  return fresh ? { w: fresh, mode: 'new' } : { w: seen[0], mode: 'ahead' };
}

function grade(correct) {
  const now = Date.now();
  const { w, mode } = current;
  const p = state.p[w.fr] || { b: 0, d: 0 };

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

  state.p[w.fr] = p;
  if (state.day !== todayStr()) { state.day = todayStr(); state.today = 0; }
  state.today++;
  save();

  recent.push(w.fr);
  if (recent.length > RECENT) recent.shift();
}

// ---------- rendering ----------

function render() {
  const learned = Object.values(state.p).filter((p) => p.b >= LEARNED_BOX).length;
  $('learned').textContent = `${learned} / ${words.length} learned`;
  const today = state.day === todayStr() ? state.today : 0;
  $('today').textContent = `${today} today`;
}

// Bracketed hints like "(a fact)" or "(m)" are shown smaller than the word itself.
function setText(el, text) {
  el.replaceChildren();
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

  // Unflip instantly so the new card's answer never flashes.
  inner.classList.add('instant');
  card.classList.remove('flipped');
  card.style.transition = 'none';
  card.style.transform = '';
  setStamps(0);
  setText($('en'), next.w.en);
  setText($('nl'), next.w.nl);
  setText($('fr'), next.w.fr);
  card.classList.toggle('is-new', next.mode === 'new');
  for (let i = 0; i < COLORS; i++) card.classList.remove(`c${i}`);
  card.classList.add(`c${colorFor(next.w.fr)}`);
  void card.offsetWidth;
  inner.classList.remove('instant');

  card.classList.remove('enter');
  void card.offsetWidth;
  card.classList.add('enter');

  $('hint').textContent = 'Tap to reveal';
  render();
}

function flip() {
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
  grade(correct);
  setTimeout(() => {
    busy = false;
    show(pick());
  }, 260);
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
  if (!current) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!busy) flip(); }
  else if (e.key === 'ArrowRight') flyOut(true);
  else if (e.key === 'ArrowLeft') flyOut(false);
  else if (e.key === 's' && revealed) speak(current.w.say);
});

// ---------- start ----------

fetch('words.json')
  .then((r) => r.json())
  .then((data) => {
    words = data;
    show(pick());
  });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
