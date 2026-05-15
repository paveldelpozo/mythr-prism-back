import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { io as createClientSocket, type Socket } from 'socket.io-client';
import type { Server as SocketIoServer } from 'socket.io';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TEST_API_KEY = 'foundation-realtime-test-key';

describe('full control realtime foundation contract', () => {
  let server: Server;
  let io: SocketIoServer;
  let baseUrl = '';

  beforeAll(async () => {
    process.env.SKIP_SERVER_START = 'true';
    process.env.FULL_CONTROL_API_KEY = TEST_API_KEY;

    const module = await import('../src/server.js');
    server = module.server;
    io = module.io;

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected test server address');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    io.close();

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it('rejects realtime connection with invalid api key', async () => {
    const socket = createClientSocket(`${baseUrl}/realtime/v1`, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { apiKey: 'invalid-key' }
    });

    const waitForError = new Promise<void>((resolve) => {
      socket.on('connect_error', (error) => {
        expect(error.message).toBe('unauthorized_api_key');
        socket.disconnect();
        resolve();
      });
    });

    socket.connect();
    await waitForError;
  });

  it('emits hello and status events after authenticated ping', async () => {
    const socket = createClientSocket(`${baseUrl}/realtime/v1`, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { apiKey: TEST_API_KEY }
    });

    const helloPromise = onceEvent(socket, 'system:hello');

    socket.connect();

    await waitForConnect(socket);

    const helloPayload = await helloPromise;
    expect(helloPayload).toMatchObject({
      type: 'system:hello',
      payload: {
        socketId: expect.any(String),
        status: {
          service: 'mythr-prism-back',
          status: 'ok'
        }
      }
    });

    const statusEventPromise = onceEvent(socket, 'system:status');
    const ackResponse = await new Promise<unknown>((resolve) => {
      socket.emit('system:ping', {}, (ack: unknown) => {
        resolve(ack);
      });
    });

    expect(ackResponse).toMatchObject({
      ok: true,
      status: {
        service: 'mythr-prism-back',
        status: 'ok'
      }
    });

    const statusPayload = await statusEventPromise;
    expect(statusPayload).toMatchObject({
      type: 'system:status',
      payload: {
        apiVersion: 'v1',
        status: 'ok'
      }
    });

    socket.disconnect();
  });
});

const waitForConnect = async (socket: Socket): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => reject(error));
  });
};

const onceEvent = async (socket: Socket, eventName: string): Promise<unknown> =>
  new Promise((resolve) => {
    socket.once(eventName, (payload) => resolve(payload));
  });
