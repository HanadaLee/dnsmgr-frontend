import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  Clock3Icon,
  CirclePauseIcon,
  CirclePlayIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { Link } from "react-router-dom";

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/api/client";
import type {
  AxisNowDomain,
  AxisNowRule,
  AxisNowRuleAutomation,
  AxisNowRuleResolvedAddress,
  AxisNowRuleOptions,
  DataResponse,
  OperationResult,
  PageResponse,
} from "@/api/types";
import { ConfirmAction } from "@/components/confirm-action";
import { CountryFlag } from "@/components/country-flag";
import { DataTable, type DataColumn } from "@/components/data-table";
import { ListPagination } from "@/components/list-pagination";
import { LoadingTable } from "@/components/loading-table";
import { QueryError } from "@/components/query-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { formatDateTime } from "@/lib/format";

type PoolType = "all_valid_eips" | "eip_tag" | "eip" | "ip" | "domain";
type Strategy = "random" | "priority_order" | "quality_optimized";

const strategyNames: Record<string, string> = {
  random: "随机",
  priority_order: "顺序",
  quality_optimized: "优选",
};

function addressKey(value: string) {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

function addressTone(item: AxisNowRuleResolvedAddress, selected: boolean) {
  if (item.status?.toLowerCase() === "unavailable") {
    return "text-destructive";
  }
  if (item.score === undefined && !item.status) return "text-foreground";
  return selected
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-amber-600 dark:text-amber-400";
}

function RulePoolCell({ rule }: { rule: AxisNowRule }) {
  const resolved = new Set(rule.resolvedAddresses.map((item) => addressKey(item.address)));
  const heading = rule.poolAddressCount > 0
    ? `${rule.poolAddressCount} 个地址`
    : rule.poolSummary ?? "—";
  const summary = (
    <div className="flex min-w-56 max-w-80 flex-col gap-1.5">
      <p className="font-medium">{heading}</p>
      {rule.poolGroups.map((group, index) => {
        return (
          <div key={`${group.type}-${index}`} className="flex items-start gap-1.5">
            <Badge variant="secondary">{group.typeName}</Badge>
            {group.type === "eip_tag" && group.items.length ? (
              <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                {group.items.map((item) => <span key={item}>{item}</span>)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
  if (!rule.poolAddresses.length) return summary;
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={100}
        closeDelay={150}
        render={
          <button
            type="button"
            className="cursor-help text-left"
            aria-label={`查看完整地址池，共 ${rule.poolAddressCount} 个地址`}
          />
        }
      >
        {summary}
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-[min(52rem,calc(100vw-2rem))]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <p className="font-medium">完整地址池</p>
            <Badge variant="outline">{rule.poolAddressCount} 个地址</Badge>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP 地址</TableHead>
                  <TableHead>提供商 / 线路</TableHead>
                  <TableHead>标签</TableHead>
                  <TableHead className="text-right">评分</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rule.poolAddresses.map((item, index) => (
                  <TableRow key={`${item.address}-${index}`}>
                    <TableCell>
                      <div className={`flex items-center gap-2 font-mono ${addressTone(item, resolved.has(addressKey(item.address)))}`}>
                        <CountryFlag countryCode={item.countryCode} provinceCode={item.provinceCode} />
                        <span>{item.address}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p>{item.providerName || "—"}</p>
                      {item.ispName ? <p className="text-xs text-muted-foreground">{item.ispName}</p> : null}
                    </TableCell>
                    <TableCell>
                      {item.tagNames.length ? (
                        <div className="flex flex-col items-start gap-1">
                          {item.tagNames.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className={`text-right font-mono tabular-nums ${addressTone(item, resolved.has(addressKey(item.address)))}`}>
                      {item.score !== undefined ? Number(item.score.toFixed(2)) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {rule.poolTruncated ? (
            <p className="text-xs text-muted-foreground">接口仅返回部分地址，完整数量以上方统计为准。</p>
          ) : null}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function RuleStrategyCell({ rule }: { rule: AxisNowRule }) {
  const name = strategyNames[rule.strategy ?? ""] ?? rule.strategy ?? "—";
  return (
    <div className="flex min-w-32 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {rule.strategyQuantity ? <span>选取 {rule.strategyQuantity} 个地址</span> : null}
        <Badge variant="outline">{name}</Badge>
      </div>
      {rule.strategyInterval ? (
        <p className="text-xs text-muted-foreground">每 {rule.strategyInterval} 分钟评估</p>
      ) : null}
    </div>
  );
}

function ruleUpdatedAt(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? formatDateTime(value)
    : date.toLocaleString("zh-CN", { hour12: false });
}

function RuleResolvedCell({ rule }: { rule: AxisNowRule }) {
  return (
    <div className="flex min-w-56 flex-col gap-1.5">
      {rule.resolvedAddresses.length ? (
        <div className="flex flex-col gap-0.5">
          {rule.resolvedAddresses.map((item, index) => (
            <div key={`${item.address}-${index}`} className={`flex items-center justify-between gap-5 font-mono text-sm ${addressTone(item, true)}`}>
              <span className="flex items-center gap-2"><CountryFlag countryCode={item.countryCode} provinceCode={item.provinceCode} />{item.address}</span>
              {item.score !== undefined ? (
                <span className="tabular-nums">
                  {Number(item.score.toFixed(2))}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">暂无解析结果</p>
      )}
      <p className="text-xs text-muted-foreground">最后更新时间：{ruleUpdatedAt(rule.resolvedUpdatedAt)}</p>
    </div>
  );
}

function automationStateName(value?: string) {
  return {
    primary: "主地址池",
    tide: "潮汐地址池",
    failover: "故障备份地址池",
    pending_primary: "正在恢复主地址池",
    pending_tide: "正在切换潮汐地址池",
    pending_failover: "正在切换故障备份地址池",
  }[value ?? ""] ?? value ?? "—";
}

function healthStateName(value?: string) {
  return {
    healthy: "全部正常",
    partial: "部分可用",
    all_failed: "全部失败",
    no_data: "无数据",
    not_configured: "未配置",
  }[value ?? ""] ?? value ?? "—";
}

function probeStatusName(value?: string) {
  return {
    available: "正常",
    unavailable: "不可用",
    pending: "探测中",
    no_data: "无数据",
  }[value?.toLowerCase() ?? ""] ?? value ?? "未知";
}

function probeStatusVariant(value?: string): "default" | "secondary" | "destructive" | "outline" {
  switch (value?.toLowerCase()) {
    case "available": return "secondary";
    case "unavailable": return "destructive";
    default: return "outline";
  }
}

function RuleProbeCell({ rule, options }: { rule: AxisNowRule; options?: AxisNowRuleOptions }) {
  if (!rule.probeTemplateUuid) return <span className="text-muted-foreground">未配置</span>;
  const template = options?.probeTemplates.find((item) => item.uuid === rule.probeTemplateUuid);
  const available = rule.probeStatuses.filter((item) => item.status === "available").length;
  const unavailable = rule.probeStatuses.filter((item) => item.status === "unavailable").length;
  return (
    <div className="flex min-w-40 flex-col items-start gap-1.5">
      <span className="max-w-48 truncate text-sm" title={template?.name ?? rule.probeTemplateUuid}>
        {template?.name ?? "已配置探测模板"}
      </span>
      <Badge variant={rule.probeState === "healthy" ? "secondary" : rule.probeState === "all_failed" ? "destructive" : "outline"}>
        {healthStateName(rule.probeState)}
      </Badge>
      {rule.probeStatuses.length ? (
        <span className="text-xs text-muted-foreground">
          正常 {available} · 不可用 {unavailable} · 共 {rule.probeStatuses.length}
        </span>
      ) : <span className="text-xs text-muted-foreground">尚无探测结果</span>}
    </div>
  );
}

function RuleAutomationCell({ rule }: { rule: AxisNowRule }) {
  const automation = rule.automation;
  if (!automation?.configured) {
    return <span className="text-muted-foreground">未配置</span>;
  }
  const switched = automation.failoverState === "switched";
  const pending = automation.activePool?.startsWith("pending_");
  return (
    <div className="flex min-w-40 flex-col items-start gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {automation.tideEnabled ? <Badge variant="secondary">潮汐</Badge> : null}
        {automation.failoverEnabled ? <Badge variant="outline">备份</Badge> : null}
      </div>
      <Badge variant={switched ? "destructive" : pending ? "outline" : "secondary"}>
        {switched ? "故障已切换（待恢复）" : pending ? "切换确认中" : automationStateName(automation.activePool)}
      </Badge>
      {automation.failoverEnabled && automation.failCount && automation.failureThreshold ? (
        <span className="text-xs text-muted-foreground">
          连续失败 {automation.failCount} / {automation.failureThreshold}
        </span>
      ) : null}
      {automation.lastHealthState ? (
        <span className="text-xs text-muted-foreground">探测：{healthStateName(automation.lastHealthState)}</span>
      ) : null}
      {automation.lastError ? <span className="max-w-48 truncate text-xs text-destructive">{automation.lastError}</span> : null}
    </div>
  );
}

export function AxisNowRulesPage({
  accountId,
  domainUuid,
}: { accountId: number; domainUuid: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const domain = useQuery({
    queryKey: ["axisnow-domain", accountId, domainUuid],
    queryFn: async () =>
      (
        await apiGet<DataResponse<AxisNowDomain>>(
          `/api/web/v1/axisnow/accounts/${accountId}/domains/${domainUuid}`,
        )
      ).data,
    enabled: accountId > 0 && Boolean(domainUuid),
  });
  const options = useQuery({
    queryKey: ["axisnow-options", accountId, "rule", domainUuid],
    queryFn: async () =>
      (
        await apiGet<DataResponse<AxisNowRuleOptions>>(
          `/api/web/v1/axisnow/accounts/${accountId}/options`,
          { scope: "rule", domainUuid },
        )
      ).data,
    enabled: accountId > 0 && Boolean(domainUuid),
  });
  const rules = useQuery({
    queryKey: ["axisnow-rules", accountId, domainUuid, page, queryText],
    queryFn: () =>
      apiGet<PageResponse<AxisNowRule>>(
        `/api/web/v1/axisnow/accounts/${accountId}/domains/${domainUuid}/rules`,
        { page, pageSize: 20, q: queryText, order: "desc" },
      ),
    enabled: accountId > 0 && Boolean(domainUuid),
  });
  const status = useApiMutation<AxisNowRule, DataResponse<OperationResult>>({
    mutationFn: (rule) =>
      apiPatch(
        `/api/web/v1/axisnow/accounts/${accountId}/domains/${domainUuid}/rules/${rule.uuid}/status`,
        { status: rule.status === "active" ? "paused" : "active" },
      ),
    successMessage: (_, rule) =>
      rule.status === "active" ? "规则已暂停" : "规则已启用",
    invalidate: [["axisnow-rules", accountId, domainUuid]],
  });
  const remove = useApiMutation<AxisNowRule, DataResponse<OperationResult>>({
    mutationFn: (rule) =>
      apiDelete(
        `/api/web/v1/axisnow/accounts/${accountId}/domains/${domainUuid}/rules/${rule.uuid}`,
      ),
    successMessage: "路由规则已删除",
    invalidate: [["axisnow-rules", accountId, domainUuid], ["axisnow-domains"]],
  });
  const columns: DataColumn<AxisNowRule>[] = [
    {
      key: "line",
      label: "线路",
      render: (rule) => (
        <div className="min-w-32">
          <p className="font-medium">{rule.geoIspName}</p>
        </div>
      ),
    },
    {
      key: "type",
      label: "记录类型",
      render: (rule) => <code>{rule.type}</code>,
    },
    { key: "pool", label: "地址池", render: (rule) => <RulePoolCell rule={rule} /> },
    {
      key: "strategy",
      label: "选取策略",
      render: (rule) => <RuleStrategyCell rule={rule} />,
    },
    {
      key: "resolved",
      label: "解析地址 / 最后更新时间",
      render: (rule) => <RuleResolvedCell rule={rule} />,
    },
    {
      key: "probe",
      label: "探测状态",
      render: (rule) => <RuleProbeCell rule={rule} options={options.data} />,
    },
    {
      key: "automation",
      label: "自动调度",
      render: (rule) => <RuleAutomationCell rule={rule} />,
    },
    {
      key: "status",
      label: "生效状态",
      render: (rule) => (
        <Badge variant={rule.status === "active" ? "default" : "secondary"}>
          {rule.status === "active" ? "启用" : "暂停"}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "",
      className: "w-12",
      render: (rule) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`管理 ${rule.geoIspName}`}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <RuleDialog
                trigger={
                  <DropdownMenuItem closeOnClick={false}>
                    <PencilIcon />
                    编辑
                  </DropdownMenuItem>
                }
                accountId={accountId}
                domain={domain.data}
                options={options.data}
                rule={rule}
              />
              <DropdownMenuItem
                disabled={status.isPending}
                onClick={() => status.mutate(rule)}
              >
                {rule.status === "active" ? (
                  <CirclePauseIcon />
                ) : (
                  <CirclePlayIcon />
                )}
                {rule.status === "active" ? "暂停" : "启用"}
              </DropdownMenuItem>
              <ConfirmAction
                trigger={
                  <DropdownMenuItem variant="destructive" closeOnClick={false}>
                    <Trash2Icon />
                    删除
                  </DropdownMenuItem>
                }
                title="删除路由规则？"
                description={rule.geoIspName}
                destructive
                pending={remove.isPending}
                onConfirm={() => remove.mutate(rule)}
              />
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  if (!accountId || !domainUuid)
    return (
      <QueryError
        error={new Error("AxisNow 路由参数无效")}
        retry={() => undefined}
      />
    );
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <form
            className="grid gap-2 lg:grid-cols-[auto_minmax(16rem,1fr)_auto_auto_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQueryText(search.trim());
            }}
          >
            <Button
              type="button"
              variant="outline"
              nativeButton={false}
              render={<Link to="/axisnow?tab=domains" />}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              返回 DNS 路由
            </Button>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索线路、名称或地址池"
              />
            </div>
            <Button type="submit">
              <SearchIcon data-icon="inline-start" />
              搜索
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearch("");
                setQueryText("");
                setPage(1);
                void rules.refetch();
                void options.refetch();
              }}
            >
              <RefreshCwIcon data-icon="inline-start" />
              刷新
            </Button>
            <RuleDialog
              trigger={
                <Button type="button">
                  <PlusIcon data-icon="inline-start" />
                  添加规则
                </Button>
              }
              accountId={accountId}
              domain={domain.data}
              options={options.data}
            />
          </form>
          {domain.isError ? (
            <QueryError
              error={domain.error}
              retry={() => void domain.refetch()}
            />
          ) : null}
          {options.isError ? (
            <QueryError
              error={options.error}
              retry={() => void options.refetch()}
            />
          ) : null}
          {rules.isError ? (
            <QueryError
              error={rules.error}
              retry={() => void rules.refetch()}
            />
          ) : rules.isPending ? (
            <LoadingTable />
          ) : (
            <DataTable
              rows={rules.data.data}
              columns={columns}
              rowKey={(rule) => rule.uuid}
              emptyTitle="暂无路由规则"
            />
          )}
          {rules.data ? (
            <ListPagination meta={rules.data.meta} onPageChange={setPage} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function formatPoolText(pool?: Record<string, unknown>) {
  return pool ? JSON.stringify(pool, null, 2) : "";
}

function parsePoolText(value: string): Record<string, unknown> | null {
  if (!value.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function automationPoolIsValid(
  pool: Record<string, unknown> | null,
  recordType: AxisNowDomain["recordType"] | undefined,
) {
  if (!pool || !recordType) return false;
  if (pool.mode === "all_valid_eips") return recordType === "A";
  if (pool.mode !== "customize" || !Array.isArray(pool.groups) || !pool.groups.length)
    return false;
  return pool.groups.every((value) => {
    const group = recordValue(value);
    const type = String(group.type ?? "");
    if (recordType === "CNAME")
      return type === "domain" && stringArray(group.domains).length > 0;
    if (type === "eip") return stringArray(group.eip_uuids).length > 0;
    if (type === "eip_tag") return stringArray(group.tag_uuids).length > 0;
    if (type === "ip") return stringArray(group.ips).length > 0;
    return false;
  });
}

function simpleAutomationPool(type: PoolType, values: string[]) {
  if (type === "all_valid_eips") return { mode: "all_valid_eips" };
  const field = {
    eip: "eip_uuids",
    eip_tag: "tag_uuids",
    ip: "ips",
    domain: "domains",
  }[type];
  return {
    mode: "customize",
    groups: [{ type, [field]: values }],
  };
}

function poolTypeName(type: string) {
  return {
    all_valid_eips: "全部有效 EIP",
    eip_tag: "EIP 标签",
    eip: "指定 EIP",
    ip: "自定义 IP",
    domain: "CNAME 候选域名",
  }[type] ?? "地址组";
}

function poolGroupItems(group: Record<string, unknown>, options?: AxisNowRuleOptions) {
  const type = String(group.type ?? "");
  const values = stringArray(group.eip_uuids ?? group.tag_uuids ?? group.ips ?? group.domains);
  if (type === "eip" || type === "eip_tag") {
    const source = type === "eip" ? options?.eips : options?.tags;
    return values.map((value) => source?.find((item) => item.uuid === value)?.name ?? value);
  }
  return values;
}

function PoolSummary({ pool, options }: { pool?: Record<string, unknown> | null; options?: AxisNowRuleOptions }) {
  if (!pool) return <p className="text-sm text-muted-foreground">未配置地址池</p>;
  if (pool.mode === "all_valid_eips") {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <Badge variant="secondary">全部有效 EIP</Badge>
        <p className="mt-2 text-muted-foreground">由 AxisNow 自动使用当前账户中所有有效 EIP。</p>
      </div>
    );
  }
  const groups = Array.isArray(pool.groups) ? pool.groups.map(recordValue) : [];
  if (!groups.length) return <p className="text-sm text-muted-foreground">未配置地址组</p>;
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      {groups.map((group, index) => {
        const type = String(group.type ?? "");
        const items = poolGroupItems(group, options);
        return (
          <div key={`${type}-${index}`} className="flex flex-col gap-1.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">地址组 {index + 1} · {poolTypeName(type)}</Badge>
              <span className="text-xs text-muted-foreground">{items.length} 项</span>
            </div>
            {items.length ? (
              <div className="flex flex-wrap gap-1.5">
                {items.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}
              </div>
            ) : <span className="text-xs text-muted-foreground">暂无条目</span>}
          </div>
        );
      })}
      {groups.length > 1 ? (
        <p className="text-xs text-muted-foreground">这套地址池包含多个地址组，页面会保留原有组合。</p>
      ) : null}
    </div>
  );
}

function ProbeStatusSummary({ statuses }: { statuses: AxisNowRuleAutomation["probeStatuses"] }) {
  if (!statuses.length) return <p className="text-sm text-muted-foreground">尚无探测结果。</p>;
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap gap-2">
        {statuses.map((item) => (
          <Badge key={item.address} variant={probeStatusVariant(item.status)}>
            {item.address} · {probeStatusName(item.status)}
            {item.avgConnectLatency !== undefined ? ` · ${item.avgConnectLatency} ms` : ""}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function AutomationPoolEditor({
  idPrefix,
  label,
  recordType,
  options,
  value,
  invalid,
  onChange,
}: {
  idPrefix: string;
  label: string;
  recordType?: AxisNowDomain["recordType"];
  options?: AxisNowRuleOptions;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const pool = parsePoolText(value);
  const groups = pool && Array.isArray(pool.groups)
    ? pool.groups.map(recordValue)
    : [];
  const group = groups[0] ?? {};
  const rawType = pool?.mode === "all_valid_eips"
    ? "all_valid_eips"
    : String(group.type ?? "");
  const allowedTypes: PoolType[] = recordType === "CNAME"
    ? ["domain"]
    : ["all_valid_eips", "eip_tag", "eip", "ip"];
  const poolType = allowedTypes.includes(rawType as PoolType)
    ? rawType as PoolType
    : "";
  const selectedValues = new Set(
    stringArray(group.eip_uuids ?? group.tag_uuids),
  );
  const textValues = stringArray(group.ips ?? group.domains).join("\n");
  const selectable = poolType === "eip"
    ? (options?.eips ?? [])
    : poolType === "eip_tag"
      ? (options?.tags ?? [])
      : [];
  const updateSimple = (type: PoolType, values: string[]) =>
    onChange(formatPoolText(simpleAutomationPool(type, values)));

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel>{label}</FieldLabel>
      <Select
        items={recordType === "CNAME"
          ? [{ value: "domain", label: "CNAME 候选域名" }]
          : [
              { value: "all_valid_eips", label: "全部有效 EIP" },
              { value: "eip_tag", label: "EIP 标签" },
              { value: "eip", label: "指定 EIP" },
              { value: "ip", label: "自定义 IP" },
            ]}
        value={poolType}
        onValueChange={(nextValue) => {
          if (!nextValue) return;
          updateSimple(nextValue as PoolType, []);
        }}
      >
        <SelectTrigger className="w-full" aria-invalid={invalid || undefined}>
          <SelectValue placeholder="请选择预留地址池类型" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {recordType === "CNAME" ? (
              <SelectItem value="domain">CNAME 候选域名</SelectItem>
            ) : (
              <>
                <SelectItem value="all_valid_eips">全部有效 EIP</SelectItem>
                <SelectItem value="eip_tag">EIP 标签</SelectItem>
                <SelectItem value="eip">指定 EIP</SelectItem>
                <SelectItem value="ip">自定义 IP</SelectItem>
              </>
            )}
          </SelectGroup>
        </SelectContent>
      </Select>
      {poolType === "eip" || poolType === "eip_tag" ? (
        <ScrollArea className="h-44 rounded-md border">
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {selectable.length ? selectable.map((option) => (
              <FieldLabel key={option.uuid} className="cursor-pointer">
                <Field orientation="horizontal">
                  <Checkbox
                    checked={selectedValues.has(option.uuid)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedValues);
                      if (checked) next.add(option.uuid);
                      else next.delete(option.uuid);
                      updateSimple(poolType, Array.from(next));
                    }}
                  />
                  <FieldTitle>{option.name}</FieldTitle>
                </Field>
              </FieldLabel>
            )) : (
              <p className="text-sm text-muted-foreground">
                当前平台账户没有可用选项
              </p>
            )}
          </div>
        </ScrollArea>
      ) : null}
      {poolType === "ip" || poolType === "domain" ? (
        <Textarea
          id={`${idPrefix}-values`}
          rows={4}
          value={textValues}
          onChange={(event) => updateSimple(
            poolType,
            event.target.value
              .split(/[\r\n,;\s]+/)
              .map((item) => item.trim())
              .filter(Boolean),
          )}
          placeholder={poolType === "domain" ? "每行一个候选域名" : "每行一个 IP"}
        />
      ) : null}
      {groups.length > 1 ? <PoolSummary pool={pool} options={options} /> : null}
      <FieldDescription>
        先在 dnsmgr 中预留这套地址池；已有多地址组会按原组合保留。
      </FieldDescription>
    </Field>
  );
}

function unixDateTime(value: number) {
  if (!value) return "—";
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}


function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function RuleDialog({
  trigger,
  accountId,
  domain,
  options,
  rule,
}: {
  trigger: React.ReactElement;
  accountId: number;
  domain?: AxisNowDomain;
  options?: AxisNowRuleOptions;
  rule?: AxisNowRule;
}) {
  const [open, setOpen] = useState(false);
  const [geoIsp, setGeoIsp] = useState("default");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"active" | "paused">("active");
  const [poolType, setPoolType] = useState<PoolType>("all_valid_eips");
  const [poolValues, setPoolValues] = useState<Set<string>>(new Set());
  const [poolText, setPoolText] = useState("");
  const [advancedPool, setAdvancedPool] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("random");
  const [quantity, setQuantity] = useState(1);
  const [triggerInterval, setTriggerInterval] = useState<5 | 10>(5);
  const [ttl, setTtl] = useState(0);
  const [probeUuid, setProbeUuid] = useState("");
  const [tideEnabled, setTideEnabled] = useState(false);
  const [tideStart, setTideStart] = useState("09:00");
  const [tideEnd, setTideEnd] = useState("18:00");
  const [tidePool, setTidePool] = useState("");
  const [failoverEnabled, setFailoverEnabled] = useState(false);
  const [failoverPool, setFailoverPool] = useState("");
  const [failureThreshold, setFailureThreshold] = useState(3);
  const [checkIntervalMinutes, setCheckIntervalMinutes] = useState(5);
  const [automationDirty, setAutomationDirty] = useState(false);
  const detail = useQuery({
    queryKey: ["axisnow-rule", accountId, domain?.uuid, rule?.uuid],
    queryFn: async () =>
      (
        await apiGet<DataResponse<AxisNowRule>>(
          `/api/web/v1/axisnow/accounts/${accountId}/domains/${domain?.uuid}/rules/${rule?.uuid}`,
        )
      ).data,
    enabled: open && Boolean(rule && domain),
  });
  const automation = useQuery({
    queryKey: ["axisnow-rule-automation", accountId, rule?.uuid],
    queryFn: async () => (
      await apiGet<DataResponse<AxisNowRuleAutomation>>(
        `/api/web/v1/axisnow/accounts/${accountId}/domains/${domain?.uuid}/rules/${rule?.uuid}/automation`,
      )
    ).data,
    enabled: open && Boolean(rule && domain),
  });
  const save = useApiMutation<
    Record<string, unknown>,
    DataResponse<OperationResult>
  >({
    mutationFn: (body) =>
      rule
        ? apiPut(
            `/api/web/v1/axisnow/accounts/${accountId}/domains/${domain?.uuid}/rules/${rule.uuid}`,
            body,
          )
        : apiPost(
            `/api/web/v1/axisnow/accounts/${accountId}/domains/${domain?.uuid}/rules`,
            body,
          ),
    successMessage: rule ? "路由规则已更新" : "路由规则已添加",
    invalidate: [
      ["axisnow-rules", accountId, domain?.uuid],
      ["axisnow-domains"],
    ],
  });
  const automationSave = useApiMutation<Record<string, unknown>, DataResponse<OperationResult>>({
    mutationFn: (body) => apiPut(
      `/api/web/v1/axisnow/accounts/${accountId}/domains/${domain?.uuid}/rules/${rule?.uuid}/automation`,
      body,
    ),
    successMessage: "自动调度配置已保存",
    invalidate: [
      ["axisnow-rules", accountId, domain?.uuid],
      ["axisnow-rule-automation", accountId, rule?.uuid],
    ],
  });
  const restore = useApiMutation<void, DataResponse<OperationResult>>({
    mutationFn: () => apiPost(
      `/api/web/v1/axisnow/accounts/${accountId}/domains/${domain?.uuid}/rules/${rule?.uuid}/automation/restore`,
    ),
    successMessage: "已恢复主地址池并重新布防",
    invalidate: [
      ["axisnow-rules", accountId, domain?.uuid],
      ["axisnow-rule-automation", accountId, rule?.uuid],
    ],
  });

  useEffect(() => {
    if (!open) return;
    setGeoIsp("default");
    setDescription("");
    setStatus("active");
    setPoolType(domain?.recordType === "CNAME" ? "domain" : "all_valid_eips");
    setPoolValues(new Set());
    setPoolText("");
    setAdvancedPool("");
    setStrategy("random");
    setQuantity(1);
    setTriggerInterval(5);
    setTtl(0);
    setProbeUuid("");
    setTideEnabled(false);
    setTideStart("09:00");
    setTideEnd("18:00");
    setTidePool("");
    setFailoverEnabled(false);
    setFailoverPool("");
    setFailureThreshold(3);
    setCheckIntervalMinutes(5);
    setAutomationDirty(false);
  }, [domain?.recordType, open]);

  useEffect(() => {
    if (!detail.data) return;
    const current = detail.data;
    const conf = recordValue(recordValue(current.action).conf);
    const pool = recordValue(conf.address_pool);
    const groups = Array.isArray(pool.groups)
      ? pool.groups.map(recordValue)
      : [];
    const group = groups[0] ?? {};
    const detectedType =
      pool.mode === "all_valid_eips"
        ? "all_valid_eips"
        : (String(group.type ?? "eip") as PoolType);
    const response = recordValue(conf.response_strategy);
    const ttlConf = recordValue(conf.ttl_conf);
    setGeoIsp(current.geoIsp || "default");
    setDescription(current.description ?? "");
    setStatus(current.status);
    setPoolType(detectedType);
    setPoolValues(new Set(stringArray(group.eip_uuids ?? group.tag_uuids)));
    setPoolText(stringArray(group.ips ?? group.domains).join("\n"));
    setAdvancedPool(groups.length > 1 ? JSON.stringify(pool, null, 2) : "");
    setStrategy((response.election_strategy ?? "random") as Strategy);
    setQuantity(Number(response.ip_quantity ?? response.addr_quantity ?? 1));
    setTriggerInterval(Number(response.trigger_interval) === 10 ? 10 : 5);
    setTtl(Number(ttlConf.ttl ?? 0));
    setProbeUuid(stringArray(conf.edge_probe_template_uuid)[0] ?? "");
  }, [detail.data, open]);

  useEffect(() => {
    if (!open || !automation.data) return;
    const current = automation.data;
    setTideEnabled(current.tideEnabled);
    setTideStart(current.tideStart || "09:00");
    setTideEnd(current.tideEnd || "18:00");
    setTidePool(formatPoolText(current.tidePool));
    setFailoverEnabled(current.failoverEnabled);
    setFailoverPool(formatPoolText(current.failoverPool));
    setFailureThreshold(current.failureThreshold || 3);
    setCheckIntervalMinutes(current.checkIntervalMinutes || 5);
    setAutomationDirty(false);
  }, [automation.data, open]);

  const selectablePool =
    poolType === "eip"
      ? (options?.eips ?? [])
      : poolType === "eip_tag"
        ? (options?.tags ?? [])
        : [];
  const fixedQuantity =
    domain?.recordType === "CNAME" &&
    ["cloudflare", "aws-route53", "cloudns"].includes(
      domain.providerType ?? "",
    );
  const poolValueList =
    poolType === "eip" || poolType === "eip_tag"
      ? Array.from(poolValues)
      : poolText
          .split(/[\r\n,;]+/)
          .map((item) => item.trim())
          .filter(Boolean);
  const canSubmit = Boolean(
    domain &&
      geoIsp &&
      (advancedPool.trim() ||
        poolType === "all_valid_eips" ||
        poolValueList.length),
  );
  const tideParsed = parsePoolText(tidePool);
  const failoverParsed = parsePoolText(failoverPool);
  const tidePoolInvalid = tideEnabled && !automationPoolIsValid(tideParsed, domain?.recordType);
  const failoverPoolInvalid = failoverEnabled && !automationPoolIsValid(failoverParsed, domain?.recordType);
  const switched = automation.data?.failoverState === "switched";
  const hasProbeTemplate = Boolean(probeUuid || automation.data?.hasProbeTemplate);
  const automationHasError = tidePoolInvalid || failoverPoolInvalid || (failoverEnabled && !hasProbeTemplate);
  const shouldSaveAutomation = Boolean(rule && (automationDirty || automation.data?.configured));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(
              {
                geoIsp,
                description: description || null,
                status,
                poolType,
                poolValues: poolValueList,
                advancedPool: advancedPool || null,
                electionStrategy: strategy,
                quantity: fixedQuantity ? 1 : quantity,
                triggerInterval,
                ttl,
                edgeProbeTemplateUuid: probeUuid || null,
              },
              {
                onSuccess: () => {
                  if (!shouldSaveAutomation) {
                    setOpen(false);
                    return;
                  }
                  automationSave.mutate(
                    {
                      tideEnabled,
                      tideStart,
                      tideEnd,
                      tidePool: tideParsed,
                      failoverEnabled,
                      failoverPool: failoverParsed,
                      failureThreshold,
                      checkIntervalMinutes,
                    },
                    { onSuccess: () => setOpen(false) },
                  );
                },
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>{rule ? "编辑路由规则" : "新增路由规则"}</DialogTitle>
            <DialogDescription>
              {domain?.domain ?? "请先等待调度域名加载完成。"}
            </DialogDescription>
          </DialogHeader>
          <div className="py-5">
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>记录类型</FieldLabel>
                  <Input value={domain?.recordType ?? ""} disabled />
                </Field>
                <Field>
                  <FieldLabel>线路</FieldLabel>
                  <Select
                    items={(options?.geoIspOptions ?? []).map((item) => ({
                      value: item.value,
                      label: item.name,
                      disabled: item.disabled,
                    }))}
                    value={geoIsp}
                    onValueChange={(value) => setGeoIsp(value ?? "default")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="请选择线路" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(options?.geoIspOptions ?? []).map((item) => (
                          <SelectItem
                            key={item.value}
                            value={item.value}
                            disabled={item.disabled}
                          >
                            {"　".repeat(item.depth)}
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>生效状态</FieldLabel>
                  <Select
                    items={[
                      { value: "active", label: "启用" },
                      { value: "paused", label: "暂停" },
                    ]}
                    value={status}
                    onValueChange={(value) =>
                      setStatus((value ?? "active") as "active" | "paused")
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="active">启用</SelectItem>
                        <SelectItem value="paused">暂停</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="axisnow-rule-description">说明</FieldLabel>
                <Input
                  id="axisnow-rule-description"
                  value={description}
                  maxLength={255}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>地址池</FieldLabel>
                <Select
                  items={
                    domain?.recordType === "CNAME"
                      ? [{ value: "domain", label: "CNAME 候选域名" }]
                      : [
                          { value: "all_valid_eips", label: "全部有效 EIP" },
                          { value: "eip_tag", label: "EIP 标签" },
                          { value: "eip", label: "指定 EIP" },
                          { value: "ip", label: "自定义 IP" },
                        ]
                  }
                  value={poolType}
                  onValueChange={(value) => {
                    const next = (value ?? "all_valid_eips") as PoolType;
                    setPoolType(next);
                    setPoolValues(new Set());
                    setPoolText("");
                    setAdvancedPool("");
                    if (
                      strategy === "priority_order" &&
                      next === "all_valid_eips"
                    )
                      setStrategy("random");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {domain?.recordType === "CNAME" ? (
                        <SelectItem value="domain">CNAME 候选域名</SelectItem>
                      ) : (
                        <>
                          <SelectItem value="all_valid_eips">
                            全部有效 EIP
                          </SelectItem>
                          <SelectItem value="eip_tag">EIP 标签</SelectItem>
                          <SelectItem value="eip">指定 EIP</SelectItem>
                          <SelectItem value="ip">自定义 IP</SelectItem>
                        </>
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {poolType === "eip" || poolType === "eip_tag" ? (
                <Field>
                  <FieldTitle>
                    {poolType === "eip" ? "选择 EIP" : "选择 EIP 标签"}
                  </FieldTitle>
                  <div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
                    {selectablePool.length ? (
                      selectablePool.map((option) => (
                        <FieldLabel
                          key={option.uuid}
                          className="cursor-pointer"
                        >
                          <Field orientation="horizontal">
                            <Checkbox
                              checked={poolValues.has(option.uuid)}
                              onCheckedChange={(checked) => {
                                const next = new Set(poolValues);
                                if (checked) next.add(option.uuid);
                                else next.delete(option.uuid);
                                setPoolValues(next);
                                setAdvancedPool("");
                              }}
                            />
                            <FieldTitle>{option.name}</FieldTitle>
                          </Field>
                        </FieldLabel>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        当前平台账户没有可用选项
                      </p>
                    )}
                  </div>
                </Field>
              ) : null}
              {poolType === "ip" || poolType === "domain" ? (
                <Field>
                  <FieldLabel htmlFor="axisnow-rule-pool-text">
                    {poolType === "domain" ? "CNAME 候选域名" : "自定义 IP"}
                  </FieldLabel>
                  <Textarea
                    id="axisnow-rule-pool-text"
                    rows={5}
                    value={poolText}
                    onChange={(event) => {
                      setPoolText(event.target.value);
                      setAdvancedPool("");
                    }}
                    placeholder="每行一个"
                  />
                </Field>
              ) : null}
              {advancedPool.trim() ? (
                <Field>
                  <FieldLabel>现有多地址组</FieldLabel>
                  <PoolSummary pool={parsePoolText(advancedPool)} options={options} />
                  <FieldDescription>
                    这是当前规则已经保存的多个地址组；本页面会保留原组合。需要重新组合时，请选择上方的单组地址池重新配置。
                  </FieldDescription>
                </Field>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel>选取策略</FieldLabel>
                  <Select
                    items={[
                      { value: "random", label: "随机" },
                      {
                        value: "priority_order",
                        label: "顺序",
                      },
                      { value: "quality_optimized", label: "优选" },
                    ]}
                    value={strategy}
                    onValueChange={(value) =>
                      setStrategy((value ?? "random") as Strategy)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="random">随机</SelectItem>
                        <SelectItem
                          value="priority_order"
                          disabled={poolType === "all_valid_eips"}
                        >
                          顺序
                        </SelectItem>
                        <SelectItem value="quality_optimized">优选</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="axisnow-rule-quantity">
                    返回地址数量
                  </FieldLabel>
                  <Input
                    id="axisnow-rule-quantity"
                    type="number"
                    min={1}
                    max={10}
                    value={fixedQuantity ? 1 : quantity}
                    disabled={fixedQuantity}
                    onChange={(event) =>
                      setQuantity(Number(event.target.value))
                    }
                  />
                </Field>
                {strategy === "quality_optimized" ? (
                  <Field>
                    <FieldLabel>评估周期</FieldLabel>
                    <Select
                      items={[
                        { value: "5", label: "5 分钟" },
                        { value: "10", label: "10 分钟" },
                      ]}
                      value={String(triggerInterval)}
                      onValueChange={(value) =>
                        setTriggerInterval(value === "10" ? 10 : 5)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="5">5 分钟</SelectItem>
                          <SelectItem value="10">10 分钟</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="axisnow-rule-ttl">TTL（秒）</FieldLabel>
                  <Input
                    id="axisnow-rule-ttl"
                    type="number"
                    min={0}
                    max={2592000}
                    value={ttl}
                    onChange={(event) => setTtl(Number(event.target.value))}
                  />
                  <FieldDescription>
                    0 表示使用 DNS 套餐默认值。
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>地址监控模板</FieldLabel>
                  <Select
                    items={[
                      { value: "none", label: "不使用地址监控模板" },
                      ...(options?.probeTemplates ?? []).map((item) => ({
                        value: item.uuid,
                        label: item.name,
                      })),
                    ]}
                    value={probeUuid || "none"}
                    onValueChange={(value) =>
                      setProbeUuid(value === "none" ? "" : (value ?? ""))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">不使用地址监控模板</SelectItem>
                        {(options?.probeTemplates ?? []).map((item) => (
                          <SelectItem key={item.uuid} value={item.uuid}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </FieldGroup>
            {rule ? (
              <div className="mt-6 flex flex-col gap-5 border-t pt-5">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-medium">
                    <Clock3Icon className="size-4" />自动调度
                  </h3>
                  <p className="text-sm text-muted-foreground">在当前路由规则中配置潮汐和故障备份调度。</p>
                </div>
                {automation.isError ? <QueryError error={automation.error} retry={() => void automation.refetch()} /> : null}
                {switched ? (
                  <Alert variant="destructive">
                    <RotateCcwIcon />
                    <AlertTitle>故障备份地址池已生效</AlertTitle>
                    <AlertDescription>系统不会自动回切。确认主地址池已恢复后，可使用下方按钮重新布防。</AlertDescription>
                  </Alert>
                ) : null}
                {automation.data ? (
                  <Alert>
                    <Clock3Icon />
                    <AlertTitle>当前状态：{automationStateName(automation.data.activePool)}</AlertTitle>
                    <AlertDescription>
                      {automation.data.lastHealthState ? `最近探测：${healthStateName(automation.data.lastHealthState)}。` : "尚无探测结果。"}
                      {automation.data.lastCheckAt ? ` 最后检查：${unixDateTime(automation.data.lastCheckAt)}。` : ""}
                      {automation.data.lastSwitchAt ? ` 最近切换：${unixDateTime(automation.data.lastSwitchAt)}。` : ""}
                      {automation.data.lastError ? ` ${automation.data.lastError}` : ""}
                    </AlertDescription>
                  </Alert>
                ) : null}
                {automation.data?.hasProbeTemplate ? (
                  <Field>
                    <FieldLabel>地址监控探测</FieldLabel>
                    <FieldDescription>
                      {options?.probeTemplates.find((item) => item.uuid === automation.data?.probeTemplateUuid)?.name ?? "已配置地址监控模板"}
                      {` · ${healthStateName(automation.data.probeState)}`}
                    </FieldDescription>
                    <ProbeStatusSummary statuses={automation.data.probeStatuses} />
                  </Field>
                ) : null}
                <Field>
                  <FieldLabel>主地址池（只读快照）</FieldLabel>
                  <PoolSummary pool={automation.data?.primaryPool} options={options} />
                  <FieldDescription>保存规则时，主地址池会同步为上方配置的地址池。</FieldDescription>
                </Field>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>启用潮汐调度</FieldTitle>
                    <FieldDescription>在指定时间范围内切换到另一套预留地址池。</FieldDescription>
                  </FieldContent>
                  <Switch checked={tideEnabled} onCheckedChange={(value) => { setTideEnabled(value); setAutomationDirty(true); }} />
                </Field>
                {tideEnabled ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor={`axisnow-tide-start-${rule.uuid}`}>开始时间</FieldLabel>
                        <Input id={`axisnow-tide-start-${rule.uuid}`} type="time" value={tideStart} onChange={(event) => { setTideStart(event.target.value); setAutomationDirty(true); }} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`axisnow-tide-end-${rule.uuid}`}>结束时间</FieldLabel>
                        <Input id={`axisnow-tide-end-${rule.uuid}`} type="time" value={tideEnd} onChange={(event) => { setTideEnd(event.target.value); setAutomationDirty(true); }} />
                      </Field>
                    </div>
                    <AutomationPoolEditor
                      idPrefix={`axisnow-tide-pool-${rule.uuid}`}
                      label="潮汐地址池"
                      recordType={domain?.recordType}
                      options={options}
                      value={tidePool}
                      invalid={tidePoolInvalid}
                      onChange={(value) => { setTidePool(value); setAutomationDirty(true); }}
                    />
                    {tidePoolInvalid ? <p className="text-sm text-destructive">请配置有效且非空的潮汐地址池。</p> : null}
                  </>
                ) : null}
                {domain?.recordType === "A" ? (
                  <>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>启用故障备份调度</FieldTitle>
                        <FieldDescription>只有所有候选 IP 都明确探测失败且连续达到阈值时才会切换。</FieldDescription>
                      </FieldContent>
                      <Switch checked={failoverEnabled} onCheckedChange={(value) => { setFailoverEnabled(value); setAutomationDirty(true); }} />
                    </Field>
                    {failoverEnabled ? (
                      <>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field>
                            <FieldLabel htmlFor={`axisnow-failure-threshold-${rule.uuid}`}>连续失败阈值</FieldLabel>
                            <Input id={`axisnow-failure-threshold-${rule.uuid}`} type="number" min={1} max={10} value={failureThreshold} onChange={(event) => { setFailureThreshold(Number(event.target.value)); setAutomationDirty(true); }} />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`axisnow-check-interval-${rule.uuid}`}>检查间隔（分钟）</FieldLabel>
                            <Input id={`axisnow-check-interval-${rule.uuid}`} type="number" min={1} max={60} value={checkIntervalMinutes} onChange={(event) => { setCheckIntervalMinutes(Number(event.target.value)); setAutomationDirty(true); }} />
                          </Field>
                        </div>
                        <AutomationPoolEditor
                          idPrefix={`axisnow-failover-pool-${rule.uuid}`}
                          label="故障备份地址池"
                          recordType={domain?.recordType}
                          options={options}
                          value={failoverPool}
                          invalid={failoverPoolInvalid}
                          onChange={(value) => { setFailoverPool(value); setAutomationDirty(true); }}
                        />
                        {failoverPoolInvalid ? <p className="text-sm text-destructive">请配置有效且非空的故障备份地址池。</p> : null}
                        {!hasProbeTemplate ? (
                          <Alert variant="destructive">
                            <AlertTitle>尚未配置地址监控模板</AlertTitle>
                            <AlertDescription>请先在上方选择地址监控模板，再启用故障备份调度。</AlertDescription>
                          </Alert>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
            {detail.isError ? (
              <QueryError
                error={detail.error}
                retry={() => void detail.refetch()}
              />
            ) : null}
          </div>
          <DialogFooter>
            {rule && switched ? (
              <ConfirmAction
                trigger={<Button type="button" variant="outline"><RotateCcwIcon data-icon="inline-start" />恢复并重新布防</Button>}
                title="恢复主地址池并重新布防"
                description="这会立即将当前规则切回主地址池，并重新开始故障探测。"
                pending={restore.isPending}
                onConfirm={() => restore.mutate(undefined)}
              />
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={save.isPending || automationSave.isPending || automation.isPending || !canSubmit || (Boolean(rule) && !automation.data) || automationHasError}>
              {save.isPending || automationSave.isPending ? <Spinner data-icon="inline-start" /> : null}确认
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
