# Backlog y plan de implementacion del backend Mythr Prism

Ultima actualizacion: 2026-04-03

## Resumen

Backlog tecnico del backend para habilitar **Monitor Virtual Remoto (Cloud Sync)** sin implementar codigo funcional en esta iteracion.

- Stack confirmado: Node.js + Socket.io.
- Estado de sesiones: Redis.
- Transporte preferido de contenido: WebRTC (senalizacion por Socket.io).
- Seguridad inicial: TLS obligatorio en produccion, CORS abierto temporalmente, anti abuso por rate limit + baneo temporal.
- Observabilidad desde el dia 0: logs estructurados + metricas.

## Decisiones de arquitectura base (aprobadas para ejecucion)

- **Senalizacion**: Socket.io como bus de control (`room lifecycle`, pairing, heartbeat, reconexion, errores).
- **Data/media path**:
  - Canal de control y eventos: Socket.io (JSON tipado).
  - Canal de contenido host -> remoto: WebRTC preferido para reducir latencia y sostener objetivo ideal de 25fps.
  - Fallback inicial: degradacion por snapshots/frames controlados si WebRTC no queda disponible en runtime.
- **Modelo Redis de sesion/sala**:
  - `room:{roomId}`: metadatos de sala, host, timestamps, estado.
  - `room:{roomId}:clients`: set/hash de clientes remotos emparejados.
  - `pair:{roomId}:{pairCode}`: intento de pairing con TTL corto y conteo de intentos.
  - TTL de sala sin clientes: 5 minutos (autocierre).
- **Anti abuso**:
  - Rate limit de intentos no aprobados por `ip + roomId`.
  - Baneo temporal escalonado por exceso (ej. 5m, 15m, 60m).
  - Registro de eventos de abuso para auditoria operativa.
- **Observabilidad**:
  - Logs JSON con `requestId`, `roomId`, `clientId`, `event`, `status`, `latencyMs`.
  - Metricas minimas: `pairing_attempts_total`, `pairing_success_total`, `active_rooms`, `active_remote_clients`, `reconnect_total`, `room_expired_total`, `webrtc_negotiation_fail_total`.

## Estrategia TLS: local vs produccion

- **Produccion (obligatorio)**
  - HTTPS/WSS terminados en proxy de entrada de Dokploy (certificados validos).
  - Redireccion HTTP -> HTTPS.
  - Cookies/tokens de sesion efimeros solo en canal seguro.
- **Local (estrategia clara)**
  - Opcion A (default desarrollo): HTTP/WS en `localhost` con advertencia explicita de entorno no productivo.
  - Opcion B (paridad pre-release): HTTPS local con mkcert/Caddy/Traefik para pruebas de fullscreen/kiosko y politicas de navegador mas cercanas a produccion.
  - Regla: cualquier prueba de flujo final de pairing remoto debe ejecutarse al menos una vez sobre entorno TLS.

## Epicas V1 - Monitor Virtual Remoto (Cloud Sync)

- [ ] **E1. Foundation de servicio Socket.io + Redis**
  - Estado: `approved-pending-execution`.
  - Entregables:
    - [ ] Bootstrap del servidor Node con namespaces/eventos base.
    - [ ] Cliente Redis, esquema de claves y politica TTL.
    - [ ] Healthcheck/readiness y configuracion por variables de entorno.
  - Criterios de aceptacion:
    - [ ] El servicio levanta en local y responde health/readiness.
    - [ ] Se crea/expira sala en Redis con TTL de 5 minutos sin clientes.
  - DoD fase:
    - [ ] Pruebas unitarias de utilidades de sala/TTL.
    - [ ] Logging estructurado activo en eventos core.

- [ ] **E2. Pairing seguro y lifecycle de sala**
  - Estado: `approved-pending-execution`.
  - Entregables:
    - [ ] Generacion de `pairCode` alta entropia formato `XXXX-XXXX-XXXX`.
    - [ ] Flujo host crea sala -> cliente por URL/QR -> cliente ingresa codigo -> host valida.
    - [ ] Cierre automatico por inactividad de clientes a los 5 minutos.
  - Criterios de aceptacion:
    - [ ] Solo el cliente ingresa codigo; host nunca pide ingresar codigo manual.
    - [ ] Pairing invalido no da alta de cliente ni consume estado inconsistente.
  - DoD fase:
    - [ ] Tests de contrato Socket.io para handshake exitoso y rechazo.
    - [ ] Metricas de intentos/resultado disponibles.

