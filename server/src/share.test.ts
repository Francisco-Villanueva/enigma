import { describe, expect, it } from 'vitest';
import {
  SHARE_COOLDOWN_SECONDS,
  SHARE_INITIAL_CREDITS,
  SHARE_MAX_CREDITS,
  SHARE_TIME_PENALTY_SECONDS,
  SHARE_UI_MAX_CHARS,
  SHARE_VOTE_SECONDS,
  TOTAL_SECONDS,
} from '@enigma/shared';
import type { FacilitatorCommand } from '@enigma/shared';
import { GameError, RoomManager } from './rooms.js';
import { beginWithRoles, joinSix } from './test-utils.js';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof GameError) return err.code;
    throw err;
  }
  return undefined;
}

/**
 * Sala jugando el Desafío 1 con un reloj manual. Roles en orden: el navegador es el facilitador.
 * `advance` solo mueve el reloj; el servidor real llama a `tick` cada segundo.
 */
function setup() {
  const clock = { t: 1_000_000 };
  const manager = new RoomManager(() => clock.t);
  const { room, host, players } = joinSix(manager);
  manager.startGame(room.roomId, host.playerId);
  beginWithRoles(manager, room, players, 0);
  const [navegador, analista, criptografo, estratega, ingeniero, hacker] = players;
  const roomId = room.roomId;

  const api = {
    manager,
    room,
    players,
    navegador,
    analista,
    criptografo,
    estratega,
    ingeniero,
    hacker,
    advance: (seconds: number) => {
      clock.t += seconds * 1000;
    },
    share: (p: (typeof players)[number]) => manager.viewFor(room, p.playerId).share,
    remainingMs: () => manager.viewFor(room, host.playerId).timer.remainingMs,
    propose: (by: (typeof players)[number], target: (typeof players)[number]) =>
      manager.proposeShare(roomId, by.playerId, target.playerId),
    vote: (by: (typeof players)[number], choice: 'yes' | 'no') => manager.voteShare(roomId, by.playerId, choice),
    command: (cmd: FacilitatorCommand) => manager.command(roomId, host.playerId, cmd),
    /** Propone y suma «sí» de otros tres: 4 de 6, aprobada. */
    approve: (by: (typeof players)[number], target: (typeof players)[number]) => {
      api.propose(by, target);
      for (const p of players.filter((x) => x !== by).slice(0, 3)) api.vote(p, 'yes');
    },
  };
  return api;
}

