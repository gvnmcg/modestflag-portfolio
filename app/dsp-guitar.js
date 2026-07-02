// Constants
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
// Strings ordered from high E (top) to low E (bottom) - as you look down at guitar
const STRING_MIDI_NOTES = [64, 59, 55, 50, 45, 40]; // high e, B, G, D, A, low E
const STRING_NAMES = ["e", "B", "G", "D", "A", "E"]; // lowercase e for high E
const NUM_FRETS = 15;
const FRET_MARKERS = [3, 5, 7, 9, 12, 15];
const DOUBLE_MARKERS = [12];

// Chord definitions (intervals from root)
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

// DOM Elements
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const audioFileInput = document.getElementById("audioFileInput");
const processUploadBtn = document.getElementById("processUploadBtn");
const statusEl = document.getElementById("status");
const chordNameEl = document.getElementById("chordName");
const detectedNotesEl = document.getElementById("detectedNotes");
const spectrumCanvas = document.getElementById("spectrumCanvas");
const spectrumCtx = spectrumCanvas.getContext("2d");
const midiDataBody = document.getElementById("midiDataBody");
const uploadStatusEl = document.getElementById("uploadStatus");
const playFramesBtn = document.getElementById("playFramesBtn");
const pauseFramesBtn = document.getElementById("pauseFramesBtn");
const playbackTimeLabel = document.getElementById("playbackTimeLabel");
const fretboard = document.getElementById("fretboard");
const fretNumbersEl = document.getElementById("fretNumbers");
const fretMarkersEl = document.getElementById("fretMarkers");
const stringBtns = document.querySelectorAll(".string-btn");

// Settings
const minFretInput = document.getElementById("minFret");
const maxFretInput = document.getElementById("maxFret");
const sensitivityInput = document.getElementById("sensitivity");
const sensitivityValue = document.getElementById("sensitivityValue");
const stabilityInput = document.getElementById("stability");
const stabilityValue = document.getElementById("stabilityValue");
const detectionModeSelect = document.getElementById("detectionMode");
const fadeTimeInput = document.getElementById("fadeTime");
const fadeTimeValue = document.getElementById("fadeTimeValue");
const sparseStepInput = document.getElementById("sparseStep");
const clearBtn = document.getElementById("clearBtn");
const stringToggles = document.querySelectorAll(".string-toggle");

// Audio variables
let audioContext;
let analyser;
let microphone;
let animationId;
let frequencyData;
let currentSampleRate = 44100;
let uploadedFile = null;
let uploadedFrameData = [];
let selectedUploadedFrameIndex = -1;
let uploadedTrackDurationSec = 0;
let uploadPlaybackTimer = null;
let isPlayingUploadFrames = false;

// Detection state
let noteDots = [];
let noteHistory = []; // For stability
const HISTORY_SIZE = 10;
let lastDetectedNotes = [];
let lastChordName = "-";

// Note persistence state
let persistedNotes = new Map(); // Map of "string-fret" -> { timestamp, midi, isRoot }
let enabledStrings = new Set([0, 1, 2, 3, 4, 5]); // All strings enabled by default

// Settings event listeners
sensitivityInput.addEventListener("input", () => {
  sensitivityValue.textContent = sensitivityInput.value;
});

stabilityInput.addEventListener("input", () => {
  stabilityValue.textContent = stabilityInput.value;
});

fadeTimeInput.addEventListener("input", () => {
  const val = fadeTimeInput.value;
  fadeTimeValue.textContent = val === "0" ? "Off" : val + "s";
});

clearBtn.addEventListener("click", () => {
  persistedNotes.clear();
  updateFretboardDisplay();
});

// String toggle listeners
stringToggles.forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const stringNum = parseInt(toggle.dataset.string);
    toggle.classList.toggle("active");

    if (toggle.classList.contains("active")) {
      enabledStrings.add(stringNum);
    } else {
      enabledStrings.delete(stringNum);
    }

    updateStringVisibility();
    updateFretboardDisplay();
  });
});

function updateStringVisibility() {
  const stringRows = fretboard.querySelectorAll(".string-row");
  stringRows.forEach((row, index) => {
    if (enabledStrings.has(index)) {
      row.classList.remove("disabled");
    } else {
      row.classList.add("disabled");
    }
  });
}

minFretInput.addEventListener("change", updateFretboardRange);
maxFretInput.addEventListener("change", updateFretboardRange);

function updateFretboardRange() {
  const minFret = parseInt(minFretInput.value);
  const maxFret = parseInt(maxFretInput.value);

  // Update fret number styling
  const fretNums = fretNumbersEl.querySelectorAll(".fret-number");
  fretNums.forEach((el, i) => {
    if (i < minFret || i > maxFret) {
      el.classList.add("out-of-range");
    } else {
      el.classList.remove("out-of-range");
    }
  });

  // Update fret styling
  const frets = fretboard.querySelectorAll(".fret");
  frets.forEach((fret) => {
    const fretNum = parseInt(fret.dataset.fret);
    if (fretNum < minFret || fretNum > maxFret) {
      fret.classList.add("out-of-range");
    } else {
      fret.classList.remove("out-of-range");
    }
  });
}

