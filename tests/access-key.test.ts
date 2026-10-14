import { describe, expect, it } from '@jest/globals';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { accessKeyMiddleware, resolveAccessKey } from '../src/access-key.js';

const KEY = 'a'.repeat(10) + 'B'.repeat(10) + '0123456789';

describe('resolveAccessKey', () => {
  it('is off outside production when no key is set', () => {
    expect(resolveAccessKey({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it('is mandatory in production', () => {
    expect(() => resolveAccessKey({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/MCP_ACCESS_KEY/);
  });

  it('can be explicitly disabled in production', () => {
    expect(
      resolveAccessKey({ NODE_ENV: 'production', MCP_ALLOW_NO_AUTH: 'true' } as NodeJS.ProcessEnv)
    ).toBeUndefined();
  });

  it('rejects short or URL-unsafe keys', () => {
    expect(() => resolveAccessKey({ MCP_ACCESS_KEY: 'short' } as NodeJS.ProcessEnv)).toThrow(/at least/);
    expect(() => resolveAccessKey({ MCP_ACCESS_KEY: 'x'.repeat(30) + '/..' } as NodeJS.ProcessEnv)).toThrow(
      /letters, digits/
    );
  });

  it('returns a valid key', () => {
    expect(resolveAccessKey({ MCP_ACCESS_KEY: KEY } as NodeJS.ProcessEnv)).toBe(KEY);
  });
});

function request(
  port: number,
  path: string,
  options: { method?: string; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: options.method || 'GET', headers: options.headers },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('accessKeyMiddleware', () => {
  const app = express();
  app.use(accessKeyMiddleware(KEY));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.all('/mcp', (req, res) => res.json({ url: req.url, query: req.query }));
  app.get('/', (_req, res) => res.json({ root: true }));

  const server = http.createServer(app);
  let port = 0;

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('keeps /health open', async () => {
    expect((await request(port, '/health')).status).toBe(200);
  });

  it('rejects requests without a key', async () => {
    expect((await request(port, '/mcp')).status).toBe(401);
    expect((await request(port, '/')).status).toBe(401);
  });

  it('rejects a wrong key in the path or header', async () => {
    expect((await request(port, `/${KEY}x/mcp`)).status).toBe(401);
    expect((await request(port, '/wrong/mcp')).status).toBe(401);
    expect((await request(port, '/mcp', { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
  });

  it('accepts the key in the path and strips it before routing', async () => {
    const res = await request(port, `/${KEY}/mcp?x=1`);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ url: '/mcp?x=1', query: { x: '1' } });
  });

  it('accepts the key alone as the root path', async () => {
    const res = await request(port, `/${KEY}`);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ root: true });
  });

  it('accepts the key as a Bearer token', async () => {
    const res = await request(port, '/mcp', { headers: { Authorization: `Bearer ${KEY}` } });
    expect(res.status).toBe(200);
  });
});
