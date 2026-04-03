export type RemoteConnectionState = 'connecting' | 'paired' | 'reconnecting' | 'down';

export interface RoomRecord {
  roomId: string;
  hostSocketId: string;
  pairCode: string;
  createdAtMs: number;
  expiresAtMs: number;
  firstClientPaired: boolean;
}

export interface RemoteClientRecord {
  remoteMonitorId: string;
  clientSocketId: string;
  roomId: string;
  pairedAtMs: number;
  state: RemoteConnectionState;
}

export interface PairAttemptStatus {
  attempts: number;
  bannedUntilMs: number | null;
}
