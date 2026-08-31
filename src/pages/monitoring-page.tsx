import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BellIcon,
  FileClockIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/api/client";
import type {
  AutomationDomainOption,
  DataResponse,
  MonitoringOverview,
  MonitoringTask,
  MonitoringTaskLog,
  OperationResult,
  PageResponse,
} from "@/api/types";
import { ConfirmAction } from "@/components/confirm-action";
import { AutomationRecordFields } from "@/components/automation-record-fields";
import { DataTable, type DataColumn } from "@/components/data-table";
import { FormDialog, type FormFieldSpec } from "@/components/form-dialog";
import { ListPagination } from "@/components/list-pagination";
import { LoadingTable } from "@/components/loading-table";
import { PageHeader } from "@/components/page-header";
import { QueryError } from "@/components/query-error";
import { StatusBadge } from "@/components/status-badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { formatDateTime } from "@/lib/format";

type MonitoringForm = {
  supportPing: boolean;
  domains: AutomationDomainOption[];
  defaults: Record<string, unknown>;
};

function taskFields(form?: MonitoringForm): FormFieldSpec[] {
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
    { name: "recordName", label: "主机记录", required: true },
    { name: "recordId", label: "供应商记录 ID", required: true },
    { name: "primaryValue", label: "主记录值", required: true },
    {
      name: "action",
      label: "异常处理",
      kind: "select",
      options: [
        { value: "none", label: "仅告警" },
        { value: "disable", label: "暂停解析" },
        { value: "failover", label: "切换备用值" },
        { value: "conditional-enable", label: "恢复时启用" },
      ],
      required: true,
    },
    {
      name: "backupValue",
      label: "备用记录值",
      visible: (values) => values.action === "failover",
      required: true,
    },
    {
      name: "checkType",
      label: "检测方式",
      kind: "select",
      options: [
        ...(form?.supportPing ? [{ value: "ping", label: "Ping" }] : []),
        { value: "tcp", label: "TCP" },
        { value: "http", label: "HTTP(S)" },
      ],
      required: true,
      visible: (values) => values.action !== "conditional-enable",
    },
    {
      name: "tcpPort",
      label: "TCP 端口",
      kind: "number",
      min: 1,
      max: 65535,
      visible: (values) =>
        values.action !== "conditional-enable" && values.checkType === "tcp",
    },
    {
      name: "checkUrl",
      label: "检测 IP / URL",
      placeholder: "Ping 可留空；HTTP(S) 填写完整 URL",
      visible: (values) =>
        values.action !== "conditional-enable" &&
        (values.checkType === "ping" || values.checkType === "http"),
    },
    {
      name: "intervalSeconds",
      label: "检测间隔（秒）",
      kind: "number",
      min: 1,
      required: true,
    },
    {
      name: "cycleCount",
      label: "失败次数 / 正常记录阈值",
      description:
        "普通检测填写连续失败次数；条件开启填写同域名正常记录数阈值，最小为 1。",
      kind: "number",
      min: 1,
      required: true,
    },
    {
      name: "timeoutSeconds",
      label: "超时（秒）",
      kind: "number",
      min: 1,
      required: true,
      visible: (values) =>
        values.action !== "conditional-enable" && values.checkType !== "ping",
    },
    { name: "lineId", label: "记录线路 ID", required: true },
    { name: "lineLabel", label: "记录线路名称" },
    { name: "ttl", label: "记录 TTL", kind: "number", min: 0, required: true },
    {
      name: "useProxy",
      label: "检测使用系统代理",
      kind: "switch",
      visible: (values) =>
        values.action !== "conditional-enable" && values.checkType === "http",
    },
    {
      name: "enableCloudflareProxy",
      label: "切换时启用 Cloudflare 代理",
      kind: "switch",
      visible: (values) =>
        values.action === "failover" &&
        form?.domains.find(
          (domain) => String(domain.id) === String(values.domainId),
        )?.providerType === "cloudflare",
    },
    { name: "remark", label: "备注", kind: "textarea" },
  ];
}

