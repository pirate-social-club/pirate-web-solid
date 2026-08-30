export type StudyFeedbackOutcome = "correct" | "incorrect";

const STUDY_FEEDBACK_OUTCOMES: readonly StudyFeedbackOutcome[] = ["correct", "incorrect"];

type StudyFeedbackAudioState = {
  buffers: Partial<Record<StudyFeedbackOutcome, AudioBuffer>>;
  context: AudioContext;
  loading: Partial<Record<StudyFeedbackOutcome, Promise<AudioBuffer>>>;
};

let studyFeedbackAudio: StudyFeedbackAudioState | null = null;

function getStudyFeedbackAudioContext(): StudyFeedbackAudioState | null {
  if (typeof window === "undefined") return null;
  // SAFETY: Safari exposes the same AudioContext constructor under its legacy
  // webkit name; the fallback is only read from the browser Window object.
  const AudioContextConstructor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  studyFeedbackAudio ??= {
    buffers: {},
    context: new AudioContextConstructor(),
    loading: {},
  };
  return studyFeedbackAudio;
}

function loadStudyFeedbackBuffer(outcome: StudyFeedbackOutcome): Promise<AudioBuffer> | null {
  const state = getStudyFeedbackAudioContext();
  if (!state) return null;
  if (state.buffers[outcome]) return Promise.resolve(state.buffers[outcome]);
  state.loading[outcome] ??= fetch(`/sounds/study/${outcome}.mp3`)
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load study feedback sound: ${outcome}`);
      return response.arrayBuffer();
    })
    .then((audioData) => state.context.decodeAudioData(audioData))
    .then((buffer) => {
      state.buffers[outcome] = buffer;
      return buffer;
    });
  return state.loading[outcome] ?? null;
}

/** Begin decoding both short feedback sounds while the lesson is loading. */
export function preloadStudyFeedbackSounds(): void {
  for (const outcome of STUDY_FEEDBACK_OUTCOMES) {
    void loadStudyFeedbackBuffer(outcome)?.catch(() => {
      // Feedback audio is non-critical.
    });
  }
}

/** Resume the audio context from the answer tap so later playback is allowed. */
export function unlockStudyFeedbackAudio(): void {
  const state = getStudyFeedbackAudioContext();
  if (!state) return;
  preloadStudyFeedbackSounds();
  if (state.context.state === "suspended") {
    void state.context.resume().catch(() => {
      // Browsers may still decline audio playback in strict modes.
    });
  }
}

function playStudyFeedbackBuffer(outcome: StudyFeedbackOutcome): boolean {
  const state = studyFeedbackAudio;
  const buffer = state?.buffers[outcome];
  if (!state || !buffer) return false;
  const source = state.context.createBufferSource();
  const gain = state.context.createGain();
  gain.gain.value = 0.7;
  source.buffer = buffer;
  source.connect(gain).connect(state.context.destination);
  source.start();
  return true;
}

function playStudyFeedbackSoundElement(outcome: StudyFeedbackOutcome): void {
  if (typeof Audio === "undefined") return;
  const audio = new Audio(`/sounds/study/${outcome}.mp3`);
  audio.volume = 0.7;
  void audio.play().catch(() => {
    // Feedback audio is non-critical.
  });
}

/** Play the result sound, falling back to an HTML audio element if needed. */
export function playStudyFeedbackSound(outcome: StudyFeedbackOutcome): void {
  if (playStudyFeedbackBuffer(outcome)) return;
  const loading = loadStudyFeedbackBuffer(outcome);
  if (!loading) {
    playStudyFeedbackSoundElement(outcome);
    return;
  }
  void loading.then(() => {
    if (!playStudyFeedbackBuffer(outcome)) playStudyFeedbackSoundElement(outcome);
  }).catch(() => {
    playStudyFeedbackSoundElement(outcome);
  });
}