describe('transmisión de pantalla: votación', () => {
  it('arranca con 3 créditos, sin votación, sin transmisión y sin espera', () => {
    const g = setup();
    expect(g.share(g.hacker)).toEqual({
      credits: SHARE_INITIAL_CREDITS,
      cooldownMs: 0,
      vote: null,
      broadcast: null,
    });
  });

  it('quien propone cuenta como «sí» y a los 4 votos se aprueba y cobra un crédito', () => {
    const g = setup();
    g.propose(g.analista, g.criptografo);

    expect(g.share(g.hacker).vote).toMatchObject({
      proposedBy: g.analista.playerId,
      target: g.criptografo.playerId,
      yes: 1,
      no: 0,
      needed: 4,
      myVote: null,
      payment: 'credit',
      msLeft: SHARE_VOTE_SECONDS * 1000,
    });
    expect(g.share(g.analista).vote?.myVote).toBe('yes');

    g.vote(g.navegador, 'yes');
    g.vote(g.estratega, 'yes');
    expect(g.share(g.hacker).vote).toMatchObject({ yes: 3 });
    expect(g.share(g.hacker).broadcast).toBeNull();

    g.vote(g.ingeniero, 'yes');
    const after = g.share(g.hacker);
    expect(after.vote).toBeNull();
    expect(after.credits).toBe(SHARE_INITIAL_CREDITS - 1);
    expect(after.broadcast).toMatchObject({
      fromPlayerId: g.criptografo.playerId,
      role: 'criptografo',
      paidWith: 'credit',
      ui: {},
    });
  });

  it('se puede proponer transmitir la propia pantalla', () => {
    const g = setup();
    g.propose(g.analista, g.analista);
    expect(g.share(g.hacker).vote?.target).toBe(g.analista.playerId);
  });

  it('con tres «no» se rechaza sin cobrar y hay que esperar 20 s para volver a proponer', () => {
    const g = setup();
    g.propose(g.analista, g.criptografo);
    g.vote(g.navegador, 'no');
    g.vote(g.estratega, 'no');
    expect(g.share(g.hacker).vote).not.toBeNull();
    g.vote(g.ingeniero, 'no');

    const after = g.share(g.hacker);
    expect(after.vote).toBeNull();
    expect(after.broadcast).toBeNull();
    expect(after.credits).toBe(SHARE_INITIAL_CREDITS);
    expect(after.cooldownMs).toBe(SHARE_COOLDOWN_SECONDS * 1000);

    expect(codeOf(() => g.propose(g.analista, g.criptografo))).toBe('share_cooldown');
    g.advance(SHARE_COOLDOWN_SECONDS - 1);
    expect(codeOf(() => g.propose(g.analista, g.criptografo))).toBe('share_cooldown');
    g.advance(2);
    expect(g.share(g.hacker).cooldownMs).toBe(0);
    expect(codeOf(() => g.propose(g.analista, g.criptografo))).toBeUndefined();
  });

  it('una votación sin mayoría se vence a los 15 s y cuenta como rechazada', () => {
    const g = setup();
    g.propose(g.analista, g.criptografo);
    g.vote(g.navegador, 'yes');
    g.advance(SHARE_VOTE_SECONDS + 1);

    expect(g.manager.tick()).toContain(g.room);
    const after = g.share(g.hacker);
    expect(after.vote).toBeNull();
    expect(after.broadcast).toBeNull();
    expect(after.credits).toBe(SHARE_INITIAL_CREDITS);
    expect(after.cooldownMs).toBe(SHARE_COOLDOWN_SECONDS * 1000);
  });

  it('no se vota dos veces, ni sin votación, ni con un voto inventado', () => {
    const g = setup();
    expect(codeOf(() => g.vote(g.hacker, 'yes'))).toBe('wrong_phase');

    g.propose(g.analista, g.criptografo);
    expect(codeOf(() => g.vote(g.analista, 'yes'))).toBe('already_voted');
    g.vote(g.estratega, 'yes');
    expect(codeOf(() => g.vote(g.estratega, 'no'))).toBe('already_voted');
    expect(codeOf(() => g.manager.voteShare(g.room.roomId, g.hacker.playerId, 'maybe'))).toBe('invalid_action');
  });

  it('solo una votación o transmisión a la vez', () => {
    const g = setup();
    g.propose(g.analista, g.criptografo);
    expect(codeOf(() => g.propose(g.estratega, g.hacker))).toBe('share_busy');

    for (const p of [g.navegador, g.estratega, g.ingeniero]) g.vote(p, 'yes');
    expect(g.share(g.hacker).broadcast).not.toBeNull();
    expect(codeOf(() => g.propose(g.estratega, g.hacker))).toBe('share_busy');
  });

  it('rechaza objetivos inválidos y propuestas fuera de un desafío en juego', () => {
    const g = setup();
    expect(codeOf(() => g.manager.proposeShare(g.room.roomId, g.hacker.playerId, 'nadie'))).toBe('invalid_target');
    expect(codeOf(() => g.manager.proposeShare(g.room.roomId, g.hacker.playerId, 42))).toBe('invalid_target');

    const lobbyManager = new RoomManager();
    const { room, host, players } = joinSix(lobbyManager);
    expect(codeOf(() => lobbyManager.proposeShare(room.roomId, host.playerId, players[1].playerId))).toBe('wrong_phase');
    lobbyManager.startGame(room.roomId, host.playerId); // briefing
    expect(codeOf(() => lobbyManager.proposeShare(room.roomId, host.playerId, players[1].playerId))).toBe('wrong_phase');
  });
});

