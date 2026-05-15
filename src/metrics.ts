import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

export const pairingAttemptsTotal = new Counter({
  name: 'pairing_attempts_total',
  help: 'Total number of pairing attempts',
  labelNames: ['result'],
  registers: [metricsRegistry]
});

export const pairingSuccessTotal = new Counter({
  name: 'pairing_success_total',
  help: 'Total successful pairings',
  registers: [metricsRegistry]
});

export const roomExpiredTotal = new Counter({
  name: 'room_expired_total',
  help: 'Rooms expired without first client',
  registers: [metricsRegistry]
});

export const reconnectTotal = new Counter({
  name: 'reconnect_total',
  help: 'Total reconnect events',
  registers: [metricsRegistry]
});

export const webrtcNegotiationFailTotal = new Counter({
  name: 'webrtc_negotiation_fail_total',
  help: 'WebRTC signaling failures',
  labelNames: ['event'],
  registers: [metricsRegistry]
});

export const signalingLatencyMs = new Histogram({
  name: 'signaling_latency_ms',
  help: 'Signaling latency by event in ms',
  labelNames: ['event'],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2000],
  registers: [metricsRegistry]
});

export const activeRooms = new Gauge({
  name: 'active_rooms',
  help: 'Current active rooms',
  registers: [metricsRegistry]
});

export const activeRemoteClients = new Gauge({
  name: 'active_remote_clients',
  help: 'Current active remote clients',
  registers: [metricsRegistry]
});
