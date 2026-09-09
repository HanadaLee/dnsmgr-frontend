import { useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CoinsIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react";

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/api/client";
import type {
  AutomationDomainOption,
  DataResponse,
  OperationResult,
  OptimizeIpSettings,
  OptimizeIpTask,
  PageResponse,
} from "@/api/types";
import { ConfirmAction } from "@/components/confirm-action";
import { DataTable, type DataColumn } from "@/components/data-table";
import { FormDialog, type FormFieldSpec } from "@/components/form-dialog";
import { ListPagination } from "@/components/list-pagination";
import { LoadingTable } from "@/components/loading-table";
import { PageHeader } from "@/components/page-header";
import { QueryError } from "@/components/query-error";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { formatDateTime } from "@/lib/format";

type OptimizeForm = {
  dataSource: string;
  domains: AutomationDomainOption[];
  excludedProviderTypes: string[];
  defaults: Record<string, unknown>;
};
type WorkerStatus = { running: boolean };
const providerLabels: Record<string, string> = {
  cloudflare: "CloudFlare",
  cloudfront: "CloudFront",
  gcore: "Gcore",
  edgeone: "EdgeOne",
};

function fields(form?: OptimizeForm): FormFieldSpec[] {
  const providers =
    form?.dataSource === "wetest"
      ? Object.entries(providerLabels)
      : [["cloudflare", providerLabels.cloudflare]];
  const ipVersionOptions =
    form?.dataSource === "xingpingcn"
      ? [{ value: "v4", label: "仅 IPv4" }]
      : [
          { value: "v4", label: "仅 IPv4" },
          { value: "v6", label: "仅 IPv6" },
          { value: "v4,v6", label: "IPv4 + IPv6" },
        ];
  return [
    {
      name: "domainId",
      label: "域名",
      kind: "select",
      options: (form?.domains ?? []).map((domain) => ({
        value: String(domain.id),
        label: domain.name,
      })),
      required: true,
    },
    {
      name: "recordName",
      label: "主机记录",
      placeholder: "www",
      required: true,
    },
    {
      name: "lineStrategy",
      label: "线路策略",
      kind: "select",
      options: [
        { value: "carrier-lines", label: "电信 / 联通 / 移动线路" },
        { value: "default-unicom-mobile", label: "默认 / 联通 / 移动线路" },
      ],
      required: true,
    },
    {
      name: "ipVersionsText",
      label: "IP 版本",
      kind: "select",
      options: ipVersionOptions,
      description:
        form?.dataSource === "xingpingcn"
          ? "当前数据源仅支持 IPv4。"
          : "同时选择 IPv4 与 IPv6 会分别查询。",
      required: true,
    },
    {
      name: "cdnProvider",
      label: "CDN 服务商",
      kind: "select",
      options: providers.map(([value, label]) => ({ value, label })),
      description:
        form?.dataSource === "wetest"
          ? undefined
          : "当前数据源仅支持 CloudFlare。",
      required: true,
    },
    {
      name: "recordCount",
      label: "每条线路记录数",
      kind: "number",
      min: 1,
      max: 50,
      required: true,
    },
    {
      name: "ttl",
      label: "TTL",
      kind: "number",
      min: 1,
      max: 3600,
      required: true,
    },
    { name: "remark", label: "备注", kind: "textarea" },
  ];
}

function body(values: Record<string, unknown>) {
  return {
    domainId: Number(values.domainId),
    recordName: values.recordName,
    lineStrategy: values.lineStrategy,
    ipVersions: String(values.ipVersionsText).split(","),
    cdnProvider: values.cdnProvider,
    recordCount: Number(values.recordCount),
    ttl: Number(values.ttl),
    remark: String(values.remark ?? "") || null,
  };
}

export function OptimizeIpPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [searchBy, setSearchBy] = useState("domain");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("id");
  const [order, setOrder] = useState("desc");
  const settings = useQuery({
    queryKey: ["optimize-settings"],
    queryFn: async () =>
      (
        await apiGet<DataResponse<OptimizeIpSettings>>(
          "/api/web/v1/optimize-ip/settings",
        )
      ).data,
  });
  const form = useQuery({
    queryKey: ["optimize-form"],
    queryFn: async () =>
      (await apiGet<DataResponse<OptimizeForm>>("/api/web/v1/optimize-ip/form"))
        .data,
  });
  const worker = useQuery({
    queryKey: ["optimize-worker"],
    queryFn: async () =>
      (
        await apiGet<DataResponse<WorkerStatus>>(
          "/api/web/v1/optimize-ip/worker-status",
        )
      ).data,
    refetchInterval: 30_000,
  });
  const tasks = useQuery({
    queryKey: [
      "optimize-tasks",
      page,
      queryText,
      searchBy,
      statusFilter,
      sort,
      order,
    ],
    queryFn: () =>
      apiGet<PageResponse<OptimizeIpTask>>("/api/web/v1/optimize-ip/tasks", {
        page,
        pageSize: 20,
        q: queryText,
        searchBy,
        status: statusFilter === "all" ? undefined : statusFilter,
        sort,
        order,
      }),
  });
  const invalidate = [["optimize-tasks"], ["dashboard"]] as const;
  const save = useApiMutation<
    { id?: number; body: Record<string, unknown> },
    DataResponse<OperationResult>
  >({
    mutationFn: ({ id, body: payload }) =>
      id
        ? apiPut(`/api/web/v1/optimize-ip/tasks/${id}`, payload)
        : apiPost("/api/web/v1/optimize-ip/tasks", payload),
    successMessage: (_, variables) =>
      variables.id ? "优选 IP 任务已更新" : "优选 IP 任务已添加",
    invalidate: [...invalidate],
  });
  const remove = useApiMutation<number, DataResponse<OperationResult>>({
    mutationFn: (id) => apiDelete(`/api/web/v1/optimize-ip/tasks/${id}`),
    successMessage: "优选 IP 任务已删除",
    invalidate: [...invalidate],
  });
  const status = useApiMutation<OptimizeIpTask, DataResponse<OperationResult>>({
    mutationFn: (task) =>
      apiPatch(`/api/web/v1/optimize-ip/tasks/${task.id}/status`, {
        enabled: !task.active,
      }),
    successMessage: "任务状态已更新",
    invalidate: [...invalidate],
  });
  const run = useApiMutation<number, DataResponse<OperationResult>>({
    mutationFn: (id) => apiPost(`/api/web/v1/optimize-ip/tasks/${id}/run`, {}),
    successMessage: (result) => result.message ?? "优选 IP 任务已执行",
    pendingMessage: (id) => `正在运行优选 IP 任务 #${id}`,
    invalidate: [...invalidate],
  });
  const settingsSave = useApiMutation<
    Record<string, unknown>,
    DataResponse<OperationResult>
  >({
    mutationFn: (payload) =>
      apiPut("/api/web/v1/optimize-ip/settings", payload),
    successMessage: "优选 IP 设置已保存",
    invalidate: [["optimize-settings"], ["optimize-form"]],
  });
  const balance = useApiMutation<
    { dataSource: string; apiKey: string },
    DataResponse<OperationResult>
  >({
    mutationFn: (payload) =>
      apiPost("/api/web/v1/optimize-ip/account-balance", payload),
    successMessage: (result) => result.message ?? "账户信息已查询",
  });
  const columns: DataColumn<OptimizeIpTask>[] = [
    {
      key: "record",
      label: "解析记录",
      render: (task) => (
        <div className="min-w-48">
          <p className="font-medium">
            {task.recordName}.{task.domain}
          </p>
          <p className="text-xs text-muted-foreground">
            {task.remark ?? task.lineStrategy}
          </p>
        </div>
      ),
    },
    {
      key: "provider",
      label: "CDN",
      render: (task) => (
        <Badge variant="outline">
          {providerLabels[task.cdnProvider] ?? task.cdnProvider}
        </Badge>
      ),
    },
    {
      key: "versions",
      label: "地址族",
      render: (task) =>
        task.ipVersions.map((version) => version.toUpperCase()).join(" + "),
    },
    {
      key: "result",
      label: "上次结果",
      render: (task) => (
        <div>
          <StatusBadge value={run.isPending && run.variables === task.id ? "running" : task.status} />
          <p className="mt-1 text-xs text-muted-foreground">
            {run.isPending && run.variables === task.id
              ? "正在发起优选 IP 运行…"
              : formatDateTime(task.lastRunAt)}
          </p>
        </div>
      ),
    },
    {
      key: "active",
      label: "状态",
      render: (task) => (
        <button onClick={() => status.mutate(task)}>
          <StatusBadge value={task.active} />
        </button>
      ),
    },
    {
      key: "actions",
      label: "",
      className: "w-12",
      render: (task) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={run.isPending && run.variables === task.id
                  ? `${task.recordName} 正在运行`
                  : `管理 ${task.recordName}`}
                aria-busy={run.isPending && run.variables === task.id}
              />
            }
          >
            {run.isPending && run.variables === task.id ? <Spinner /> : <MoreHorizontalIcon />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <OptimizeDialog
                trigger={
                  <DropdownMenuItem closeOnClick={false}>
                    <PencilIcon />
                    编辑
                  </DropdownMenuItem>
                }
                task={task}
                form={form.data}
                pending={save.isPending}
                onSave={(payload, close) =>
                  save.mutate(
                    { id: task.id, body: payload },
                    { onSuccess: close },
                  )
                }
              />
              <DropdownMenuItem disabled={run.isPending} onClick={() => run.mutate(task.id)}>
                {run.isPending && run.variables === task.id ? <Spinner /> : <PlayIcon />}
                {run.isPending && run.variables === task.id ? "正在运行" : "立即运行"}
              </DropdownMenuItem>
              <ConfirmAction
                trigger={
                  <DropdownMenuItem
                    variant="destructive"
                    closeOnClick={false}
                  >
                    <Trash2Icon />
                    删除
                  </DropdownMenuItem>
                }
                title="删除优选 IP 任务？"
                description={`${task.recordName}.${task.domain}`}
                destructive
                pending={remove.isPending}
                onConfirm={() => remove.mutate(task.id)}
              />
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Automation"
        title="优选 IP"
        description="从质量数据源筛选 CDN 节点，并自动维护多线路解析。"
        action={
          <OptimizeDialog
            trigger={
              <Button>
                <PlusIcon data-icon="inline-start" />
                添加任务
              </Button>
            }
            form={form.data}
            pending={save.isPending}
            onSave={(payload, close) =>
              save.mutate({ body: payload }, { onSuccess: close })
            }
          />
        }
      />
      <Tabs defaultValue="tasks">
        <TabsList variant="line">
          <TabsTrigger value="tasks">优选任务</TabsTrigger>
          <TabsTrigger value="settings">数据源设置</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <form
                className="grid gap-2 md:grid-cols-2 xl:grid-cols-[9rem_minmax(14rem,1fr)_9rem_11rem_8rem_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  setPage(1);
                  setQueryText(search.trim());
                }}
              >
                <Select
                  items={[
                    { value: "domain", label: "按域名" },
                    { value: "remark", label: "按备注" },
                  ]}
                  value={searchBy}
                  onValueChange={(value) => {
                    setSearchBy(value ?? "domain");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="domain">按域名</SelectItem>
                      <SelectItem value="remark">按备注</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="输入筛选内容"
                  />
                </div>
                <Select
                  items={[
                    { value: "all", label: "全部结果" },
                    { value: "success", label: "成功" },
                    { value: "failed", label: "失败" },
                  ]}
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value ?? "all");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">全部结果</SelectItem>
                      <SelectItem value="success">成功</SelectItem>
                      <SelectItem value="failed">失败</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select
                  items={[
                    { value: "id", label: "按添加顺序" },
                    { value: "recordName", label: "按主机记录" },
                    { value: "cdnProvider", label: "按 CDN" },
                    { value: "recordCount", label: "按记录数量" },
                    { value: "ipVersions", label: "按 IP 类型" },
                    { value: "active", label: "按运行状态" },
                    { value: "lastRunAt", label: "按运行时间" },
                    { value: "status", label: "按结果" },
                  ]}
                  value={sort}
                  onValueChange={(value) => {
                    setSort(value ?? "id");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="id">按添加顺序</SelectItem>
                      <SelectItem value="recordName">按主机记录</SelectItem>
                      <SelectItem value="cdnProvider">按 CDN</SelectItem>
                      <SelectItem value="recordCount">按记录数量</SelectItem>
                      <SelectItem value="ipVersions">按 IP 类型</SelectItem>
                      <SelectItem value="active">按运行状态</SelectItem>
                      <SelectItem value="lastRunAt">按运行时间</SelectItem>
                      <SelectItem value="status">按结果</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select
                  items={[
                    { value: "desc", label: "降序" },
                    { value: "asc", label: "升序" },
                  ]}
                  value={order}
                  onValueChange={(value) => {
                    setOrder(value ?? "desc");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="desc">降序</SelectItem>
                      <SelectItem value="asc">升序</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button type="submit" variant="outline">
                  搜索
                </Button>
              </form>
              {tasks.isError ? (
                <QueryError
                  error={tasks.error}
                  retry={() => void tasks.refetch()}
                />
              ) : tasks.isPending ? (
                <LoadingTable />
              ) : (
                <DataTable
                  rows={tasks.data.data}
                  columns={columns}
                  rowKey={(task) => String(task.id)}
                  emptyTitle="暂无优选 IP 任务"
                />
              )}
              {tasks.data ? (
                <ListPagination meta={tasks.data.meta} onPageChange={setPage} />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="settings">
          {settings.isError ? (
            <QueryError
              error={settings.error}
              retry={() => void settings.refetch()}
            />
          ) : settings.isPending ? (
            <LoadingTable />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>数据源</CardTitle>
                  <CardDescription>
                    优选 IP 查询凭据与执行间隔。
                  </CardDescription>
                  <CardAction>
                    <StatusBadge
                      value={worker.data?.running ? "running" : "stopped"}
                    />
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <FormDialog
                    trigger={
                      <Button>
                        <SettingsIcon data-icon="inline-start" />
                        编辑设置
                      </Button>
                    }
                    title="优选 IP 设置"
                    initialValues={settings.data}
                    fields={[
                      {
                        name: "dataSource",
                        label: "数据源",
                        kind: "select",
                        options: [
                          { value: "wetest", label: "WeTest" },
                          { value: "hostmonit", label: "HostMonit" },
                          { value: "xingpingcn", label: "星评测" },
                        ],
                      },
                      { name: "apiKey", label: "API Key", kind: "password" },
                      { name: "proxyUrl", label: "查询代理 URL" },
                      {
                        name: "intervalMinutes",
                        label: "运行间隔（分钟）",
                        kind: "number",
                        min: 10,
                        max: 525600,
                      },
                    ]}
                    pending={settingsSave.isPending}
                    onSubmit={(values, close) =>
                      settingsSave.mutate(
                        {
                          ...values,
                          intervalMinutes: Number(values.intervalMinutes),
                        },
                        { onSuccess: close },
                      )
                    }
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>账户余额</CardTitle>
                  <CardDescription>
                    查询 WeTest 或 HostMonit 账户信息。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormDialog
                    trigger={
                      <Button variant="outline">
                        <CoinsIcon data-icon="inline-start" />
                        查询账户
                      </Button>
                    }
                    title="查询数据源账户"
                    initialValues={{
                      dataSource: settings.data.dataSource,
                      apiKey: settings.data.apiKey,
                    }}
                    fields={[
                      {
                        name: "dataSource",
                        label: "数据源",
                        kind: "select",
                        options: [
                          { value: "wetest", label: "WeTest" },
                          { value: "hostmonit", label: "HostMonit" },
                        ],
                      },
                      {
                        name: "apiKey",
                        label: "API Key",
                        kind: "password",
                        required: true,
                      },
                    ]}
                    pending={balance.isPending}
                    onSubmit={(values, close) =>
                      balance.mutate(
                        {
                          dataSource: String(values.dataSource),
                          apiKey: String(values.apiKey),
                        },
                        { onSuccess: close },
                      )
                    }
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OptimizeDialog({
  trigger,
  task,
  form,
  pending,
  onSave,
}: {
  trigger: ReactElement;
  task?: OptimizeIpTask;
  form?: OptimizeForm;
  pending: boolean;
  onSave: (body: Record<string, unknown>, close: () => void) => void;
}) {
  const initial = task
    ? {
        domainId: String(task.domainId),
        recordName: task.recordName,
        lineStrategy: task.lineStrategy,
        ipVersionsText: task.ipVersions.join(","),
        cdnProvider: task.cdnProvider,
        recordCount: task.recordCount,
        ttl: task.ttl,
        remark: task.remark ?? "",
      }
    : {
        ...form?.defaults,
        ipVersionsText: Array.isArray(form?.defaults.ipVersions)
          ? form.defaults.ipVersions.join(",")
          : "v4",
      };
  return (
    <FormDialog
      trigger={trigger}
      title={task ? "编辑优选 IP 任务" : "添加优选 IP 任务"}
      fields={fields(form)}
      initialValues={initial}
      pending={pending}
      onSubmit={(values, close) => onSave(body(values), close)}
    />
  );
}
