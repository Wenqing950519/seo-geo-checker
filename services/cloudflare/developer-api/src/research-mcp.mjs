import { createMcpHandler } from 'agents/mcp/server';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

const HEADERS = { 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', 'Strict-Transport-Security': 'max-age=31536000' };
const measurementInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('prompt'), text: z.string().min(1).max(4000) }).strict(),
  z.object({ type: z.literal('url'), url: z.string().url().max(2048) }).strict()
]);

export async function handleResearchMcp(request, { research, env = {}, ctx = {} }) {
  try {
    const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1] || '';
    await research.authenticate(token);
    // Bound streamed bodies too; Content-Length alone is not a size limit.
    if (request.body) {
      const reader = request.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          return errorResponse('request_too_large', 'MCP request exceeds 64 KiB', 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      request = new Request(request.url, { method: request.method, headers: request.headers, body: bytes });
    }
    const result = async (operation) => {
      try {
        const data = await operation();
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
      } catch (error) {
        const code = error?.code || 'service_unavailable';
        return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code,
          message: error?.statusCode && error.statusCode < 500 ? error.message : code } }) }] };
      }
    };
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'lslabs-platform-research', version: '0.1.0' });
      server.registerTool('create_measurement', {
        description: 'Submit one authorized research observation. Returns immediately; reuse the same idempotency_key on retry. Costs are funded by LS-Labs research.',
        inputSchema: z.object({ study_id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/), input: measurementInput,
          locale: z.string().max(30).optional(), engine_ids: z.array(z.string().min(1).max(80)).min(1).max(4).optional(),
          idempotency_key: z.string().min(8).max(200) }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
      }, (body) => result(() => research.createMeasurement({ token, body })));
      server.registerTool('get_measurement', {
        description: 'Read your research observation status and retained answers/citations. Pending work returns a status; partial failures and unknown values remain explicit.',
        inputSchema: z.object({ measurement_id: z.string().min(1).max(100) }).strict(),
        annotations: { readOnlyHint: true, openWorldHint: false }
      }, ({ measurement_id }) => result(() => research.getMeasurement({ token, measurementId: measurement_id })));
      server.registerTool('get_usage', {
        description: 'Read your research usage and cost uncertainty, plus the budget shared by internal callers. This is not a prepaid points balance.',
        inputSchema: z.object({}).strict(), annotations: { readOnlyHint: true, openWorldHint: false }
      }, () => result(() => research.getUsage({ token })));
      return server;
    }, { route: '/mcp', corsOptions: false, allowedHostnames: ['platform.lslabs.tw', 'localhost', '127.0.0.1'],
      allowedOriginHostnames: ['platform.lslabs.tw', 'localhost', '127.0.0.1'] });
    const response = await handler(request, env, ctx);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(HEADERS)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    const status = error?.statusCode || 503;
    return errorResponse(error?.code || 'service_unavailable', status < 500 ? error.message : 'Research MCP is temporarily unavailable', status);
  }
}
function errorResponse(code, message, status) {
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers: {
    ...HEADERS, 'Content-Type': 'application/json', ...(status === 401 ? { 'WWW-Authenticate': 'Bearer realm="lslabs-research"' } : {})
  } });
}
