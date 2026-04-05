# mythr-prism-back

Backend realtime para el feature **Monitor Virtual Remoto (Cloud Sync)**.

## Stack

- Node.js + Express
- Socket.io para lifecycle/pairing/signaling
- Redis para salas/sesiones con TTL
- Prometheus metrics (`/metrics`) + logs estructurados (`pino`)

## Endpoints

- `GET /health` estado base del servicio
- `GET /ready` readiness (requiere Redis conectado)
- `GET /metrics` metricas para scraping

## Pairing flow

1. Host crea sala con `pairing:create-room`.
2. Cliente entra por URL/QR a `/remote` e ingresa codigo `XXXX-XXXX-XXXX`.
3. Cliente envia `pairing:join-request`.
4. Host valida con `pairing:approve-client`.
5. Backend asigna `remoteMonitorId` y habilita signaling WebRTC.

Si no se conecta el primer cliente en 5 minutos (`ROOM_TTL_MS`), la sala expira automaticamente.

## TLS

- **Produccion**: TLS obligatorio (terminado por proxy de Dokploy, HTTPS/WSS).
- **Local**: HTTP/WS permitido para desarrollo; recomendado probar al menos una vez sobre TLS local para validar fullscreen/politicas de navegador.

## Desarrollo

```bash
pnpm --filter mythr-prism-back install
pnpm --filter mythr-prism-back run dev
```

## Validacion minima backend

```bash
pnpm --filter mythr-prism-back run typecheck
pnpm --filter mythr-prism-back run test
pnpm --filter mythr-prism-back run build
```
