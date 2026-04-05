import { createClient, type RedisClientType } from 'redis';
import type { PairAttemptStatus, RemoteClientRecord, RoomRecord } from './types.js';

type PairAttemptMap = Map<string, PairAttemptStatus>;

const roomKey = (roomId: string): string => `room:${roomId}`;
const roomClientsKey = (roomId: string): string => `room:${roomId}:clients`;
const pairAttemptKey = (roomId: string, ip: string): string => `pair-attempt:${roomId}:${ip}`;

export class SessionStore {
  private readonly redis: RedisClientType;

  private readonly roomFallback = new Map<string, RoomRecord>();

  private readonly roomClientsFallback = new Map<string, RemoteClientRecord[]>();

  private readonly pairAttemptsFallback: PairAttemptMap = new Map();

  private connected = false;

  constructor(private readonly redisUrl: string) {
    this.redis = createClient({ url: redisUrl });
  }

  async connect(): Promise<void> {
    try {
      await this.redis.connect();
      this.connected = true;
    } catch {
      this.connected = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.redis.quit();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async saveRoom(room: RoomRecord, ttlMs: number): Promise<void> {
    if (!this.connected) {
      this.roomFallback.set(room.roomId, room);
      return;
    }

    await this.redis.set(roomKey(room.roomId), JSON.stringify(room), { PX: ttlMs });
  }

  async getRoom(roomId: string): Promise<RoomRecord | null> {
    if (!this.connected) {
      return this.roomFallback.get(roomId) ?? null;
    }

    const raw = await this.redis.get(roomKey(roomId));
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as RoomRecord;
  }

  async deleteRoom(roomId: string): Promise<void> {
    if (!this.connected) {
      this.roomFallback.delete(roomId);
      this.roomClientsFallback.delete(roomId);
      return;
    }

    await this.redis.del(roomKey(roomId));
    await this.redis.del(roomClientsKey(roomId));
  }

  async setRoomTtl(roomId: string, ttlMs: number): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.redis.pExpire(roomKey(roomId), ttlMs);
  }

  async saveRoomClients(roomId: string, clients: RemoteClientRecord[]): Promise<void> {
    if (!this.connected) {
      this.roomClientsFallback.set(roomId, clients);
      return;
    }

    await this.redis.set(roomClientsKey(roomId), JSON.stringify(clients));
  }

  async getRoomClients(roomId: string): Promise<RemoteClientRecord[]> {
    if (!this.connected) {
      return this.roomClientsFallback.get(roomId) ?? [];
    }

    const raw = await this.redis.get(roomClientsKey(roomId));
    if (!raw) {
      return [];
    }

    return JSON.parse(raw) as RemoteClientRecord[];
  }

  async getPairAttempt(roomId: string, ip: string): Promise<PairAttemptStatus> {
    const key = pairAttemptKey(roomId, ip);

    if (!this.connected) {
      return this.pairAttemptsFallback.get(key) ?? { attempts: 0, bannedUntilMs: null };
    }

    const raw = await this.redis.get(key);
    if (!raw) {
      return { attempts: 0, bannedUntilMs: null };
    }

    return JSON.parse(raw) as PairAttemptStatus;
  }

  async savePairAttempt(roomId: string, ip: string, status: PairAttemptStatus, ttlMs: number): Promise<void> {
    const key = pairAttemptKey(roomId, ip);

    if (!this.connected) {
      this.pairAttemptsFallback.set(key, status);
      return;
    }

    await this.redis.set(key, JSON.stringify(status), { PX: ttlMs });
  }
}
