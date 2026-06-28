// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { UserConfig } from 'vite';
import viteConfig from './vite.config';

describe('vite dev proxy', () => {
  it('uses loopback IPv4 for API and WebSocket backend targets', () => {
    const config = viteConfig as UserConfig;

    expect(config.server?.proxy?.['/api']).toMatchObject({
      target: 'http://127.0.0.1:3001',
    });
    expect(config.server?.proxy?.['/ws']).toMatchObject({
      target: 'ws://127.0.0.1:3001',
      ws: true,
    });
  });
});
