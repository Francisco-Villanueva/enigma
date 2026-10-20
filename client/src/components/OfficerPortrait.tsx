/**
 * Illustrated officer, drawn in SVG so the film needs no image files.
 * Deliberately generic: no country, no real insignia.
 */
export function OfficerPortrait({ talking }: { talking: boolean }) {
  return (
    <svg viewBox="0 0 400 500" className="h-full w-full" role="img" aria-label="Search and rescue coordinator">
      <defs>
        <linearGradient id="of-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c2a2a" />
          <stop offset="1" stopColor="#0a0f10" />
        </linearGradient>
        <radialGradient id="of-light" cx="0.3" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#f2c58a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="of-skin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d9a77a" />
          <stop offset="0.6" stopColor="#c08a5e" />
          <stop offset="1" stopColor="#8d5f3f" />
        </linearGradient>
        <linearGradient id="of-coat" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3b4a3a" />
          <stop offset="1" stopColor="#1f2a1f" />
        </linearGradient>
      </defs>

      <rect width="400" height="500" fill="url(#of-bg)" />
      {/* window blinds behind him */}
      <g opacity="0.22" fill="#e8b46b">
        {[40, 80, 120, 160, 200].map((y) => (
          <rect key={y} x="0" y={y} width="400" height="9" />
        ))}
      </g>

      {/* shoulders and jacket */}
      <path d="M20 500 C 30 400, 90 360, 150 345 L 250 345 C 310 360, 370 400, 380 500 Z" fill="url(#of-coat)" />
      <path d="M150 345 L200 430 L250 345 Z" fill="#cfc7b2" />
      <path d="M185 360 L200 430 L215 360 L200 352 Z" fill="#7a1f1f" />
      {/* lapels */}
      <path d="M150 345 L200 430 L120 470 L90 390 Z" fill="#2c3a2b" />
      <path d="M250 345 L200 430 L280 470 L310 390 Z" fill="#2c3a2b" />
      {/* epaulettes and plain bars */}
      <rect x="62" y="395" width="70" height="16" rx="3" fill="#b88f3a" transform="rotate(-18 97 403)" />
      <rect x="268" y="395" width="70" height="16" rx="3" fill="#b88f3a" transform="rotate(18 303 403)" />
      <g fill="#e9dfc8">
        <circle cx="285" cy="404" r="3" />
        <circle cx="300" cy="408" r="3" />
        <circle cx="315" cy="413" r="3" />
        <circle cx="115" cy="404" r="3" />
        <circle cx="100" cy="408" r="3" />
        <circle cx="85" cy="413" r="3" />
      </g>
      {/* medal ribbons */}
      <g transform="translate(250 400)">
        <rect width="14" height="8" fill="#a33" />
        <rect x="14" width="14" height="8" fill="#38a" />
        <rect y="8" width="14" height="8" fill="#da3" />
        <rect x="14" y="8" width="14" height="8" fill="#3a6" />
      </g>

      {/* neck */}
      <path d="M170 300 L170 350 Q200 372 230 350 L230 300 Z" fill="#a8734c" />

      {/* ears */}
      <ellipse cx="143" cy="248" rx="11" ry="22" fill="#b27c52" />
      <ellipse cx="257" cy="248" rx="11" ry="22" fill="#8d5f3f" />

      {/* head */}
      <path
        d="M150 215 C150 150, 250 150, 250 215 L250 262 C250 312, 222 330, 200 330 C178 330, 150 312, 150 262 Z"
        fill="url(#of-skin)"
      />
      {/* jaw shadow */}
      <path d="M150 262 C150 312, 178 330, 200 330 C222 330, 250 312, 250 262 C235 300, 165 300, 150 262Z" fill="#000" opacity="0.14" />
      {/* brows, eyes (blink) */}
      <path d="M163 228 L190 224" stroke="#2a1d14" strokeWidth="5" strokeLinecap="round" />
      <path d="M210 224 L237 228" stroke="#2a1d14" strokeWidth="5" strokeLinecap="round" />
      <g>
        <ellipse cx="177" cy="242" rx="9" ry="4.5" fill="#efe6d6" />
        <ellipse cx="223" cy="242" rx="9" ry="4.5" fill="#efe6d6" />
        <circle cx="178" cy="242" r="3.4" fill="#2a1d14" />
        <circle cx="224" cy="242" r="3.4" fill="#2a1d14" />
        <animateTransform attributeName="transform" type="scale" values="1 1;1 1;1 0.1;1 1;1 1" keyTimes="0;0.9;0.93;0.96;1" dur="5s" repeatCount="indefinite" additive="sum" />
      </g>
      {/* nose */}
      <path d="M200 244 L194 278 Q200 284 208 278" fill="none" stroke="#7a4c30" strokeWidth="3" strokeLinecap="round" />
      {/* moustache */}
      <path d="M170 292 Q200 280 230 292 Q215 300 200 297 Q185 300 170 292Z" fill="#4a3426" />
      {/* mouth */}
      <g transform="translate(200 306)">
        <ellipse rx="14" ry={talking ? 5 : 1.6} fill="#5b2b24">
          {talking && <animate attributeName="ry" values="1.5;6;2.5;5;1.5" dur="0.55s" repeatCount="indefinite" />}
        </ellipse>
      </g>
      {/* stubble */}
      <path d="M160 285 C165 320 235 320 240 285 C230 312 170 312 160 285Z" fill="#3a2a20" opacity="0.28" />

      {/* peaked cap */}
      <path d="M140 205 C140 120, 260 120, 260 205 Z" fill="#2c3a2b" />
      <path d="M135 200 L265 200 L265 214 Q200 226 135 214 Z" fill="#1a231a" />
      <path d="M135 214 Q200 250 265 214 L275 222 Q200 262 125 222 Z" fill="#0f150f" />
      <circle cx="200" cy="178" r="13" fill="#b88f3a" />
      <circle cx="200" cy="178" r="7" fill="#7a5d20" />

      {/* radio headset */}
      <path d="M143 235 C128 235 128 275 148 280" fill="none" stroke="#111" strokeWidth="5" strokeLinecap="round" />
      <rect x="132" y="262" width="22" height="26" rx="8" fill="#1b1b1b" />
      <path d="M143 288 C150 330 185 338 196 322" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
      <circle cx="197" cy="320" r="6" fill="#222" />

      {/* warm key light */}
      <rect width="400" height="500" fill="url(#of-light)" />
    </svg>
  );
}