describe('transmisión de pantalla: qué ve cada uno', () => {
  it('los demás reciben exactamente la vista del rol del emisor; el emisor no recibe copia', () => {
    const g = setup();
    g.approve(g.analista, g.criptografo);

    const sender = g.manager.viewFor(g.room, g.criptografo.playerId);
    const viewer = g.manager.viewFor(g.room, g.hacker.playerId);

    expect(sender.share.broadcast?.view).toBeNull();
    expect(viewer.share.broadcast?.view).toEqual(sender.challenge?.view);
    // Su propio panel no cambia: sigue siendo el del Hacker.
    expect(viewer.challenge?.view).not.toEqual(sender.challenge?.view);
    expect(viewer.challenge?.view).toMatchObject({ role: 'hacker' });
  });

  it('el espejo se actualiza cuando el emisor actúa', () => {
    const g = setup();
    g.approve(g.criptografo, g.analista);

    const mirrored = () => {
      const view = g.share(g.hacker).broadcast?.view;
      if (view?.kind !== 'core' || view.role !== 'analista') throw new Error('se esperaba la vista del Analista');
      return view;
    };
    expect(mirrored().shared).toEqual([]);

    g.manager.applyAction(g.room.roomId, g.analista.playerId, { kind: 'core:share', reactor: 3 });
    expect(mirrored().shared).toEqual([3]);
  });

  it('quien vota o mira no ve el voto de otro: cada uno ve el suyo', () => {
    const g = setup();
    g.propose(g.analista, g.criptografo);
    g.vote(g.estratega, 'no');
    expect(g.share(g.estratega).vote?.myVote).toBe('no');
    expect(g.share(g.hacker).vote?.myVote).toBeNull();
    expect(g.share(g.hacker).vote).toMatchObject({ yes: 1, no: 1 });
  });
});

describe('transmisión de pantalla: cobro', () => {
  it('los tres créditos alcanzan para tres transmisiones; la cuarta cuesta 20 s', () => {
    const g = setup();
    for (let i = 0; i < SHARE_INITIAL_CREDITS; i++) {
      g.approve(g.analista, g.criptografo);
      expect(g.share(g.hacker).broadcast?.paidWith).toBe('credit');
      g.command({ type: 'share:cancel' });
    }
    expect(g.share(g.hacker)).toMatchObject({ credits: 0, broadcast: null });
    // No hubo cobro en tiempo: lo único que pasó es el reloj de la partida.
    const before = g.remainingMs();

    g.propose(g.analista, g.criptografo);
    expect(g.share(g.hacker).vote?.payment).toBe('time');
    for (const p of [g.navegador, g.estratega, g.ingeniero]) g.vote(p, 'yes');

    expect(g.share(g.hacker).broadcast?.paidWith).toBe('time');
    expect(g.remainingMs()).toBe(before - SHARE_TIME_PENALTY_SECONDS * 1000);
  });

  it('sin créditos no se puede pagar con tiempo si eso terminaría la partida', () => {
    const g = setup();
    g.command({ type: 'share:credits', delta: -SHARE_INITIAL_CREDITS });
    expect(g.share(g.hacker).credits).toBe(0);

    g.advance(TOTAL_SECONDS - (SHARE_TIME_PENALTY_SECONDS + 1)); // quedan 21 s
    g.propose(g.analista, g.criptografo);
    g.command({ type: 'share:cancel' });

    g.advance(2); // quedan 19 s
    expect(codeOf(() => g.propose(g.analista, g.criptografo))).toBe('share_no_budget');
  });

  it('con créditos se puede proponer aunque queden pocos segundos', () => {
    const g = setup();
    g.advance(TOTAL_SECONDS - 5);
    expect(codeOf(() => g.propose(g.analista, g.criptografo))).toBeUndefined();
  });
});

