import { describe, expect, it } from 'vitest'
import { appendTagValues, tagValues } from '@/lib/tag-values'
import { mcpConfiguration } from '@/lib/mcp-config'

describe('dnsmgr multi-value configuration', () => {
  it.each([
    ['www.example.com,cdn.example.com', ['www.example.com', 'cdn.example.com']],
    [' WWW.Example.COM\ncdn.example.com；img.example.com，api.example.com;www.example.com ', ['www.example.com', 'cdn.example.com', 'img.example.com', 'api.example.com']],
    ['https://WWW.Example.com/ http://cdn.example.com///', ['www.example.com', 'cdn.example.com']],
    [['www.example.com', 'cdn.example.com', 'www.example.com'], ['www.example.com', 'cdn.example.com']],
    ['', []], [null, []], [undefined, []],
  ])('normalizes legacy and pasted values: %j', (value, expected) => expect(tagValues(value)).toEqual(expected))
  it('appends without duplicates and persists a string accepted by PHP explode', () => {
    expect(appendTagValues('www.example.com', 'WWW.example.com\ncdn.example.com')).toBe('www.example.com,cdn.example.com')
  })
  it('builds the original MCP API-key configuration', () => {
    expect(JSON.parse(mcpConfiguration('https://dns.test', 12, 'secret'))).toEqual({ mcpServers: { dnsmgr: {
      url: 'https://dns.test/mcp', headers: { Authorization: 'Bearer 12:secret' },
    } } })
  })
})
