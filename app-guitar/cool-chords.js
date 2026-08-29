// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK_KEY_PC = new Set([1, 3, 6, 8, 10]);
const NUM_FRETS = 15;
const FRET_MARKERS = [3, 5, 7, 9, 12, 15];
const DOUBLE_MARKERS = [12];
const ROW_HEIGHT = 16;
const LABEL_WIDTH = 54;
const RULER_HEIGHT = 22;

const CHORD_TYPES = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  5: [0, 7],
};

// Coarse triad quality per chord type, used for roman-numeral casing.
const CHORD_QUALITY = {
  maj: "maj", min: "min", dim: "dim", aug: "aug",
  7: "maj", maj7: "maj", min7: "min", sus2: "sus", sus4: "sus", add9: "maj", 5: "power",
};

const TUNING_PRESETS = {
  "Standard E": [64, 59, 55, 50, 45, 40],
  "Drop D": [64, 59, 55, 50, 45, 38],
  "Half Step Down": [63, 58, 54, 49, 44, 39],
  "Open G": [62, 59, 55, 50, 43, 38],
  "Open D": [62, 57, 54, 50, 45, 38],
  DADGAD: [62, 57, 55, 50, 45, 38],
  "7-String Standard": [64, 59, 55, 50, 45, 40, 35],
  "Bass Standard (4)": [43, 38, 33, 28],
};

// Chromatic scale degree labels relative to a tonic, used for roman-numeral analysis.
const ROMAN_BASE = [
  { acc: "", num: "I" }, { acc: "b", num: "II" }, { acc: "", num: "II" }, { acc: "b", num: "III" },
  { acc: "", num: "III" }, { acc: "", num: "IV" }, { acc: "#", num: "IV" }, { acc: "", num: "V" },
  { acc: "b", num: "VI" }, { acc: "", num: "VI" }, { acc: "b", num: "VII" }, { acc: "", num: "VII" },
];
const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

const LIBRARY_KEY = "coolChords.library.v1";
const MIDI_TPQ = 480;
const MIDI_TEMPO_USPQ = 500000; // 120 BPM
const MIDI_CHORD_TICKS = MIDI_TPQ * 4; // one 4/4 bar per chord
const PIANOROLL_BAR_SECONDS = 2.0;

// ---------------------------------------------------------------------------
// DOM elements
// ---------------------------------------------------------------------------
const statusEl = document.getElementById("status");

const tuningPresetSelect = document.getElementById("tuningPreset");
const tuningStringsEl = document.getElementById("tuningStrings");
const addStringBtn = document.getElementById("addStringBtn");
const minFretInput = document.getElementById("minFret");
const maxFretInput = document.getElementById("maxFret");

const fretNumbersEl = document.getElementById("fretNumbers");
const fretboardEl = document.getElementById("fretboard");
const fretMarkersEl = document.getElementById("fretMarkers");

const chordNameEl = document.getElementById("chordName");
const detectedNotesEl = document.getElementById("detectedNotes");
const chordNameInput = document.getElementById("chordNameInput");
const playChordBtn = document.getElementById("playChordBtn");
const saveChordBtn = document.getElementById("saveChordBtn");
const clearChordBtn = document.getElementById("clearChordBtn");

const chordLibraryGridEl = document.getElementById("chordLibraryGrid");

const progressionStripEl = document.getElementById("progressionStrip");
const playProgressionBtn = document.getElementById("playProgressionBtn");
const analyzeProgressionBtn = document.getElementById("analyzeProgressionBtn");
const sendToPianoRollBtn = document.getElementById("sendToPianoRollBtn");
const downloadMidiBtn = document.getElementById("downloadMidiBtn");
const clearProgressionBtn = document.getElementById("clearProgressionBtn");
const analysisPanelEl = document.getElementById("analysisPanel");
const analysisKeyEl = document.getElementById("analysisKey");
const analysisRomansEl = document.getElementById("analysisRomans");

const pianorollSection = document.getElementById("pianorollSection");
const pianorollScroll = document.getElementById("pianorollScroll");
const pianorollContent = document.getElementById("pianorollContent");
const timeRulerEl = document.getElementById("timeRuler");
const pitchLabelsEl = document.getElementById("pitchLabels");
const pianorollGrid = document.getElementById("pianorollGrid");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomLabelEl = document.getElementById("zoomLabel");
const selectAllBtn = document.getElementById("selectAllBtn");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
const selectionInfoEl = document.getElementById("selectionInfo");
const playSelectionBtn = document.getElementById("playSelectionBtn");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentTuning = [...TUNING_PRESETS["Standard E"]];
let chordFrets = currentTuning.map(() => null); // per-string fret number, or null = muted
let noteDots = [];
let userEditedName = false;