// Build fretboard
function buildFretboard() {
  fretNumbersEl.innerHTML = "";
  for (let f = 0; f <= NUM_FRETS; f++) {
    const num = document.createElement("div");
    num.className = "fret-number";
    num.textContent = f;
    fretNumbersEl.appendChild(num);
  }

  fretboard.innerHTML = "";
  noteDots = [];

  for (let s = 0; s < 6; s++) {
    const stringRow = document.createElement("div");
    stringRow.className = "string-row";

    const stringName = document.createElement("div");
    stringName.className = "string-name";
    stringName.textContent = STRING_NAMES[s];
    stringRow.appendChild(stringName);

    const fretsContainer = document.createElement("div");
    fretsContainer.className = "frets";

    for (let f = 0; f <= NUM_FRETS; f++) {
      const fret = document.createElement("div");
      fret.className = "fret" + (f === 0 ? " open" : "");
      fret.dataset.fret = f;

      const noteDot = document.createElement("div");
      noteDot.className = "note-dot";
      noteDot.dataset.string = s;
      noteDot.dataset.fret = f;

      const midiNote = STRING_MIDI_NOTES[s] + f;
      const noteIndex = midiNote % 12;
      noteDot.textContent = NOTE_NAMES[noteIndex];
      noteDot.dataset.midiNote = midiNote;

      fret.appendChild(noteDot);
      fretsContainer.appendChild(fret);

      noteDots.push(noteDot);
    }

    stringRow.appendChild(fretsContainer);
    fretboard.appendChild(stringRow);
  }

  // Fret markers
  fretMarkersEl.innerHTML = '<div class="fret-marker-space"></div>';
  for (let f = 1; f <= NUM_FRETS; f++) {
    const space = document.createElement("div");
    space.className = "fret-marker-space";

    if (FRET_MARKERS.includes(f)) {
      const marker = document.createElement("div");
      marker.className =
        "fret-marker" + (DOUBLE_MARKERS.includes(f) ? " double" : "");
      space.appendChild(marker);
    }

    fretMarkersEl.appendChild(space);
  }

  updateFretboardRange();
}

// Convert frequency to MIDI note
function frequencyToMidi(freq) {
  return Math.round(12 * Math.log2(freq / 440) + 69);
}

// Convert MIDI to note info
function midiToNote(midi) {
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return {
    name: NOTE_NAMES[noteIndex],
    octave: octave,
    midi: midi,
    noteClass: noteIndex,
  };
}

// Harmonic Product Spectrum - finds true fundamental by cancelling harmonics
function computeHPS(frequencyData, sampleRate, numHarmonics = 4) {
  const binSize = sampleRate / (frequencyData.length * 2);
  const hpsLength = Math.floor(frequencyData.length / numHarmonics);
  const hps = new Float32Array(hpsLength);

  // Initialize with original spectrum
  for (let i = 0; i < hpsLength; i++) {
    hps[i] = frequencyData[i] || 0;
  }

  // Multiply with downsampled versions
  for (let h = 2; h <= numHarmonics; h++) {
    for (let i = 0; i < hpsLength; i++) {
      const harmonicBin = i * h;
      if (harmonicBin < frequencyData.length) {
        hps[i] *= frequencyData[harmonicBin] / 255 + 0.1; // Add small value to avoid zeros
      }
    }
  }

  return { hps, binSize };
}

// Find all peaks in a spectrum
function findAllPeaks(data, minMagnitude, minBin, maxBin) {
  const peaks = [];

  for (
    let i = Math.max(minBin, 2);
    i < Math.min(maxBin, data.length - 2);
    i++
  ) {
    const mag = data[i];
    if (mag < minMagnitude) continue;

    if (
      mag > data[i - 1] &&
      mag > data[i + 1] &&
      mag > data[i - 2] &&
      mag > data[i + 2]
    ) {
      peaks.push({ bin: i, mag: mag });
    }
  }

  return peaks;
}

// Check if freq2 is a harmonic of freq1
function isHarmonic(freq1, freq2, tolerance = 0.04) {
  if (freq2 <= freq1) return false;
  const ratio = freq2 / freq1;
  const nearestHarmonic = Math.round(ratio);
  return (
    nearestHarmonic >= 2 &&
    nearestHarmonic <= 8 &&
    Math.abs(ratio - nearestHarmonic) < tolerance
  );
}

