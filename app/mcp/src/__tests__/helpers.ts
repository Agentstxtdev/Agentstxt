import { vi } from 'vitest';

export type CapturedTool = {
  config: { description: string; inputSchema: unknown };
  handler: (input: any) => any;
};

export function captureTools() {
  const tools: Record<string, CapturedTool> = {};
  const server = {
    registerTool(name: string, config: CapturedTool['config'], handler: CapturedTool['handler']) {
      tools[name] = { config, handler };
    },
  } as any;
  return { server, tools };
}

export function textOf(result: any): string {
  return result.content[0].text as string;
}

export function jsonOf<T = any>(result: any): T {
  return JSON.parse(textOf(result)) as T;
}

export type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/**
 * Install a fetch stub for the duration of one test. Returns the spy plus a
 * restore function. The handler maps URL → Response.
 */
export function installFetch(handler: FetchHandler) {
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    return handler(url, init);
  });
  return spy;
}

export function res(body: string, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: init.headers ?? {},
  });
}
