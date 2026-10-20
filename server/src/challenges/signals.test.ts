import { describe, expect, it } from 'vitest';
import {
  CIPHER_METHODS,
  ROLES,
  SIGNAL_BURSTS,
  SIGNAL_CHANNELS,
  SIGNAL_DECODE_PENALTY_SECONDS,
  SIGNAL_SUBMIT_PENALTY_SECONDS,
  SIGNAL_TUNE_PENALTY_SECONDS,
} from '@enigma/shared';
import type { BurstId, CipherMethod, Role } from '@enigma/shared';
import { decode, encode, signalChallenge as sig } from './signals.js';
import type { SignalState } from './signals.js';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 11);

const tune = (s: SignalState, burst: BurstId, channel: number, role: Role = 'ingeniero') =>
  sig.apply(s, role, { kind: 'sig:tune', burst, channel });
const dec = (s: SignalState, burst: BurstId, method: CipherMethod, shift: number, role: Role = 'hacker') =>
  sig.apply(s, role, { kind: 'sig:decode', burst, method, shift });
const submit = (s: SignalState, words: string[], role: Role = 'hacker') =>
  sig.apply(s, role, { kind: 'sig:submit', words });
const tuneAll = (s: SignalState) => s.bursts.reduce((cur, b) => tune(cur, b.id, b.channel).state, s);
const answer = (s: SignalState) => s.order.map((id) => s.bursts.find((b) => b.id === id)!.word);

describe('cifrado', () => {
  it('descifrar deshace cifrar para todos los métodos y desfases', () => {
    for (const method of CIPHER_METHODS) {
      for (let shift = 1; shift <= 25; shift++) {
        expect(decode(encode('REACTOR', method, shift), method, shift)).toBe('REACTOR');
      }
    }
  });

  it('un método o desfase equivocado no recupera la palabra (salvo el desplazamiento equivalente)', () => {
    for (const seed of SEEDS) {
      const s = sig.init(seed);
      for (const b of s.bursts) {
        expect(b.cipher).not.toBe(b.word);
        expect(decode(b.cipher, b.method, b.shift)).toBe(b.word);
        for (const method of CIPHER_METHODS) {
          for (let shift = 0; shift <= 25; shift++) {
            const ok = decode(b.cipher, method, shift) === b.word;
            const isTrue = method === b.method && shift === b.shift;
            // «adelante N» y «atrás 26−N» son el mismo desplazamiento: dan igual resultado.
            const twin =
              (b.method === 'adelante' && method === 'atras' && shift === 26 - b.shift) ||
              (b.method === 'atras' && method === 'adelante' && shift === 26 - b.shift);
            expect(ok).toBe(isTrue || twin);
          }
        }
      }
    }
  });

  it('el espejo refleja A↔Z y el inverso lee al revés', () => {
    expect(encode('AB', 'espejo', 0)).toBe('ZY');
    expect(encode('ABC', 'inverso', 0)).toBe('CBA');
    expect(encode('AZ', 'adelante', 1)).toBe('BA');
    expect(encode('AZ', 'atras', 1)).toBe('ZY');
  });
});

describe('generación', () => {
  it('es determinista por semilla y varía entre semillas', () => {
    expect(sig.init(5)).toEqual(sig.init(5));
    expect(new Set(SEEDS.map((x) => JSON.stringify(sig.init(x).order))).size).toBeGreaterThan(5);
  });

  it('4 ráfagas con palabras y canales distintos; el rumbo cae en la banda de su canal', () => {
    for (const seed of SEEDS) {
      const s = sig.init(seed);
      expect(s.bursts.map((b) => b.id)).toEqual([...SIGNAL_BURSTS]);
      expect(new Set(s.bursts.map((b) => b.word)).size).toBe(4);
      expect(new Set(s.bursts.map((b) => b.channel)).size).toBe(4);
      expect([...s.order].sort()).toEqual([...SIGNAL_BURSTS].sort());
      for (const b of s.bursts) {
        expect(b.channel).toBeGreaterThanOrEqual(1);
        expect(b.channel).toBeLessThanOrEqual(SIGNAL_CHANNELS);
        expect(Math.floor(b.degrees / 40) + 1).toBe(b.channel);
        expect(b.shift).toBeGreaterThanOrEqual(1);
        expect(b.shift).toBeLessThanOrEqual(25);
        expect(b.shift).not.toBe(13);
      }
    }
  });
});

