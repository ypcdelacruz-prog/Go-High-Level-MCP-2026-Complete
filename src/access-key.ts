/**
 * Access-key protection for the HTTP server.
 *
 * Callers must prove they know MCP_ACCESS_KEY, either by
 *   - putting it as the first path segment:  https://host/<key>/mcp
 *     (needed for Claude custom connectors, which only accept a URL), or
 *   - sending the header:  Authorization: Bearer <key>
 *
 * Only GET /health stays open (no sensitive data) so hosting platforms can
 * run health checks. The key segment is stripped from req.url before any
 * later middleware or route sees it, so it never reaches the request logger.
 */

import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const MIN_ACCESS_KEY_LENGTH = 24;

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Returns the configured key, or undefined when protection is off.
 * In production (NODE_ENV=production) the key is mandatory unless
 * MCP_ALLOW_NO_AUTH=true is set explicitly.
 */
export function resolveAccessKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const key = (env.MCP_ACCESS_KEY || '').trim();

  if (!key) {
    if (env.NODE_ENV === 'production' && env.MCP_ALLOW_NO_AUTH !== 'true') {
      throw new Error(
        'MCP_ACCESS_KEY is required when NODE_ENV=production. ' +
          `Set a random value of at least ${MIN_ACCESS_KEY_LENGTH} characters.`
      );
    }
    return undefined;
  }

  if (key.length < MIN_ACCESS_KEY_LENGTH) {
    throw new Error(`MCP_ACCESS_KEY must be at least ${MIN_ACCESS_KEY_LENGTH} characters long.`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error('MCP_ACCESS_KEY may only contain letters, digits, "-" and "_" (it is used inside a URL).');
  }
  return key;
}

export function accessKeyMiddleware(key: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET' && req.path === '/health') {
      next();
      return;
    }

    if (req.method === 'OPTIONS') {
      next();
      return;
    }

    const auth = req.headers.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ') && safeEqual(auth.slice(7).trim(), key)) {
      next();
      return;
    }

    const match = /^\/([^/?#]+)([^]*)$/.exec(req.url);
    if (match) {
      let segment = match[1];
      try {
        segment = decodeURIComponent(segment);
      } catch {
        // leave undecoded; it simply will not match
      }
      if (safeEqual(segment, key)) {
        const rest = match[2];
        req.url = rest === '' ? '/' : rest.startsWith('?') ? `/${rest}` : rest;
        next();
        return;
      }
    }

    res.status(401).json({ error: 'Unauthorized' });
  };
}