// Group peaks into harmonic series and find fundamentals
function findFundamentals(peaks, frequencyData, binSize, sampleRate) {
  const fundamentals = [];
  const used = new Set();

  // Sort peaks by frequency (lowest first)
  const sortedPeaks = [...peaks].sort((a, b) => a.bin - b.bin);

  for (const peak of sortedPeaks) {
    if (used.has(peak.bin)) continue;

    const freq = peak.bin * binSize;
    if (freq < 70 || freq > 500) continue; // Focus on fundamental range

    // Count how many harmonics this peak has
    let harmonicScore = peak.mag;
    let harmonicCount = 1;
    const harmonics = [peak];

    for (const otherPeak of sortedPeaks) {
      if (otherPeak.bin === peak.bin) continue;

      const otherFreq = otherPeak.bin * binSize;
      if (isHarmonic(freq, otherFreq)) {
        harmonicScore += otherPeak.mag * 0.5; // Harmonics contribute less
        harmonicCount++;
        harmonics.push(otherPeak);
        used.add(otherPeak.bin);
      }
    }

    // A real note should have at least some harmonics
    if (harmonicCount >= 1) {
      // Calculate spectral centroid for this harmonic series
      let centroidNum = 0,
        centroidDen = 0;
      for (const h of harmonics) {
        centroidNum += h.bin * h.mag;
        centroidDen += h.mag;
      }
      const centroid =
        centroidDen > 0 ? (centroidNum / centroidDen) * binSize : freq;

      fundamentals.push({
        freq: freq,
        mag: peak.mag,
        score: harmonicScore,
        harmonicCount: harmonicCount,
        centroid: centroid,
        midi: frequencyToMidi(freq),
      });

      used.add(peak.bin);
    }
  }

  return fundamentals;
}

// Detect peaks in frequency spectrum with improved octave detection
function detectPeaks(frequencyData, sampleRate) {
  const sensitivity = 11 - parseInt(sensitivityInput.value);
  const minMagnitude = sensitivity * 12;
  const binSize = sampleRate / (frequencyData.length * 2);

  // Method 1: Standard peak detection
  const minBin = Math.floor(70 / binSize);
  const maxBin = Math.floor(1500 / binSize);
  const rawPeaks = findAllPeaks(frequencyData, minMagnitude, minBin, maxBin);

  // Method 2: Harmonic Product Spectrum for fundamental detection
  const { hps, binSize: hpsBinSize } = computeHPS(frequencyData, sampleRate, 4);
  const hpsMinBin = Math.floor(70 / hpsBinSize);
  const hpsMaxBin = Math.floor(500 / hpsBinSize);
  const hpsPeaks = findAllPeaks(hps, minMagnitude * 0.5, hpsMinBin, hpsMaxBin);

  // Find fundamentals using harmonic grouping
  const fundamentals = findFundamentals(
    rawPeaks,
    frequencyData,
    binSize,
    sampleRate,
  );

  // Also consider HPS peaks
  for (const hpsPeak of hpsPeaks) {
    const hpsFreq = hpsPeak.bin * hpsBinSize;

    // Check if we already have this fundamental
    let isDuplicate = false;
    for (const f of fundamentals) {
      const semitonesDiff = Math.abs(12 * Math.log2(hpsFreq / f.freq));
      if (semitonesDiff < 0.5) {
        // Within half a semitone
        // Boost score of existing fundamental
        f.score += hpsPeak.mag;
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate && hpsFreq >= 70 && hpsFreq <= 500) {
      fundamentals.push({
        freq: hpsFreq,
        mag: hpsPeak.mag,
        score: hpsPeak.mag,
        harmonicCount: 1,
        centroid: hpsFreq,
        midi: frequencyToMidi(hpsFreq),
        fromHPS: true,
      });
    }
  }

  // Sort by score and filter
  fundamentals.sort((a, b) => b.score - a.score);

  // Remove duplicates (same note class in same octave)
  const uniqueNotes = [];
  const seenMidi = new Set();

  for (const f of fundamentals) {
    if (!seenMidi.has(f.midi)) {
      seenMidi.add(f.midi);
      uniqueNotes.push(f);
    }
  }

  const mode = detectionModeSelect.value;
  const maxPeaks = mode === "single" ? 1 : 6;

  // Store detected fundamentals for visualization
  lastDetectedFundamentals = uniqueNotes.slice(0, maxPeaks);

  return lastDetectedFundamentals;
}

// Store for visualization
let lastDetectedFundamentals = [];

function resetDetectionState() {
  noteHistory = [];
  lastDetectedNotes = [];
  lastDetectedFundamentals = [];
  lastChordName = "-";
  persistedNotes.clear();
  selectedUploadedFrameIndex = -1;
}

function formatTimeLabel(seconds) {
  return `${(seconds || 0).toFixed(3)}s`;
}

function updatePlaybackTimeLabel(currentTimeSec = 0) {
  playbackTimeLabel.textContent = `${formatTimeLabel(currentTimeSec)} / ${formatTimeLabel(uploadedTrackDurationSec)}`;
}

function updatePlaybackButtons() {
  const hasFrames = uploadedFrameData.length > 0;
  playFramesBtn.disabled = !hasFrames || isPlayingUploadFrames;
  pauseFramesBtn.disabled = !isPlayingUploadFrames;
}

function stopUploadFramePlayback() {
  if (uploadPlaybackTimer) {
    clearTimeout(uploadPlaybackTimer);
    uploadPlaybackTimer = null;
  }
  isPlayingUploadFrames = false;
  updatePlaybackButtons();
}

function processDetectionFrame(peaks) {
  const stableNotes = stabilizeNotes(peaks);
  const currentMidis = stableNotes
    .map((n) => n.midi)
    .sort()
    .join(",");
  const lastMidis = lastDetectedNotes
    .map((n) => n.midi)
    .sort()
    .join(",");

  if (currentMidis !== lastMidis) {
    lastDetectedNotes = stableNotes;
    updateNotesDisplay(stableNotes);
    updateFretboard(stableNotes);

    const chordName = identifyChord(stableNotes);
    if (chordName !== lastChordName) {
      lastChordName = chordName;
      chordNameEl.textContent = chordName;
    }
  }

  updateFretboardDisplay();
  drawSpectrum();
}

function nextPowerOfTwo(value) {
  let power = 1;
  while (power < value) power <<= 1;
  return power;
}

function computeSparseFFT(channelData, sampleStart, fftSize) {
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const twoPi = Math.PI * 2;

  for (let i = 0; i < fftSize; i++) {
    const sample = channelData[sampleStart + i] || 0;
    const window = 0.5 * (1 - Math.cos((twoPi * i) / (fftSize - 1))); // Hann window
    re[i] = sample * window;
    im[i] = 0;
  }

  let j = 0;
  for (let i = 1; i < fftSize; i++) {
    let bit = fftSize >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= fftSize; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-twoPi) / len;
    const wLenCos = Math.cos(angle);
    const wLenSin = Math.sin(angle);

    for (let i = 0; i < fftSize; i += len) {
      let wCos = 1;
      let wSin = 0;
      for (let k = 0; k < halfLen; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + halfLen] * wCos - im[i + k + halfLen] * wSin;
        const vIm = re[i + k + halfLen] * wSin + im[i + k + halfLen] * wCos;

        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + halfLen] = uRe - vRe;
        im[i + k + halfLen] = uIm - vIm;

        const nextCos = wCos * wLenCos - wSin * wLenSin;
        const nextSin = wCos * wLenSin + wSin * wLenCos;
        wCos = nextCos;
        wSin = nextSin;
      }
    }
  }

  const half = fftSize / 2;
  const magnitudes = new Uint8Array(half);
  let maxMag = 1e-9;
  const rawMag = new Float32Array(half);

  for (let i = 0; i < half; i++) {
    const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    rawMag[i] = mag;
    if (mag > maxMag) maxMag = mag;
  }

  for (let i = 0; i < half; i++) {
    const normalized = rawMag[i] / maxMag;
    magnitudes[i] = Math.min(255, Math.round(Math.sqrt(normalized) * 255));
  }

  return magnitudes;
}

