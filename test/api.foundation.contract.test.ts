import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

const TEST_API_KEY = 'foundation-contract-test-key';

describe('full control API foundation contract', () => {
  let app: Parameters<typeof request>[0];

  beforeAll(async () => {
    process.env.SKIP_SERVER_START = 'true';
    process.env.FULL_CONTROL_API_KEY = TEST_API_KEY;
    process.env.FULL_CONTROL_RATE_LIMIT_MAX = '200';

    const module = await import('../src/server.js');
    app = module.app;
  });

  it('requires api key for /api/v1/system/status', async () => {
    const response = await request(app).get('/api/v1/system/status');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'unauthorized_api_key',
      message: expect.any(String)
    });
  });

  it('returns foundation status with API key', async () => {
    const response = await request(app)
      .get('/api/v1/system/status')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      service: 'mythr-prism-back',
      apiVersion: 'v1',
      status: 'ok'
    });
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('returns mock monitor records for foundation endpoint', async () => {
    const response = await request(app)
      .get('/api/v1/monitors')
      .set('x-api-key', TEST_API_KEY);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0]).toMatchObject({
      id: 'foundation-monitor-1',
      source: 'foundation-mock'
    });
  });

  it('exports OpenAPI 3.1 json and yaml without API key', async () => {
    const jsonResponse = await request(app).get('/openapi.json');
    const yamlResponse = await request(app).get('/openapi.yaml');

    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.body.openapi).toBe('3.1.0');
    expect(jsonResponse.body.paths['/system/status']).toBeDefined();

    expect(yamlResponse.status).toBe(200);
    expect(yamlResponse.text).toContain('openapi: 3.1.0');
    expect(yamlResponse.text).toContain('/monitors:');
  });
});