function mutationBody(values: Record<string, unknown>) {
  return {
    domainId: Number(values.domainId),
    recordName: values.recordName,
    recordId: values.recordId,
    action: values.action,
    primaryValue: values.primaryValue,
    backupValue: String(values.backupValue ?? "") || null,
    checkType: values.checkType,
    checkUrl: String(values.checkUrl ?? "") || null,
    tcpPort: values.checkType === "tcp" ? Number(values.tcpPort) : null,
    intervalSeconds: Number(values.intervalSeconds),
    cycleCount: Number(values.cycleCount),
    timeoutSeconds: Number(values.timeoutSeconds),
    useProxy: Boolean(values.useProxy),
    enableCloudflareProxy: Boolean(values.enableCloudflareProxy),
    remark: String(values.remark ?? "") || null,
    record: {
      lineId: String(values.lineId),
      lineLabel: String(values.lineLabel ?? "") || undefined,
      ttl: Number(values.ttl),
    },
  };
}

export function MonitoringPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [searchBy, setSearchBy] = useState("domain");
  const [healthFilter, setHealthFilter] = useState("all");
  const [sort, setSort] = useState("id");
  const [order, setOrder] = useState("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const overview = useQuery({
    queryKey: ["monitoring-overview"],
    queryFn: async () =>
      (
        await apiGet<DataResponse<MonitoringOverview>>(
          "/api/web/v1/monitoring/overview",
        )
      ).data,
    refetchInterval: 30_000,
  });
  const form = useQuery({
    queryKey: ["monitoring-form"],
    queryFn: async () =>
      (
        await apiGet<DataResponse<MonitoringForm>>(
          "/api/web/v1/monitoring/form",
        )
      ).data,
  });
  const tasks = useQuery({
    queryKey: [
      "monitoring-tasks",
      page,
      queryText,
      searchBy,
      healthFilter,
      sort,
      order,
    ],
    queryFn: () =>
      apiGet<PageResponse<MonitoringTask>>("/api/web/v1/monitoring/tasks", {
        page,
        pageSize: 20,
        q: queryText,
        searchBy,
        health: healthFilter === "all" ? undefined : healthFilter,
        sort,
        order,
      }),
  });
  const invalidate = [
    ["monitoring-tasks"],
    ["monitoring-overview"],
    ["dashboard"],
  ] as const;
  const save = useApiMutation<
    { id?: number; body: Record<string, unknown> },
    DataResponse<OperationResult>
  >({
    mutationFn: ({ id, body }) =>
      id
        ? apiPut(`/api/web/v1/monitoring/tasks/${id}`, body)
        : apiPost("/api/web/v1/monitoring/tasks", body),
    successMessage: (_, variables) =>
      variables.id ? "监控任务已更新" : "监控任务已添加",
    invalidate: [...invalidate],
  });
  const remove = useApiMutation<number, DataResponse<OperationResult>>({
    mutationFn: (id) => apiDelete(`/api/web/v1/monitoring/tasks/${id}`),
    successMessage: "监控任务已删除",
    invalidate: [...invalidate],
  });
  const status = useApiMutation<MonitoringTask, DataResponse<OperationResult>>({
    mutationFn: (task) =>
      apiPatch(`/api/web/v1/monitoring/tasks/${task.id}/status`, {
        enabled: !task.active,
      }),
    successMessage: "监控任务状态已更新",
    invalidate: [...invalidate],
  });
  const batch = useApiMutation<string, DataResponse<OperationResult>>({
    mutationFn: (action) =>
      apiPost("/api/web/v1/monitoring/tasks/batch", {
        ids: Array.from(selected, Number),
        action,
      }),
    successMessage: (result) => result.message ?? "批量操作已完成",
    invalidate: [...invalidate],
    onSuccess: () => setSelected(new Set()),
  });
  const notifications = useApiMutation<
    Record<string, unknown>,
    DataResponse<OperationResult>
  >({
    mutationFn: (body) => apiPut("/api/web/v1/monitoring/notifications", body),
    successMessage: "告警通知设置已保存",
    invalidate: [["monitoring-overview"]],
  });
  const clean = useApiMutation<number, DataResponse<OperationResult>>({
    mutationFn: (days) =>
      apiPost("/api/web/v1/monitoring/logs/clean", { days }),
    successMessage: "监控日志已清理",
    invalidate: [["monitoring-logs"]],
  });
  const columns: DataColumn<MonitoringTask>[] = [
    {
      key: "record",
      label: "监控记录",
      render: (task) => (
        <div className="min-w-48">
          <p className="font-medium">
            {task.recordName}.{task.domain}
          </p>
          <p className="text-xs text-muted-foreground">{task.primaryValue}</p>
        </div>
      ),
    },
    {
      key: "check",
      label: "检测",
      render: (task) => (
        <div>
          <BadgeText>{task.checkType.toUpperCase()}</BadgeText>
          <p className="mt-1 text-xs text-muted-foreground">
            每 {task.intervalSeconds} 秒
          </p>
        </div>
      ),
    },
    {
      key: "health",
      label: "健康",
      render: (task) => <StatusBadge value={task.health} />,
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
      key: "checked",
      label: "上次检查",
      render: (task) => formatDateTime(task.checkedAt),
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
                aria-label={`管理 ${task.recordName}`}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <MonitoringTaskDialog
                trigger={
                  <DropdownMenuItem onClick={(event) => event.preventDefault()}>
                    <PencilIcon />
                    编辑
                  </DropdownMenuItem>
                }
                task={task}
                form={form.data}
                pending={save.isPending}
                onSave={(body, close) =>
                  save.mutate({ id: task.id, body }, { onSuccess: close })
                }
              />
              <MonitoringLogsDialog task={task} />
              <ConfirmAction
                trigger={
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={(event) => event.preventDefault()}
                  >
                    <Trash2Icon />
                    删除
                  </DropdownMenuItem>
                }
                title="删除监控任务？"
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
        title="解析监控"
        description="持续检查解析目标，在异常时告警、暂停或切换备用记录。"
        action={
          <MonitoringTaskDialog
            trigger={
              <Button>
                <PlusIcon data-icon="inline-start" />
                添加监控
              </Button>
            }
            form={form.data}
            pending={save.isPending}
            onSave={(body, close) =>
              save.mutate({ body }, { onSuccess: close })
            }
          />
        }
      />
      <Tabs defaultValue="tasks">
        <TabsList variant="line">
          <TabsTrigger value="tasks">监控任务</TabsTrigger>
          <TabsTrigger value="overview">运行设置</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <form
                className="grid gap-2 md:grid-cols-2 xl:grid-cols-[10rem_minmax(14rem,1fr)_9rem_11rem_8rem_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  setPage(1);
                  setSelected(new Set());
                  setQueryText(search.trim());
                }}
              >
                <Select
                  items={[
                    { value: "domain", label: "按域名" },
                    { value: "primaryValue", label: "按主记录值" },
                    { value: "backupValue", label: "按备用值" },
                    { value: "recordId", label: "按记录 ID" },
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
                      <SelectItem value="primaryValue">按主记录值</SelectItem>
                      <SelectItem value="backupValue">按备用值</SelectItem>
                      <SelectItem value="recordId">按记录 ID</SelectItem>
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
                    { value: "all", label: "全部健康状态" },
                    { value: "healthy", label: "正常" },
                    { value: "failed", label: "异常" },
                  ]}
                  value={healthFilter}
                  onValueChange={(value) => {
                    setHealthFilter(value ?? "all");
                    setPage(1);
                    setSelected(new Set());
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">全部健康状态</SelectItem>
                      <SelectItem value="healthy">正常</SelectItem>
                      <SelectItem value="failed">异常</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select
                  items={[
                    { value: "id", label: "按添加顺序" },
                    { value: "recordName", label: "按主机记录" },
                    { value: "primaryValue", label: "按主记录值" },
                    { value: "action", label: "按异常动作" },
                    { value: "checkType", label: "按检查方式" },
                    { value: "intervalSeconds", label: "按检查频率" },
                    { value: "health", label: "按健康状态" },
                    { value: "active", label: "按运行状态" },
                    { value: "checkedAt", label: "按检查时间" },
                    { value: "addedAt", label: "按添加时间" },
                    { value: "remark", label: "按备注" },
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
                      <SelectItem value="primaryValue">按主记录值</SelectItem>
                      <SelectItem value="action">按异常动作</SelectItem>
                      <SelectItem value="checkType">按检查方式</SelectItem>
                      <SelectItem value="intervalSeconds">按检查频率</SelectItem>
                      <SelectItem value="health">按健康状态</SelectItem>
                      <SelectItem value="active">按运行状态</SelectItem>
                      <SelectItem value="checkedAt">按检查时间</SelectItem>
                      <SelectItem value="addedAt">按添加时间</SelectItem>
                      <SelectItem value="remark">按备注</SelectItem>
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
              {selected.size ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
                  <span className="mr-auto text-sm">
                    已选择 {selected.size} 项
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => batch.mutate("enable")}
                  >
                    启用
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => batch.mutate("disable")}
                  >
                    停用
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => batch.mutate("retry")}
                  >
                    重试
                  </Button>
                  <ConfirmAction
                    trigger={
                      <Button size="sm" variant="destructive">
                        删除
                      </Button>
                    }
                    title="删除所选监控任务？"
                    description="此操作无法撤销。"
                    destructive
                    pending={batch.isPending}
                    onConfirm={() => batch.mutate("delete")}
                  />
                </div>
              ) : null}
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
                  selected={selected}
                  onSelectedChange={setSelected}
                  emptyTitle="暂无监控任务"
                />
              )}
              {tasks.data ? (
                <ListPagination
                  meta={tasks.data.meta}
                  onPageChange={(next) => {
                    setSelected(new Set());
                    setPage(next);
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="overview">
          {overview.isError ? (
            <QueryError
              error={overview.error}
              retry={() => void overview.refetch()}
            />
          ) : overview.isPending ? (
            <LoadingTable />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>运行状态</CardTitle>
                  <CardDescription>监控工作进程与今日统计</CardDescription>
                  <CardAction>
                    <StatusBadge
                      value={
                        overview.data.workerRunning ? "running" : "stopped"
                      }
                    />
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="grid grid-cols-3 gap-3">
                    <Stat
                      label="今日运行"
                      value={overview.data.runCountToday}
                    />
                    <Stat
                      label="24H 告警"
                      value={overview.data.alertsLast24Hours}
                    />
                    <Stat
                      label="24H 切换"
                      value={overview.data.switchesLast24Hours}
                    />
                  </div>
                  <div className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">上次运行</p>
                      <p className="mt-1">
                        {formatDateTime(overview.data.lastRunAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">运行扩展</p>
                      <p className="mt-1">
                        {overview.data.swooleInstalled ? "已安装" : "未安装"}
                      </p>
                    </div>
                  </div>
                  {overview.data.lastError ? (
                    <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                      {overview.data.lastError}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>通知与维护</CardTitle>
                  <CardDescription>
                    选择监控告警渠道并管理历史日志。
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <FormDialog
                    trigger={
                      <Button variant="outline">
                        <BellIcon data-icon="inline-start" />
                        通知设置
                      </Button>
                    }
                    title="监控通知设置"
                    initialValues={overview.data.notifications}
                    fields={[
                      { name: "email", label: "邮件通知", kind: "switch" },
                      { name: "wechat", label: "微信通知", kind: "switch" },
                      {
                        name: "telegram",
                        label: "Telegram 通知",
                        kind: "switch",
                      },
                      {
                        name: "robotWebhook",
                        label: "群机器人 Webhook",
                        kind: "switch",
                      },
                      {
                        name: "customWebhook",
                        label: "自定义 Webhook",
                        kind: "switch",
                      },
                    ]}
                    pending={notifications.isPending}
                    onSubmit={(values, close) =>
                      notifications.mutate(values, { onSuccess: close })
                    }
                  />
                  <FormDialog
                    trigger={
                      <Button variant="outline">
                        <Trash2Icon data-icon="inline-start" />
                        清理日志
                      </Button>
                    }
                    title="清理监控日志"
                    initialValues={{ days: 90 }}
                    fields={[
                      {
                        name: "days",
                        label: "保留最近天数",
                        kind: "number",
                        min: 1,
                        max: 365000,
                      },
                    ]}
                    pending={clean.isPending}
                    onSubmit={(values, close) =>
                      clean.mutate(Number(values.days), { onSuccess: close })
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

function BadgeText({ children }: { children: string }) {
  return (
    <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
      {children}
    </span>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted p-3 text-center">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function MonitoringTaskDialog({
  trigger,
  task,
  form,
  pending,
  onSave,
}: {
  trigger: React.ReactElement;
  task?: MonitoringTask;
  form?: MonitoringForm;
  pending: boolean;
  onSave: (body: Record<string, unknown>, close: () => void) => void;
}) {
  const initial = task
    ? {
        domainId: String(task.domainId),
        recordName: task.recordName,
        recordId: task.recordId,
        primaryValue: task.primaryValue,
        backupValue: task.backupValue ?? "",
        action: task.action,
        checkType: task.checkType,
        checkUrl: task.checkUrl ?? "",
        tcpPort: task.tcpPort ?? 80,
        intervalSeconds: task.intervalSeconds,
        cycleCount: task.cycleCount,
        timeoutSeconds: task.timeoutSeconds,
        useProxy: task.useProxy,
        enableCloudflareProxy: task.enableCloudflareProxy,
        lineId: task.record?.lineId ?? "",
        lineLabel: task.record?.lineLabel ?? "",
        ttl: task.record?.ttl ?? 600,
        remark: task.remark ?? "",
      }
    : {
        ...form?.defaults,
        domainId: "",
        recordName: "",
        recordId: "",
        primaryValue: "",
        lineId: "",
        lineLabel: "",
        ttl: 600,
      };
  const managed = new Set([
    "domainId",
    "recordName",
    "recordId",
    "lineId",
    "lineLabel",
    "ttl",
  ]);
  return (
    <FormDialog
      trigger={trigger}
      title={task ? "编辑监控任务" : "添加监控任务"}
      initialValues={initial}
      pending={pending}
      onSubmit={(values, close) => onSave(mutationBody(values), close)}
    >
      {(values, onChange) => (
        <AutomationRecordFields
          domains={form?.domains ?? []}
          fields={taskFields(form).filter((field) => !managed.has(field.name))}
          values={values}
          onChange={onChange}
        />
      )}
    </FormDialog>
  );
}

function MonitoringLogsDialog({ task }: { task: MonitoringTask }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [eventFilter, setEventFilter] = useState("all");
  const query = useQuery({
    queryKey: ["monitoring-logs", task.id, page, eventFilter],
    queryFn: () =>
      apiGet<PageResponse<MonitoringTaskLog>>(
        `/api/web/v1/monitoring/tasks/${task.id}/logs`,
        {
          page,
          pageSize: 20,
          event: eventFilter === "all" ? undefined : eventFilter,
        },
      ),
    enabled: open,
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setPage(1);
          setEventFilter("all");
        }
      }}
    >
      <DialogTrigger
        render={
          <DropdownMenuItem onClick={(event) => event.preventDefault()} />
        }
      >
        <FileClockIcon />
        运行日志
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>监控运行日志</DialogTitle>
          <DialogDescription>
            {task.recordName}.{task.domain} 的失败与恢复历史。
          </DialogDescription>
        </DialogHeader>
        <Select
          items={[
            { value: "all", label: "全部事件" },
            { value: "failure", label: "失败" },
            { value: "recovery", label: "恢复" },
          ]}
          value={eventFilter}
          onValueChange={(value) => {
            setEventFilter(value ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">全部事件</SelectItem>
              <SelectItem value="failure">失败</SelectItem>
              <SelectItem value="recovery">恢复</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        {query.isError ? (
          <QueryError error={query.error} retry={() => void query.refetch()} />
        ) : query.isPending ? (
          <LoadingTable />
        ) : (
          <div className="flex flex-col gap-4">
            <DataTable
              rows={query.data.data}
              rowKey={(item) => String(item.id)}
              columns={[
                {
                  key: "time",
                  label: "时间",
                  render: (item) => formatDateTime(item.time),
                },
                {
                  key: "event",
                  label: "事件",
                  render: (item) => (
                    <StatusBadge
                      value={item.event === "recovery" ? "success" : "failed"}
                      label={item.event === "recovery" ? "恢复" : "失败"}
                    />
                  ),
                },
                {
                  key: "error",
                  label: "信息",
                  render: (item) => item.error ?? "—",
                },
              ]}
              emptyTitle="暂无运行日志"
            />
            <ListPagination meta={query.data.meta} onPageChange={setPage} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
