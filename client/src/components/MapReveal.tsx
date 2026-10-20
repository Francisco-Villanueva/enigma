import type { Reveal } from '@enigma/shared';
import { Confetti } from './Confetti';

/** Everyone sees the same satellite view, centered on the position the team assembled. */
export function MapReveal({ reveal, timeLeft }: { reveal: Reveal; timeLeft: string }) {
  const embed = `https://maps.google.com/maps?ll=${reveal.lat.toFixed(6)},${reveal.lng.toFixed(6)}&z=18&t=k&output=embed`;
  const open = `https://www.google.com/maps?q=${reveal.lat.toFixed(6)},${reveal.lng.toFixed(6)}&t=k&z=18`;
  return (
    <main className="mx-auto max-w-3xl px-5 py-8" data-reveal>
      <div className="text-center">
        <p className="stamp stamp-ok text-sm">Aircraft located</p>
        <h1 className="mt-4 font-display text-3xl leading-tight font-black tracking-tight text-white sm:text-4xl">
          Position confirmed
        </h1>
        <p className="mt-2 font-mono text-lg text-signal" data-coords>
          {reveal.dms}
        </p>
        <p className="mt-1 text-sm text-slate-400">{timeLeft} left on the clock.</p>
      </div>

      <div className="mt-6 overflow-hidden border-2 border-core-600 bg-core-900 shadow-[0_3px_6px_rgb(60_40_10/0.3)]">
        <iframe
          title="Satellite view of the aircraft position"
          src={embed}
          className="h-[26rem] w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
      <p className="mt-2 text-center text-xs text-slate-400">
        Zoom in on the centre of the map.{' '}
        <a className="text-signal underline" href={open} target="_blank" rel="noreferrer">
          Open in Google Maps
        </a>
      </p>

      <section className="mt-6 border border-core-600 border-l-4 border-l-signal bg-core-950 px-5 py-4" data-summary>
        <p className="font-mono text-[0.65rem] tracking-widest text-signal uppercase">What happened</p>
        <div className="mt-2 space-y-2 text-slate-200">
          {reveal.summary.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </section>
      <Confetti />
    </main>
  );
}