- [ ] **E3. Transporte remoto por WebRTC + sincronizacion de estado**
  - Estado: `approved-pending-execution`.
  - Entregables:
    - [ ] Senalizacion SDP/ICE via Socket.io.
    - [ ] Canal de contenido host->remoto optimizado para 25fps objetivo.
    - [ ] Canal de control para estado remoto (`conectando/emparejado/reconectando/caido`).
  - Criterios de aceptacion:
    - [ ] En red objetivo, flujo remoto mantiene reproduccion estable con degradacion controlada.
    - [ ] Reconexion breve preserva sala y recupera estado remoto.
  - DoD fase:
    - [ ] Pruebas de reconexion y fallback documentadas.
    - [ ] Registro de latencia y fps efectivo por sesion.

- [ ] **E4. Seguridad operativa y anti abuso**
  - Estado: `approved-pending-execution`.
  - Entregables:
    - [ ] Middleware rate limit para pairing no aprobado.
    - [ ] Baneo temporal escalonado por IP/room.
    - [ ] Hooks de auditoria de eventos sospechosos.
  - Criterios de aceptacion:
    - [ ] Exceso de intentos bloquea temporalmente nuevos intentos de pairing.
    - [ ] El baneo expira automaticamente sin intervencion manual.
  - DoD fase:
    - [ ] Tests de limite y expiracion de ban.
    - [ ] Dashboards/consultas basicas para detectar abuso.

- [ ] **E5. Observabilidad y operaciones (desde inicio)**
  - Estado: `approved-pending-execution`.
  - Entregables:
    - [ ] Logs estructurados y politicas de nivel (`info/warn/error`).
    - [ ] Endpoint o export de metricas para scraping.
    - [ ] Trazas de eventos criticos de pairing/sala/reconexion.
  - Criterios de aceptacion:
    - [ ] Cada incidente operativo puede rastrearse por `roomId` y `requestId`.
    - [ ] Metricas clave disponibles en entorno de despliegue.
  - DoD fase:
    - [ ] Checklist de observabilidad minimo completo antes de release.

## Checklist tecnico de infraestructura (backend)

- [ ] Variables de entorno versionadas en `.env.example` (sin secretos reales).
- [ ] Redis provisionado con politica de eviction compatible y persistence definida.
- [ ] Socket.io con configuracion de ping/pong, reconexion y limites de payload.
- [ ] Timeouts globales de handshake y limpieza de sockets huerfanos.
- [ ] CORS abierto temporalmente documentado (y pendiente de restriccion por origen en hardening).
- [ ] Limites de intentos + baneo temporal habilitados.
- [ ] Logs JSON + metricas publicados desde inicio.
- [ ] Runbook minimo de incidencias (reinicio, saturacion, degradacion de red).

## Checklist de despliegue Dokploy (front + back)

- [ ] Definir `docker-compose` del monorepo con servicios `frontend`, `backend` y `redis`.
- [ ] Configurar networking interno entre servicios y puertos publicos minimos.
- [ ] Configurar variables de entorno por servicio en Dokploy.
- [ ] Activar TLS en entrada publica (HTTPS/WSS) para produccion.
- [ ] Configurar healthcheck de backend y estrategia de restart.
- [ ] Definir estrategia de logs (retencion minima y acceso operativo).
- [ ] Validar deploy end-to-end: host crea sala, cliente remoto empareja, sala expira sin clientes en 5 min.

## Plan de implementacion aprobado pendiente de ejecucion

- Estado general: `aprobado pendiente de OK final del usuario`.
- Ramas sugeridas:
  - `feature/back-remote-foundation`
  - `feature/back-remote-pairing`
  - `feature/back-remote-webrtc`
  - `feature/back-remote-security-observability`
  - `feature/infra-dokploy-remote-stack`
- Regla de integracion:
  - Merge por fase a `development` con DoD completo y validacion tecnica minima.
  - Promocion a `main` solo tras cierre de checklist Dokploy + smoke test remoto.
- Gate de inicio:
  - [ ] OK explicito del usuario para iniciar implementacion funcional.

## Riesgos principales y mitigaciones

- Riesgo: variabilidad de red impide 25fps sostenido.
  - Mitigacion: adaptacion de calidad/fps dinamica y telemetria de fps real por cliente.
- Riesgo: complejidad de WebRTC en navegadores moviles.
  - Mitigacion: fase de pruebas temprana con matriz de dispositivos + fallback degradado controlado.
- Riesgo: abuso de endpoints de pairing por CORS abierto.
  - Mitigacion: rate limit estricto, ban temporal y monitoreo de anomalias desde primera entrega.
