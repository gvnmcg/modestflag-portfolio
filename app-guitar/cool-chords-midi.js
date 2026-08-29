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

// ---------------------------------------------------------------------------
// DOM elements
// ---------------------------------------------------------------------------
const midiFileInput = document.getElementById("midiFileInput");
const loadDemoBtn = document.getElementById("loadDemoBtn");
const statusEl = document.getElementById("status");

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
const playChordBtn = document.getElementById("playChordBtn");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let midiNotes = [];
let noteEls = [];
let trackDuration = 0;
let minPitch = 60;
let maxPitch = 72;
let pxPerSecond = 100;
let selectedIndices = new Set();
let currentTuning = [...TUNING_PRESETS["Standard E"]];
let noteDots = [];
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

// ---------------------------------------------------------------------------
// MIDI file parsing
// ---------------------------------------------------------------------------
const MidiParser = {
  parse(buffer) {
    const data = new Uint8Array(buffer);
    const cur = { pos: 0 };

    const readUint32 = () => {
      const v =
        ((data[cur.pos] << 24) |
          (data[cur.pos + 1] << 16) |
          (data[cur.pos + 2] << 8) |
          data[cur.pos + 3]) >>>
        0;
      cur.pos += 4;
      return v;
    };
    const readUint16 = () => {
      const v = (data[cur.pos] << 8) | data[cur.pos + 1];
      cur.pos += 2;
      return v;
    };
    const readString = (len) => {
      let s = "";
      for (let i = 0; i < len; i++) s += String.fromCharCode(data[cur.pos + i]);
      cur.pos += len;
      return s;
    };
    const readVarLen = () => {
      let value = 0;
      let byte;
      do {
        byte = data[cur.pos++];
        value = (value << 7) | (byte & 0x7f);
      } while (byte & 0x80);
      return value >>> 0;
    };

    const headerId = readString(4);
    if (headerId !== "MThd") throw new Error("Not a valid MIDI file (missing MThd header)");
    const headerLen = readUint32();
    const format = readUint16();
    const numTracks = readUint16();
    const division = readUint16();
    cur.pos += Math.max(0, headerLen - 6);

    if (division & 0x8000) {
      throw new Error("SMPTE time division is not supported");
    }
    const ticksPerQuarter = division;

    const tracks = [];
    for (let t = 0; t < numTracks && cur.pos < data.length; t++) {
      const chunkId = readString(4);
      const chunkLen = readUint32();
      const chunkEnd = cur.pos + chunkLen;
      if (chunkId !== "MTrk") {
        cur.pos = chunkEnd;
        continue;
      }

      const events = [];
      let absTick = 0;
      let runningStatus = 0;

      while (cur.pos < chunkEnd) {
        const delta = readVarLen();
        absTick += delta;
        let statusByte = data[cur.pos];

        if (statusByte & 0x80) {
          cur.pos++;
          runningStatus = statusByte;
        } else {
          statusByte = runningStatus;
        }

        if (statusByte === 0xff) {
          const metaType = data[cur.pos++];
          const len = readVarLen();
          const metaData = data.slice(cur.pos, cur.pos + len);
          cur.pos += len;
          events.push({ tick: absTick, type: "meta", metaType, data: metaData });
        } else if (statusByte === 0xf0 || statusByte === 0xf7) {
          const len = readVarLen();
          cur.pos += len;
        } else {
          const subtype = statusByte & 0xf0;
          const channel = statusByte & 0x0f;
          const data1 = data[cur.pos++];
          if (subtype === 0xc0 || subtype === 0xd0) {
            events.push({ tick: absTick, type: "channel", subtype, channel, data1, data2: 0 });
          } else {
            const data2 = data[cur.pos++];
            events.push({ tick: absTick, type: "channel", subtype, channel, data1, data2 });
          }
        }
      }
      cur.pos = chunkEnd;
      tracks.push(events);
    }

    return { format, ticksPerQuarter, tracks };
  },
};

