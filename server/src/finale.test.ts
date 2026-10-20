import { describe, expect, it } from 'vitest';
import { FRAGMENTS } from '@enigma/shared';
import { CHALLENGES } from './challenges/index.js';
import { RoomManager } from './rooms.js';

function setup() {
  let t = 0;
  const m = new RoomManager(() => t, CHALLENGES);
  const { room, player } = m.createRoom('Host');
  const host = player.playerId;
  const ids = [host];
  for (const n of ['A', 'B', 'C', 'D', 'E']) ids.push(m.joinRoom(room.roomId, n).player.playerId);
  m.startGame(room.roomId, host);
  return { m, room, host, ids, advance: (ms: number) => (t += ms) };
}

/** Skips every mission through the facilitator, as if the team had beaten them. */
function reachFinal(s: ReturnType<typeof setup>) {
  for (let i = 1; i <= CHALLENGES.length; i++) {
    s.m.command(s.room.roomId, s.host, { type: 'autoassign' });
    s.m.command(s.room.roomId, s.host, { type: 'begin' });
    s.m.command(s.room.roomId, s.host, { type: 'skip' });
    if (i < CHALLENGES.length) s.m.command(s.room.roomId, s.host, { type: 'next' });
  }
}

describe('final step', () => {
  it('recovers one fragment per mission and then opens the final step', () => {
    const s = setup();
    reachFinal(s);
    expect(s.room.status).toBe('final');
    const view = s.m.viewFor(s.room, s.host);
    expect(view.fragments.map((f) => f.value)).toEqual([...FRAGMENTS]);
    expect(view.reveal).toBeNull();
    expect(view.challenge?.view.kind).toBe('final');
  });

  it('a wrong order is rejected and the right one wins and reveals the map', () => {
    const s = setup();
    reachFinal(s);
    const a = s.host;
    [...FRAGMENTS].reverse().forEach((v, i) => s.m.applyAction(s.room.roomId, a, { kind: 'final:place', slot: i, value: v }));
    expect(() => s.m.applyAction(s.room.roomId, a, { kind: 'final:submit' })).toThrow();
    FRAGMENTS.forEach((v, i) => s.m.applyAction(s.room.roomId, a, { kind: 'final:place', slot: i, value: v }));
    s.m.applyAction(s.room.roomId, a, { kind: 'final:submit' });
    expect(s.room.status).toBe('won');
    const view = s.m.viewFor(s.room, a);
    expect(view.reveal?.dms).toContain('68°');
  });

  it('every role gets a different clue and the answer never reaches the client early', () => {
    const s = setup();
    reachFinal(s);
    const clues = new Set(s.ids.map((id) => {
      const v = s.m.viewFor(s.room, id).challenge!.view;
      expect(JSON.stringify(v)).not.toContain('68,26');
      return v.kind === 'final' ? v.clue : '';
    }));
    expect(clues.size).toBe(6);
  });

  it('time running out during the final step loses the game', () => {
    const s = setup();
    reachFinal(s);
    s.advance(3_000_000);
    s.m.tick();
    expect(s.room.status).toBe('lost');
  });
});

describe('intro film', () => {
  it('goes lobby → intro → warm-up or mission 1, and needs 6 players', () => {
    const m = new RoomManager();
    const { room, player } = m.createRoom('Host');
    expect(() => m.command(room.roomId, player.playerId, { type: 'intro' })).toThrow();
    for (const n of ['A', 'B', 'C', 'D', 'E']) m.joinRoom(room.roomId, n);
    m.command(room.roomId, player.playerId, { type: 'intro' });
    expect(room.status).toBe('intro');
    m.startGame(room.roomId, player.playerId);
    expect(room.status).toBe('briefing');
  });
});

describe('back to lobby', () => {
  it('resets everything from any point so the flow can be run again', () => {
    const s = setup();
    reachFinal(s);
    expect(s.room.status).toBe('final');
    s.m.command(s.room.roomId, s.host, { type: 'lobby' });
    expect(s.room.status).toBe('lobby');
    const view = s.m.viewFor(s.room, s.host);
    expect(view.fragments).toEqual([]);
    expect(view.players.every((p) => p.role === null && p.usedRoles.length === 0)).toBe(true);
    expect(view.timer.remainingMs).toBe(3_000_000);
    s.m.command(s.room.roomId, s.host, { type: 'intro' });
    expect(s.room.status).toBe('intro');
    s.m.command(s.room.roomId, s.host, { type: 'lobby' });
    expect(s.room.status).toBe('lobby');
  });

  it('only the facilitator can do it', () => {
    const s = setup();
    expect(() => s.m.command(s.room.roomId, s.ids[1]!, { type: 'lobby' })).toThrow();
  });
});
