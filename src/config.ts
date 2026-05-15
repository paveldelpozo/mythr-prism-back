import 'dotenv/config';

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};

export interface AppConfig {
  port: number;
  host: string;
  corsOrigin: string;
  redisUrl: string;
  fullControlApiKey: string;
  fullControlRateLimitWindowMs: number;
  fullControlRateLimitMax: number;
  roomTtlMs: number;
  unapprovedAttemptLimit: number;
  banDurationMs: number;
  secureMode: boolean;
}

export const loadConfig = (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const secureMode = nodeEnv === 'production';

  return {
    port: toInt(process.env.PORT, 3000),
    host: process.env.HOST ?? '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
    redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    fullControlApiKey: process.env.FULL_CONTROL_API_KEY ?? 'mythr-prism-dev-full-control-key',
    fullControlRateLimitWindowMs: toInt(process.env.FULL_CONTROL_RATE_LIMIT_WINDOW_MS, 60_000),
    fullControlRateLimitMax: toInt(process.env.FULL_CONTROL_RATE_LIMIT_MAX, 120),
    roomTtlMs: toInt(process.env.ROOM_TTL_MS, 5 * 60_000),
    unapprovedAttemptLimit: toInt(process.env.UNAPPROVED_ATTEMPT_LIMIT, 8),
    banDurationMs: toInt(process.env.BAN_DURATION_MS, 5 * 60_000),
    secureMode
  };
};