function formatMidiRow(frameTimeSec, notes, chord) {
  if (notes.length === 0) {
    return {
      time: frameTimeSec.toFixed(3),
      midi: "-",
      noteNames: "-",
      chord,
    };
  }

  const midiValues = notes.map((n) => n.midi).join(", ");
  const noteNames = notes
    .map((n) => {
      const note = midiToNote(n.midi);
      return `${note.name}${note.octave}`;
    })
    .join(", ");

  return {
    time: frameTimeSec.toFixed(3),
    midi: midiValues,
    noteNames,
    chord,
  };
}

function renderMidiDataRows(rows) {
  if (!rows.length) {
    midiDataBody.innerHTML =
      '<tr><td colspan="4" class="empty-midi-row">No notes detected in upload.</td></tr>';
    return;
  }

  midiDataBody.innerHTML = rows
    .map(
      (row, index) =>
        `<tr data-row-index="${index}" class="${index === selectedUploadedFrameIndex ? "active-row" : ""}"><td>${row.time}</td><td>${row.midi}</td><td>${row.noteNames}</td><td>${row.chord}</td></tr>`,
    )
    .join("");
}

function showUploadedFrame(index, options = {}) {
  const { autoScroll = false } = options;
  if (index < 0 || index >= uploadedFrameData.length) return;

  const frame = uploadedFrameData[index];
  selectedUploadedFrameIndex = index;
  frequencyData = Uint8Array.from(frame.spectrum);
  lastDetectedFundamentals = frame.fundamentals.map((f) => ({ ...f }));
  lastDetectedNotes = frame.notes.map((n) => ({ ...n }));
  lastChordName = frame.chord;
  chordNameEl.textContent = frame.chord;
  updateNotesDisplay(lastDetectedNotes);

  persistedNotes.clear();
  updateFretboard(lastDetectedNotes);
  updateFretboardDisplay();
  drawSpectrum();
  renderMidiDataRows(
    uploadedFrameData.map((f) => formatMidiRow(f.timeSec, f.notes, f.chord)),
  );

  uploadStatusEl.textContent = `Showing frame ${index + 1}/${uploadedFrameData.length} at ${frame.timeSec.toFixed(3)}s`;
  updatePlaybackTimeLabel(frame.timeSec);

  const rowEl = midiDataBody.querySelector(`tr[data-row-index="${index}"]`);
  if (rowEl && autoScroll) {
    rowEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function scheduleNextPlaybackFrame() {
  if (!isPlayingUploadFrames) return;

  const currentIndex = selectedUploadedFrameIndex;
  const nextIndex = currentIndex + 1;
  if (nextIndex >= uploadedFrameData.length) {
    stopUploadFramePlayback();
    if (uploadedFrameData.length > 0) {
      updatePlaybackTimeLabel(uploadedTrackDurationSec);
      uploadStatusEl.textContent = "Playback finished.";
    }
    return;
  }

  const currentTime = uploadedFrameData[currentIndex].timeSec;
  const nextTime = uploadedFrameData[nextIndex].timeSec;
  const waitMs = Math.max(1, Math.round((nextTime - currentTime) * 1000));

  uploadPlaybackTimer = setTimeout(() => {
    showUploadedFrame(nextIndex, { autoScroll: false });
    scheduleNextPlaybackFrame();
  }, waitMs);
}

function startUploadFramePlayback() {
  if (!uploadedFrameData.length) return;
  stopUploadFramePlayback();

  if (
    selectedUploadedFrameIndex < 0 ||
    selectedUploadedFrameIndex >= uploadedFrameData.length - 1
  ) {
    showUploadedFrame(0);
  }

  isPlayingUploadFrames = true;
  updatePlaybackButtons();
  uploadStatusEl.textContent = "Playing uploaded timeline...";
  scheduleNextPlaybackFrame();
}

async function processUploadedAudioFile(file) {
  const sparseStep = Math.max(1, parseInt(sparseStepInput.value) || 8);
  uploadStatusEl.textContent = "Decoding audio file...";

  const decodeContext = new (window.AudioContext || window.webkitAudioContext)();
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await decodeContext.decodeAudioData(arrayBuffer);
  await decodeContext.close();

  currentSampleRate = audioBuffer.sampleRate;
  uploadedTrackDurationSec = audioBuffer.duration;
  const frameSize = nextPowerOfTwo(Math.min(8192, Math.max(2048, currentSampleRate / 4)));
  const hopSize = frameSize * sparseStep;
  const channelData = audioBuffer.getChannelData(0);
  const totalFrames = Math.floor((channelData.length - frameSize) / hopSize) + 1;
  const rows = [];
  uploadedFrameData = [];
  stopUploadFramePlayback();

  resetDetectionState();
  chordNameEl.textContent = "-";
  updateNotesDisplay([]);
  persistedNotes.clear();
  updateFretboardDisplay();

  if (totalFrames <= 0) {
    renderMidiDataRows([]);
    updatePlaybackTimeLabel(0);
    updatePlaybackButtons();
    uploadStatusEl.textContent = "File is too short for FFT analysis.";
    return;
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    const sampleStart = frame * hopSize;
    const frameSpectrum = computeSparseFFT(channelData, sampleStart, frameSize);
    frequencyData = frameSpectrum;

    const peaks = detectPeaks(frameSpectrum, currentSampleRate);
    const stableNotes = stabilizeNotes(peaks);
    const chord = identifyChord(stableNotes);
    const frameTimeSec = sampleStart / currentSampleRate;
    const fundamentals = lastDetectedFundamentals.map((f) => ({ ...f }));

    lastDetectedNotes = stableNotes;
    lastChordName = chord;
    chordNameEl.textContent = chord;
    updateNotesDisplay(stableNotes);
    updateFretboard(stableNotes);
    updateFretboardDisplay();
    drawSpectrum();

    rows.push(formatMidiRow(frameTimeSec, stableNotes, chord));
    uploadedFrameData.push({
      index: frame,
      timeSec: frameTimeSec,
      spectrum: Uint8Array.from(frameSpectrum),
      notes: stableNotes.map((n) => ({ ...n })),
      chord,
      fundamentals,
    });
  }

  selectedUploadedFrameIndex = rows.length > 0 ? 0 : -1;
  renderMidiDataRows(rows);
  if (rows.length > 0) {
    showUploadedFrame(0, { autoScroll: false });
  }
  updatePlaybackButtons();
  uploadStatusEl.textContent = `Processed ${rows.length} sparse FFT frames (step ${sparseStep}).`;
}

// Apply stability filtering
function stabilizeNotes(currentNotes) {
  const stabilityLevel = parseInt(stabilityInput.value);
  const requiredCount = Math.ceil(stabilityLevel * 0.6); // How many times a note must appear

  noteHistory.push(currentNotes.map((n) => n.midi));
  if (noteHistory.length > HISTORY_SIZE) {
    noteHistory.shift();
  }

  // Count occurrences of each note across history
  const noteCounts = {};
  for (const frame of noteHistory) {
    for (const midi of frame) {
      noteCounts[midi] = (noteCounts[midi] || 0) + 1;
    }
  }

  // Filter notes that appear frequently enough
  const stableNotes = [];
  for (const note of currentNotes) {
    if (noteCounts[note.midi] >= requiredCount) {
      stableNotes.push(note);
    }
  }

  return stableNotes;
}

// Identify chord from notes
function identifyChord(notes) {
  if (notes.length < 2) {
    return notes.length === 1
      ? midiToNote(notes[0].midi).name + midiToNote(notes[0].midi).octave
      : "-";
  }

  const noteClasses = [...new Set(notes.map((n) => n.midi % 12))].sort(
    (a, b) => a - b,
  );

  if (noteClasses.length < 2) return "-";

  let bestMatch = null;
  let bestScore = 0;

  // Try each note as potential root
  for (let rootIdx = 0; rootIdx < noteClasses.length; rootIdx++) {
    const root = noteClasses[rootIdx];
    const intervals = noteClasses
      .map((n) => (n - root + 12) % 12)
      .sort((a, b) => a - b);

    // Compare with known chord types
    for (const [chordType, chordIntervals] of Object.entries(CHORD_TYPES)) {
      let matches = 0;
      for (const interval of intervals) {
        if (chordIntervals.includes(interval)) matches++;
      }

      const score = matches / Math.max(intervals.length, chordIntervals.length);

      if (score > bestScore && matches >= 2) {
        bestScore = score;
        bestMatch = {
          root: NOTE_NAMES[root],
          type: chordType,
          score: score,
        };
      }
    }
  }

  if (bestMatch && bestScore > 0.5) {
    const typeName = bestMatch.type === "maj" ? "" : bestMatch.type;
    return bestMatch.root + typeName;
  }

  // If no chord match, just list the notes
  return noteClasses.map((n) => NOTE_NAMES[n]).join("-");
}

// Add notes to persistence map
function updateFretboard(notes) {
  if (notes.length === 0) return;

  const now = Date.now();
  const rootMidi = notes[0]?.midi;
  const detectedMidis = new Set(notes.map((n) => n.midi));

  // Add detected notes to persistence map
  noteDots.forEach((dot) => {
    const stringNum = parseInt(dot.dataset.string);
    const fret = parseInt(dot.dataset.fret);
    const dotMidi = parseInt(dot.dataset.midiNote);
    const key = `${stringNum}-${fret}`;

    // Only persist exact MIDI matches
    if (detectedMidis.has(dotMidi) && enabledStrings.has(stringNum)) {
      persistedNotes.set(key, {
        timestamp: now,
        midi: dotMidi,
        isRoot: dotMidi === rootMidi,
      });
    }
  });

  // Trigger display update
  updateFretboardDisplay();
}

// Update fretboard display with fading
function updateFretboardDisplay() {
  const minFret = parseInt(minFretInput.value);
  const maxFret = parseInt(maxFretInput.value);
  const fadeTime = parseInt(fadeTimeInput.value) * 1000; // Convert to ms
  const now = Date.now();

  // Clear all highlights and styles
  noteDots.forEach((dot) => {
    dot.classList.remove("active", "root", "chord-note", "same-note", "fading");
    dot.style.opacity = "";
    dot.style.transform = "";
  });

  // Get currently detected MIDIs for same-note highlighting
  const currentMidis = new Set(lastDetectedNotes.map((n) => n.midi));
  const currentNoteClasses = new Set(lastDetectedNotes.map((n) => n.midi % 12));

  // Clean up old persisted notes if fade is enabled
  if (fadeTime > 0) {
    for (const [key, data] of persistedNotes.entries()) {
      if (now - data.timestamp > fadeTime) {
        persistedNotes.delete(key);
      }
    }
  }

  // Apply highlighting with fade
  noteDots.forEach((dot) => {
    const stringNum = parseInt(dot.dataset.string);
    const fret = parseInt(dot.dataset.fret);
    const dotMidi = parseInt(dot.dataset.midiNote);
    const dotClass = dotMidi % 12;
    const key = `${stringNum}-${fret}`;

    // Skip if string disabled or fret out of range
    if (!enabledStrings.has(stringNum)) return;
    if (fret < minFret || fret > maxFret) return;

    const persistedNote = persistedNotes.get(key);

    if (persistedNote) {
      dot.classList.add("active", "chord-note");
      if (persistedNote.isRoot) {
        dot.classList.add("root");
      }

      // Apply fade effect based on age
      if (fadeTime > 0) {
        const age = now - persistedNote.timestamp;
        const fadeProgress = age / fadeTime;
        const opacity = Math.max(0.3, 1 - fadeProgress * 0.7);
        const scale = Math.max(0.7, 1 - fadeProgress * 0.3);

        dot.style.opacity = opacity;
        dot.style.transform = `scale(${scale})`;

        if (fadeProgress > 0.5) {
          dot.classList.add("fading");
        }
      }
    }
    // Same note class but different octave or not persisted - show dimmer if currently playing
    else if (currentNoteClasses.has(dotClass)) {
      dot.classList.add("active", "same-note");
    }
  });
}

// Update notes display
function updateNotesDisplay(notes) {
  if (notes.length === 0) {
    detectedNotesEl.innerHTML =
      '<span style="color: #666;">No notes detected...</span>';
    return;
  }

  const html = notes
    .map((n, i) => {
      const noteInfo = midiToNote(n.midi);
      const isRoot = i === 0;
      const freqStr = n.freq ? n.freq.toFixed(1) : "?";
      return `<div class="note-badge${isRoot ? " root" : ""}" title="${freqStr} Hz">
          ${noteInfo.name}<span class="octave">${noteInfo.octave}</span>
          <span class="freq-small">${freqStr}</span>
        </div>`;
    })
    .join("");

  detectedNotesEl.innerHTML = html;
}

// Draw frequency spectrum with fundamental markers
function drawSpectrum() {
  const rect = spectrumCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  spectrumCtx.fillStyle = "rgba(0, 0, 0, 0.3)";
  spectrumCtx.fillRect(0, 0, width, height);

  if (!frequencyData) return;

  const sampleRate = audioContext ? audioContext.sampleRate : currentSampleRate;
  const binSize = sampleRate / (frequencyData.length * 2);
  const barCount = 200;
  const barWidth = width / barCount;

  // Logarithmic frequency scale for better visualization
  const minFreq = 60;
  const maxFreq = 1500;

  for (let i = 0; i < barCount; i++) {
    // Logarithmic mapping
    const t = i / barCount;
    const freq = minFreq * Math.pow(maxFreq / minFreq, t);
    const bin = Math.floor(freq / binSize);

    if (bin >= frequencyData.length) continue;

    const value = frequencyData[bin];
    const barHeight = (value / 255) * height;

    // Color based on frequency
    const hue = (i / barCount) * 120 + 180;
    spectrumCtx.fillStyle = `hsla(${hue}, 70%, 45%, 0.7)`;

    spectrumCtx.fillRect(
      i * barWidth,
      height - barHeight,
      barWidth - 1,
      barHeight,
    );
  }

  // Draw markers for detected fundamentals
  if (lastDetectedFundamentals.length > 0) {
    for (let f = 0; f < lastDetectedFundamentals.length; f++) {
      const fund = lastDetectedFundamentals[f];
      const noteInfo = midiToNote(fund.midi);

      // Calculate x position (logarithmic)
      const t = Math.log(fund.freq / minFreq) / Math.log(maxFreq / minFreq);
      const x = t * width;

      // Draw fundamental marker
      spectrumCtx.strokeStyle = f === 0 ? "#00ff88" : "#00d9ff";
      spectrumCtx.lineWidth = 2;
      spectrumCtx.beginPath();
      spectrumCtx.moveTo(x, 0);
      spectrumCtx.lineTo(x, height);
      spectrumCtx.stroke();

      // Draw note label
      spectrumCtx.fillStyle = f === 0 ? "#00ff88" : "#00d9ff";
      spectrumCtx.font = "bold 11px sans-serif";
      spectrumCtx.fillText(
        `${noteInfo.name}${noteInfo.octave}`,
        x + 3,
        12 + f * 14,
      );

      // Draw harmonic markers (lighter)
      spectrumCtx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      spectrumCtx.lineWidth = 1;
      for (let h = 2; h <= 5; h++) {
        const harmonicFreq = fund.freq * h;
        if (harmonicFreq > maxFreq) break;
        const ht =
          Math.log(harmonicFreq / minFreq) / Math.log(maxFreq / minFreq);
        const hx = ht * width;
        spectrumCtx.beginPath();
        spectrumCtx.moveTo(hx, height * 0.7);
        spectrumCtx.lineTo(hx, height);
        spectrumCtx.stroke();
      }
    }
  }

  // Draw frequency scale
  spectrumCtx.fillStyle = "#666";
  spectrumCtx.font = "9px sans-serif";
  const scaleFreqs = [100, 200, 400, 800, 1200];
  for (const sf of scaleFreqs) {
    const t = Math.log(sf / minFreq) / Math.log(maxFreq / minFreq);
    const x = t * width;
    spectrumCtx.fillText(`${sf}`, x, height - 2);
  }
}

// Set canvas dimensions
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = spectrumCanvas.getBoundingClientRect();
  spectrumCanvas.width = rect.width * dpr;
  spectrumCanvas.height = rect.height * dpr;
  spectrumCtx.scale(dpr, dpr);
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// Main analysis loop
function analyze() {
  animationId = requestAnimationFrame(analyze);

  analyser.getByteFrequencyData(frequencyData);

  // Detect peaks
  const peaks = detectPeaks(frequencyData, audioContext.sampleRate);
  processDetectionFrame(peaks);
}

// Start microphone
async function startMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 8192; // High resolution for better frequency detection
    analyser.smoothingTimeConstant = 0.7;

    microphone = audioContext.createMediaStreamSource(stream);
    microphone.connect(analyser);

    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    currentSampleRate = audioContext.sampleRate;

    // Reset state
    resetDetectionState();
    uploadStatusEl.textContent = "Microphone mode active.";

    statusEl.textContent = "Listening... Play a chord!";
    statusEl.className = "active";
    startBtn.disabled = true;
    stopBtn.disabled = false;

    analyze();
  } catch (err) {
    console.error("Error accessing microphone:", err);
    statusEl.textContent = "Error: " + err.message;
    statusEl.className = "error";
  }
}

