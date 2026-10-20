import { describe, expect, it } from 'vitest';
import { BOMB_COLORS, BOMB_SECONDS, ROLES } from '@enigma/shared';
import { bombChallenge as b } from './bomb.js';
import type { BombState } from './bomb.js';

const S = 1000;
const run = (s: BombState, role: any, action: any, t = 0) => b.apply(s, role, action, undefined, t);
const unlock = (s: BombState) => run(s, 'hacker', { kind: 'bomb:unlock', pin: s.pin }).state;
const wrongCable = (s: BombState) => [1, 2, 3, 4, 5, 6].find((p) => p !== s.solution[s.cuts.length])!;

describe('La Bomba', () => {
  const s0 = b.init(3);

  it('es determinista y tiene solución única según las pistas de cada rol', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const s = b.init(seed);
      expect(b.init(seed)).toEqual(s);
      expect([...s.layout].sort()).toEqual([...BOMB_COLORS].sort());
      expect(s.decoys).toHaveLength(2);
      const byRanking = s.ranking.filter((c) => !s.decoys.includes(c)).map((c) => s.layout.indexOf(c) + 1);
      expect(s.solution).toEqual(byRanking);
      expect(s.solution).toHaveLength(4);
      expect(s.pin).toHaveLength(3);
      expect(s.pinSymbols.map((sym) => s.symbolDigit[sym]).join('')).toBe(s.pin);
    }
  });

  it('el panel bloqueado no deja cortar; el PIN errado cuesta 5 s', () => {
    expect(run(s0, 'ingeniero', { kind: 'bomb:cut', position: s0.solution[0] }).error).toBeDefined();
    const bad = run(s0, 'hacker', { kind: 'bomb:unlock', pin: '000' });
    expect(bad.penaltySeconds).toBe(5);
    expect(bad.state.unlocked).toBe(false);
    expect(unlock(s0).unlocked).toBe(true);
  });

  it('desactivar la bomba cortando en orden', () => {
    let s = unlock(s0);
    for (const p of s.solution) {
      const r = run(s, 'ingeniero', { kind: 'bomb:cut', position: p });
      expect(r.error).toBeUndefined();
      s = r.state;
    }
    expect(b.isComplete(s)).toBe(true);
  });

  it('un corte equivocado suma un error y el cable no se corta', () => {
    const s = unlock(s0);
    const r = run(s, 'ingeniero', { kind: 'bomb:cut', position: wrongCable(s) });
    expect(r.error?.message).toMatch(/Mistakes: 1\/3/);
    expect(r.state.strikes).toBe(1);
    expect(r.state.cuts).toEqual([]);
  });

  it('el tercer error reinicia en silencio con el mismo cableado', () => {
    let s = unlock(s0);
    for (let i = 0; i < 2; i++) s = run(s, 'ingeniero', { kind: 'bomb:cut', position: wrongCable(s) }, 7 * S).state;
    const r = run(s, 'ingeniero', { kind: 'bomb:cut', position: wrongCable(s) }, 7 * S);
    expect(r.error).toBeUndefined();
    expect(r.state).toMatchObject({ attempt: 2, strikes: 0, unlocked: false, cuts: [], startMs: 7 * S });
    expect(r.state.layout).toEqual(s0.layout);
    expect(r.state.pin).toBe(s0.pin);
  });

  it('al agotarse el reloj se reinicia, y antes no', () => {
    expect(b.advance!(s0, BOMB_SECONDS * S - 1)).toBe(s0);
    const r = b.advance!(unlock(s0), BOMB_SECONDS * S);
    expect(r.attempt).toBe(2);
    expect(r.unlocked).toBe(false);
    const v: any = b.viewFor(r, 'estratega', undefined, BOMB_SECONDS * S + 30 * S);
    expect(v.leftMs).toBe((BOMB_SECONDS - 30) * S);
  });

  it('todos los roles ven el reloj y los errores', () => {
    for (const role of ROLES) {
      expect(b.viewFor(s0, role, undefined, 20 * S)).toMatchObject({
        kind: 'bomb', role, leftMs: (BOMB_SECONDS - 20) * S, strikes: 0, maxStrikes: 3, attempt: 1, unlocked: false,
      });
    }
  });

  it('nadie ve datos de otro rol', () => {
    const json = (role: any) => JSON.stringify(b.viewFor(s0, role, undefined, 0));
    expect(json('ingeniero')).not.toContain('color');
    expect(json('ingeniero')).not.toContain(s0.pin);
    expect(json('navegador')).not.toContain('decoys');
    expect(json('navegador')).not.toContain('ranking');
    expect(json('analista')).not.toContain('"cables"');
    expect(json('estratega')).not.toContain('"cables"');
    expect(json('criptografo')).not.toContain('"table"');
    expect(json('hacker')).not.toContain('"pin"');
    expect(json('hacker')).not.toContain('decoys');
  });

  it('cada acción tiene dueño', () => {
    expect(run(s0, 'ingeniero', { kind: 'bomb:unlock', pin: s0.pin }).error?.code).toBe('wrong_role');
    expect(run(unlock(s0), 'hacker', { kind: 'bomb:cut', position: 1 }).error?.code).toBe('wrong_role');
  });
});
