/** Synthesized sound effects using the Web Audio API.
 *  No external audio files needed.
 *  These sounds are intentionally dramatic: sharp stings, dissonant drops,
 *  and longer tails so every answer feels consequential.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioCtx;
}

interface PlayToneOptions {
  frequency: number | number[];
  duration: number;
  type?: OscillatorType;
  gain?: number;
  startGain?: number;
  endGain?: number;
  fadeOut?: boolean;
  attack?: number;
  delay?: number;
  pan?: number;
}

function playTone({
  frequency,
  duration,
  type = "sine",
  gain = 0.25,
  startGain,
  endGain,
  fadeOut = true,
  attack = 0.01,
  delay = 0,
  pan = 0,
}: PlayToneOptions) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const startTime = now + delay;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const panner = ctx.createStereoPanner?.() ?? null;

    osc.type = type;

    if (Array.isArray(frequency)) {
      osc.frequency.setValueAtTime(frequency[0], startTime);
      frequency.forEach((f, i) => {
        if (i > 0) {
          osc.frequency.exponentialRampToValueAtTime(
            f,
            startTime + (duration * i) / (frequency.length - 1),
          );
        }
      });
    } else {
      osc.frequency.setValueAtTime(frequency, startTime);
    }

    const sGain = startGain ?? gain;
    const eGain = endGain ?? (fadeOut ? 0.001 : gain);
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(sGain, startTime + attack);
    gainNode.gain.exponentialRampToValueAtTime(eGain, startTime + duration);

    osc.connect(gainNode);
    if (panner) {
      gainNode.connect(panner);
      panner.pan.value = pan;
      panner.connect(ctx.destination);
    } else {
      gainNode.connect(ctx.destination);
    }

    osc.start(startTime);
    osc.stop(startTime + duration);
  } catch {
    // Audio playback is optional; ignore failures.
  }
}

/** Play several notes together as a dramatic chord. */
function playChord(
  notes: number[],
  duration: number,
  type: OscillatorType = "triangle",
  gain = 0.15,
  stagger = 0.08,
) {
  notes.forEach((freq, i) => {
    playTone({
      frequency: freq,
      duration,
      type,
      gain: gain / notes.length,
      attack: 0.02,
      delay: i * stagger,
      pan: i % 2 === 0 ? -0.35 : 0.35,
    });
  });
}

/** Short white-noise burst for impact / shock / punch. */
function playNoiseBurst(duration: number, gain = 0.25) {
  try {
    const ctx = getAudioContext();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + duration);
  } catch {
    // ignore
  }
}

/**
 * Unlock the shared AudioContext from inside a user gesture (e.g. the
 * answer click). Browsers create a fresh AudioContext suspended when
 * it is first built outside a gesture — server-driven feedback plays
 * its sound from a fetch callback, so the context must already be
 * running by then. Safe to call repeatedly; no-ops when running.
 */
export function unlockAudioContext(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
  } catch {
    // ignore
  }
}

/** Sharp, metallic correct-answer sting — clear and consequential, not cuddly. */
export function playWinnerSound() {
  // Main piercing ping
  playTone({ frequency: 880, duration: 0.14, type: "square", gain: 0.12, attack: 0.005, pan: 0.25 });
  // Higher harmonic tail
  playTone({ frequency: 1320, duration: 0.18, type: "sine", gain: 0.08, delay: 0.04, pan: -0.25 });
  // Tiny impact click for presence
  playNoiseBurst(0.06, 0.05);
}

/** Long, sinking, dissonant wrong-answer sound — disappointment with a sting. */
export function playHeartbreakSound() {
  // Dissonant tritone descent on sawtooth (harsh, unsettling)
  playTone({ frequency: [220, 146.83], duration: 1.5, type: "sawtooth", gain: 0.12, attack: 0.02, pan: -0.4 });
  playTone({
    frequency: [233.08, 155.56],
    duration: 1.5,
    type: "sawtooth",
    gain: 0.1,
    attack: 0.02,
    delay: 0.05,
    pan: 0.4,
  });
  // Low thud at the end of the fall
  playTone({ frequency: 75, duration: 0.45, type: "sine", gain: 0.22, delay: 1.05, attack: 0.01 });
}

/** Triumphant badge fanfare — extended, bright, layered. */
export function playBadgeSound() {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((freq, i) => {
    setTimeout(() => {
      playTone({
        frequency: freq,
        duration: 0.55,
        type: "triangle",
        gain: 0.14,
        attack: 0.02,
        pan: i % 2 === 0 ? -0.4 : 0.4,
      });
    }, i * 90);
  });
  setTimeout(() => {
    playChord([1046.5, 1318.5, 1568.0], 0.9, "triangle", 0.12, 0.06);
  }, 520);
}

/** Sparkling bonus unlock — longer and more magical. */
export function playBonusUnlockSound() {
  const notes = [659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5, 1568.0];
  notes.forEach((freq, i) => {
    setTimeout(() => {
      playTone({
        frequency: freq,
        duration: 0.38,
        type: "sine",
        gain: 0.1,
        attack: 0.01,
        pan: i % 2 === 0 ? -0.5 : 0.5,
      });
      playNoiseBurst(0.05, 0.04);
    }, i * 80);
  });
  setTimeout(() => {
    playChord([1046.5, 1318.5, 1568.0, 2093.0], 1.1, "triangle", 0.12, 0.05);
  }, 620);
}

/** Big, dramatic passing chord — celebration with weight. */
export function playPassSound() {
  playNoiseBurst(0.15, 0.12);
  playChord([261.63, 329.63, 392.0, 523.25], 1.2, "triangle", 0.18, 0.12);
  setTimeout(() => {
    playChord([523.25, 659.25, 783.99, 1046.5], 1.5, "sine", 0.14, 0.08);
  }, 420);
}

/** Scary, low fail sound — descending drone with a dissonant edge. */
export function playFailSound() {
  playNoiseBurst(0.28, 0.15);
  playTone({ frequency: [220, 110], duration: 1.6, type: "sawtooth", gain: 0.14, attack: 0.02, pan: -0.45 });
  playTone({
    frequency: [233.08, 116.54],
    duration: 1.6,
    type: "sawtooth",
    gain: 0.12,
    attack: 0.02,
    delay: 0.05,
    pan: 0.45,
  });
  // Dissonant high whine on top for tension
  playTone({ frequency: 440, duration: 1.1, type: "square", gain: 0.03, delay: 0.2, pan: 0 });
}