// Stop microphone
function stopMicrophone() {
  stopUploadFramePlayback();
  if (animationId) {
    cancelAnimationFrame(animationId);
  }

  if (microphone) {
    microphone.disconnect();
  }

  if (audioContext) {
    audioContext.close();
  }
  audioContext = null;
  analyser = null;
  microphone = null;

  statusEl.textContent = "Stopped";
  statusEl.className = "";
  startBtn.disabled = false;
  stopBtn.disabled = true;

  // Reset displays
  chordNameEl.textContent = "-";
  detectedNotesEl.innerHTML =
    '<span style="color: #666;">Play a chord...</span>';
  noteDots.forEach((dot) => {
    dot.classList.remove("active", "root", "chord-note", "same-note", "fading");
    dot.style.opacity = "";
    dot.style.transform = "";
  });
  resetDetectionState();

  const rect = spectrumCanvas.getBoundingClientRect();
  spectrumCtx.fillStyle = "rgba(0, 0, 0, 0.3)";
  spectrumCtx.fillRect(0, 0, rect.width, rect.height);
}

// Play reference tone
function playReferenceTone(frequency) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;

  gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start();
  oscillator.stop(ctx.currentTime + 1.5);
}

// Event listeners
startBtn.addEventListener("click", startMicrophone);
stopBtn.addEventListener("click", stopMicrophone);
audioFileInput.addEventListener("change", () => {
  stopUploadFramePlayback();
  uploadedFile = audioFileInput.files?.[0] || null;
  processUploadBtn.disabled = !uploadedFile;
  if (uploadedFile) {
    uploadStatusEl.textContent = `Selected: ${uploadedFile.name}`;
  } else {
    uploadStatusEl.textContent = "Upload a file and click Process Upload.";
  }
});