let chordLibrary = loadLibrary();
let progression = [];
let lastAnalysis = null;

let midiNotes = [];
let noteEls = [];
let trackDuration = 0;
let minPitch = 60;
let maxPitch = 72;
let pxPerSecond = 100;
let selectedIndices = new Set();

let playCtx = null;

// ---------------------------------------------------------------------------
// Note name helpers
// ---------------------------------------------------------------------------
function midiToNoteName(midi, withOctave = true) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[pc] + (withOctave ? octave : "");
}

function parseNoteName(str) {
  const m = /^\s*([A-Ga-g])([#b]?)(-?\d+)\s*$/.exec(str || "");
  if (!m) return null;
  const letters = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = letters[m[1].toUpperCase()];
  if (m[2] === "#") pc += 1;
  if (m[2] === "b") pc -= 1;
  pc = ((pc % 12) + 12) % 12;
  const octave = parseInt(m[3], 10);
  return (octave + 1) * 12 + pc;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------------------------------------------------------------------------
// Chord identification
// ---------------------------------------------------------------------------
function identifyChord(pitchClasses) {
  if (!pitchClasses.length) return null;
  let bestMatch = null;
  let bestScore = 0;

  for (const root of pitchClasses) {
    const intervals = pitchClasses.map((n) => (n - root + 12) % 12).sort((a, b) => a - b);
    for (const [chordType, chordIntervals] of Object.entries(CHORD_TYPES)) {
      let matches = 0;
      for (const interval of intervals) {
        if (chordIntervals.includes(interval)) matches++;
      }
      const score = matches / Math.max(intervals.length, chordIntervals.length);
      if (score > bestScore && matches >= 2) {
        bestScore = score;
        bestMatch = { root, type: chordType };
      }
    }
  }

  return bestScore > 0.5 ? bestMatch : null;
}

function formatChordName(root, type) {
  const base = NOTE_NAMES[root];
  switch (type) {
    case "maj": return base;
    case "min": return base + "m";
    case "dim": return base + "dim";
    case "aug": return base + "aug";
    case "7": return base + "7";
    case "maj7": return base + "maj7";
    case "min7": return base + "m7";
    case "sus2": return base + "sus2";
    case "sus4": return base + "sus4";
    case "add9": return base + "add9";
    case "5": return base + "5";
    default: return base + type;
  }
}

function identifyChordFromPitchClasses(pitchClasses) {
  if (pitchClasses.length === 0) return "-";
  if (pitchClasses.length === 1) return NOTE_NAMES[pitchClasses[0]];
  const match = identifyChord(pitchClasses);
  if (match) return formatChordName(match.root, match.type);
  return pitchClasses.map((n) => NOTE_NAMES[n]).join("-");
}

// ---------------------------------------------------------------------------
// Key / roman-numeral analysis
// ---------------------------------------------------------------------------
function detectKey(chordInfos) {
  let best = null;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ["major", "minor"]) {
      const scale = mode === "major" ? MAJOR_SCALE_INTERVALS : MINOR_SCALE_INTERVALS;
      let score = 0;
      chordInfos.forEach((c) => {
        const rel = ((c.root - tonic) % 12 + 12) % 12;
        if (scale.includes(rel)) score += 1;
        if (rel === 0) score += 0.25;
      });
      if (!best || score > best.score) best = { tonic, mode, score };
    }
  }
  return best;
}

function romanNumeralFor(chordInfo, tonicPc) {
  const rel = ((chordInfo.root - tonicPc) % 12 + 12) % 12;
  const { acc, num } = ROMAN_BASE[rel];
  const quality = CHORD_QUALITY[chordInfo.type] || "maj";
  const isLower = quality === "min" || quality === "dim";
  const numeral = isLower ? num.toLowerCase() : num;

  let suffix = "";
  if (quality === "dim") suffix = "°";
  else if (quality === "aug") suffix = "+";
  else if (chordInfo.type === "7") suffix = "7";
  else if (chordInfo.type === "maj7") suffix = "maj7";
  else if (chordInfo.type === "min7") suffix = "7";
  else if (chordInfo.type === "sus2") suffix = "sus2";
  else if (chordInfo.type === "sus4") suffix = "sus4";
  else if (chordInfo.type === "add9") suffix = "add9";

  return acc + numeral + suffix;
}

// ---------------------------------------------------------------------------
// Fretboard
// ---------------------------------------------------------------------------
function buildFretboard(tuning) {
  fretNumbersEl.innerHTML = "";
  for (let f = 0; f <= NUM_FRETS; f++) {
    const num = document.createElement("div");
    num.className = "fret-number";
    num.textContent = f;
    fretNumbersEl.appendChild(num);
  }

  fretboardEl.innerHTML = "";
  noteDots = [];

  tuning.forEach((openMidi, s) => {
    const stringRow = document.createElement("div");
    stringRow.className = "string-row";

    const nameDiv = document.createElement("div");
    nameDiv.className = "string-name";
    nameDiv.textContent = midiToNoteName(openMidi, false);
    nameDiv.title = midiToNoteName(openMidi, true) + " (open)";
    stringRow.appendChild(nameDiv);

    const fretsContainer = document.createElement("div");
    fretsContainer.className = "frets";

    for (let f = 0; f <= NUM_FRETS; f++) {
      const fret = document.createElement("div");
      fret.className = "fret" + (f === 0 ? " open" : "");
      fret.dataset.fret = f;
      // The note-dot is scaled to 0 until active, so it has no real hit box for a
      // mouse click - the whole fret cell is the clickable target instead.
      fret.addEventListener("click", () => toggleChordFret(s, f));

      const dot = document.createElement("div");
      dot.className = "note-dot";
      dot.dataset.string = s;
      dot.dataset.fret = f;
      const midiNote = openMidi + f;
      dot.dataset.midiNote = midiNote;
      dot.textContent = NOTE_NAMES[((midiNote % 12) + 12) % 12];

      fret.appendChild(dot);
      fretsContainer.appendChild(fret);
      noteDots.push(dot);
    }

    stringRow.appendChild(fretsContainer);
    fretboardEl.appendChild(stringRow);
  });

  fretMarkersEl.innerHTML = '<div class="fret-marker-space"></div>';
  for (let f = 1; f <= NUM_FRETS; f++) {
    const space = document.createElement("div");
    space.className = "fret-marker-space";
    if (FRET_MARKERS.includes(f)) {
      const marker = document.createElement("div");
      marker.className = "fret-marker" + (DOUBLE_MARKERS.includes(f) ? " double" : "");
      space.appendChild(marker);
    }
    fretMarkersEl.appendChild(space);
  }

  applyFretRange();
}

function applyFretRange() {
  const minFret = parseInt(minFretInput.value, 10);
  const maxFret = parseInt(maxFretInput.value, 10);

  fretNumbersEl.querySelectorAll(".fret-number").forEach((el, i) => {
    el.classList.toggle("out-of-range", i < minFret || i > maxFret);
  });
  fretboardEl.querySelectorAll(".fret").forEach((fret) => {
    const fretNum = parseInt(fret.dataset.fret, 10);
    fret.classList.toggle("out-of-range", fretNum < minFret || fretNum > maxFret);
  });
}

function updateFretboardHighlight(notes) {
  noteDots.forEach((dot) => dot.classList.remove("active", "root", "chord-note", "same-note"));

  if (!notes.length) {
    updateChordInfoUI([], "-");
    return;
  }

  const midis = [...new Set(notes.map((n) => n.midi))].sort((a, b) => a - b);
  const rootMidi = midis[0];
  const pitchClassSet = new Set(midis.map((m) => ((m % 12) + 12) % 12));
  const exactSet = new Set(midis);

  noteDots.forEach((dot) => {
    const dotMidi = parseInt(dot.dataset.midiNote, 10);
    const pc = ((dotMidi % 12) + 12) % 12;
    if (exactSet.has(dotMidi)) {
      dot.classList.add("active", "chord-note");
      if (dotMidi === rootMidi) dot.classList.add("root");
    } else if (pitchClassSet.has(pc)) {
      dot.classList.add("active", "same-note");
    }
  });

  const chordName = identifyChordFromPitchClasses([...pitchClassSet]);
  updateChordInfoUI(midis, chordName);
}

function updateChordInfoUI(midis, chordName) {
  chordNameEl.textContent = chordName;

  if (!midis.length) {
    detectedNotesEl.innerHTML = '<span style="color: #666;">Click frets on the fretboard to build a chord&hellip;</span>';
    return;
  }

  detectedNotesEl.innerHTML = midis
    .map((m, i) => {
      const name = midiToNoteName(m, false);
      const octave = Math.floor(m / 12) - 1;
      return `<div class="note-badge${i === 0 ? " root" : ""}">${name}<span class="octave">${octave}</span></div>`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Chord builder (click-to-toggle frets)
// ---------------------------------------------------------------------------
function getChordNotesFromFrets() {
  const list = [];
  chordFrets.forEach((fret, s) => {
    if (fret === null || fret === undefined) return;
    list.push({ string: s, fret, midi: currentTuning[s] + fret });
  });
  return list;
}

function toggleChordFret(s, f) {
  chordFrets[s] = chordFrets[s] === f ? null : f;
  renderChordFromFrets();
}

function renderChordFromFrets() {
  const notesList = getChordNotesFromFrets();
  const midis = [...new Set(notesList.map((n) => n.midi))].sort((a, b) => a - b);
  updateFretboardHighlight(midis.map((m) => ({ midi: m })));

  const hasNotes = midis.length > 0;
  playChordBtn.disabled = !hasNotes;
  saveChordBtn.disabled = !hasNotes;

  if (!userEditedName) {
    chordNameInput.value = hasNotes ? chordNameEl.textContent : "";
  }
}

function clearChord() {
  chordFrets = currentTuning.map(() => null);
  userEditedName = false;
  chordNameInput.value = "";
  renderChordFromFrets();
  statusEl.textContent = "Click frets on the fretboard below to build a chord.";
}

// ---------------------------------------------------------------------------
// Chord library
// ---------------------------------------------------------------------------
function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function persistLibrary() {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(chordLibrary));
  } catch (err) {
    // storage unavailable (private mode, quota, etc.) - fail silently
  }
}

function saveCurrentChordToLibrary() {
  const notesList = getChordNotesFromFrets();
  if (!notesList.length) return;

  const midis = [...new Set(notesList.map((n) => n.midi))].sort((a, b) => a - b);
  const name = (chordNameInput.value || chordNameEl.textContent || "Chord").trim();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name,
    frets: [...chordFrets],
    tuning: [...currentTuning],
    notes: midis,
  };

  chordLibrary.push(entry);
  persistLibrary();
  renderLibrary();
  statusEl.textContent = `Saved "${name}" to library.`;
}

function deleteChordFromLibrary(id) {
  const entry = chordLibrary.find((c) => c.id === id);
  chordLibrary = chordLibrary.filter((c) => c.id !== id);
  persistLibrary();
  renderLibrary();
  if (entry) statusEl.textContent = `Deleted "${entry.name}" from library.`;
}

function loadChordToBuilder(entry) {
  chordFrets = currentTuning.map((_, i) => (i < entry.frets.length ? entry.frets[i] : null));
  userEditedName = true;
  chordNameInput.value = entry.name;
  renderChordFromFrets();
  statusEl.textContent = `Loaded "${entry.name}" shape onto the fretboard.`;
}

function addChordToProgression(entry) {
  progression.push({ name: entry.name, notes: [...entry.notes], frets: [...entry.frets], tuning: [...entry.tuning] });
  clearAnalysis();
  renderProgression();
  statusEl.textContent = `Added "${entry.name}" to the progression.`;
}

function renderLibrary() {
  if (!chordLibrary.length) {
    chordLibraryGridEl.innerHTML = '<div class="library-empty">No saved chords yet &mdash; build one above and click "Save to Library".</div>';
    return;
  }

  chordLibraryGridEl.innerHTML = chordLibrary
    .map((entry) => {
      const pattern = entry.tuning
        .map((_, i) => (entry.frets[i] === null || entry.frets[i] === undefined ? "x" : entry.frets[i]))
        .join("-");
      return `
        <div class="chord-card" data-id="${entry.id}">
          <div class="chord-card-name">${escapeHtml(entry.name)}</div>
          <div class="chord-card-pattern">${pattern}</div>
          <div class="chord-card-actions">
            <button type="button" class="chip-btn" data-action="add" data-id="${entry.id}">+ Add</button>
            <button type="button" class="chip-btn chord-card-delete" data-action="delete" data-id="${entry.id}">Delete</button>
          </div>
        </div>`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------
function clearAnalysis() {
  lastAnalysis = null;
  analysisPanelEl.style.display = "none";
}

function renderProgression() {
  const hasItems = progression.length > 0;
  playProgressionBtn.disabled = !hasItems;
  analyzeProgressionBtn.disabled = !hasItems;
  sendToPianoRollBtn.disabled = !hasItems;
  downloadMidiBtn.disabled = !hasItems;

  if (!hasItems) {
    progressionStripEl.innerHTML = '<div class="progression-empty">Add chords from your library to build a progression.</div>';
    return;
  }

  progressionStripEl.innerHTML = progression
    .map((chord, i) => {
      const roman = lastAnalysis ? lastAnalysis.romans[i] || "" : "";
      return `
        <div class="progression-chip" data-index="${i}">
          ${roman ? `<div class="chip-roman">${roman}</div>` : ""}
          <div class="chip-name">${escapeHtml(chord.name)}</div>
          <div class="chip-controls">
            <button type="button" data-action="up" data-index="${i}" ${i === 0 ? "disabled" : ""}>&uarr;</button>
            <button type="button" data-action="down" data-index="${i}" ${i === progression.length - 1 ? "disabled" : ""}>&darr;</button>
            <button type="button" data-action="remove" data-index="${i}">&times;</button>
          </div>
        </div>`;
    })
    .join("");
}

function runAnalysis() {
  if (!progression.length) return;

  const chordInfos = progression.map((chord) => {
    const pcs = [...new Set(chord.notes.map((m) => ((m % 12) + 12) % 12))];
    const match = identifyChord(pcs);
    return match ? { root: match.root, type: match.type } : { root: pcs[0], type: "maj" };
  });

  const key = detectKey(chordInfos);
  const romans = chordInfos.map((info) => romanNumeralFor(info, key.tonic));
  lastAnalysis = { key, romans };

  analysisKeyEl.textContent = `Key: ${NOTE_NAMES[key.tonic]} ${key.mode}`;
  analysisRomansEl.innerHTML = romans.map((r) => `<span class="roman-chip">${r}</span>`).join("");
  analysisPanelEl.style.display = "";
  renderProgression();
}

function sendProgressionToPianoRoll() {
  if (!progression.length) return;

  const notes = [];
  progression.forEach((chord, i) => {
    const start = i * PIANOROLL_BAR_SECONDS;
    const midis = [...new Set(chord.notes)];
    midis.forEach((m) => {
      notes.push({ midi: m, startSec: start, endSec: start + PIANOROLL_BAR_SECONDS - 0.1, velocity: 95, channel: 0, track: 0 });
    });
  });

  const duration = progression.length * PIANOROLL_BAR_SECONDS;
  loadNotes(notes, duration, `Sent ${progression.length} chord${progression.length === 1 ? "" : "s"} to the piano roll.`);
}

// ---------------------------------------------------------------------------
// MIDI file export
// ---------------------------------------------------------------------------
function writeVarLen(value) {
  const bytes = [value & 0x7f];
  value = Math.floor(value / 128);
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  return bytes;
}

function buildMidiBytes(chords) {
  const events = [{ tick: 0, bytes: [0xff, 0x51, 0x03, (MIDI_TEMPO_USPQ >> 16) & 0xff, (MIDI_TEMPO_USPQ >> 8) & 0xff, MIDI_TEMPO_USPQ & 0xff] }];

  let tick = 0;
  chords.forEach((chord) => {
    const midis = [...new Set(chord.notes)];
    midis.forEach((m) => events.push({ tick, bytes: [0x90, m & 0x7f, 90] }));
    tick += MIDI_CHORD_TICKS;
    midis.forEach((m) => events.push({ tick, bytes: [0x80, m & 0x7f, 0] }));
  });
  events.push({ tick, bytes: [0xff, 0x2f, 0x00] });

  const trackBytes = [];
  let lastTick = 0;
  events.forEach((ev) => {
    trackBytes.push(...writeVarLen(ev.tick - lastTick));
    trackBytes.push(...ev.bytes);
    lastTick = ev.tick;
  });

  const headerBytes = [
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6,
    0, 0, // format 0
    0, 1, // 1 track
    (MIDI_TPQ >> 8) & 0xff, MIDI_TPQ & 0xff,
  ];
  const trackLen = trackBytes.length;
  const trackHeader = [0x4d, 0x54, 0x72, 0x6b, (trackLen >>> 24) & 0xff, (trackLen >>> 16) & 0xff, (trackLen >>> 8) & 0xff, trackLen & 0xff];

  return new Uint8Array([...headerBytes, ...trackHeader, ...trackBytes]);
}

function downloadMidiFile() {
  if (!progression.length) return;
  const bytes = buildMidiBytes(progression);
  const blob = new Blob([bytes], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chord-progression.mid";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  statusEl.textContent = `Downloaded chord-progression.mid (${progression.length} chords, 1 bar each @ 120 BPM).`;
}

// ---------------------------------------------------------------------------
// Playback (Web Audio)
// ---------------------------------------------------------------------------
function scheduleChord(ctx, midis, when, stagger, dur) {
  midis.forEach((m, i) => {
    const freq = 440 * Math.pow(2, (m - 69) / 12);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const startAt = when + i * stagger;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(0.25, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, startAt + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.05);
  });
}

function ensurePlayCtx() {
  if (!playCtx) playCtx = new (window.AudioContext || window.webkitAudioContext)();
  return playCtx;
}

function playChordFromFrets() {
  const midis = [...new Set(getChordNotesFromFrets().map((n) => n.midi))].sort((a, b) => a - b);
  if (!midis.length) return;
  const ctx = ensurePlayCtx();
  scheduleChord(ctx, midis, ctx.currentTime, 0.02, 1.4);
}

function playSelectedPianoRollNotes() {
  const selected = [...selectedIndices].map((i) => midiNotes[i]);
  if (!selected.length) return;
  const midis = [...new Set(selected.map((n) => n.midi))].sort((a, b) => a - b);
  const ctx = ensurePlayCtx();
  scheduleChord(ctx, midis, ctx.currentTime, 0.02, 1.4);
}

function playProgression() {
  if (!progression.length) return;
  const ctx = ensurePlayCtx();
  const now = ctx.currentTime;
  const chordDur = 1.1;
  progression.forEach((chord, i) => {
    const midis = [...new Set(chord.notes)].sort((a, b) => a - b);
    scheduleChord(ctx, midis, now + i * chordDur, 0.015, chordDur * 0.95);
  });
}

// ---------------------------------------------------------------------------
// Piano roll (output preview)
// ---------------------------------------------------------------------------
function chooseTimeStep(pxPerSec) {
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const c of candidates) {
    if (c * pxPerSec >= 55) return c;
  }
  return 600;
}

function loadNotes(notes, duration, infoText) {
  midiNotes = notes;
  trackDuration = Math.max(1, duration);
  selectedIndices = new Set();

  const pitches = notes.map((n) => n.midi);
  minPitch = Math.max(0, Math.min(...pitches) - 2);
  maxPitch = Math.min(127, Math.max(...pitches) + 2);

  pianorollSection.style.display = "";
  buildPianoRollDOM();
  layoutPianoRoll();
  onSelectionChanged();

  if (infoText) statusEl.textContent = infoText;
  pianorollSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function buildPianoRollDOM() {
  pitchLabelsEl.innerHTML = "";
  pianorollGrid.innerHTML = "";

  for (let p = maxPitch, i = 0; p >= minPitch; p--, i++) {
    const pc = ((p % 12) + 12) % 12;
    const isBlack = BLACK_KEY_PC.has(pc);

    const label = document.createElement("div");
    label.className = "pitch-label" + (isBlack ? " black-key" : "");
    label.textContent = pc === 0 || !isBlack ? midiToNoteName(p) : "";
    pitchLabelsEl.appendChild(label);

    const stripe = document.createElement("div");
    stripe.className = "row-stripe" + (isBlack ? " black-key" : "");
    stripe.style.top = i * ROW_HEIGHT + "px";
    pianorollGrid.appendChild(stripe);
  }

  noteEls = midiNotes.map((note, index) => {
    const el = document.createElement("div");
    el.className = "note-block";
    el.dataset.index = index;
    const hue = (note.track * 67 + note.channel * 23) % 360;
    el.style.background = `hsl(${hue} 65% 55%)`;
    el.title = `${midiToNoteName(note.midi)} · ${note.startSec.toFixed(2)}s - ${note.endSec.toFixed(2)}s`;
    pianorollGrid.appendChild(el);
    return el;
  });
}

function layoutPianoRoll() {
  const rows = maxPitch - minPitch + 1;
  const rowsHeight = rows * ROW_HEIGHT;
  const gridWidth = Math.max(pianorollScroll.clientWidth - LABEL_WIDTH, trackDuration * pxPerSecond + 60);

  pianorollGrid.style.width = gridWidth + "px";
  pianorollGrid.style.height = rowsHeight + "px";
  pitchLabelsEl.style.height = rowsHeight + "px";
  timeRulerEl.style.width = gridWidth + "px";
  pianorollContent.style.width = LABEL_WIDTH + gridWidth + "px";
  pianorollContent.style.height = RULER_HEIGHT + rowsHeight + "px";

  noteEls.forEach((el, i) => {
    const n = midiNotes[i];
    const rowIndex = maxPitch - n.midi;
    el.style.left = n.startSec * pxPerSecond + "px";
    el.style.top = rowIndex * ROW_HEIGHT + 1 + "px";
    el.style.width = Math.max(3, (n.endSec - n.startSec) * pxPerSecond - 1) + "px";
    el.style.height = ROW_HEIGHT - 2 + "px";
  });

  renderTimeRuler(gridWidth);
  zoomLabelEl.textContent = Math.round(pxPerSecond) + " px/s";
}

function renderTimeRuler(gridWidth) {
  timeRulerEl.innerHTML = "";
  const step = chooseTimeStep(pxPerSecond);
  for (let t = 0; t * pxPerSecond <= gridWidth; t += step) {
    const x = t * pxPerSecond;
    const tick = document.createElement("div");
    tick.className = "ruler-tick";
    tick.style.left = x + "px";
    tick.style.width = step * pxPerSecond + "px";
    timeRulerEl.appendChild(tick);

    const label = document.createElement("div");
    label.className = "ruler-label";
    label.style.left = x + "px";
    label.textContent = t.toFixed(step < 1 ? 1 : 0) + "s";
    timeRulerEl.appendChild(label);
  }
}

function selectNotesInRect(left, right, top, bottom, shift) {
  const matched = new Set();
  midiNotes.forEach((n, i) => {
    const rowIndex = maxPitch - n.midi;
    const nLeft = n.startSec * pxPerSecond;
    const nRight = n.endSec * pxPerSecond;
    const nTop = rowIndex * ROW_HEIGHT;
    const nBottom = nTop + ROW_HEIGHT;
    const overlap = nLeft < right && nRight > left && nTop < bottom && nBottom > top;
    if (overlap) matched.add(i);
  });

  if (shift) {
    matched.forEach((i) => selectedIndices.add(i));
  } else {
    selectedIndices = matched;
  }
  applySelectionStyles();
  onSelectionChanged();
}

function toggleSingleNote(index, shift) {
  if (shift) {
    if (selectedIndices.has(index)) selectedIndices.delete(index);
    else selectedIndices.add(index);
  } else {
    selectedIndices = new Set([index]);
  }
  applySelectionStyles();
  onSelectionChanged();
}

function clearSelection() {
  selectedIndices = new Set();
  applySelectionStyles();
  onSelectionChanged();
}

function selectAllNotes() {
  selectedIndices = new Set(midiNotes.map((_, i) => i));
  applySelectionStyles();
  onSelectionChanged();
}

function applySelectionStyles() {
  noteEls.forEach((el, i) => el.classList.toggle("selected", selectedIndices.has(i)));
}

function onSelectionChanged() {
  updateSelectionInfo();
  playSelectionBtn.disabled = selectedIndices.size === 0;
}

function updateSelectionInfo() {
  if (selectedIndices.size === 0) {
    selectionInfoEl.textContent = midiNotes.length ? "No notes selected." : "No notes yet.";
    return;
  }
  const midis = [...new Set([...selectedIndices].map((i) => midiNotes[i].midi))].sort((a, b) => a - b);
  const names = midis.map((m) => midiToNoteName(m)).join(", ");
  selectionInfoEl.textContent = `${selectedIndices.size} note${selectedIndices.size === 1 ? "" : "s"} selected: ${names}`;
}

// Marquee drag handling, shared by the grid (2D) and the ruler (time-only).
function attachMarquee(el, { fullHeight }) {
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const noteEl = e.target.closest(".note-block");
    const rect = pianorollGrid.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = fullHeight ? 0 : e.clientY - rect.top;
    let moved = false;
    let box = null;

    const onMove = (ev) => {
      const x = ev.clientX - rect.left;
      const y = fullHeight ? rect.height : ev.clientY - rect.top;
      if (!moved && (Math.abs(x - startX) > 4 || Math.abs(y - startY) > 4)) {
        moved = true;
        box = document.createElement("div");
        box.className = "selection-box";
        pianorollGrid.appendChild(box);
      }
      if (moved) {
        const left = Math.min(x, startX);
        const top = fullHeight ? 0 : Math.min(y, startY);
        const w = Math.abs(x - startX);
        const h = fullHeight ? rect.height : Math.abs(y - startY);
        box.style.left = left + "px";
        box.style.top = top + "px";
        box.style.width = w + "px";
        box.style.height = h + "px";
      }
    };

    const onUp = (ev) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const shift = ev.shiftKey;

      if (moved) {
        const x = ev.clientX - rect.left;
        const y = fullHeight ? rect.height : ev.clientY - rect.top;
        const left = Math.min(x, startX);
        const right = Math.max(x, startX);
        const top = fullHeight ? 0 : Math.min(y, startY);
        const bottom = fullHeight ? rect.height : Math.max(y, startY);
        selectNotesInRect(left, right, top, bottom, shift);
        if (box) box.remove();
      } else if (noteEl) {
        toggleSingleNote(parseInt(noteEl.dataset.index, 10), shift);
      } else if (!shift) {
        clearSelection();
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

// ---------------------------------------------------------------------------
// Tuning UI
// ---------------------------------------------------------------------------
function renderTuningUI() {
  tuningStringsEl.innerHTML = "";

  currentTuning.forEach((midi, idx) => {
    const row = document.createElement("div");
    row.className = "tuning-string-row";

    const label = document.createElement("span");
    label.className = "tuning-string-index";
    label.textContent = `S${idx + 1}`;
    row.appendChild(label);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tuning-note-input";
    input.value = midiToNoteName(midi, true);
    input.addEventListener("change", () => {
      const parsed = parseNoteName(input.value);
      if (parsed === null || parsed < 0 || parsed > 127) {
        input.value = midiToNoteName(currentTuning[idx], true);
        return;
      }
      currentTuning[idx] = parsed;
      tuningPresetSelect.value = "Custom";
      onTuningChanged();
    });
    row.appendChild(input);

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "tuning-adjust-btn";
    upBtn.textContent = "▲";
    upBtn.addEventListener("click", () => {
      currentTuning[idx] = Math.min(127, currentTuning[idx] + 1);
      tuningPresetSelect.value = "Custom";
      renderTuningUI();
      onTuningChanged();
    });
    row.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "tuning-adjust-btn";
    downBtn.textContent = "▼";
    downBtn.addEventListener("click", () => {
      currentTuning[idx] = Math.max(0, currentTuning[idx] - 1);
      tuningPresetSelect.value = "Custom";
      renderTuningUI();
      onTuningChanged();
    });
    row.appendChild(downBtn);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "tuning-remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.disabled = currentTuning.length <= 1;
    removeBtn.addEventListener("click", () => {
      if (currentTuning.length <= 1) return;
      currentTuning.splice(idx, 1);
      chordFrets.splice(idx, 1);
      tuningPresetSelect.value = "Custom";
      renderTuningUI();
      onTuningChanged();
    });
    row.appendChild(removeBtn);

    tuningStringsEl.appendChild(row);
  });
}

function onTuningChanged() {
  if (chordFrets.length < currentTuning.length) {
    while (chordFrets.length < currentTuning.length) chordFrets.push(null);
  } else if (chordFrets.length > currentTuning.length) {
    chordFrets.length = currentTuning.length;
  }
  buildFretboard(currentTuning);
  renderChordFromFrets();
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------
tuningPresetSelect.addEventListener("change", () => {
  const val = tuningPresetSelect.value;
  if (val === "Custom" || !TUNING_PRESETS[val]) return;
  currentTuning = [...TUNING_PRESETS[val]];
  chordFrets = currentTuning.map(() => null);
  renderTuningUI();
  onTuningChanged();
});

addStringBtn.addEventListener("click", () => {
  const last = currentTuning[currentTuning.length - 1];
  currentTuning.push(Math.max(0, last - 5));
  chordFrets.push(null);
  tuningPresetSelect.value = "Custom";
  renderTuningUI();
  onTuningChanged();
});

minFretInput.addEventListener("change", applyFretRange);
maxFretInput.addEventListener("change", applyFretRange);

chordNameInput.addEventListener("input", () => {
  userEditedName = true;
});
playChordBtn.addEventListener("click", playChordFromFrets);
saveChordBtn.addEventListener("click", saveCurrentChordToLibrary);
clearChordBtn.addEventListener("click", clearChord);

chordLibraryGridEl.addEventListener("click", (e) => {
  const actionBtn = e.target.closest("[data-action]");
  if (actionBtn) {
    const entry = chordLibrary.find((c) => c.id === actionBtn.dataset.id);
    if (!entry) return;
    if (actionBtn.dataset.action === "add") addChordToProgression(entry);
    else if (actionBtn.dataset.action === "delete") deleteChordFromLibrary(actionBtn.dataset.id);
    return;
  }
  const card = e.target.closest(".chord-card");
  if (card) {
    const entry = chordLibrary.find((c) => c.id === card.dataset.id);
    if (entry) loadChordToBuilder(entry);
  }
});

progressionStripEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const idx = parseInt(btn.dataset.index, 10);
  const action = btn.dataset.action;
  if (action === "remove") {
    progression.splice(idx, 1);
  } else if (action === "up" && idx > 0) {
    [progression[idx - 1], progression[idx]] = [progression[idx], progression[idx - 1]];
  } else if (action === "down" && idx < progression.length - 1) {
    [progression[idx + 1], progression[idx]] = [progression[idx], progression[idx + 1]];
  }
  clearAnalysis();
  renderProgression();
});

playProgressionBtn.addEventListener("click", playProgression);
analyzeProgressionBtn.addEventListener("click", runAnalysis);
sendToPianoRollBtn.addEventListener("click", sendProgressionToPianoRoll);
downloadMidiBtn.addEventListener("click", downloadMidiFile);
clearProgressionBtn.addEventListener("click", () => {
  progression = [];
  clearAnalysis();
  renderProgression();
});

zoomInBtn.addEventListener("click", () => {
  pxPerSecond = Math.min(400, pxPerSecond * 1.25);
  layoutPianoRoll();
});
zoomOutBtn.addEventListener("click", () => {
  pxPerSecond = Math.max(10, pxPerSecond / 1.25);
  layoutPianoRoll();
});
selectAllBtn.addEventListener("click", selectAllNotes);
clearSelectionBtn.addEventListener("click", clearSelection);
playSelectionBtn.addEventListener("click", playSelectedPianoRollNotes);

attachMarquee(pianorollGrid, { fullHeight: false });
attachMarquee(timeRulerEl, { fullHeight: true });

window.addEventListener("resize", () => {
  if (midiNotes.length) layoutPianoRoll();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
renderTuningUI();
buildFretboard(currentTuning);
renderChordFromFrets();
renderLibrary();
renderProgression();
