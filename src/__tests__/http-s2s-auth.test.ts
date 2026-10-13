/**
 * HTTP transport fails closed (CWE-306).
 *
 * Startup refuses to listen when CONDUIT_S2S_SECRET is empty or a known
 * placeholder, unless MCP_ALLOW_INSECURE_DEV=1 (empty secret only). That
 * bypass binds 127.0.0.1 even if MCP_HTTP_HOST is wider. A real secret
 * honors MCP_HTTP_HOST. Gateway-mode /mcp requests without
 * X-SaaS-Alerts-API-Key are 401 and must not consult process.env.
 */
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TEST_SECRET = 'test-s2s-fail-closed-secret-do-not-use-in-prod';
const ENV_API_KEY = 'env-saas-alerts-key-must-not-leak';
const HEADER_API_KEY = 'header-saas-alerts-key';

const getCredentialsSpy = vi.hoisted(() => vi.fn());

vi.mock('../utils/client.js', async () => {
  const actual = await vi.importActual<typeof import('../utils/client.js')>('../utils/client.js');
  return {
    ...actual,
    getClient: () => {
      throw new Error('network disabled in test');
    },
    getCredentials: () => {
      const creds = actual.getCredentials();
      getCredentialsSpy(creds);
      return creds;
    },
  };
});

const ENV_KEYS = [
  'MCP_TRANSPORT',
  'AUTH_MODE',
  'MCP_HTTP_PORT',
  'MCP_HTTP_HOST',
  'CONDUIT_S2S_SECRET',
  'MCP_ALLOW_INSECURE_DEV',
  'SAAS_ALERTS_API_KEY',
  'LOG_LEVEL',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const openServers: Server[] = [];

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function mintS2sHeader(secret: string, unixSeconds = Math.floor(Date.now() / 1000)): string {
  const message = `t=${unixSeconds}`;
  const hex = createHmac('sha256', secret).update(message).digest('hex');
  return `${message},v1=${hex}`;
}

function assertNoSecrets(text: string): void {
  expect(text).not.toContain(TEST_SECRET);
  expect(text).not.toContain(ENV_API_KEY);
  expect(text).not.toContain(HEADER_API_KEY);
  expect(text).not.toContain('replace-with-a-real-secret');
  expect(text).not.toContain('Your-S2S-Secret');
  expect(text).not.toContain('changeme');
}

async function loadHttpModule(): Promise<{ httpServers: Server[] }> {
  vi.resetModules();
  return import('../http.js');
}

async function waitForListen(server: Server): Promise<AddressInfo> {
  if (!server.listening) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('listen timeout')), 5000);
      server.once('listening', () => {
        clearTimeout(timer);
        resolve();
      });
      server.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('server has no TCP address');
  return addr;
}

function captureConsoleError(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  });
  return {
    lines,
    restore: () => spy.mockRestore(),
  };
}