describe('transmisión de pantalla: duración, pausa y cortes', () => {
  it('la transmisión no tiene límite de tiempo: sigue hasta que termina el desafío', () => {
    const g = setup();
    g.approve(g.analista, g.criptografo);

    g.advance(600);
    g.manager.tick();
    expect(g.share(g.hacker).broadcast).not.toBeNull();
    // Mientras está en vivo no se puede abrir otra votación.
    expect(codeOf(() => g.propose(g.analista, g.hacker))).toBe('share_busy');
    // Al cortarla el facilitador, se puede proponer de nuevo enseguida.
    g.command({ type: 'share:cancel' });
    expect(g.share(g.hacker).broadcast).toBeNull();
    expect(g.share(g.hacker).cooldownMs).toBe(0);
  });

  it('la pausa del facilitador congela la votación y la espera, y no corta la transmisión', () => {
    const g = setup();

    g.propose(g.analista, g.criptografo);
    g.advance(5);
    g.command({ type: 'pause' });
    g.advance(60);
    expect(g.share(g.hacker).vote?.msLeft).toBe((SHARE_VOTE_SECONDS - 5) * 1000);
    expect(codeOf(() => g.vote(g.estratega, 'yes'))).toBe('wrong_phase');
    g.command({ type: 'resume' });
    g.advance(SHARE_VOTE_SECONDS - 6);
    expect(g.share(g.hacker).vote).not.toBeNull();
    g.advance(2);
    expect(g.share(g.hacker).vote).toBeNull();

    // Espera congelada también.
    g.command({ type: 'pause' });
    g.advance(60);
    expect(g.share(g.hacker).cooldownMs).toBe(SHARE_COOLDOWN_SECONDS * 1000);
    g.command({ type: 'resume' });

    g.advance(SHARE_COOLDOWN_SECONDS + 1);
    g.approve(g.analista, g.criptografo);
    g.command({ type: 'pause' });
    expect(codeOf(() => g.propose(g.analista, g.hacker))).toBe('wrong_phase');
    g.command({ type: 'resume' });
    expect(g.share(g.hacker).broadcast).not.toBeNull();
  });

  it('si se desconecta el emisor, la transmisión se corta y no se devuelve el crédito', () => {
    const g = setup();
    g.approve(g.analista, g.criptografo);
    g.manager.setConnected(g.room.roomId, g.criptografo.playerId, false);

    const after = g.share(g.hacker);
    expect(after.broadcast).toBeNull();
    expect(after.credits).toBe(SHARE_INITIAL_CREDITS - 1);
  });

  it('si se desconecta quien iba a transmitir, la votación se cancela sin espera', () => {
    const g = setup();
    g.propose(g.analista, g.criptografo);
    g.manager.setConnected(g.room.roomId, g.criptografo.playerId, false);

    expect(g.share(g.hacker)).toMatchObject({ vote: null, cooldownMs: 0 });
    expect(codeOf(() => g.propose(g.analista, g.criptografo))).toBe('invalid_target');
  });

  it('al completar el desafío se cierra todo y los créditos se conservan', () => {
    const g = setup();
    g.approve(g.analista, g.criptografo);
    g.command({ type: 'skip' });

    expect(g.room.status).toBe('transition');
    expect(g.share(g.hacker)).toEqual({
      credits: SHARE_INITIAL_CREDITS - 1,
      cooldownMs: 0,
      vote: null,
      broadcast: null,
    });
  });

  it('si se acaba el tiempo todo se cierra, y «volver a jugar» devuelve los 3 créditos', () => {
    const g = setup();
    g.approve(g.analista, g.criptografo);
    g.advance(TOTAL_SECONDS + 1);
    g.manager.tick();

    expect(g.room.status).toBe('lost');
    expect(g.share(g.hacker)).toMatchObject({ vote: null, broadcast: null, credits: SHARE_INITIAL_CREDITS - 1 });

    g.command({ type: 'replay' });
    expect(g.room.status).toBe('briefing');
    expect(g.share(g.hacker).credits).toBe(SHARE_INITIAL_CREDITS);
  });
});

