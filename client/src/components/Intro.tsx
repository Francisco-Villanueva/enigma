import { useEffect, useRef, useState } from 'react';
import type { Ack, FacilitatorCommand } from '@enigma/shared';
import { Maximize2, Volume2, VolumeX } from 'lucide-react';
import { primeVoice } from '../lib/voice';
import { OfficerPortrait } from './OfficerPortrait';

/** What the coordinator says. Short on purpose; every line is also shown as a subtitle. */
const LINES = [
  'Attention, team. This is a priority call.',
  'On 22 June 2022, an Antonov An-30M cargo plane lost both engines over Siberia.',
  'The crew made a forced landing in the woods, far from any town. Its location signal has gone silent.',
  'The core that processes that signal has failed. You are the six people who can bring it back.',
  'Every system you restore gives us a fragment of the aircraft’s position. Put them together, and we find them.',
  'The clock is running. Good luck.',
];

const CHAR_MS = 32;
const HOLD_MS = 1700;
const TITLE_MS = 3400;

type Phase = 'title' | 'talk' | 'end';

interface Props {
  isFacilitator: boolean;
  exiting: boolean;
  sendCommand: (command: FacilitatorCommand) => Promise<Ack>;
  startGame: () => Promise<Ack>;
}

export function Intro({ isFacilitator, exiting, sendCommand, startGame }: Props) {
  const [phase, setPhase] = useState<Phase>('title');
  const [line, setLine] = useState(0);
  const [typed, setTyped] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  /** The browser refused to play sound (a page reload loses the permission). One tap fixes it. */
  const [blocked, setBlocked] = useState(false);

  const mutedRef = useRef(false);
  const blockedRef = useRef(false);
  const clipsRef = useRef<HTMLAudioElement[]>([]);
  if (clipsRef.current.length === 0) clipsRef.current = primeVoice().clips;

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    for (const a of clipsRef.current) a.muted = next;
    if (next) window.speechSynthesis?.cancel();
  }

  function enableAfterBlock() {
    primeVoice();
    blockedRef.current = false;
    setBlocked(false);
  }

  useEffect(() => {
    const clips = clipsRef.current;
    return () => {
      for (const a of clips) a.pause();
      window.speechSynthesis?.cancel();
    };
  }, []);

  // title card → first line
  useEffect(() => {
    if (phase !== 'title') return;
    const id = setTimeout(() => setPhase('talk'), TITLE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  // One line: recorded voice if there is a clip, else the browser voice, else just the typewriter.
  useEffect(() => {
    if (phase !== 'talk') return;
    const text = LINES[line] ?? '';
    setTyped(0);
    setVoiceOn(false);
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => !cancelled && fn(), ms);
      cleanups.push(() => clearTimeout(id));
    };
    const every = (fn: () => void, ms: number) => {
      const id = setInterval(() => !cancelled && fn(), ms);
      cleanups.push(() => clearInterval(id));
    };
    const advance = (delay: number) =>
      later(() => (line + 1 < LINES.length ? setLine(line + 1) : setPhase('end')), delay);

    const silent = () => {
      every(() => setTyped((n) => Math.min(text.length, n + 1)), CHAR_MS);
      advance(text.length * CHAR_MS + HOLD_MS);
    };

    const browserVoice = () => {
      const synth = window.speechSynthesis;
      if (!synth || mutedRef.current || blockedRef.current) return silent();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.92;
      u.pitch = 0.7;
      setVoiceOn(true);
      every(() => setTyped((n) => Math.min(text.length, n + 1)), 55);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        setVoiceOn(false);
        setTyped(text.length);
        advance(HOLD_MS - 700);
      };
      u.onend = finish;
      u.onerror = finish;
      later(finish, text.length * 120 + 3000);
      synth.cancel();
      synth.speak(u);
      cleanups.push(() => synth.cancel());
    };

    const clip = clipsRef.current[line];
    if (!clip) {
      browserVoice();
    } else {
      let started = false;
      let fellBack = false;
      const fallBack = (blockedByBrowser: boolean) => {
        if (fellBack || started || cancelled) return;
        fellBack = true;
        if (blockedByBrowser) {
          blockedRef.current = true;
          setBlocked(true);
          silent();
        } else {
          browserVoice();
        }
      };
      clip.muted = mutedRef.current;
      clip.currentTime = 0;
      const onError = () => fallBack(false);
      const onEnded = () => {
        setVoiceOn(false);
        setTyped(text.length);
        advance(HOLD_MS - 700);
      };
      clip.addEventListener('error', onError);
      clip.addEventListener('ended', onEnded);
      every(() => {
        if (!started || !clip.duration || !Number.isFinite(clip.duration)) return;
        const progress = Math.min(1, clip.currentTime / (clip.duration * 0.92));
        setTyped(Math.round(text.length * progress));
      }, 50);
      if (blockedRef.current) {
        fallBack(true);
      } else {
        clip.play().then(
          () => {
            started = true;
            setVoiceOn(true);
          },
          (err: unknown) => fallBack((err as { name?: string })?.name === 'NotAllowedError'),
        );
        // A missing file is served as HTML by the SPA fallback: it never starts, so give up soon.
        later(() => {
          if (!started) {
            clip.pause();
            fallBack(false);
          }
        }, 2500);
      }
      cleanups.push(() => {
        clip.removeEventListener('error', onError);
        clip.removeEventListener('ended', onEnded);
        clip.pause();
      });
    }

    return () => {
      cancelled = true;
      for (const fn of cleanups) fn();
    };
  }, [phase, line]);

  const text = LINES[line] ?? '';
  const talking = phase === 'talk' && (voiceOn || (blocked && typed < text.length));
  const showOfficer = phase !== 'title';

  async function go(action: Promise<Ack>) {
    setError(null);
    const res = await action;
    if (!res.ok) setError(res.message);
  }

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // not allowed here: the overlay already covers the whole window
    }
  }

  return (
    <div className={`cine ${exiting ? 'cine-out' : ''}`} data-intro-scene data-phase={phase} role="dialog" aria-label="Mission briefing">
      <div className="cine-stage">
        {/* officer */}
        {showOfficer && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ animation: 'cine-fade-in 1.6s ease-out both' }}>
            <div className="cine-officer aspect-[4/5] h-[92vh] max-h-[900px]" style={{ maskImage: 'radial-gradient(ellipse 62% 62% at 50% 48%, #000 55%, transparent 100%)', WebkitMaskImage: 'radial-gradient(ellipse 62% 62% at 50% 48%, #000 55%, transparent 100%)' }}>
              <OfficerPortrait talking={talking} />
            </div>
          </div>
        )}

        {/* radar inset */}
        {showOfficer && phase === 'talk' && line >= 1 && (
          <div className="cine-pop absolute top-[18vh] right-[4vw] hidden w-[22vw] min-w-44 max-w-72 sm:block" data-radar>
            <svg viewBox="0 0 200 200" className="w-full">
              <circle cx="100" cy="100" r="92" fill="#06130d" stroke="#2e7d4f" strokeWidth="2" />
              {[30, 60, 90].map((r) => (
                <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#2e7d4f" strokeOpacity="0.5" />
              ))}
              <path d="M100 8 V192 M8 100 H192" stroke="#2e7d4f" strokeOpacity="0.4" />
              <g className="cine-sweep">
                <path d="M100 100 L100 8 A92 92 0 0 1 150 20 Z" fill="#4ade80" fillOpacity="0.18" />
              </g>
              <circle cx="132" cy="68" r="4" fill={line >= 2 ? '#ef4444' : '#4ade80'} />
              <circle className="cine-blip" cx="132" cy="68" r="6" fill="none" stroke={line >= 2 ? '#ef4444' : '#4ade80'} strokeWidth="2" />
            </svg>
            <p className={`mt-1 text-center font-mono text-xs tracking-widest uppercase ${line >= 2 ? 'cine-flicker text-red-400' : 'text-green-400'}`}>
              {line >= 2 ? 'Signal lost' : 'Tracking · Yakutia'}
            </p>
          </div>
        )}

        {/* lower third */}
        {showOfficer && (
          <div className="cine-lower absolute bottom-[18vh] left-[4vw] border-l-4 border-amber-500 bg-black/55 px-4 py-2">
            <p className="font-mono text-[0.7rem] tracking-[0.3em] text-amber-400 uppercase">Priority call · Live</p>
            <p className="font-display text-lg font-black text-[#f6eedc] sm:text-2xl">Search &amp; Rescue Coordinator</p>
          </div>
        )}

        <div className="cine-bar cine-bar-top" />
        <div className="cine-bar cine-bar-bottom" />

        {/* subtitles */}
        {phase === 'talk' && (
          <p
            className="cine-caret absolute right-[6vw] bottom-[3.5vh] left-[6vw] z-10 text-center font-mono text-base text-[#fbe9c0] sm:text-xl"
            aria-live="polite"
            data-subtitle
          >
            {text.slice(0, typed)}
          </p>
        )}

        {/* title card */}
        {phase === 'title' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="cine-title font-mono text-sm tracking-[0.5em] text-amber-500 uppercase">Incoming transmission</p>
            <p className="cine-title mt-4 font-display text-4xl font-black tracking-[0.3em] text-[#f6eedc] uppercase sm:text-6xl" style={{ animationDelay: '0.2s' }}>
              Priority call
            </p>
          </div>
        )}

        {/* end card */}
        {phase === 'end' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 px-6 text-center" data-intro-end>
            <p className="cine-pop font-mono text-sm tracking-[0.4em] text-amber-500 uppercase">Your mission</p>
            <h1 className="cine-pop mt-3 font-display text-4xl font-black tracking-tight text-[#f6eedc] sm:text-6xl" style={{ animationDelay: '0.15s' }}>
              Find the lost aircraft
            </h1>
            <p className="cine-pop mt-3 max-w-md text-[#d8cfb8]" style={{ animationDelay: '0.3s' }}>
              Six systems. Six fragments. One position.
            </p>
            <div className="cine-pop mt-8 flex flex-wrap justify-center gap-3" style={{ animationDelay: '0.5s' }}>
              {isFacilitator ? (
                <>
                  <button
                    type="button"
                    data-intro-practice
                    onClick={() => void go(sendCommand({ type: 'practice' }))}
                    className="rounded-md bg-amber-500 px-5 py-3 font-semibold text-black transition hover:brightness-110"
                  >
                    Warm-up round (recommended)
                  </button>
                  <button
                    type="button"
                    data-intro-start
                    onClick={() => void go(startGame())}
                    className="rounded-md border border-slate-500 px-5 py-3 text-[#f6eedc] transition hover:border-amber-400"
                  >
                    Skip to mission 1
                  </button>
                </>
              ) : (
                <p className="font-mono text-xs text-[#b9ae94]">Waiting for the facilitator…</p>
              )}
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
          </div>
        )}

        {blocked && (
          <button
            type="button"
            data-intro-unblock
            onClick={enableAfterBlock}
            className="absolute top-[16vh] left-1/2 z-20 -translate-x-1/2 rounded-full bg-amber-500 px-5 py-2 font-mono text-xs tracking-widest text-black uppercase shadow-lg"
          >
            Tap to turn the sound on
          </button>
        )}

        <div className="cine-vignette" />
        <div className="cine-scan" />
        <div className="cine-grain" />
      </div>

      <div className="absolute top-3 right-4 z-20 flex gap-2">
        {isFacilitator && (
          <button
            type="button"
            data-intro-lobby
            onClick={() => void go(sendCommand({ type: 'lobby' }))}
            className="rounded border border-white/20 bg-black/50 px-3 py-1.5 font-mono text-xs tracking-widest text-[#f6eedc]/80 uppercase hover:text-[#f6eedc]"
          >
            ‹ Lobby
          </button>
        )}
        <button
          type="button"
          onClick={() => void fullscreen()}
          aria-label="Toggle full screen"
          className="rounded border border-white/20 bg-black/50 p-2 text-[#f6eedc]/80 hover:text-[#f6eedc]"
        >
          <Maximize2 size={16} />
        </button>
        {(
          <button
            type="button"
            data-intro-mute
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="rounded border border-white/20 bg-black/50 p-2 text-[#f6eedc]/80 hover:text-[#f6eedc]"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}
