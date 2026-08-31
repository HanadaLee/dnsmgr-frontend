import { Badge } from '@/components/ui/badge'

const successValues = new Set(['enabled', 'active', 'healthy', 'issued', 'succeeded', 'success', 'verified', 'running', 'ready'])
const dangerValues = new Set(['disabled', 'blocked', 'failed', 'expired', 'revoked', 'unverified', 'error', 'dns_error'])
const labels: Record<string, string> = {
  enabled: '已启用', disabled: '已停用', active: '正常', blocked: '已封禁', healthy: '健康', failed: '失败',
  issued: '已签发', pending: '待处理', processing: '处理中', succeeded: '成功', success: '成功',
  'never-run': '未运行', verified: '已验证', unverified: '待验证', running: '运行中', stopped: '未运行',
  ready: '已获取', expired: '已过期', revoked: '已吊销', validating: '验证中', 'awaiting-validation': '待验证',
  partial: '部分成功', unknown: '未知', dns_error: 'DNS 异常',
}

export function StatusBadge({ value, label }: { value: string | boolean; label?: string }) {
  const normalized = typeof value === 'boolean' ? (value ? 'enabled' : 'disabled') : value
  return (
    <Badge variant={successValues.has(normalized) ? 'default' : dangerValues.has(normalized) ? 'destructive' : 'secondary'}>
      {label ?? labels[normalized] ?? normalized}
    </Badge>
  )
}