describe('qué ve cada rol', () => {
  const s = sig.init(31);
  const json = (state: SignalState, role: Role) => JSON.stringify(sig.viewFor(state, role));

  it('nadie recibe una palabra en claro antes de terminar', () => {
    for (const role of ROLES) for (const b of s.bursts) expect(json(s, role)).not.toContain(b.word);
  });

  it('cada dato vive en un solo rol', () => {
    const view = (role: Role) => sig.viewFor(s, role);
    expect(view('navegador')).toMatchObject({ bearings: s.bursts.map((b) => ({ burst: b.id, degrees: b.degrees })) });
    expect(view('analista')).toMatchObject({ shifts: s.bursts.map((b) => ({ burst: b.id, shift: b.shift })) });
    expect(view('estratega')).toMatchObject({ order: s.order, tuned: [] });
    const crypto = view('criptografo');
    if (crypto.kind !== 'signal' || crypto.role !== 'criptografo') throw new Error('vista inesperada');
    expect(crypto.bands).toHaveLength(SIGNAL_CHANNELS);
    expect(crypto.methods.map((m) => m.method)).toEqual(s.bursts.map((b) => b.method));
    // Solo el Criptógrafo conoce los métodos y solo el Navegador los rumbos
    for (const role of ROLES.filter((r) => r !== 'navegador')) expect(json(s, role)).not.toContain('degrees');
    for (const role of ROLES.filter((r) => r !== 'analista')) expect(json(s, role)).not.toContain('"shift"');
    for (const role of ROLES.filter((r) => r !== 'criptografo')) expect(json(s, role)).not.toContain('"method"');
    for (const role of ROLES.filter((r) => r !== 'estratega')) expect(json(s, role)).not.toContain('"order"');
  });

  it('el texto cifrado solo le llega al Hacker y después de sintonizar; el canal, solo al Ingeniero y ya sintonizado', () => {
    const b = s.bursts[0];
    expect(json(s, 'hacker')).not.toContain(b.cipher);
    expect(sig.viewFor(s, 'ingeniero')).toMatchObject({ bursts: [{ tuned: false, channel: null }, {}, {}, {}] });
    const tuned = tune(s, b.id, b.channel).state;
    expect(sig.viewFor(tuned, 'hacker')).toMatchObject({
      bursts: [{ burst: b.id, captured: true, cipher: b.cipher }, { captured: false, cipher: null }, {}, {}],
    });
    expect(sig.viewFor(tuned, 'ingeniero')).toMatchObject({ bursts: [{ tuned: true, channel: b.channel }, {}, {}, {}] });
    for (const role of ROLES.filter((r) => r !== 'hacker')) expect(json(tuned, role)).not.toContain(b.cipher);
  });
});

describe('sintonizar', () => {
  const s = sig.init(8);
  const b = s.bursts[1];

  it('el canal correcto captura la ráfaga y no cuesta tiempo', () => {
    const res = tune(s, b.id, b.channel);
    expect(res.error).toBeUndefined();
    expect(res.penaltySeconds ?? 0).toBe(0);
    expect(res.state.tuned).toEqual([b.id]);
    expect(tune(res.state, b.id, b.channel).error?.code).toBe('invalid_action'); // ya sintonizada
  });

  it('un canal equivocado cuesta tiempo y suma un error', () => {
    const wrong = (b.channel % SIGNAL_CHANNELS) + 1;
    const res = tune(s, b.id, wrong);
    expect(res.error?.code).toBe('wrong_value');
    expect(res.penaltySeconds).toBe(SIGNAL_TUNE_PENALTY_SECONDS);
    expect(res.state.mistakes).toBe(1);
    expect(res.state.tuned).toEqual([]);
  });

  it('valida rol, ráfaga y canal', () => {
    for (const role of ROLES.filter((r) => r !== 'ingeniero')) expect(tune(s, b.id, b.channel, role).error?.code).toBe('wrong_role');
    expect(tune(s, 'omega' as BurstId, 1).error?.code).toBe('invalid_action');
    for (const channel of [0, 10, 2.5, NaN]) expect(tune(s, b.id, channel).error?.code).toBe('invalid_action');
  });
});

