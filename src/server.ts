import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import pino from 'pino';
import { Server } from 'socket.io';
import { z } from 'zod';
import { loadConfig } from './config.js';
import {
  activeRemoteClients,
  activeRooms,
  pairingAttemptsTotal,
  pairingSuccessTotal,
  reconnectTotal,
  roomExpiredTotal,
  signalingLatencyMs,
  webrtcNegotiationFailTotal,
  metricsRegistry
} from './metrics.js';
import { createPairCode, isValidPairCodeFormat } from './pairing.js';
import { SessionStore } from './store.js';
import type { RemoteClientRecord, RoomRecord } from './types.js';

const config = loadConfig();
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const app = express();
app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin }));
app.use(express.json());

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
  pingInterval: 20_000,
  pingTimeout: 15_000
});

const store = new SessionStore(config.redisUrl);
const roomTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const socketToRoom = new Map<string, string>();
const socketRoleById = new Map<string, 'host' | 'client'>();

const createRoomId = (): string => randomUUID().slice(0, 8);
const createRemoteMonitorId = (): string => `remote-${randomUUID().slice(0, 8)}`;

const now = (): number => Date.now();

const scheduleRoomExpiry = (roomId: string, ttlMs: number) => {
  const previous = roomTimeouts.get(roomId);
  if (previous) {
    clearTimeout(previous);
  }

  const timeout = setTimeout(async () => {
    const room = await store.getRoom(roomId);
    if (!room || room.firstClientPaired) {
      return;
    }

    roomExpiredTotal.inc();
    await store.deleteRoom(roomId);
    activeRooms.dec();
    io.to(room.hostSocketId).emit('room:expired', { roomId });
    logger.info({ event: 'room.expired', roomId }, 'Room expired without first client');
  }, ttlMs + 50);

  roomTimeouts.set(roomId, timeout);
};

const updateActiveClientsGauge = async (roomId: string) => {
  const clients = await store.getRoomClients(roomId);
  const total = clients.filter((client) => client.state !== 'down').length;
  activeRemoteClients.set(total);
};

const PairingCreateSchema = z.object({
  hostLabel: z.string().min(1).max(120).optional()
});

const PairingJoinSchema = z.object({
  roomId: z.string().min(1),
  pairCode: z.string().min(1)
});

const PairingApproveSchema = z.object({
  roomId: z.string().min(1),
  clientSocketId: z.string().min(1)
});

const SignalSchema = z.object({
  roomId: z.string().min(1),
  targetSocketId: z.string().min(1),
  payload: z.record(z.unknown()),
  sentAtMs: z.number().optional()
});

const RemoteControlSchema = z.object({
  roomId: z.string().min(1),
  targetSocketId: z.string().min(1),
  message: z.record(z.unknown())
});

