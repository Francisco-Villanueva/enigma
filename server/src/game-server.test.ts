import type { AddressInfo } from 'node:net';
import { io as connect } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROLES } from '@enigma/shared';
import type {
  Ack,
  ClientToServerEvents,
  JoinedInfo,
  RoomState,
  ServerToClientEvents,
} from '@enigma/shared';
import { sandboxChallenge } from './challenges/sandbox.js';
import { createGameServer } from './game-server.js';
import type { GameServer } from './game-server.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: GameServer;
let url: string;
const clients: Client[] = [];

beforeEach(async () => {
  // Se prueba el motor con el desafío mínimo; el Desafío 1 tiene su propio archivo de tests.
  server = createGameServer({ challenges: [sandboxChallenge] });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  await server.close();
});

function newClient(): Client {
  const c: Client = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  return c;
}

/** Último estado recibido por un cliente. */
function track(c: Client): { latest: () => RoomState | undefined } {
  let state: RoomState | undefined;
  c.on('room:state', (s) => {
    state = s;
  });
  return { latest: () => state };
}

function emitAck<T extends object = object>(
  fn: (cb: (a: Ack<T>) => void) => void,
): Promise<Ack<T>> {
  return new Promise((resolve) => fn(resolve));
}

async function waitFor<T>(read: () => T | undefined | false, ms = 2000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error('timeout esperando el estado');
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function createAndJoinSix() {
  const names = ['Nico', 'Sofia', 'Mateo', 'Lucia', 'Fran', 'Valen'];
  const sockets = names.map(() => newClient());
  const views = sockets.map(track);

  const created = await emitAck<JoinedInfo>((cb) => sockets[0].emit('room:create', { name: names[0] }, cb));
  if (!created.ok) throw new Error('no se pudo crear');
  const joined: JoinedInfo[] = [created];
  for (let i = 1; i < 6; i++) {
    const res = await emitAck<JoinedInfo>((cb) =>
      sockets[i].emit('room:join', { roomId: created.roomId, name: names[i] }, cb),
    );
    if (!res.ok) throw new Error(`no se pudo unir ${names[i]}: ${res.message}`);
    joined.push(res);
  }
  return { sockets, views, joined, roomId: created.roomId };
}

describe('servidor de juego', () => {
  it('6 jugadores entran, eligen rol y el facilitador inicia la partida', async () => {
    const { sockets, views } = await createAndJoinSix();

    const early = await emitAck((cb) => sockets[1].emit('game:start', cb));
    expect(early).toMatchObject({ ok: false, error: 'not_facilitator' });

    const started = await emitAck((cb) => sockets[0].emit('game:start', cb));
    expect(started.ok).toBe(true);
    for (const v of views) {
      const state = await waitFor(() => v.latest()?.status === 'briefing' && v.latest());
      expect(state.briefing?.challengeId).toBe(1);
      expect(state.challenge).toBeNull();
    }

    for (let i = 0; i < 6; i++) {
      const res = await emitAck((cb) => sockets[i].emit('role:pick', { role: ROLES[i] }, cb));
      expect(res.ok).toBe(true);
    }
    const tooSoon = await emitAck((cb) => sockets[1].emit('facilitator:command', { type: 'begin' }, cb));
    expect(tooSoon).toMatchObject({ ok: false, error: 'not_facilitator' });
    const begun = await emitAck((cb) => sockets[0].emit('facilitator:command', { type: 'begin' }, cb));
    expect(begun.ok).toBe(true);

    for (let i = 0; i < 6; i++) {
      const state = await waitFor(() => views[i].latest()?.status === 'playing' && views[i].latest());
      expect(state.you.role).toBe(ROLES[i]);
      expect(state.you.isFacilitator).toBe(i === 0);
      expect(state.players).toHaveLength(6);
      expect(state.currentChallenge).toBe(1);
    }
  });

  it('dos personas no pueden tomar el mismo rol', async () => {
    const { sockets } = await createAndJoinSix();
    await emitAck((cb) => sockets[0].emit('game:start', cb));
    expect((await emitAck((cb) => sockets[0].emit('role:pick', { role: 'hacker' }, cb))).ok).toBe(true);
    const clash = await emitAck((cb) => sockets[1].emit('role:pick', { role: 'hacker' }, cb));
    expect(clash).toMatchObject({ ok: false, error: 'role_taken' });
  });

  it('un código inexistente devuelve error claro', async () => {
    const c = newClient();
    const res = await emitAck<JoinedInfo>((cb) => c.emit('room:join', { roomId: 'ZZZZ', name: 'Ana' }, cb));
    expect(res).toMatchObject({ ok: false, error: 'room_not_found' });
  });

  it('el jugador que se cae vuelve con su playerId y conserva su rol', async () => {
    const { sockets, views, joined, roomId } = await createAndJoinSix();
    await emitAck((cb) => sockets[0].emit('game:start', cb));
    await emitAck((cb) => sockets[2].emit('role:pick', { role: 'criptografo' }, cb));

    // El jugador 2 pierde la conexión.
    sockets[2].disconnect();
    await waitFor(() => {
      const me = views[0].latest()?.players.find((p) => p.playerId === joined[2].playerId);
      return me?.connected === false && me;
    });

    // Vuelve con un socket nuevo (como una recarga de página).
    const back = newClient();
    const backView = track(back);
    const res = await emitAck<JoinedInfo>((cb) =>
      back.emit('room:rejoin', { roomId, playerId: joined[2].playerId }, cb),
    );
    expect(res.ok).toBe(true);

    const state = await waitFor(() => backView.latest());
    expect(state.you.role).toBe('criptografo');
    await waitFor(() => {
      const me = views[0].latest()?.players.find((p) => p.playerId === joined[2].playerId);
      return me?.connected === true && me;
    });
  });

  it('rejoin con un playerId desconocido falla', async () => {
    const { roomId } = await createAndJoinSix();
    const c = newClient();
    const res = await emitAck<JoinedInfo>((cb) => c.emit('room:rejoin', { roomId, playerId: 'nope' }, cb));
    expect(res).toMatchObject({ ok: false, error: 'unknown_player' });
  });

  it('si el mismo jugador abre otra pestaña, la anterior se cierra', async () => {
    const { sockets, joined, roomId } = await createAndJoinSix();
    const second = newClient();
    track(second);
    const res = await emitAck<JoinedInfo>((cb) =>
      second.emit('room:rejoin', { roomId, playerId: joined[1].playerId }, cb),
    );
    expect(res.ok).toBe(true);
    await waitFor(() => !sockets[1].connected);
    expect(second.connected).toBe(true);
  });
});

describe('partida completa por sockets', () => {
  async function startedGame() {
    const game = await createAndJoinSix();
    await emitAck((cb) => game.sockets[0].emit('game:start', cb));
    for (let i = 0; i < 6; i++) {
      await emitAck((cb) => game.sockets[i].emit('role:pick', { role: ROLES[i] }, cb));
    }
    await emitAck((cb) => game.sockets[0].emit('facilitator:command', { type: 'begin' }, cb));
    const playing = await Promise.all(
      game.views.map((v) => waitFor(() => v.latest()?.status === 'playing' && v.latest())),
    );
    return { ...game, playing };
  }

  /** El código se arma con el dígito de cada rol, en el orden de los roles. */
  function codeFrom(views: ReturnType<typeof track>[]): string {
    return views
      .map((v) => {
        const view = v.latest()?.challenge?.view;
        if (!view || view.kind !== 'sandbox') throw new Error('sin vista');
        return view.digit;
      })
      .join('');
  }

  it('cada jugador recibe solo su dígito; el Hacker lo arma y todos ven la victoria', async () => {
    const { sockets, views, playing } = await startedGame();

    for (const state of playing) {
      expect(state.challenge?.name).toBeTruthy();
      expect(state.timer.running).toBe(true);
    }
    // Solo el facilitador (jugador 0) recibe la solución.
    expect(views[0].latest()?.facilitatorView).not.toBeNull();
    for (let i = 1; i < 6; i++) expect(views[i].latest()?.facilitatorView).toBeNull();

    const code = codeFrom(views);
    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await emitAck((cb) => sockets[5].emit('challenge:action', { kind: 'sandbox:submit', code: wrong }, cb));
    expect(bad).toMatchObject({ ok: false, error: 'wrong_code' });
    await waitFor(() => {
      const view = views[5].latest()?.challenge?.view;
      return view?.kind === 'sandbox' && view.attempts === 1;
    });

    const good = await emitAck((cb) => sockets[5].emit('challenge:action', { kind: 'sandbox:submit', code }, cb));
    expect(good.ok).toBe(true);
    for (const v of views) await waitFor(() => v.latest()?.status === 'won');
  });

  it('el facilitador pausa, manda una pista a todos y los demás no pueden hacerlo', async () => {
    const { sockets, views } = await startedGame();

    const denied = await emitAck((cb) => sockets[3].emit('facilitator:command', { type: 'pause' }, cb));
    expect(denied).toMatchObject({ ok: false, error: 'not_facilitator' });

    const paused = await emitAck((cb) => sockets[0].emit('facilitator:command', { type: 'pause' }, cb));
    expect(paused.ok).toBe(true);
    for (const v of views) {
      const state = await waitFor(() => v.latest()?.status === 'paused' && v.latest());
      expect(state.timer.running).toBe(false);
    }

    await emitAck((cb) => sockets[0].emit('facilitator:command', { type: 'hint', text: 'Hablen de a uno' }, cb));
    for (const v of views) await waitFor(() => v.latest()?.hint?.text === 'Hablen de a uno');
  });

  it('la transmisión de pantalla viaja por sockets: propuesta, votos y vista del emisor para los demás', async () => {
    const { sockets, views } = await startedGame();

    const early = await emitAck((cb) => sockets[1].emit('share:vote', { vote: 'yes' }, cb));
    expect(early).toMatchObject({ ok: false, error: 'wrong_phase' });

    const target = views[2].latest()?.you.playerId;
    if (!target) throw new Error('sin estado');
    const proposed = await emitAck((cb) => sockets[1].emit('share:propose', { target }, cb));
    expect(proposed.ok).toBe(true);
    for (const v of views) await waitFor(() => v.latest()?.share.vote?.yes === 1 && v.latest());

    for (const i of [0, 3, 4]) {
      const res = await emitAck((cb) => sockets[i].emit('share:vote', { vote: 'yes' }, cb));
      expect(res.ok).toBe(true);
    }
    for (const v of views) await waitFor(() => v.latest()?.share.broadcast && v.latest());

    const sender = views[2].latest();
    const viewer = views[5].latest();
    // El emisor no recibe copia de su propia vista; los demás sí, y solo la de su rol.
    expect(sender?.share.broadcast?.view).toBeNull();
    expect(viewer?.share.broadcast).toMatchObject({ fromPlayerId: target, role: ROLES[2] });
    expect(viewer?.share.broadcast?.view).toEqual(sender?.challenge?.view);
    expect(viewer?.share.credits).toBe(2);

    // El emisor publica el estado de su pantalla y los espectadores lo reciben; un espectador no puede.
    const intruder = await emitAck((cb) => sockets[5].emit('share:ui', { ui: { x: 1 } }, cb));
    expect(intruder).toMatchObject({ ok: false, error: 'wrong_phase' });
    const published = await emitAck((cb) => sockets[2].emit('share:ui', { ui: { 'nav.notes': { '1,1': 'mine' } } }, cb));
    expect(published.ok).toBe(true);
    await waitFor(() => views[5].latest()?.share.broadcast?.ui['nav.notes'] && views[5].latest());
    expect(views[5].latest()?.share.broadcast?.ui).toEqual({ 'nav.notes': { '1,1': 'mine' } });
    expect(views[2].latest()?.share.broadcast?.ui).toEqual({});

    // El facilitador la corta y todos dejan de verla.
    const cancelled = await emitAck((cb) => sockets[0].emit('facilitator:command', { type: 'share:cancel' }, cb));
    expect(cancelled.ok).toBe(true);
    for (const v of views) await waitFor(() => v.latest()?.share.broadcast === null && v.latest());
  });

  it('cuando se acaba el tiempo, el servidor avisa a todos que se perdió', async () => {
    const { sockets, views, roomId } = await startedGame();
    const room = server.manager.getRoom(roomId);
    if (!room) throw new Error('sala inexistente');
    // Dejamos 1 s en el reloj de la sala y esperamos al tick del servidor.
    room.timer.remainingMs = 1000;
    room.timer.runningSince = Date.now();

    for (const v of views) await waitFor(() => v.latest()?.status === 'lost', 4000);
    const late = await emitAck((cb) =>
      sockets[5].emit('challenge:action', { kind: 'sandbox:submit', code: '123456' }, cb),
    );
    expect(late).toMatchObject({ ok: false, error: 'wrong_phase' });
  });
});
