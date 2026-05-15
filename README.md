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
- `GET /docs` Swagger UI (foundation OpenAPI 3.1)
- `GET /openapi.json` especificacion OpenAPI en JSON
- `GET /openapi.yaml` especificacion OpenAPI en YAML
- `GET /api/v1/system/status` estado foundation API (requiere API key)
- `GET /api/v1/monitors` inventario foundation mock (requiere API key)

## Full Control API foundation (V2 kickoff)

Esta iteracion activa una base REST + Realtime para integraciones de terceros:

- Prefix REST: `/api/v1`
- Auth API key (`x-api-key` o `Authorization: Bearer <key>`) en rutas API
- Rate limit basico por IP en rutas API
- Envelope de error estandar: `{ code, message, details }`
- Canal realtime foundation con Socket.IO namespace `/realtime/v1`

Eventos foundation:

- `system:hello` al conectar (payload inicial de estado)
- `system:ping` (cliente -> servidor, responde ack + `system:status`)
- `system:status` (servidor -> cliente)

### Variables de entorno relevantes

- `FULL_CONTROL_API_KEY` API key para REST y realtime foundation.
  - Default dev: `mythr-prism-dev-full-control-key`
- `FULL_CONTROL_RATE_LIMIT_WINDOW_MS` ventana de rate limit por IP (default `60000`)
- `FULL_CONTROL_RATE_LIMIT_MAX` max requests por IP en la ventana (default `120`)

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

### Ejemplo rapido de uso API foundation

```bash
curl -H "x-api-key: mythr-prism-dev-full-control-key" \
  http://localhost:3000/api/v1/system/status
```

## Validacion minima backend

```bash
pnpm --filter mythr-prism-back run typecheck
pnpm --filter mythr-prism-back run test
pnpm --filter mythr-prism-back run build
```