describe('descifrador del Hacker', () => {
  const s = sig.init(12);
  const b = s.bursts[2];
  const tuned = tune(s, b.id, b.channel).state;

  it('hace falta haber capturado la ráfaga', () => {
    expect(dec(s, b.id, b.method, b.shift).error?.code).toBe('invalid_action');
  });

  it('la primera prueba de cada ráfaga es gratis y las siguientes cuestan', () => {
    const first = dec(tuned, b.id, 'adelante', 3);
    expect(first.penaltySeconds ?? 0).toBe(0);
    expect(first.state.decodes[b.id].last).toMatchObject({ method: 'adelante', shift: 3 });
    const second = dec(first.state, b.id, b.method, b.shift);
    expect(second.penaltySeconds).toBe(SIGNAL_DECODE_PENALTY_SECONDS);
    expect(second.state.decodes[b.id].last?.result).toBe(b.word);
    expect(sig.viewFor(second.state, 'hacker')).toMatchObject({ bursts: [{}, {}, { decodes: 2, last: { result: b.word } }, {}] });
  });

  it('valida rol y parámetros', () => {
    for (const role of ROLES.filter((r) => r !== 'hacker')) expect(dec(tuned, b.id, b.method, b.shift, role).error?.code).toBe('wrong_role');
    expect(dec(tuned, b.id, 'rot13' as CipherMethod, 3).error?.code).toBe('invalid_action');
    for (const shift of [-1, 26, 1.5]) expect(dec(tuned, b.id, b.method, shift).error?.code).toBe('invalid_action');
  });
});

describe('transmitir la clave', () => {
  const s = tuneAll(sig.init(77));

  it('con las 4 palabras en orden se completa el desafío', () => {
    const res = submit(s, answer(s));
    expect(res.error).toBeUndefined();
    expect(sig.isComplete(res.state)).toBe(true);
  });

  it('acepta minúsculas y espacios', () => {
    expect(sig.isComplete(submit(s, answer(s).map((w) => ` ${w.toLowerCase()} `)).state)).toBe(true);
  });

  it('las palabras correctas en orden equivocado se rechazan y se informa cuántas están bien', () => {
    const words = answer(s);
    const swapped = [words[1], words[0], words[2], words[3]];
    const res = submit(s, swapped);
    expect(res.error?.code).toBe('wrong_value');
    expect(res.penaltySeconds).toBe(SIGNAL_SUBMIT_PENALTY_SECONDS);
    expect(res.state.lastCorrect).toBe(2);
    expect(res.state.attempts).toBe(1);
    expect(sig.isComplete(res.state)).toBe(false);
    expect(sig.viewFor(res.state, 'hacker')).toMatchObject({ attempts: 1, lastCorrect: 2 });
  });

  it('valida la forma y el rol, y no acepta más jugadas al terminar', () => {
    expect(submit(s, ['A', 'B']).error?.code).toBe('invalid_action');
    expect(submit(s, ['A', 'B', 'C', '1']).error?.code).toBe('invalid_action');
    for (const role of ROLES.filter((r) => r !== 'hacker')) expect(submit(s, answer(s), role).error?.code).toBe('wrong_role');
    const done = submit(s, answer(s)).state;
    expect(tune(done, 'alfa', 1).error?.code).toBe('invalid_action');
  });

  it('no hace falta sintonizar para transmitir, pero entonces hay que saberlas sin descifrar (el servidor no lo impide)', () => {
    const fresh = sig.init(77);
    expect(sig.isComplete(submit(fresh, answer(fresh)).state)).toBe(true);
  });

  it('el facilitador ve la solución y no se modifica el estado recibido', () => {
    const snapshot = structuredClone(s);
    submit(s, ['X', 'Y', 'Z', 'W']);
    tune(s, 'alfa', 1);
    dec(s, 'alfa', 'adelante', 1);
    expect(s).toEqual(snapshot);
    expect(sig.facilitatorView(s)).toMatchObject({ kind: 'signal', words: answer(s), order: s.order });
  });
});
