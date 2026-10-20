/**
 * The voice of the intro film. Browsers only allow sound after the person has tapped something,
 * so `primeVoice` is called from the Create / Join click: by the time the facilitator starts the
 * film, every player's browser is already allowed to play it.
 */
export const VOICE_CLIPS = 6;

interface Voice {
  ctx: AudioContext | null;
  clips: HTMLAudioElement[];
}

let voice: Voice | null = null;

export function primeVoice(): Voice {
  if (voice) {
    void voice.ctx?.resume().catch(() => {});
    return voice;
  }
  const clips = Array.from({ length: VOICE_CLIPS }, (_, i) => {
    const a = new Audio(`/voice/line-${i + 1}.mp3`);
    a.preload = 'auto';
    return a;
  });
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
    // Radio filter: narrow band and a touch of grit. No background noise.
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 320;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 3400;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 2.2);
    shaper.curve = curve;
    const gain = ctx.createGain();
    gain.gain.value = 1.15;
    high.connect(low);
    low.connect(shaper);
    shaper.connect(gain);
    gain.connect(ctx.destination);
    for (const a of clips) ctx.createMediaElementSource(a).connect(high);
    void ctx.resume().catch(() => {});
  } catch {
    // no Web Audio: the clips still play, just without the radio effect
  }
  // Unlock each clip inside the tap (needed by Safari): play it silently for an instant.
  for (const a of clips) {
    a.muted = true;
    a.play().then(
      () => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
      },
      () => {
        a.muted = false;
      },
    );
  }
  voice = { ctx, clips };
  return voice;
}
