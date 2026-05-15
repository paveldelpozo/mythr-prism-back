import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details?: unknown;
}

export interface SystemStatusResponse {
  service: 'mythr-prism-back';
  apiVersion: 'v1';
  status: 'ok';
  secureMode: boolean;
  timestamp: string;
}

export interface MonitorFoundationRecord {
  id: string;
  label: string;
  status: 'available' | 'inactive';
  source: 'foundation-mock';
}

export interface FullControlApiOptions {
  secureMode: boolean;
  apiKey: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
}

export const createApiErrorEnvelope = (
  code: string,
  message: string,
  details?: unknown
): ApiErrorEnvelope => {
  if (typeof details === 'undefined') {
    return { code, message };
  }

  return { code, message, details };
};

const normalizeApiKey = (value: string | string[] | undefined): string | null => {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readApiKeyFromRequest = (request: Request): string | null => {
  const headerKey = normalizeApiKey(request.header('x-api-key'));
  if (headerKey) {
    return headerKey;
  }

  const bearer = request.header('authorization');
  if (typeof bearer === 'string' && bearer.startsWith('Bearer ')) {
    return normalizeApiKey(bearer.slice('Bearer '.length));
  }

  return null;
};

export const createSystemStatusPayload = (secureMode: boolean): SystemStatusResponse => ({
  service: 'mythr-prism-back',
  apiVersion: 'v1',
  status: 'ok',
  secureMode,
  timestamp: new Date().toISOString()
});

export const createFoundationMonitorsPayload = (): MonitorFoundationRecord[] => [
  {
    id: 'foundation-monitor-1',
    label: 'Foundation Monitor 1',
    status: 'available',
    source: 'foundation-mock'
  }
];

export const createApiKeyAuthMiddleware = (apiKey: string): RequestHandler => (request, response, next) => {
  const requestApiKey = readApiKeyFromRequest(request);
  if (requestApiKey === apiKey) {
    next();
    return;
  }

  response.status(401).json(
    createApiErrorEnvelope(
      'unauthorized_api_key',
      'Missing or invalid API key for full control API access.'
    )
  );
};

export const createApiRateLimiter = (
  windowMs: number,
  max: number
): RequestHandler => rateLimit({
  windowMs,
  max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json(
      createApiErrorEnvelope(
        'rate_limit_exceeded',
        'Too many requests for this IP address. Retry later.'
      )
    );
  }
});

const FoundationOpenApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Mythr Prism Full Control API',
    version: '1.0.0-foundation',
    description: 'Foundation V2 API surface for third-party integrations (REST + realtime).'
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'System', description: 'Operational status and diagnostics.' },
    { name: 'Monitors', description: 'Monitor inventory and lifecycle.' }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key'
      }
    },
    schemas: {
      ApiErrorEnvelope: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          details: {}
        }
      },
      SystemStatusResponse: {
        type: 'object',
        required: ['service', 'apiVersion', 'status', 'secureMode', 'timestamp'],
        properties: {
          service: { type: 'string', enum: ['mythr-prism-back'] },
          apiVersion: { type: 'string', enum: ['v1'] },
          status: { type: 'string', enum: ['ok'] },
          secureMode: { type: 'boolean' },
          timestamp: { type: 'string', format: 'date-time' }
        }
      },
      MonitorFoundationRecord: {
        type: 'object',
        required: ['id', 'label', 'status', 'source'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          status: { type: 'string', enum: ['available', 'inactive'] },
          source: { type: 'string', enum: ['foundation-mock'] }
        }
      }
    }
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    '/system/status': {
      get: {
        operationId: 'getSystemStatus',
        tags: ['System'],
        summary: 'Get backend service status.',
        responses: {
          200: {
            description: 'Current service status.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SystemStatusResponse' }
              }
            }
          },
          401: {
            description: 'API key is missing or invalid.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorEnvelope' }
              }
            }
          }
        }
      }
    },
    '/monitors': {
      get: {
        operationId: 'listMonitorsFoundation',
        tags: ['Monitors'],
        summary: 'List monitor records (foundation mock payload).',
        responses: {
          200: {
            description: 'Monitor list payload.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/MonitorFoundationRecord' }
                }
              }
            }
          },
          401: {
            description: 'API key is missing or invalid.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiErrorEnvelope' }
              }
            }
          }
        }
      }
    }
  }
} as const;

export const fullControlOpenApiSpec = FoundationOpenApiSpec;

const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json(
    createApiErrorEnvelope(
      'resource_not_found',
      `No API route matches ${request.method} ${request.originalUrl}.`
    )
  );
};

const errorHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction
) => {
  const details = error instanceof Error ? { reason: error.message } : undefined;
  response.status(500).json(
    createApiErrorEnvelope('internal_server_error', 'Unexpected API failure.', details)
  );
};

export const createFullControlApiRouter = (
  options: Pick<FullControlApiOptions, 'secureMode'>
): Router => {
  const router = Router();

  router.get('/system/status', (_request, response) => {
    response.json(createSystemStatusPayload(options.secureMode));
  });

  router.get('/monitors', (_request, response) => {
    response.json(createFoundationMonitorsPayload());
  });

  router.use(notFoundHandler);
  router.use(errorHandler);

  return router;
};
