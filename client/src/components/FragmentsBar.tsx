import { FRAGMENTS } from '@enigma/shared';
import type { FragmentInfo } from '@enigma/shared';

/** The recovered position fragments, one slot per mission. Everyone sees the same bar. */
export function FragmentsBar({ fragments }: { fragments: FragmentInfo[] }) {
  return (
    <div className="border-b border-core-700 bg-core-950" data-fragments>
      <div className="mx-auto flex max-w-3xl items-center gap-3 overflow-x-auto px-5 py-2">
        <p className="shrink-0 font-mono text-[0.65rem] tracking-widest text-slate-400 uppercase">
          Position fragments
        </p>
        <ul className="flex gap-1.5">
          {FRAGMENTS.map((_, i) => {
            const got = fragments.find((f) => f.challengeId === i + 1);
            return (
              <li
                key={i}
                data-fragment={i + 1}
                data-got={got ? 'yes' : 'no'}
                className={`min-w-14 border px-2 py-0.5 text-center font-mono text-sm ${
                  got
                    ? 'border-signal bg-signal/10 font-bold text-signal'
                    : 'border-dashed border-core-600 text-slate-500'
                }`}
                title={`Mission ${i + 1}`}
              >
                {got ? got.value : '▒▒'}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