function exitSpy() {
  return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${code ?? 'undefined'}`);
  }) as typeof process.exit);
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => closeServer(server)));
  restoreEnv();
  vi.restoreAllMocks();
});

describe('HTTP startup fails closed without CONDUIT_S2S_SECRET', () => {
  it('logs an error and exits non-zero when the secret is unset', async () => {
    delete process.env.CONDUIT_S2S_SECRET;
    delete process.env.MCP_ALLOW_INSECURE_DEV;
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_PORT = '0';
    process.env.MCP_HTTP_HOST = '127.0.0.1';
    process.env.LOG_LEVEL = 'error';

    const captured = captureConsoleError();
    const exit = exitSpy();
    try {
      await expect(loadHttpModule()).rejects.toThrow('process.exit:1');
      expect(exit).toHaveBeenCalledWith(1);
      const logged = captured.lines.join('\n');
      expect(logged).toContain('Refusing to start HTTP server: CONDUIT_S2S_SECRET is empty.');
      expect(logged).toContain('CWE-306');
      expect(logged).toContain('MCP_ALLOW_INSECURE_DEV=1');
      assertNoSecrets(logged);
    } finally {
      captured.restore();
      exit.mockRestore();
    }
  });

  it('exits when the secret is empty or whitespace', async () => {
    process.env.CONDUIT_S2S_SECRET = '   ';
    delete process.env.MCP_ALLOW_INSECURE_DEV;
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_PORT = '0';
    process.env.LOG_LEVEL = 'error';

    const captured = captureConsoleError();
    const exit = exitSpy();
    try {
      await expect(loadHttpModule()).rejects.toThrow('process.exit:1');
      expect(exit).toHaveBeenCalledWith(1);
      expect(captured.lines.join('\n')).toContain('CONDUIT_S2S_SECRET is empty');
    } finally {
      captured.restore();
      exit.mockRestore();
    }
  });

  it('still exits when MCP_ALLOW_INSECURE_DEV is not exactly 1', async () => {
    delete process.env.CONDUIT_S2S_SECRET;
    process.env.MCP_ALLOW_INSECURE_DEV = 'true';
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_PORT = '0';
    process.env.LOG_LEVEL = 'error';

    const captured = captureConsoleError();
    const exit = exitSpy();
    try {
      await expect(loadHttpModule()).rejects.toThrow('process.exit:1');
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      captured.restore();
      exit.mockRestore();
    }
  });

  it('starts on 127.0.0.1 and logs a warning when MCP_ALLOW_INSECURE_DEV=1', async () => {
    delete process.env.CONDUIT_S2S_SECRET;
    delete process.env.MCP_HTTP_HOST;
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_TRANSPORT = 'http';
    process.env.AUTH_MODE = 'gateway';
    process.env.MCP_HTTP_PORT = '0';
    process.env.LOG_LEVEL = 'error';

    const captured = captureConsoleError();
    const exit = exitSpy();
    try {
      const mod = await loadHttpModule();
      const server = mod.httpServers[0];
      openServers.push(server);
      const addr = await waitForListen(server);
      expect(exit).not.toHaveBeenCalled();
      expect(addr.address).toBe('127.0.0.1');
      const logged = captured.lines.join('\n');
      expect(logged).toContain('SECURITY WARNING');
      expect(logged).toContain('MCP_ALLOW_INSECURE_DEV=1');
      expect(logged).toContain('DISABLED');
      expect(logged).toContain('127.0.0.1');
      assertNoSecrets(logged);
    } finally {
      captured.restore();
      exit.mockRestore();
    }
  });

  it('forces 127.0.0.1 when insecure dev is set and MCP_HTTP_HOST is not loopback', async () => {
    delete process.env.CONDUIT_S2S_SECRET;
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_PORT = '0';
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    process.env.LOG_LEVEL = 'error';

    const captured = captureConsoleError();
    const exit = exitSpy();
    try {
      const mod = await loadHttpModule();
      const server = mod.httpServers[0];
      openServers.push(server);
      const addr = await waitForListen(server);
      expect(exit).not.toHaveBeenCalled();
      expect(addr.address).toBe('127.0.0.1');
      const logged = captured.lines.join('\n');
      expect(logged).toContain('MCP_HTTP_HOST=0.0.0.0 is not a loopback address');
      expect(logged).toContain('Binding 127.0.0.1 only');
      assertNoSecrets(logged);
    } finally {
      captured.restore();
      exit.mockRestore();
    }
  });

  it('refuses a known placeholder secret and does not log it', async () => {
    process.env.CONDUIT_S2S_SECRET = 'replace-with-a-real-secret';
    delete process.env.MCP_ALLOW_INSECURE_DEV;
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_PORT = '0';
    process.env.LOG_LEVEL = 'error';

    const captured = captureConsoleError();
    const exit = exitSpy();
    try {
      await expect(loadHttpModule()).rejects.toThrow('process.exit:1');
      expect(exit).toHaveBeenCalledWith(1);
      const logged = captured.lines.join('\n');
      expect(logged).toContain('known placeholder');
      expect(logged).toContain('openssl rand -hex 32');
      assertNoSecrets(logged);
    } finally {
      captured.restore();
      exit.mockRestore();
    }
  });

  it('refuses a placeholder even when MCP_ALLOW_INSECURE_DEV=1', async () => {
    process.env.CONDUIT_S2S_SECRET = '  Your-S2S-Secret  ';
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_PORT = '0';
    process.env.MCP_HTTP_HOST = '127.0.0.1';
    process.env.LOG_LEVEL = 'error';

    const captured = captureConsoleError();
    const exit = exitSpy();
    try {
      await expect(loadHttpModule()).rejects.toThrow('process.exit:1');
      expect(exit).toHaveBeenCalledWith(1);
      expect(captured.lines.join('\n')).toContain('known placeholder');
      assertNoSecrets(captured.lines.join('\n'));
    } finally {
      captured.restore();
      exit.mockRestore();
    }
  });

  it('honors a non-loopback MCP_HTTP_HOST when a real secret is set', async () => {
    process.env.CONDUIT_S2S_SECRET = TEST_SECRET;
    delete process.env.MCP_ALLOW_INSECURE_DEV;
    process.env.MCP_TRANSPORT = 'http';
    process.env.AUTH_MODE = 'gateway';
    process.env.MCP_HTTP_PORT = '0';
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    process.env.LOG_LEVEL = 'info';

    const captured = captureConsoleError();
    const exit = exitSpy();
    try {
      const mod = await loadHttpModule();
      const server = mod.httpServers[0];
      openServers.push(server);
      const addr = await waitForListen(server);
      expect(exit).not.toHaveBeenCalled();
      expect(addr.address).toBe('0.0.0.0');
      const logged = captured.lines.join('\n');
      expect(logged).toContain('HTTP streaming server listening on 0.0.0.0:');
      expect(logged).not.toContain('not a loopback address');
      assertNoSecrets(logged);
    } finally {
      captured.restore();
      exit.mockRestore();
    }
  });

  it('defaults the bind address to 127.0.0.1 when a secret is set and MCP_HTTP_HOST is unset', async () => {
    process.env.CONDUIT_S2S_SECRET = TEST_SECRET;
    delete process.env.MCP_ALLOW_INSECURE_DEV;
    delete process.env.MCP_HTTP_HOST;
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_PORT = '0';
    process.env.LOG_LEVEL = 'info';

    const captured = captureConsoleError();
    const exit = exitSpy();
    try {
      const mod = await loadHttpModule();
      const server = mod.httpServers[0];
      openServers.push(server);
      const addr = await waitForListen(server);
      expect(exit).not.toHaveBeenCalled();
      expect(addr.address).toBe('127.0.0.1');
      expect(captured.lines.join('\n')).toContain('HTTP streaming server listening on 127.0.0.1:');
      assertNoSecrets(captured.lines.join('\n'));
    } finally {
      captured.restore();
      exit.mockRestore();
    }
  });
});

describe('gateway /mcp auth', () => {
  async function listenGateway(): Promise<AddressInfo> {
    process.env.MCP_TRANSPORT = 'http';
    process.env.AUTH_MODE = 'gateway';
    process.env.MCP_HTTP_PORT = '0';
    delete process.env.MCP_HTTP_HOST;
    process.env.CONDUIT_S2S_SECRET = TEST_SECRET;
    delete process.env.MCP_ALLOW_INSECURE_DEV;
    process.env.SAAS_ALERTS_API_KEY = ENV_API_KEY;
    process.env.LOG_LEVEL = 'error';

    const captured = captureConsoleError();
    try {
      const mod = await loadHttpModule();
      const server = mod.httpServers[0];
      openServers.push(server);
      const addr = await waitForListen(server);
      assertNoSecrets(captured.lines.join('\n'));
      getCredentialsSpy.mockClear();
      return addr;
    } finally {
      captured.restore();
    }
  }

  async function postMcp(port: number, headers: Record<string, string>): Promise<Response> {
    return fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'saas_alerts_status', arguments: {} },
      }),
    });
  }

  it('serves /health and /healthz without reading credentials', async () => {
    const addr = await listenGateway();
    getCredentialsSpy.mockClear();
    for (const path of ['/health', '/healthz']) {
      const res = await fetch(`http://127.0.0.1:${addr.port}${path}`);
      expect(res.status).toBe(200);
      const body = await res.json() as { status: string; credentials?: unknown };
      expect(body.status).toBe('ok');
      expect(body.credentials).toBeUndefined();
      assertNoSecrets(JSON.stringify(body));
    }
    expect(getCredentialsSpy).not.toHaveBeenCalled();
  });

  it('returns 401 when the S2S header is missing', async () => {
    const addr = await listenGateway();
    const res = await postMcp(addr.port, { 'x-saas-alerts-api-key': HEADER_API_KEY });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/X-Gateway-S2S/);
    expect(getCredentialsSpy).not.toHaveBeenCalled();
    assertNoSecrets(JSON.stringify(body));
  });

  it('returns 401 when the S2S header is invalid', async () => {
    const addr = await listenGateway();
    const res = await postMcp(addr.port, {
      'x-gateway-s2s': mintS2sHeader('wrong-secret'),
      'x-saas-alerts-api-key': HEADER_API_KEY,
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/X-Gateway-S2S/);
    expect(getCredentialsSpy).not.toHaveBeenCalled();
    assertNoSecrets(JSON.stringify(body));
  });

  it('returns 401 in gateway mode when the credential header is missing and does not use env credentials', async () => {
    const addr = await listenGateway();
    const res = await postMcp(addr.port, {
      'x-gateway-s2s': mintS2sHeader(TEST_SECRET),
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/X-SaaS-Alerts-API-Key/);
    expect(getCredentialsSpy).not.toHaveBeenCalled();
    assertNoSecrets(JSON.stringify(body));
  });

  it('returns 401 when the credential header is blank', async () => {
    const addr = await listenGateway();
    const res = await postMcp(addr.port, {
      'x-gateway-s2s': mintS2sHeader(TEST_SECRET),
      'x-saas-alerts-api-key': '   ',
    });
    expect(res.status).toBe(401);
    expect(getCredentialsSpy).not.toHaveBeenCalled();
  });

  it('accepts a valid S2S header plus the API key header and does not use env credentials', async () => {
    const addr = await listenGateway();
    const res = await postMcp(addr.port, {
      'x-gateway-s2s': mintS2sHeader(TEST_SECRET),
      'x-saas-alerts-api-key': HEADER_API_KEY,
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { result: { content: Array<{ text: string }> } };
    const status = JSON.parse(body.result.content[0].text) as { connected: boolean; status: string };
    expect(status.connected).toBe(false);
    expect(status.status).toContain('network disabled in test');
    expect(getCredentialsSpy).toHaveBeenCalled();
    const reads = getCredentialsSpy.mock.calls.map((call) => call[0]);
    expect(reads).toContainEqual({ apiKey: HEADER_API_KEY });
    expect(JSON.stringify(reads)).not.toContain(ENV_API_KEY);
    assertNoSecrets(JSON.stringify(body).replaceAll(HEADER_API_KEY, ''));
  });
});

describe('env mode still uses process credentials after S2S auth', () => {
  it('does not require the gateway credential header', async () => {
    process.env.MCP_TRANSPORT = 'http';
    process.env.AUTH_MODE = 'env';
    process.env.MCP_HTTP_PORT = '0';
    process.env.MCP_HTTP_HOST = '127.0.0.1';
    process.env.CONDUIT_S2S_SECRET = TEST_SECRET;
    delete process.env.MCP_ALLOW_INSECURE_DEV;
    process.env.SAAS_ALERTS_API_KEY = ENV_API_KEY;
    process.env.LOG_LEVEL = 'error';

    const captured = captureConsoleError();
    const mod = await loadHttpModule();
    const server = mod.httpServers[0];
    openServers.push(server);
    const addr = await waitForListen(server);
    captured.restore();
    getCredentialsSpy.mockClear();

    const res = await fetch(`http://127.0.0.1:${addr.port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'x-gateway-s2s': mintS2sHeader(TEST_SECRET),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'saas_alerts_status', arguments: {} },
      }),
    });
    expect(res.status).toBe(200);
    const reads = getCredentialsSpy.mock.calls.map((call) => call[0]);
    expect(reads).toContainEqual({ apiKey: ENV_API_KEY });
  });
});
