import { randomInt, randomUUID } from 'node:crypto';
import {
  HINT_MAX_LENGTH,
  MAX_PLAYERS,
  NAME_MAX_LENGTH,
  FRAGMENTS,
  SHARE_COOLDOWN_SECONDS,
  SHARE_MAX_CREDITS,
  SHARE_TIME_PENALTY_SECONDS,
  SHARE_UI_MAX_CHARS,
  SHARE_VOTES_NEEDED,
  SHARE_VOTE_SECONDS,
  ROLES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  TIME_ADJUST_MAX_SECONDS,
  TOTAL_SECONDS,
  isRole,
  normalizeRoomCode,
} from '@enigma/shared';
import type {
  BriefingInfo,
  FragmentInfo,
  ChallengeAction,
  FacilitatorCommand,
  Hint,
  PublicPlayer,
  Role,
  ShareInfo,
  RoomState,
  RoomStatus,
} from '@enigma/shared';
import { GUIDES } from './challenges/guide.js';
import { CHALLENGES } from './challenges/index.js';
import type { AnyChallenge } from './challenges/index.js';
import { REVEAL, finalChallenge } from './challenges/final.js';
import { sandboxChallenge } from './challenges/sandbox.js';
import { GameError } from './errors.js';
import { completeAssignment } from './roles.js';
import { challengeSeed, randomSeed } from './rng.js';
import {
  clearShareActivity,
  clockExpired,
  clockLeft,
  freezeShare,
  newShareState,
  startClock,
  tallyVote,
  thawShare,
} from './share.js';
import type { ShareState } from './share.js';

export { GameError } from './errors.js';

interface Player extends PublicPlayer {}

export interface Room {
  roomId: string;
  status: RoomStatus;
  currentChallenge: number | null;
  players: Map<string, Player>;
  /** Momento en que la sala se quedó sin nadie conectado (null si hay alguien). */
  emptySince: number | null;
  /** De acá salen los datos de todos los desafíos de la sala. */
  seed: number;
  /** Estado interno del desafío en curso; solo el módulo sabe qué contiene. */
  challengeState: unknown;
  completed: number[];
  /** Si runningSince no es null, el tiempo restante real es remainingMs menos lo transcurrido. */
  timer: { remainingMs: number; runningSince: number | null };
  /** Milisegundos jugados del desafío en curso, ya acumulados (sin contar pausas ni penalidades). */
  missionMs: number;
  hint: Hint | null;
  /** Último cambio de vista por tiempo que ya se avisó a los jugadores (ver ChallengeModule.viewChangeAt). */
  timedNotified: number | null;
  /** Transmisión de pantalla: créditos, votación, transmisión en curso y espera. */
  share: ShareState;
}