io.on('connection', (socket) => {
  const socketIp = socket.handshake.address ?? 'unknown';
  logger.info({ event: 'socket.connected', socketId: socket.id, socketIp }, 'Socket connected');

  socket.on('pairing:create-room', async (rawPayload, ack) => {
    const parsed = PairingCreateSchema.safeParse(rawPayload ?? {});
    if (!parsed.success) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const roomId = createRoomId();
    const pairCode = createPairCode();
    const createdAtMs = now();
    const room: RoomRecord = {
      roomId,
      hostSocketId: socket.id,
      pairCode,
      createdAtMs,
      expiresAtMs: createdAtMs + config.roomTtlMs,
      firstClientPaired: false
    };

    await store.saveRoom(room, config.roomTtlMs);
    await store.saveRoomClients(roomId, []);
    scheduleRoomExpiry(roomId, config.roomTtlMs);
    socket.join(`room:${roomId}`);
    socketToRoom.set(socket.id, roomId);
    socketRoleById.set(socket.id, 'host');
    activeRooms.inc();

    logger.info({ event: 'pairing.room_created', roomId, hostSocketId: socket.id }, 'Room created');
    ack?.({ ok: true, roomId, pairCode, expiresAtMs: room.expiresAtMs });
  });

  socket.on('pairing:join-request', async (rawPayload, ack) => {
    const parsed = PairingJoinSchema.safeParse(rawPayload);
    if (!parsed.success) {
      pairingAttemptsTotal.inc({ result: 'invalid_payload' });
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const roomId = parsed.data.roomId.trim();
    const pairCode = parsed.data.pairCode.trim().toUpperCase();
    const attemptStatus = await store.getPairAttempt(roomId, socketIp);

    if (attemptStatus.bannedUntilMs && attemptStatus.bannedUntilMs > now()) {
      pairingAttemptsTotal.inc({ result: 'banned' });
      ack?.({ ok: false, error: 'temporarily_banned', bannedUntilMs: attemptStatus.bannedUntilMs });
      return;
    }

    if (!isValidPairCodeFormat(pairCode)) {
      const nextAttempts = attemptStatus.attempts + 1;
      const ban = nextAttempts >= config.unapprovedAttemptLimit ? now() + config.banDurationMs : null;
      await store.savePairAttempt(roomId, socketIp, { attempts: nextAttempts, bannedUntilMs: ban }, config.banDurationMs);
      pairingAttemptsTotal.inc({ result: 'invalid_format' });
      ack?.({ ok: false, error: 'invalid_pair_code_format' });
      return;
    }

    const room = await store.getRoom(roomId);
    if (!room) {
      pairingAttemptsTotal.inc({ result: 'room_not_found' });
      ack?.({ ok: false, error: 'room_not_found' });
      return;
    }

    if (room.pairCode !== pairCode) {
      const nextAttempts = attemptStatus.attempts + 1;
      const ban = nextAttempts >= config.unapprovedAttemptLimit ? now() + config.banDurationMs : null;
      await store.savePairAttempt(roomId, socketIp, { attempts: nextAttempts, bannedUntilMs: ban }, config.banDurationMs);
      pairingAttemptsTotal.inc({ result: 'invalid_pair_code' });
      ack?.({ ok: false, error: 'invalid_pair_code', remaining: Math.max(0, config.unapprovedAttemptLimit - nextAttempts) });
      return;
    }

    pairingAttemptsTotal.inc({ result: 'pending_host_approval' });
    io.to(room.hostSocketId).emit('pairing:approval-requested', {
      roomId,
      clientSocketId: socket.id,
      requestedAtMs: now()
    });
    socketToRoom.set(socket.id, roomId);
    socketRoleById.set(socket.id, 'client');
    ack?.({ ok: true, status: 'pending_host_approval' });
  });

  socket.on('pairing:approve-client', async (rawPayload, ack) => {
    const parsed = PairingApproveSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const room = await store.getRoom(parsed.data.roomId);
    if (!room || room.hostSocketId !== socket.id) {
      ack?.({ ok: false, error: 'room_not_found_or_not_host' });
      return;
    }

    const targetSocket = io.sockets.sockets.get(parsed.data.clientSocketId);
    if (!targetSocket) {
      ack?.({ ok: false, error: 'client_not_connected' });
      return;
    }

    const remoteMonitorId = createRemoteMonitorId();
    const clientRecord: RemoteClientRecord = {
      remoteMonitorId,
      clientSocketId: parsed.data.clientSocketId,
      roomId: parsed.data.roomId,
      pairedAtMs: now(),
      state: 'paired'
    };

    const clients = await store.getRoomClients(parsed.data.roomId);
    clients.push(clientRecord);
    await store.saveRoomClients(parsed.data.roomId, clients);

    if (!room.firstClientPaired) {
      room.firstClientPaired = true;
      await store.saveRoom(room, config.roomTtlMs);
    }

    targetSocket.join(`room:${parsed.data.roomId}`);
    targetSocket.emit('pairing:approved', {
      roomId: parsed.data.roomId,
      remoteMonitorId,
      hostSocketId: socket.id
    });

    socket.emit('pairing:client-paired', {
      roomId: parsed.data.roomId,
      clientSocketId: parsed.data.clientSocketId,
      remoteMonitorId
    });

    pairingSuccessTotal.inc();
    await updateActiveClientsGauge(parsed.data.roomId);

    logger.info(
      { event: 'pairing.approved', roomId: parsed.data.roomId, remoteMonitorId, clientSocketId: parsed.data.clientSocketId },
      'Client approved and paired'
    );

    ack?.({ ok: true, remoteMonitorId });
  });

  socket.on('remote:update-state', async (payload) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) {
      return;
    }

    const clients = await store.getRoomClients(roomId);
    const current = clients.find((entry) => entry.clientSocketId === socket.id);
    if (!current) {
      return;
    }

    const state = payload?.state;
    if (state !== 'connecting' && state !== 'paired' && state !== 'reconnecting' && state !== 'down') {
      return;
    }

    current.state = state;
    await store.saveRoomClients(roomId, clients);
    io.to(`room:${roomId}`).emit('remote:state-updated', {
      remoteMonitorId: current.remoteMonitorId,
      state
    });

    if (state === 'reconnecting') {
      reconnectTotal.inc();
    }

    await updateActiveClientsGauge(roomId);
  });

  socket.on('signal:offer', (rawPayload, ack) => {
    const parsed = SignalSchema.safeParse(rawPayload);
    if (!parsed.success) {
      webrtcNegotiationFailTotal.inc({ event: 'offer_invalid_payload' });
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    io.to(parsed.data.targetSocketId).emit('signal:offer', {
      fromSocketId: socket.id,
      roomId: parsed.data.roomId,
      payload: parsed.data.payload,
      sentAtMs: parsed.data.sentAtMs ?? now()
    });
    ack?.({ ok: true });
  });

  socket.on('signal:answer', (rawPayload, ack) => {
    const parsed = SignalSchema.safeParse(rawPayload);
    if (!parsed.success) {
      webrtcNegotiationFailTotal.inc({ event: 'answer_invalid_payload' });
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const sentAtMs = parsed.data.sentAtMs ?? now();
    signalingLatencyMs.observe({ event: 'answer' }, Math.max(0, now() - sentAtMs));

    io.to(parsed.data.targetSocketId).emit('signal:answer', {
      fromSocketId: socket.id,
      roomId: parsed.data.roomId,
      payload: parsed.data.payload,
      sentAtMs
    });
    ack?.({ ok: true });
  });

  socket.on('signal:ice-candidate', (rawPayload, ack) => {
    const parsed = SignalSchema.safeParse(rawPayload);
    if (!parsed.success) {
      webrtcNegotiationFailTotal.inc({ event: 'ice_invalid_payload' });
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const sentAtMs = parsed.data.sentAtMs ?? now();
    signalingLatencyMs.observe({ event: 'ice' }, Math.max(0, now() - sentAtMs));

    io.to(parsed.data.targetSocketId).emit('signal:ice-candidate', {
      fromSocketId: socket.id,
      roomId: parsed.data.roomId,
      payload: parsed.data.payload,
      sentAtMs
    });
    ack?.({ ok: true });
  });

  socket.on('remote:close-session', async ({ roomId }) => {
    if (typeof roomId !== 'string' || roomId.length === 0) {
      return;
    }

    const clients = await store.getRoomClients(roomId);
    const nextClients = clients.filter((entry) => entry.clientSocketId !== socket.id);
    await store.saveRoomClients(roomId, nextClients);
    io.to(`room:${roomId}`).emit('remote:disconnected', { clientSocketId: socket.id });
    await updateActiveClientsGauge(roomId);
  });

  socket.on('remote:control-message', (rawPayload) => {
    const parsed = RemoteControlSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return;
    }

    io.to(parsed.data.targetSocketId).emit('remote:control-message', {
      roomId: parsed.data.roomId,
      message: parsed.data.message,
      fromSocketId: socket.id
    });
  });

  socket.on('disconnect', async (reason) => {
    const roomId = socketToRoom.get(socket.id);
    const role = socketRoleById.get(socket.id);

    socketToRoom.delete(socket.id);
    socketRoleById.delete(socket.id);

    if (!roomId) {
      return;
    }

    if (role === 'host') {
      await store.deleteRoom(roomId);
      activeRooms.dec();
      io.to(`room:${roomId}`).emit('room:closed', { roomId, reason: 'host-disconnected' });
      logger.info({ event: 'room.closed', roomId, reason }, 'Room closed because host disconnected');
      return;
    }

    const clients = await store.getRoomClients(roomId);
    const nextClients = clients.map((client) =>
      client.clientSocketId === socket.id
        ? { ...client, state: 'down' as const }
        : client
    );

    await store.saveRoomClients(roomId, nextClients);
    io.to(`room:${roomId}`).emit('remote:disconnected', { clientSocketId: socket.id });
    await updateActiveClientsGauge(roomId);
    logger.info({ event: 'remote.disconnected', roomId, socketId: socket.id, reason }, 'Remote disconnected');
  });
});

app.get('/health', async (_req, res) => {
  res.json({
    service: 'mythr-prism-back',
    status: 'ok',
    secureMode: config.secureMode,
    redisConnected: store.isConnected()
  });
});

app.get('/ready', async (_req, res) => {
  if (!store.isConnected()) {
    res.status(503).json({ ready: false, reason: 'redis_not_connected' });
    return;
  }

  res.json({ ready: true });
});

app.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', metricsRegistry.contentType);
  res.send(await metricsRegistry.metrics());
});

const start = async () => {
  await store.connect();

  server.listen(config.port, config.host, () => {
    logger.info(
      {
        event: 'server.started',
        host: config.host,
        port: config.port,
        tlsRequiredInProduction: true,
        redisConnected: store.isConnected()
      },
      'Mythr Prism backend started'
    );
  });
};

void start();