describe('transmisión de pantalla: facilitador', () => {
  it('solo el facilitador puede cancelar o ajustar créditos', () => {
    const g = setup();
    const asPlayer = (cmd: FacilitatorCommand) => g.manager.command(g.room.roomId, g.analista.playerId, cmd);
    expect(codeOf(() => asPlayer({ type: 'share:cancel' }))).toBe('not_facilitator');
    expect(codeOf(() => asPlayer({ type: 'share:credits', delta: 1 }))).toBe('not_facilitator');
  });

  it('cancela una votación (sin espera) o una transmisión (sin devolver el crédito)', () => {
    const g = setup();
    expect(codeOf(() => g.command({ type: 'share:cancel' }))).toBe('invalid_command');

    g.propose(g.analista, g.criptografo);
    g.command({ type: 'share:cancel' });
    expect(g.share(g.hacker)).toMatchObject({ vote: null, cooldownMs: 0, credits: SHARE_INITIAL_CREDITS });

    g.approve(g.analista, g.criptografo);
    g.command({ type: 'share:cancel' });
    expect(g.share(g.hacker)).toMatchObject({ broadcast: null, credits: SHARE_INITIAL_CREDITS - 1 });
  });

  it('suma y resta créditos dentro de los límites', () => {
    const g = setup();
    g.command({ type: 'share:credits', delta: 1 });
    expect(g.share(g.hacker).credits).toBe(SHARE_INITIAL_CREDITS + 1);

    g.command({ type: 'share:credits', delta: SHARE_MAX_CREDITS });
    expect(g.share(g.hacker).credits).toBe(SHARE_MAX_CREDITS);

    g.command({ type: 'share:credits', delta: -SHARE_MAX_CREDITS });
    expect(g.share(g.hacker).credits).toBe(0);

    for (const delta of [0, 1.5, SHARE_MAX_CREDITS + 1, Number.NaN]) {
      expect(codeOf(() => g.command({ type: 'share:credits', delta }))).toBe('invalid_command');
    }
  });
});

describe('transmisión de pantalla: estado de pantalla del emisor (espejo)', () => {
  it('el emisor publica su estado y los espectadores lo reciben; él no', () => {
    const g = setup();
    g.approve(g.analista, g.criptografo);
    expect(g.share(g.hacker).broadcast?.ui).toEqual({});

    g.manager.updateShareUi(g.room.roomId, g.criptografo.playerId, { 'nav.notes': ['a', 'b'], sel: 3 });
    expect(g.share(g.hacker).broadcast?.ui).toEqual({ 'nav.notes': ['a', 'b'], sel: 3 });
    expect(g.share(g.analista).broadcast?.ui).toEqual({ 'nav.notes': ['a', 'b'], sel: 3 });
    expect(g.share(g.criptografo).broadcast?.ui).toEqual({});
  });

  it('solo el emisor puede publicar, y solo mientras transmite', () => {
    const g = setup();
    expect(codeOf(() => g.manager.updateShareUi(g.room.roomId, g.criptografo.playerId, {}))).toBe('wrong_phase');
    g.approve(g.analista, g.criptografo);
    expect(codeOf(() => g.manager.updateShareUi(g.room.roomId, g.hacker.playerId, { x: 1 }))).toBe('wrong_phase');
    expect(g.share(g.hacker).broadcast?.ui).toEqual({});
  });

  it('rechaza lo que no es un objeto o es demasiado grande', () => {
    const g = setup();
    g.approve(g.analista, g.criptografo);
    const send = (ui: unknown) => codeOf(() => g.manager.updateShareUi(g.room.roomId, g.criptografo.playerId, ui));
    expect(send('hola')).toBe('invalid_action');
    expect(send(null)).toBe('invalid_action');
    expect(send([1, 2])).toBe('invalid_action');
    expect(send({ big: 'x'.repeat(SHARE_UI_MAX_CHARS) })).toBe('invalid_action');
    expect(g.share(g.hacker).broadcast?.ui).toEqual({});
  });

  it('cada transmisión nueva arranca con el estado vacío', () => {
    const g = setup();
    g.approve(g.analista, g.criptografo);
    g.manager.updateShareUi(g.room.roomId, g.criptografo.playerId, { x: 1 });
    g.command({ type: 'share:cancel' });
    g.approve(g.analista, g.criptografo);
    expect(g.share(g.hacker).broadcast?.ui).toEqual({});
  });
});
