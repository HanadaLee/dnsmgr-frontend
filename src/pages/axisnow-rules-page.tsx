import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CirclePauseIcon,
  CirclePlayIcon,
  CodeXmlIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { Link } from "react-router-dom";

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/api/client";
import type {
  AxisNowDomain,
  AxisNowRule,
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
import { Spinner } from "@/components/ui/spinner";
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
  const resolved = new Set(rule.resolvedAddresses.map((item) => item.address.toLowerCase()));
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
                      <div className={`flex items-center gap-2 font-mono ${addressTone(item, resolved.has(item.address.toLowerCase()))}`}>
                        <CountryFlag countryCode={item.countryCode} />
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
                    <TableCell className={`text-right font-mono tabular-nums ${addressTone(item, resolved.has(item.address.toLowerCase()))}`}>
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
              <span className="flex items-center gap-2"><CountryFlag countryCode={item.countryCode} />{item.address}</span>
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
      <p className="text-xs text-muted-foreground">最后更新时间：{ruleUpdatedAt(rule.updatedAt)}</p>
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"active" | "paused">("active");
  const [poolType, setPoolType] = useState<PoolType>("all_valid_eips");
  const [poolValues, setPoolValues] = useState<Set<string>>(new Set());
  const [poolText, setPoolText] = useState("");
  const [advancedPool, setAdvancedPool] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [strategy, setStrategy] = useState<Strategy>("random");
  const [quantity, setQuantity] = useState(1);
  const [triggerInterval, setTriggerInterval] = useState<5 | 10>(5);
  const [ttl, setTtl] = useState(0);
  const [probeUuid, setProbeUuid] = useState("");
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

  useEffect(() => {
    if (!open) return;
    setGeoIsp("default");
    setName("");
    setDescription("");
    setStatus("active");
    setPoolType(domain?.recordType === "CNAME" ? "domain" : "all_valid_eips");
    setPoolValues(new Set());
    setPoolText("");
    setAdvancedPool("");
    setShowAdvanced(false);
    setStrategy("random");
    setQuantity(1);
    setTriggerInterval(5);
    setTtl(0);
    setProbeUuid("");
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
    setName(current.name ?? "");
    setDescription(current.description ?? "");
    setStatus(current.status);
    setPoolType(detectedType);
    setPoolValues(new Set(stringArray(group.eip_uuids ?? group.tag_uuids)));
    setPoolText(stringArray(group.ips ?? group.domains).join("\n"));
    setAdvancedPool(groups.length > 1 ? JSON.stringify(pool, null, 2) : "");
    setShowAdvanced(groups.length > 1);
    setStrategy((response.election_strategy ?? "random") as Strategy);
    setQuantity(Number(response.ip_quantity ?? response.addr_quantity ?? 1));
    setTriggerInterval(Number(response.trigger_interval) === 10 ? 10 : 5);
    setTtl(Number(ttlConf.ttl ?? 0));
    setProbeUuid(stringArray(conf.edge_probe_template_uuid)[0] ?? "");
  }, [detail.data]);

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
                name: name || null,
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
              { onSuccess: () => setOpen(false) },
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
                      label: `${"　".repeat(item.depth)}${item.name}`,
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
                  <FieldLabel htmlFor="axisnow-rule-name">规则名称</FieldLabel>
                  <Input
                    id="axisnow-rule-name"
                    value={name}
                    maxLength={100}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
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
                    onChange={(event) => setPoolText(event.target.value)}
                    placeholder="每行一个"
                  />
                </Field>
              ) : null}
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAdvanced((current) => !current)}
                >
                  <CodeXmlIcon data-icon="inline-start" />
                  高级地址池 JSON
                </Button>
                {showAdvanced ? (
                  <Field className="mt-3">
                    <FieldLabel htmlFor="axisnow-rule-advanced">
                      address_pool JSON
                    </FieldLabel>
                    <Textarea
                      id="axisnow-rule-advanced"
                      className="font-mono"
                      rows={6}
                      value={advancedPool}
                      onChange={(event) => setAdvancedPool(event.target.value)}
                    />
                    <FieldDescription>
                      多地址组或混合地址池可直接按 AxisNow API 的 address_pool
                      结构编辑。
                    </FieldDescription>
                  </Field>
                ) : null}
              </div>
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
            {detail.isError ? (
              <QueryError
                error={detail.error}
                retry={() => void detail.refetch()}
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={save.isPending || !canSubmit}>
              {save.isPending ? <Spinner data-icon="inline-start" /> : null}确认
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