function buildTempoMap(tracks) {
  const events = [];
  for (const track of tracks) {
    for (const ev of track) {
      if (ev.type === "meta" && ev.metaType === 0x51 && ev.data.length >= 3) {
        const usPerQuarter = (ev.data[0] << 16) | (ev.data[1] << 8) | ev.data[2];
        events.push({ tick: ev.tick, usPerQuarter });
      }
    }
  }
  events.sort((a, b) => a.tick - b.tick);
  if (events.length === 0 || events[0].tick > 0) {
    events.unshift({ tick: 0, usPerQuarter: 500000 });
  }
  return events;
}

function makeTickToSeconds(tempoEvents, ticksPerQuarter) {
  const segs = [];
  let accSec = 0;
  for (let i = 0; i < tempoEvents.length; i++) {
    const { tick, usPerQuarter } = tempoEvents[i];
    segs.push({ tick, accSec, usPerQuarter });
    if (i < tempoEvents.length - 1) {
      const deltaTicks = tempoEvents[i + 1].tick - tick;
      accSec += (deltaTicks / ticksPerQuarter) * (usPerQuarter / 1e6);
    }
  }
  return function tickToSeconds(tick) {
    let seg = segs[0];
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].tick <= tick) seg = segs[i];
      else break;
    }
    const deltaTicks = tick - seg.tick;
    return seg.accSec + (deltaTicks / ticksPerQuarter) * (seg.usPerQuarter / 1e6);
  };
}

function extractNotes(tracks, tickToSeconds) {
  const notes = [];
  tracks.forEach((track, trackIndex) => {
    const active = new Map();
    for (const ev of track) {
      if (ev.type !== "channel") continue;
      const key = ev.channel + "-" + ev.data1;

      if (ev.subtype === 0x90 && ev.data2 > 0) {
        active.set(key, { tick: ev.tick, velocity: ev.data2 });
      } else if (ev.subtype === 0x80 || (ev.subtype === 0x90 && ev.data2 === 0)) {
        const start = active.get(key);
        if (start) {
          active.delete(key);
          const startSec = tickToSeconds(start.tick);
          const endSec = tickToSeconds(ev.tick);
          if (endSec > startSec) {
            notes.push({
              midi: ev.data1,
              startSec,
              endSec,
              velocity: start.velocity,
              channel: ev.channel,
              track: trackIndex,
            });
          }
        }
      }
    }
  });
  notes.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi);
  return notes;
}

// ---------------------------------------------------------------------------
// Demo progression (no file needed)
// ---------------------------------------------------------------------------
function buildDemoNotes() {
  const chords = [
    { root: 55, notes: [55, 59, 62, 67] }, // G major
    { root: 48, notes: [48, 52, 55, 60] }, // C major
    { root: 50, notes: [50, 57, 62, 66] }, // D major
    { root: 52, notes: [52, 55, 59, 64] }, // E minor
  ];
  const notes = [];
  const barLength = 2.0;
  chords.forEach((chord, i) => {
    const start = i * barLength;
    chord.notes.forEach((midi, ni) => {
      notes.push({
        midi,
        startSec: start,
        endSec: start + barLength - 0.1,
        velocity: 90,
        channel: 0,
        track: 0,
      });
    });
    // simple melody note on top, twice per bar
    notes.push({ midi: chord.root + 24, startSec: start, endSec: start + barLength / 2 - 0.05, velocity: 100, channel: 1, track: 1 });
    notes.push({ midi: chord.root + 19, startSec: start + barLength / 2, endSec: start + barLength - 0.05, velocity: 100, channel: 1, track: 1 });
  });
  return notes;
}

// ---------------------------------------------------------------------------
// Piano roll
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
  updateFretboardHighlight([]);
  updateSelectionInfo();

  if (infoText) statusEl.textContent = infoText;
}

function buildPianoRollDOM() {
  const rows = maxPitch - minPitch + 1;

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

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------
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
  const selected = [...selectedIndices].map((i) => midiNotes[i]);
  updateFretboardHighlight(selected);
  updateSelectionInfo();
  playChordBtn.disabled = selected.length === 0;
}

