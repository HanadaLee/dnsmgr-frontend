export function mcpConfiguration(origin: string, userId: number, apiKey: string): string {
  return JSON.stringify({ mcpServers: { dnsmgr: {
    url: new URL('/mcp', origin).href,
    headers: { Authorization: `Bearer ${userId}:${apiKey}` },
  } } }, null, 2)
}