processUploadBtn.addEventListener("click", async () => {
  if (!uploadedFile) return;
  try {
    if (animationId || audioContext) {
      stopMicrophone();
    }
    statusEl.textContent = "Processing uploaded file...";
    statusEl.className = "active";
    processUploadBtn.disabled = true;
    await processUploadedAudioFile(uploadedFile);
    statusEl.textContent = "Upload analysis complete.";
    statusEl.className = "";
  } catch (err) {
    console.error("Error processing upload:", err);
    uploadStatusEl.textContent = `Upload error: ${err.message}`;
    statusEl.textContent = "Upload processing failed.";
    statusEl.className = "error";
  } finally {
    processUploadBtn.disabled = !uploadedFile;
  }
});

playFramesBtn.addEventListener("click", () => {
  startUploadFramePlayback();
});

pauseFramesBtn.addEventListener("click", () => {
  stopUploadFramePlayback();
  if (selectedUploadedFrameIndex >= 0 && selectedUploadedFrameIndex < uploadedFrameData.length) {
    const frame = uploadedFrameData[selectedUploadedFrameIndex];
    uploadStatusEl.textContent = `Paused at ${frame.timeSec.toFixed(3)}s`;
  }
});

midiDataBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-row-index]");
  if (!row) return;
  const index = parseInt(row.dataset.rowIndex, 10);
  if (Number.isNaN(index)) return;
  stopUploadFramePlayback();
  showUploadedFrame(index, { autoScroll: true });
});

stringBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const freq = parseFloat(btn.dataset.freq);
    playReferenceTone(freq);

    stringBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// Initialize
buildFretboard();
renderMidiDataRows([]);
updatePlaybackTimeLabel(0);
updatePlaybackButtons();
