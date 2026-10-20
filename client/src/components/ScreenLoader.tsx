import { useMemo } from 'react';

const MESSAGES = [
  'Establishing link…',
  'Syncing the squad…',
  'Decrypting the channel…',
  'Locking onto the signal…',
  'Receiving orders…',
];

/** Short loading scene between screens: a cargo plane crossing the limb of a planet. */
export function ScreenLoader({ phase, tick }: { phase: 'in' | 'out'; tick: number }) {
  const stars = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        x: (i * 173) % 800,
        y: (i * 97) % 300,
        r: 0.6 + ((i * 7) % 5) * 0.3,
        d: ((i * 13) % 20) / 10,
      })),
    [],
  );
  return (
    <div className={`loader ${phase === 'out' ? 'loader-out' : 'loader-in'}`} role="status" aria-label="Loading" data-loader>
      <svg viewBox="0 0 800 450" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id="ld-planet" cx="0.35" cy="0.15" r="0.9">
            <stop offset="0" stopColor="#5fb3d9" />
            <stop offset="0.45" stopColor="#245a86" />
            <stop offset="1" stopColor="#07142a" />
          </radialGradient>
          <radialGradient id="ld-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.86" stopColor="#7cc8ff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#7cc8ff" stopOpacity="0" />
          </radialGradient>
          <clipPath id="ld-clip">
            <circle cx="400" cy="740" r="420" />
          </clipPath>
        </defs>

        <rect width="800" height="450" fill="#04070d" />
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#f6eedc" className="loader-star" style={{ animationDelay: `${s.d}s` }} />
        ))}

        {/* planet */}
        <circle cx="400" cy="740" r="468" fill="url(#ld-glow)" />
        <circle cx="400" cy="740" r="420" fill="url(#ld-planet)" />
        <g clipPath="url(#ld-clip)" className="loader-clouds">
          <ellipse cx="260" cy="350" rx="150" ry="9" fill="#fff" opacity="0.18" />
          <ellipse cx="560" cy="372" rx="190" ry="8" fill="#fff" opacity="0.14" />
          <ellipse cx="400" cy="402" rx="260" ry="10" fill="#fff" opacity="0.1" />
          <path d="M300 330 q30 -14 60 0 q22 -8 40 6 q-40 12 -100 -6z" fill="#3f8f5a" opacity="0.5" />
          <path d="M520 346 q26 -12 54 2 q-26 12 -54 -2z" fill="#3f8f5a" opacity="0.4" />
        </g>
        <circle cx="400" cy="740" r="420" fill="none" stroke="#bfe4ff" strokeWidth="1.5" opacity="0.6" />

        {/* flight path (trail) */}
        <path
          id="ld-path"
          d="M -60 290 Q 400 -40 860 290"
          fill="none"
          stroke="#e0a84b"
          strokeOpacity="0.55"
          strokeWidth="1.5"
          strokeDasharray="4 8"
          className="loader-trail"
        />

        {/* the plane */}
        <g>
          <g transform="scale(1.15)">
            <path d="M-30 0 C-30 -7 -18 -9 0 -9 L22 -9 C32 -9 38 -3 40 0 C38 3 32 6 22 6 L0 6 C-18 6 -30 4 -30 0Z" fill="#e9dfc8" />
            <path d="M-26 -8 L-36 -23 L-25 -23 L-12 -8Z" fill="#c9bfa6" />
            <path d="M2 -8 L-12 -22 L4 -22 L18 -8Z" fill="#bfb496" />
            <ellipse cx="6" cy="-13" rx="7" ry="3" fill="#8f8466" />
            <path d="M30 -6 L36 -6 L38 -1 L28 -1Z" fill="#7fb7d8" />
            <g fill="#7fb7d8">
              <rect x="-14" y="-5" width="4" height="3" />
              <rect x="-6" y="-5" width="4" height="3" />
              <rect x="2" y="-5" width="4" height="3" />
            </g>
            <rect x="-30" y="-2" width="70" height="1.6" fill="#b04a3a" opacity="0.8" />
          </g>
          <animateMotion dur="1.7s" repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
            <mpath href="#ld-path" />
          </animateMotion>
        </g>
      </svg>

      <div className="absolute inset-x-0 bottom-[9vh] flex flex-col items-center gap-3 px-6 text-center">
        <p className="font-mono text-xs tracking-[0.4em] text-[#e0a84b] uppercase loader-text">
          {MESSAGES[tick % MESSAGES.length]}
        </p>
        <div className="h-[3px] w-56 overflow-hidden rounded bg-white/10">
          <div className="loader-bar h-full bg-[#e0a84b]" />
        </div>
      </div>
    </div>
  );
}
