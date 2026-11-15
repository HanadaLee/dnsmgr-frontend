import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { mcpConfiguration } from '@/lib/mcp-config'

export function McpConfiguration({ userId, apiKey }: { userId: number; apiKey: string }) {
  return <Field>
    <FieldLabel htmlFor="mcp-config">MCP 客户端配置</FieldLabel>
    <Textarea id="mcp-config" readOnly rows={8} value={mcpConfiguration(window.location.origin, userId, apiKey)} />
    <FieldDescription>保存用户后，将此配置添加到 MCP 客户端。配置包含 API 密钥，请妥善保管。</FieldDescription>
  </Field>
}