/**
 * Lógica pura de salas y fases, sin sockets: se prueba sola y el servidor solo la conecta.
 * El jugador se identifica con su playerId (no con el socketId, que cambia al reconectar).
 * El servidor es la autoridad: el timer y las reglas viven acá, los clientes solo los muestran.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly challenges: AnyChallenge[] = CHALLENGES,
    /** After the last challenge comes the final step (put the fragments in order). Only in the real game. */
    private readonly finale: boolean = challenges === CHALLENGES,
  ) {
    if (challenges.length > ROLES.length) {
      throw new Error('There are more challenges than roles: nobody could play a new role in every one.');
    }
    challenges.forEach((c, i) => {
      if (c.id !== i + 1) {
        throw new Error(`Challenges must be numbered 1..N in order (fails at "${c.name}").`);
      }
    });
  }

  get size(): number {
    return this.rooms.size;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(normalizeRoomCode(roomId));
  }

  // ---------------------------------------------------------------- lobby

  createRoom(rawName: string): { room: Room; player: Player } {
    const name = this.validateName(rawName);
    const roomId = this.newRoomCode();
    const room: Room = {
      roomId,
      status: 'lobby',
      currentChallenge: null,
      players: new Map(),
      emptySince: null,
      seed: randomSeed(),
      challengeState: null,
      completed: [],
      timer: { remainingMs: TOTAL_SECONDS * 1000, runningSince: null },
      missionMs: 0,
      hint: null,
      timedNotified: null,
      share: newShareState(),
    };
    this.rooms.set(roomId, room);
    const player = this.addPlayer(room, name, true);
    return { room, player };
  }

  joinRoom(rawRoomId: string, rawName: string): { room: Room; player: Player } {
    const room = this.requireRoom(rawRoomId);
    const name = this.validateName(rawName);
    if (room.status !== 'lobby') {
      throw new GameError('game_started', 'The game has already started.');
    }
    if (room.players.size >= MAX_PLAYERS) {
      throw new GameError('room_full', 'The room already has all 6 players.');
    }
    const taken = [...room.players.values()].some(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) {
      throw new GameError('name_taken', 'That name is already taken in this room.');
    }
    const player = this.addPlayer(room, name, false);
    return { room, player };
  }

  /** Vuelve a conectar a un jugador existente (idempotente). */
  rejoin(rawRoomId: string, playerId: string): { room: Room; player: Player } {
    const room = this.requireRoom(rawRoomId);
    const player = room.players.get(playerId);
    if (!player) {
      throw new GameError('unknown_player', 'We couldn’t find your seat in the room.');
    }
    this.setConnected(room.roomId, playerId, true);
    return { room, player };
  }

  setConnected(roomId: string, playerId: string, connected: boolean): void {
    const room = this.rooms.get(roomId);
    const player = room?.players.get(playerId);
    if (!room || !player) return;
    player.connected = connected;
    if (!connected) {
      // Sin emisor no hay transmisión (el crédito no vuelve); sin el elegido, la votación se cae sin espera.
      if (room.share.broadcast?.target === playerId) room.share.broadcast = null;
      if (room.share.vote?.target === playerId) room.share.vote = null;
    }
    const anyConnected = [...room.players.values()].some((p) => p.connected);
    room.emptySince = anyConnected ? null : (room.emptySince ?? this.now());
  }

  /** Elige (o suelta, con null) el rol para el desafío que está por empezar. */
  pickRole(roomId: string, playerId: string, role: Role | null): void {
    const { room, player } = this.requirePlayer(roomId, playerId);
    if (room.status !== 'briefing') {
      throw new GameError('wrong_phase', 'Roles are chosen before each challenge.');
    }
    if (role !== null) {
      if (!isRole(role)) throw new GameError('invalid_role', 'Invalid role.');
      if (player.usedRoles.includes(role)) {
        throw new GameError('role_used', 'You’ve already played that role. Try a new one.');
      }
      const owner = [...room.players.values()].find((p) => p.role === role);
      if (owner && owner.playerId !== playerId) {
        throw new GameError('role_taken', 'Someone else already took that role.');
      }
      // Si con esta elección a alguien le quedaría un rol imposible, no se permite.
      const seats = [...room.players.values()].map((p) => this.seatOf(p, p.playerId === playerId ? role : p.role));
      if (!completeAssignment(seats)) {
        throw new GameError(
          'role_unavailable',
          'If you take that role, someone else would have no new role left to play. Pick another one.',
        );
      }
    }
    player.role = role;
  }

  /** Marca (o desmarca) que el jugador entendió su rol. Es opcional y no bloquea nada. */
  setReady(roomId: string, playerId: string, ready: boolean): void {
    const { room, player } = this.requirePlayer(roomId, playerId);
    if (room.status !== 'briefing') {
      throw new GameError('wrong_phase', 'You can only confirm during the briefing.');
    }
    player.ready = ready === true;
  }

  // ----------------------------------------------------------------- juego

  startGame(roomId: string, playerId: string): void {
    const { room, player } = this.requirePlayer(roomId, playerId);
    if (!player.isFacilitator) {
      throw new GameError('not_facilitator', 'Only the facilitator can start.');
    }
    if (room.status !== 'lobby' && room.status !== 'intro' && room.status !== 'practice_done') {
      throw new GameError('game_started', 'The game has already started.');
    }
    if (room.players.size !== MAX_PLAYERS) {
      throw new GameError('not_ready', 'You need 6 players to start.');
    }
    room.timer = { remainingMs: TOTAL_SECONDS * 1000, runningSince: null };
    room.missionMs = 0;
    room.completed = [];
    room.hint = null;
    room.share = newShareState();
    this.beginBriefing(room, 1);
  }

  /** Una acción de un jugador dentro del desafío en curso. Las reglas las decide el módulo. */
  applyAction(roomId: string, playerId: string, action: ChallengeAction): void {
    const { room, player } = this.requirePlayer(roomId, playerId);
    if (room.status === 'practice' || room.status === 'final') {
      this.applySpecial(room, player, action);
      return;
    }
    if (room.status !== 'playing' || room.currentChallenge === null) {
      throw new GameError('wrong_phase', 'You can’t act right now.');
    }
    if (typeof action !== 'object' || action === null) {
      throw new GameError('invalid_action', 'Invalid action.');
    }
    if (!player.role) {
      throw new GameError('invalid_role', 'You don’t have a role assigned.');
    }
    if (this.checkExpiry(room)) {
      throw new GameError('wrong_phase', 'Time is up.');
    }

    this.syncChallenge(room);
    const challenge = this.challengeFor(room.currentChallenge);
    const result = challenge.apply(
      room.challengeState,
      player.role,
      action,
      this.remainingMs(room),
      this.missionElapsedMs(room),
    );
    room.challengeState = result.state;
    if (result.penaltySeconds) this.adjustTimer(room, -result.penaltySeconds * 1000);

    if (challenge.isComplete(room.challengeState)) {
      this.completeChallenge(room);
    } else {
      this.checkExpiry(room);
    }
    if (result.error) throw new GameError(result.error.code, result.error.message);
  }

  /** Controles del facilitador: pausa, tiempo, pistas y avance entre desafíos. */
  command(roomId: string, playerId: string, command: FacilitatorCommand): void {
    const { room, player } = this.requirePlayer(roomId, playerId);
    if (!player.isFacilitator) {
      throw new GameError('not_facilitator', 'Only the facilitator can do this.');
    }
    if (typeof command !== 'object' || command === null) {
      throw new GameError('invalid_command', 'Invalid command.');
    }

    switch (command.type) {
      case 'lobby':
        // Back to the waiting room, as if the game had never started (handy to run it end to end again).
        if (room.status === 'lobby') return;
        this.stopTimer(room);
        room.seed = randomSeed();
        room.timer = { remainingMs: TOTAL_SECONDS * 1000, runningSince: null };
        room.missionMs = 0;
        room.completed = [];
        room.hint = null;
        room.currentChallenge = null;
        room.challengeState = null;
        room.timedNotified = null;
        room.share = newShareState();
        room.status = 'lobby';
        for (const p of room.players.values()) {
          p.role = null;
          p.ready = false;
          p.usedRoles = [];
        }
        return;

      case 'intro':
        this.requireStatus(room, ['lobby']);
        if (room.players.size !== MAX_PLAYERS) {
          throw new GameError('not_ready', 'You need 6 players to start.');
        }
        room.status = 'intro';
        return;

      case 'practice': {
        this.requireStatus(room, ['lobby', 'intro', 'practice_done']);
        if (room.players.size !== MAX_PLAYERS) {
          throw new GameError('not_ready', 'You need 6 players to start.');
        }
        const roles = [...ROLES];
        for (let i = roles.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [roles[i], roles[j]] = [roles[j] as Role, roles[i] as Role];
        }
        [...room.players.values()].forEach((p, i) => {
          p.role = roles[i] as Role;
          p.ready = false;
        });
        room.currentChallenge = 0;
        room.challengeState = sandboxChallenge.init(randomSeed());
        room.hint = null;
        room.status = 'practice';
        return;
      }

      case 'pause':
        this.requireStatus(room, ['playing']);
        this.stopTimer(room);
        freezeShare(room.share, this.now());
        room.status = 'paused';
        return;

      case 'resume':
        this.requireStatus(room, ['paused']);
        room.status = 'playing';
        thawShare(room.share, this.now());
        this.startTimer(room);
        return;

      case 'next':
        this.requireStatus(room, ['transition']);
        this.beginBriefing(room, (room.currentChallenge ?? 0) + 1);
        return;

      case 'begin': {
        this.requireStatus(room, ['briefing']);
        const players = [...room.players.values()];
        if (players.some((p) => p.role === null)) {
          throw new GameError('not_ready', 'Some players still need to choose their role.');
        }
        for (const p of players) p.usedRoles.push(p.role as Role);
        this.beginChallenge(room, room.currentChallenge ?? 1);
        this.startTimer(room);
        return;
      }

      case 'replay':
        this.requireStatus(room, ['won', 'lost']);
        room.seed = randomSeed();
        room.timer = { remainingMs: TOTAL_SECONDS * 1000, runningSince: null };
    room.missionMs = 0;
        room.completed = [];
        room.hint = null;
        room.share = newShareState();
        for (const p of room.players.values()) p.usedRoles = [];
        this.beginBriefing(room, 1);
        return;

      case 'autoassign': {
        this.requireStatus(room, ['briefing']);
        const players = [...room.players.values()];
        const roles = completeAssignment(
          players.map((p) => this.seatOf(p, p.role)),
          Math.random,
        );
        if (!roles) throw new GameError('role_unavailable', 'There’s no way to assign the remaining roles.');
        players.forEach((p, i) => {
          p.role = roles[i];
        });
        return;
      }

      case 'restart': {
        this.requireStatus(room, ['playing', 'paused']);
        const id = room.currentChallenge ?? 1;
        // Misma semilla: el desafío vuelve a empezar con los mismos datos.
        room.challengeState = this.challengeFor(id).init(challengeSeed(room.seed, id));
        room.timedNotified = null;
        this.resetMissionClock(room);
        return;
      }

      case 'skip':
        this.requireStatus(room, ['practice', 'final', 'playing', 'paused']);
        if (room.status === 'practice') {
          this.endPractice(room);
          return;
        }
        if (room.status === 'final') {
          this.winGame(room);
          return;
        }
        this.completeChallenge(room);
        return;

      case 'time': {
        this.requireStatus(room, ['playing', 'paused', 'final']);
        const seconds = command.seconds;
        if (
          !Number.isInteger(seconds) ||
          seconds === 0 ||
          Math.abs(seconds) > TIME_ADJUST_MAX_SECONDS
        ) {
          throw new GameError(
            'invalid_command',
            `The time adjustment must be between 1 and ${TIME_ADJUST_MAX_SECONDS} seconds.`,
          );
        }
        this.adjustTimer(room, seconds * 1000);
        this.checkExpiry(room);
        return;
      }

      case 'hint': {
        this.requireStatus(room, ['practice', 'briefing', 'playing', 'paused', 'transition', 'final']);
        const text = typeof command.text === 'string' ? command.text.trim() : '';
        if (text.length === 0 || text.length > HINT_MAX_LENGTH) {
          throw new GameError('invalid_command', `The hint must be between 1 and ${HINT_MAX_LENGTH} characters.`);
        }
        room.hint = { id: (room.hint?.id ?? 0) + 1, text };
        return;
      }

      case 'share:cancel':
        if (!room.share.vote && !room.share.broadcast) {
          throw new GameError('invalid_command', 'There is no vote or broadcast to cancel.');
        }
        // Cortada por el facilitador: sin espera y sin devolver el cobro.
        room.share.vote = null;
        room.share.broadcast = null;
        return;

      case 'share:credits': {
        const delta = command.delta;
        if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > SHARE_MAX_CREDITS) {
          throw new GameError(
            'invalid_command',
            `The credit adjustment must be a whole number between 1 and ${SHARE_MAX_CREDITS}.`,
          );
        }
        room.share.credits = Math.min(SHARE_MAX_CREDITS, Math.max(0, room.share.credits + delta));
        return;
      }

      default:
        throw new GameError('invalid_command', 'Unknown command.');
    }
  }

  /**
   * Revisa los timers: las salas jugando cuyo tiempo llegó a cero pasan a "lost".
   * Devuelve las salas que cambiaron, para avisarles a los jugadores.
   */
  tick(): Room[] {
    const changed: Room[] = [];
    for (const room of this.rooms.values()) {
      if (this.checkExpiry(room)) {
        changed.push(room);
        continue;
      }
      if (this.syncShare(room)) changed.push(room);
      // Desafíos en tiempo real: el estado avanza solo con el reloj.
      if (this.syncChallenge(room)) changed.push(room);
      // Vistas que cambian solas con el tiempo (por ejemplo, un escaneo que se apaga).
      if (room.status === 'playing' && room.currentChallenge !== null && room.challengeState !== null) {
        const at = this.challengeFor(room.currentChallenge).viewChangeAt?.(room.challengeState) ?? null;
        if (at !== null && this.remainingMs(room) <= at && room.timedNotified !== at) {
          room.timedNotified = at;
          changed.push(room);
        }
      }
    }
    return changed;
  }

  // --------------------------------------------- transmisión de pantalla

  /** Un jugador propone que todos vean la pantalla de `target` (puede ser él mismo). */
  proposeShare(roomId: string, playerId: string, target: unknown): void {
    const { room } = this.requirePlayer(roomId, playerId);
    this.requirePlaying(room);
    this.syncShare(room);
    const chosen = typeof target === 'string' ? room.players.get(target) : undefined;
    if (!chosen || !chosen.connected || !chosen.role) {
      throw new GameError('invalid_target', 'That player cannot share their screen right now.');
    }
    const share = room.share;
    if (share.vote || share.broadcast) {
      throw new GameError('share_busy', 'There is already a vote or a broadcast in progress.');
    }
    if (share.cooldown) {
      throw new GameError('share_cooldown', 'Wait a few seconds before proposing again.');
    }
    if (share.credits <= 0 && this.remainingMs(room) <= SHARE_TIME_PENALTY_SECONDS * 1000) {
      throw new GameError('share_no_budget', 'There are no credits left and not enough time to pay with the clock.');
    }
    share.vote = {
      proposedBy: playerId,
      target: chosen.playerId,
      yes: [playerId],
      no: [],
      clock: startClock(this.now(), SHARE_VOTE_SECONDS * 1000),
    };
  }

  voteShare(roomId: string, playerId: string, choice: unknown): void {
    const { room } = this.requirePlayer(roomId, playerId);
    this.requirePlaying(room);
    this.syncShare(room);
    const share = room.share;
    const vote = share.vote;
    if (!vote) throw new GameError('wrong_phase', 'There is no vote in progress.');
    if (choice !== 'yes' && choice !== 'no') throw new GameError('invalid_action', 'Invalid vote.');
    if (vote.yes.includes(playerId) || vote.no.includes(playerId)) {
      throw new GameError('already_voted', 'You already voted.');
    }
    (choice === 'yes' ? vote.yes : vote.no).push(playerId);

    const result = tallyVote(vote);
    if (result === 'pending') return;
    share.vote = null;
    if (result === 'rejected') {
      share.cooldown = startClock(this.now(), SHARE_COOLDOWN_SECONDS * 1000);
      return;
    }
    // Aprobada: recién ahora se cobra.
    let paidWith: 'credit' | 'time' = 'credit';
    if (share.credits > 0) {
      share.credits -= 1;
    } else {
      if (this.remainingMs(room) <= SHARE_TIME_PENALTY_SECONDS * 1000) {
        throw new GameError('share_no_budget', 'There are no credits left and not enough time to pay with the clock.');
      }
      paidWith = 'time';
      this.adjustTimer(room, -SHARE_TIME_PENALTY_SECONDS * 1000);
    }
    share.lastBroadcastId += 1;
    share.broadcast = { id: share.lastBroadcastId, target: vote.target, paidWith, ui: {} };
  }

  /** El emisor publica el estado de su pantalla; el servidor lo valida y lo reenvia a los demas. */
  updateShareUi(roomId: string, playerId: string, ui: unknown): void {
    const { room } = this.requirePlayer(roomId, playerId);
    const broadcast = room.share.broadcast;
    if ((room.status !== 'playing' && room.status !== 'paused') || !broadcast || broadcast.target !== playerId) {
      throw new GameError('wrong_phase', 'You are not broadcasting right now.');
    }
    if (typeof ui !== 'object' || ui === null || Array.isArray(ui)) {
      throw new GameError('invalid_action', 'Invalid screen state.');
    }
    let size: number;
    try {
      size = JSON.stringify(ui).length;
    } catch {
      throw new GameError('invalid_action', 'Invalid screen state.');
    }
    if (size > SHARE_UI_MAX_CHARS) throw new GameError('invalid_action', 'The screen state is too large.');
    broadcast.ui = ui as Record<string, unknown>;
  }

  /** Vista que recibe un jugador: sin datos que no le correspondan. */
  viewFor(room: Room, playerId: string): RoomState {
    const me = room.players.get(playerId);
    if (!me) throw new GameError('unknown_player', 'Unknown player.');
    this.syncChallenge(room);
    this.syncShare(room);

    const special = this.specialModule(room);
    const inPractice = special === sandboxChallenge;
    const inChallenge =
      special !== null ||
      ((room.status === 'playing' || room.status === 'paused') &&
        room.currentChallenge !== null &&
        room.challengeState !== null);
    const challenge: AnyChallenge | null = special
      ? special
      : inChallenge
        ? this.challengeFor(room.currentChallenge as number)
        : null;

    const briefingChallenge =
      room.status === 'briefing' && room.currentChallenge !== null
        ? this.challengeFor(room.currentChallenge)
        : null;
    const briefing: BriefingInfo | null = briefingChallenge
      ? { challengeId: briefingChallenge.id, name: briefingChallenge.name, ...briefingChallenge.briefing, guide: this.guideFor(briefingChallenge.id) }
      : null;

    return {
      roomId: room.roomId,
      status: room.status,
      currentChallenge: room.currentChallenge,
      totalChallenges: this.challenges.length,
      players: [...room.players.values()].map((p) => ({ ...p, usedRoles: [...p.usedRoles] })),
      you: {
        playerId: me.playerId,
        role: me.role,
        isFacilitator: me.isFacilitator,
        usedRoles: [...me.usedRoles],
      },
      timer: { remainingMs: this.remainingMs(room), running: room.timer.runningSince !== null },
      briefing,
      challenge:
        challenge && me.role
          ? {
              id: challenge.id,
              name: inPractice ? 'Warm-up round' : challenge.name,
              task: this.guideFor(inPractice ? 0 : challenge.id).tasks[me.role],
              guide: this.guideFor(inPractice ? 0 : challenge.id),
              view: challenge.viewFor(room.challengeState, me.role, this.remainingMs(room), this.missionElapsedMs(room)),
            }
          : null,
      facilitatorView:
        challenge && me.isFacilitator ? challenge.facilitatorView(room.challengeState) : null,
      hint: room.hint,
      share: this.shareView(room, playerId),
      fragments: this.fragmentsOf(room),
      reveal: room.status === 'won' && this.finale ? REVEAL : null,
    };
  }

  /** Borra salas que llevan más de maxEmptyMs sin nadie conectado. */
  sweep(maxEmptyMs: number): number {
    let removed = 0;
    for (const [id, room] of this.rooms) {
      if (room.emptySince !== null && this.now() - room.emptySince > maxEmptyMs) {
        this.rooms.delete(id);
        removed++;
      }
    }
    return removed;
  }

  // -------------------------------------------------------------- internos

  private requirePlaying(room: Room): void {
    if (room.status !== 'playing') {
      throw new GameError('wrong_phase', 'Screen sharing only works while a challenge is running.');
    }
  }

  /** Vence la votacion (cuenta como rechazada) y la espera. Devuelve true si algo cambio. */
  private syncShare(room: Room): boolean {
    const share = room.share;
    const now = this.now();
    let changed = false;
    if (share.vote && clockExpired(share.vote.clock, now)) {
      share.vote = null;
      share.cooldown = startClock(now, SHARE_COOLDOWN_SECONDS * 1000);
      changed = true;
    }
    if (share.cooldown && clockExpired(share.cooldown, now)) {
      share.cooldown = null;
      changed = true;
    }
    return changed;
  }

  private shareView(room: Room, playerId: string): ShareInfo {
    const { share } = room;
    const now = this.now();
    const vote = share.vote;
    const broadcast = share.broadcast;
    const sender = broadcast ? room.players.get(broadcast.target) : undefined;
    const mirrored =
      broadcast &&
      sender?.role &&
      broadcast.target !== playerId &&
      room.currentChallenge !== null &&
      room.challengeState !== null
        ? this.challengeFor(room.currentChallenge).viewFor(
            room.challengeState,
            sender.role,
            this.remainingMs(room),
            this.missionElapsedMs(room),
          )
        : null;
    return {
      credits: share.credits,
      cooldownMs: share.cooldown ? clockLeft(share.cooldown, now) : 0,
      vote: vote
        ? {
            proposedBy: vote.proposedBy,
            target: vote.target,
            yes: vote.yes.length,
            no: vote.no.length,
            needed: SHARE_VOTES_NEEDED,
            myVote: vote.yes.includes(playerId) ? 'yes' : vote.no.includes(playerId) ? 'no' : null,
            payment: share.credits > 0 ? 'credit' : 'time',
            msLeft: clockLeft(vote.clock, now),
          }
        : null,
      broadcast:
        broadcast && sender?.role
          ? {
              id: broadcast.id,
              fromPlayerId: broadcast.target,
              role: sender.role,
              paidWith: broadcast.paidWith,
              view: mirrored,
              ui: broadcast.target === playerId ? {} : broadcast.ui,
            }
          : null,
    };
  }

  /** Antes de cada desafío: se muestra su descripción y todos eligen un rol nuevo. */
  private beginBriefing(room: Room, id: number): void {
    this.challengeFor(id);
    room.currentChallenge = id;
    room.challengeState = null;
    room.timedNotified = null;
    clearShareActivity(room.share);
    room.status = 'briefing';
    for (const p of room.players.values()) {
      p.role = null;
      p.ready = false;
    }
  }

  /** Practice and final step run outside the numbered challenges. */
  private specialModule(room: Room): AnyChallenge | null {
    if (room.challengeState === null) return null;
    if (room.status === 'practice') return sandboxChallenge;
    if (room.status === 'final') return finalChallenge;
    return null;
  }

  private fragmentsOf(room: Room): FragmentInfo[] {
    return room.completed
      .filter((id) => id >= 1 && id <= FRAGMENTS.length)
      .map((id) => ({ challengeId: id, value: FRAGMENTS[id - 1] as string }));
  }

  private beginFinal(room: Room): void {
    const roles = [...ROLES];
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j] as Role, roles[i] as Role];
    }
    [...room.players.values()].forEach((p, i) => {
      p.role = roles[i] as Role;
    });
    room.currentChallenge = null;
    room.challengeState = finalChallenge.init(challengeSeed(room.seed, 7));
    room.timedNotified = null;
    room.status = 'final';
    this.startTimer(room);
  }

  private winGame(room: Room): void {
    this.stopTimer(room);
    room.challengeState = null;
    room.status = 'won';
  }

  private guideFor(id: number) {
    return GUIDES[id] ?? GUIDES[0]!;
  }

  private applySpecial(room: Room, player: Player, action: ChallengeAction): void {
    if (typeof action !== 'object' || action === null) {
      throw new GameError('invalid_action', 'Invalid action.');
    }
    if (!player.role) throw new GameError('invalid_role', 'You don’t have a role assigned.');
    if (this.checkExpiry(room)) throw new GameError('wrong_phase', 'Time is up.');
    const mod = this.specialModule(room);
    if (!mod) throw new GameError('wrong_phase', 'You can’t act right now.');
    const result = mod.apply(room.challengeState, player.role, action, this.remainingMs(room), 0);
    room.challengeState = result.state;
    if (mod.isComplete(room.challengeState)) {
      if (room.status === 'practice') this.endPractice(room);
      else this.winGame(room);
    }
    if (result.error) throw new GameError(result.error.code, result.error.message);
  }

  /** La práctica no deja huellas: ni roles usados ni tiempo gastado. */
  private endPractice(room: Room): void {
    room.challengeState = null;
    room.currentChallenge = null;
    room.status = 'practice_done';
    for (const p of room.players.values()) p.role = null;
  }

  private seatOf(player: Player, picked: Role | null) {
    return { allowed: ROLES.filter((r) => !player.usedRoles.includes(r)), picked };
  }

  private beginChallenge(room: Room, id: number): void {
    const challenge = this.challengeFor(id);
    room.currentChallenge = id;
    room.challengeState = challenge.init(challengeSeed(room.seed, id));
    room.timedNotified = null;
    room.missionMs = 0;
    room.status = 'playing';
  }

  private completeChallenge(room: Room): void {
    const id = room.currentChallenge ?? 0;
    this.stopTimer(room);
    room.completed.push(id);
    room.challengeState = null;
    clearShareActivity(room.share);
    if (id < this.challenges.length) {
      room.status = 'transition';
    } else if (this.finale) {
      this.beginFinal(room);
    } else {
      room.status = 'won';
    }
  }

  private checkExpiry(room: Room): boolean {
    if ((room.status === 'playing' || room.status === 'final') && this.remainingMs(room) <= 0) {
      this.stopTimer(room);
      room.challengeState = null;
      clearShareActivity(room.share);
      room.status = 'lost';
      return true;
    }
    return false;
  }

  private remainingMs(room: Room): number {
    const { remainingMs, runningSince } = room.timer;
    if (runningSince === null) return remainingMs;
    return Math.max(0, remainingMs - (this.now() - runningSince));
  }

  private startTimer(room: Room): void {
    if (room.timer.runningSince === null) room.timer.runningSince = this.now();
  }

  /** Tiempo jugado del desafío en curso: solo corre mientras el reloj corre y no lo afectan las penalidades. */
  private missionElapsedMs(room: Room): number {
    const { runningSince } = room.timer;
    return room.missionMs + (runningSince === null ? 0 : Math.max(0, this.now() - runningSince));
  }

  private resetMissionClock(room: Room): void {
    const running = room.timer.runningSince !== null;
    this.stopTimer(room);
    room.missionMs = 0;
    if (running) this.startTimer(room);
  }

  /** Lleva el desafío en tiempo real hasta el momento actual. Devuelve true si el estado cambió. */
  private syncChallenge(room: Room): boolean {
    if (
      (room.status !== 'playing' && room.status !== 'paused') ||
      room.currentChallenge === null ||
      room.challengeState === null
    ) {
      return false;
    }
    const challenge = this.challengeFor(room.currentChallenge);
    if (!challenge.advance) return false;
    const next = challenge.advance(room.challengeState, this.missionElapsedMs(room));
    if (next === room.challengeState) return false;
    room.challengeState = next;
    return true;
  }

  private stopTimer(room: Room): void {
    if (room.timer.runningSince !== null) {
      room.missionMs += Math.max(0, this.now() - room.timer.runningSince);
    }
    room.timer.remainingMs = this.remainingMs(room);
    room.timer.runningSince = null;
  }

  private adjustTimer(room: Room, deltaMs: number): void {
    const wasRunning = room.timer.runningSince !== null;
    this.stopTimer(room);
    room.timer.remainingMs = Math.max(0, room.timer.remainingMs + deltaMs);
    if (wasRunning) this.startTimer(room);
  }

  private challengeFor(id: number): AnyChallenge {
    const challenge = this.challenges[id - 1];
    if (!challenge) throw new Error(`Challenge ${id} does not exist.`);
    return challenge;
  }

  private requireStatus(room: Room, allowed: RoomStatus[]): void {
    if (!allowed.includes(room.status)) {
      throw new GameError('wrong_phase', 'That can’t be done at this point in the game.');
    }
  }

  private addPlayer(room: Room, name: string, isFacilitator: boolean): Player {
    const player: Player = {
      playerId: randomUUID(),
      name,
      role: null,
      connected: true,
      isFacilitator,
      usedRoles: [],
      ready: false,
    };
    room.players.set(player.playerId, player);
    room.emptySince = null;
    return player;
  }

  private requireRoom(rawRoomId: string): Room {
    const room = this.getRoom(rawRoomId);
    if (!room) throw new GameError('room_not_found', 'No room exists with that code.');
    return room;
  }

  private requirePlayer(roomId: string, playerId: string): { room: Room; player: Player } {
    const room = this.rooms.get(roomId);
    const player = room?.players.get(playerId);
    if (!room || !player) throw new GameError('not_in_room', 'You’re not in a room.');
    return { room, player };
  }

  private validateName(raw: string): string {
    const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
    if (name.length === 0 || name.length > NAME_MAX_LENGTH) {
      throw new GameError('invalid_name', `The name must be between 1 and ${NAME_MAX_LENGTH} characters.`);
    }
    return name;
  }

  private newRoomCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }
}