function updateSelectionInfo() {
  if (selectedIndices.size === 0) {
    selectionInfoEl.textContent = "No notes selected.";
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

function identifyChordFromPitchClasses(pitchClasses) {
  if (pitchClasses.length === 0) return "-";
  if (pitchClasses.length === 1) return NOTE_NAMES[pitchClasses[0]];

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

  if (bestMatch && bestScore > 0.5) {
    const typeName = bestMatch.type === "maj" ? "" : bestMatch.type;
    return NOTE_NAMES[bestMatch.root] + typeName;
  }

  return pitchClasses.map((n) => NOTE_NAMES[n]).join("-");
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
    detectedNotesEl.innerHTML = '<span style="color: #666;">Select notes on the grid...</span>';
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
      tuningPresetSelect.value = "Custom";
      renderTuningUI();
      onTuningChanged();
    });
    row.appendChild(removeBtn);

    tuningStringsEl.appendChild(row);
  });
}

function onTuningChanged() {
  buildFretboard(currentTuning);
  const selected = [...selectedIndices].map((i) => midiNotes[i]);
  updateFretboardHighlight(selected);
}

// ---------------------------------------------------------------------------
// Playback (Web Audio)
// ---------------------------------------------------------------------------
function playSelectedChord() {
  const selected = [...selectedIndices].map((i) => midiNotes[i]);
  if (!selected.length) return;

  const midis = [...new Set(selected.map((n) => n.midi))].sort((a, b) => a - b);
  if (!playCtx) playCtx = new (window.AudioContext || window.webkitAudioContext)();
  const ctx = playCtx;
  const now = ctx.currentTime;

  midis.forEach((m, i) => {
    const freq = 440 * Math.pow(2, (m - 69) / 12);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const startAt = now + i * 0.02;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(0.25, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, startAt + 1.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + 1.5);
  });
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------
midiFileInput.addEventListener("change", async () => {
  const file = midiFileInput.files && midiFileInput.files[0];
  if (!file) return;

  statusEl.textContent = "Parsing MIDI file...";
  try {
    const buffer = await file.arrayBuffer();
    const parsed = MidiParser.parse(buffer);
    const tempoEvents = buildTempoMap(parsed.tracks);
    const tickToSeconds = makeTickToSeconds(tempoEvents, parsed.ticksPerQuarter);
    const notes = extractNotes(parsed.tracks, tickToSeconds);

    if (!notes.length) {
      statusEl.textContent = "No notes found in this MIDI file.";
      return;
    }

    const duration = Math.max(...notes.map((n) => n.endSec));
    const bpm = Math.round(60000000 / tempoEvents[0].usPerQuarter);
    const info = `Loaded "${file.name}" — ${parsed.tracks.length} tracks, ${notes.length} notes, ~${bpm} BPM, ${duration.toFixed(1)}s`;
    loadNotes(notes, duration, info);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error parsing MIDI file: " + err.message;
  }
});

loadDemoBtn.addEventListener("click", () => {
  const notes = buildDemoNotes();
  const duration = Math.max(...notes.map((n) => n.endSec));
  loadNotes(notes, duration, `Loaded demo progression — ${notes.length} notes, ${duration.toFixed(1)}s`);
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

attachMarquee(pianorollGrid, { fullHeight: false });
attachMarquee(timeRulerEl, { fullHeight: true });

tuningPresetSelect.addEventListener("change", () => {
  const val = tuningPresetSelect.value;
  if (val === "Custom" || !TUNING_PRESETS[val]) return;
  currentTuning = [...TUNING_PRESETS[val]];
  renderTuningUI();
  onTuningChanged();
});

addStringBtn.addEventListener("click", () => {
  const last = currentTuning[currentTuning.length - 1];
  currentTuning.push(Math.max(0, last - 5));
  tuningPresetSelect.value = "Custom";
  renderTuningUI();
  onTuningChanged();
});

minFretInput.addEventListener("change", applyFretRange);
maxFretInput.addEventListener("change", applyFretRange);

playChordBtn.addEventListener("click", playSelectedChord);

window.addEventListener("resize", () => {
  if (midiNotes.length) layoutPianoRoll();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
renderTuningUI();
buildFretboard(currentTuning);
