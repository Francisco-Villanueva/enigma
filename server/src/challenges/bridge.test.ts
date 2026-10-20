import { describe, expect, it } from 'vitest';
import { BRIDGE_CATEGORY, ROLES } from '@enigma/shared';
import { bridgeChallenge as b } from './bridge.js';
import { RIDDLES } from './bridge-riddles.js';
import type { BridgeState } from './bridge.js';

const step = (s: BridgeState, side: 'L' | 'R', role: any = 'estratega') => b.apply(s, role, { kind: 'bridge:step', side }, undefined, 0);
const other = (side: 'L' | 'R') => (side === 'L' ? 'R' : 'L');
const view = (s: BridgeState, role: any): any => b.viewFor(s, role);

describe('El banco de acertijos', () => {
  it('tiene 5 acertijos por categoría, completos y sin repetir', () => {
    const texts = new Set<string>();
    for (const role of ROLES) {
      expect(RIDDLES[role]).toHaveLength(5);
      for (const r of RIDDLES[role]) {
        expect(r.text.length).toBeGreaterThan(10);
        expect(r.answer).not.toBe(r.wrong);
        expect(r.hint.length).toBeGreaterThan(10);
        expect(r.explanation.length).toBeGreaterThan(10);
        expect(r.hint).not.toContain(r.answer);
        texts.add(r.text);
      }
    }
    expect(texts.size).toBe(30);
  });

  it('incluye el acertijo de las iniciales del equipo', () => {
    const r = RIDDLES.criptografo.find((x) => x.text.includes('F, L, S, F, R'))!;
    expect(r.answer).toBe('A');
  });
});

describe('El Puente de Cristal', () => {
  const s0 = b.init(5);

  it('cada fila es de una categoría distinta y es determinista', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = b.init(seed);
      expect(b.init(seed)).toEqual(s);
      expect(new Set(s.rows.map((r) => r.category)).size).toBe(6);
    }
  });

  it('todos ven el acertijo actual con sus dos opciones, y nadie ve la respuesta', () => {
    const row = s0.rows[0];
    const right = RIDDLES[row.category][row.riddle];
    for (const role of ROLES) {
      const v = view(s0, role);
      expect(v.riddle).toMatchObject({ row: 1, text: right.text, category: BRIDGE_CATEGORY[row.category] });
      expect([v.riddle.left, v.riddle.right].sort()).toEqual([right.answer, right.wrong].sort());
      expect(JSON.stringify(v)).not.toContain(right.explanation);
      expect(JSON.stringify(v)).not.toContain('"safe"');
    }
  });

  it('solo el especialista de la categoría ve la pista, y solo en su turno', () => {
    const row = s0.rows[0];
    const hint = RIDDLES[row.category][row.riddle].hint;
    for (const role of ROLES) {
      expect(view(s0, role).hint).toBe(role === row.category ? hint : null);
      expect(view(s0, role).specialty).toBe(BRIDGE_CATEGORY[role]);
    }
    // En la fila siguiente la tiene otro rol.
    const s1 = step(s0, row.safe).state;
    const next = s1.rows[1];
    expect(view(s1, row.category).hint).toBeNull();
    expect(view(s1, next.category).hint).toBe(RIDDLES[next.category][next.riddle].hint);
  });

  it('acertar muestra la explicación a todos y pasa a la siguiente fila', () => {
    const row = s0.rows[0];
    const r = step(s0, row.safe);
    expect(r.error).toBeUndefined();
    for (const role of ROLES) {
      expect(view(r.state, role).solved).toEqual({
        row: 1,
        answer: RIDDLES[row.category][row.riddle].answer,
        explanation: RIDDLES[row.category][row.riddle].explanation,
      });
      expect(view(r.state, role).riddle.row).toBe(2);
    }
  });

  it('cruzar el puente resolviendo los seis acertijos', () => {
    let s = s0;
    for (const row of s0.rows) s = step(s, row.safe).state;
    expect(b.isComplete(s)).toBe(true);
    expect(view(s, 'hacker').riddle).toBeNull();
  });

  it('una baldosa falsa suma un error, se rompe y no avanza', () => {
    const wrong = other(s0.rows[0].safe);
    const r = step(s0, wrong);
    expect(r.error?.message).toMatch(/Mistakes: 1\/2/);
    expect(r.state).toMatchObject({ strikes: 1, crossed: 0, cracked: [wrong] });
  });

  it('el segundo error reinicia en silencio, con acertijos nuevos de cada categoría', () => {
    let s = step(s0, other(s0.rows[0].safe)).state;
    const r = step(s, other(s.rows[0].safe));
    expect(r.error).toBeUndefined();
    expect(r.state).toMatchObject({ attempt: 2, strikes: 0, crossed: 0, cracked: [], solved: null });
    for (const role of ROLES) {
      const before = s0.rows.find((x) => x.category === role)!.riddle;
      const after = r.state.rows.find((x) => x.category === role)!.riddle;
      expect(after).not.toBe(before);
    }
  });

  it('todos ven los errores y el avance', () => {
    for (const role of ROLES) {
      expect(view(s0, role)).toMatchObject({ kind: 'bridge', role, strikes: 0, maxStrikes: 2, crossed: 0, rows: 6, attempt: 1 });
    }
  });

  it('solo el Estratega pisa', () => {
    expect(step(s0, 'L', 'hacker').error?.code).toBe('wrong_role');
  });
});
