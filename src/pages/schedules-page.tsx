import { useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import {
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
  OperationResult,
  PageResponse,
  ScheduledDnsTask,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { useApiMutation } from "@/hooks/use-api-mutation";
import { formatDateTime } from "@/lib/format";

type ScheduleForm = {
  domains: AutomationDomainOption[];
  defaults: Record<string, unknown>;
};
const actionLabels: Record<string, string> = {
  update: "修改解析",
  enable: "启用解析",
  disable: "停用解析",
  delete: "删除解析",
};

function scheduleFields(
  form: ScheduleForm | undefined,
  values: Record<string, unknown>,
): FormFieldSpec[] {
  const execution = values.execution;
  const cycle = values.cycle;
  const providerType = form?.domains.find(
    (domain) => String(domain.id) === String(values.domainId),
  )?.providerType;
  const actions = Object.entries(actionLabels)
    .filter(([value]) => execution !== "recurring" || value !== "delete")
    .map(([value, label]) => ({ value, label }));
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
    {
      name: "execution",
      label: "执行方式",
      kind: "select",
      options: [
        { value: "once", label: "单次执行" },
        { value: "recurring", label: "周期执行" },
      ],
      required: true,
    },
    {
      name: "cycle",
      label: "周期",
      kind: "select",
      options: [
        { value: "daily", label: "每天" },
        { value: "weekly", label: "每周" },
        { value: "monthly", label: "每月" },
      ],
      visible: (values) => values.execution === "recurring",
    },
    {
      name: "switchDate",
      label: "星期",
      kind: "select",
      options: [
        { value: "0", label: "周日" },
        { value: "1", label: "周一" },
        { value: "2", label: "周二" },
        { value: "3", label: "周三" },
        { value: "4", label: "周四" },
        { value: "5", label: "周五" },
        { value: "6", label: "周六" },
      ],
      visible: () => execution === "recurring" && cycle === "weekly",
      required: true,
    },
    {
      name: "switchDate",
      label: "日期",
      kind: "number",
      min: 1,
      max: 31,
      visible: () => execution === "recurring" && cycle === "monthly",
      required: true,
    },
    {
      name: "switchTime",
      label: "执行时间",
      kind: execution === "once" ? "datetime-local" : "time",
      required: true,
    },
    {
      name: "action",
      label: "动作",
      kind: "select",
      options: actions,
      required: true,
    },
    {
      name: "value",
      label: "新记录值",
      kind: "textarea",
      visible: (values) => values.action === "update",
    },
    {
      name: "lineMode",
      label: "CloudFlare 代理模式",
      kind: "select",
      options: [
        { value: "unchanged", label: "保持不变" },
        { value: "dns-only", label: "仅 DNS" },
        { value: "proxied", label: "已代理" },
      ],
      visible: (values) =>
        values.action === "update" && providerType === "cloudflare",
    },
    { name: "lineId", label: "当前线路 ID", required: true },
    { name: "lineLabel", label: "当前线路名称" },
    { name: "ttl", label: "当前 TTL", kind: "number", min: 0, required: true },
    { name: "currentValue", label: "当前记录值" },
    { name: "remark", label: "备注", kind: "textarea" },
  ];
}

function taskBody(
  values: Record<string, unknown>,
  domains: AutomationDomainOption[],
) {
  const recurring = values.execution === "recurring";
  const providerType = domains.find(
    (domain) => String(domain.id) === String(values.domainId),
  )?.providerType;
  return {
    domainId: Number(values.domainId),
    recordName: values.recordName,
    recordId: values.recordId,
    execution: values.execution,
    cycle: values.cycle ?? "daily",
    action: values.action,
    switchDate:
      recurring && values.cycle !== "daily"
        ? String(values.switchDate ?? "")
        : "",
    switchTime: values.switchTime,
    value: String(values.value ?? "") || null,
    lineMode:
      values.action === "update" && providerType === "cloudflare"
        ? (values.lineMode ?? "unchanged")
        : "unchanged",
    remark: String(values.remark ?? "") || null,
    record: {
      value: String(values.currentValue ?? "") || undefined,
      values: Array.isArray(values.currentValues)
        ? values.currentValues.map(String)
        : undefined,
      lineId: String(values.lineId),
      lineLabel: String(values.lineLabel ?? "") || undefined,
      ttl: Number(values.ttl),
    },
  };
}

export function SchedulesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [searchBy, setSearchBy] = useState("domain");
  const [executionFilter, setExecutionFilter] = useState("all");
  const [sort, setSort] = useState("id");
  const [order, setOrder] = useState("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const form = useQuery({
    queryKey: ["schedules-form"],
    queryFn: async () =>
      (await apiGet<DataResponse<ScheduleForm>>("/api/web/v1/schedules/form"))
        .data,
  });
  const tasks = useQuery({
    queryKey: [
      "schedules",
      page,
      queryText,
      searchBy,
      executionFilter,
      sort,
      order,
    ],
    queryFn: () =>
      apiGet<PageResponse<ScheduledDnsTask>>("/api/web/v1/schedules", {
        page,
        pageSize: 20,
        q: queryText,
        searchBy,
        execution: executionFilter === "all" ? undefined : executionFilter,
        sort,
        order,
      }),
  });
  const invalidate = [["schedules"], ["dashboard"]] as const;
  const save = useApiMutation<
    { id?: number; body: Record<string, unknown> },
    DataResponse<OperationResult>
  >({
    mutationFn: ({ id, body }) =>
      id
        ? apiPut(`/api/web/v1/schedules/${id}`, body)
        : apiPost("/api/web/v1/schedules", body),
    successMessage: (_, variables) =>
      variables.id ? "定时任务已更新" : "定时任务已添加",
    invalidate: [...invalidate],
  });
  const remove = useApiMutation<number, DataResponse<OperationResult>>({
    mutationFn: (id) => apiDelete(`/api/web/v1/schedules/${id}`),
    successMessage: "定时任务已删除",
    invalidate: [...invalidate],
  });
  const status = useApiMutation<
    ScheduledDnsTask,
    DataResponse<OperationResult>
  >({
    mutationFn: (task) =>
      apiPatch(`/api/web/v1/schedules/${task.id}/status`, {
        enabled: !task.active,
      }),
    successMessage: "定时任务状态已更新",
    invalidate: [...invalidate],
  });
  const batch = useApiMutation<string, DataResponse<OperationResult>>({
    mutationFn: (action) =>
      apiPost("/api/web/v1/schedules/batch", {
        ids: Array.from(selected, Number),
        action,
      }),
    successMessage: (result) => result.message ?? "批量操作已完成",
    invalidate: [...invalidate],
    onSuccess: () => setSelected(new Set()),
  });
  const columns: DataColumn<ScheduledDnsTask>[] = [
    {
      key: "record",
      label: "解析记录",
      render: (task) => (
        <div className="min-w-48">
          <p className="font-medium">
            {task.recordName}.{task.domain}
          </p>
          <p className="text-xs text-muted-foreground">
            {task.remark ?? task.value ?? "—"}
          </p>
        </div>
      ),
    },
    {
      key: "action",
      label: "动作",
      render: (task) => (
        <Badge variant="outline">
          {actionLabels[task.action] ?? task.action}
        </Badge>
      ),
    },
    {
      key: "execution",
      label: "计划",
      render: (task) => (
        <div>
          <p>
            {task.execution === "once"
              ? "单次"
              : task.cycle === "daily"
                ? "每天"
                : task.cycle === "weekly"
                  ? "每周"
                  : "每月"}
          </p>
          <p className="text-xs text-muted-foreground">
            {task.switchDate ? `${task.switchDate} ` : ""}
            {task.switchTime}
          </p>
        </div>
      ),
    },
    {
      key: "next",
      label: "下次执行",
      render: (task) => formatDateTime(task.nextRunAt),
    },
    {
      key: "status",
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
                aria-label={`管理 ${task.recordName}`}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <ScheduleDialog
                trigger={
                  <DropdownMenuItem closeOnClick={false}>
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
                title="删除定时任务？"
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
        title="定时任务"
        description="按一次、每天、每周或每月计划自动修改解析记录。"
        action={
          <ScheduleDialog
            trigger={
              <Button>
                <PlusIcon data-icon="inline-start" />
                添加任务
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
      <Card>
        <CardContent className="flex flex-col gap-4">
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
                { value: "value", label: "按记录值" },
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
                  <SelectItem value="value">按记录值</SelectItem>
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
                { value: "all", label: "全部执行方式" },
                { value: "once", label: "单次执行" },
                { value: "recurring", label: "周期执行" },
              ]}
              value={executionFilter}
              onValueChange={(value) => {
                setExecutionFilter(value ?? "all");
                setPage(1);
                setSelected(new Set());
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部执行方式</SelectItem>
                  <SelectItem value="once">单次执行</SelectItem>
                  <SelectItem value="recurring">周期执行</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={[
                { value: "id", label: "按添加顺序" },
                { value: "recordName", label: "按主机记录" },
                { value: "execution", label: "按执行方式" },
                { value: "action", label: "按执行动作" },
                { value: "active", label: "按运行状态" },
                { value: "lastRunAt", label: "按上次执行" },
                { value: "nextRunAt", label: "按下次执行" },
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
                  <SelectItem value="execution">按执行方式</SelectItem>
                  <SelectItem value="action">按执行动作</SelectItem>
                  <SelectItem value="active">按运行状态</SelectItem>
                  <SelectItem value="lastRunAt">按上次执行</SelectItem>
                  <SelectItem value="nextRunAt">按下次执行</SelectItem>
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
              <span className="mr-auto text-sm">已选择 {selected.size} 项</span>
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
              <ConfirmAction
                trigger={
                  <Button size="sm" variant="destructive">
                    删除
                  </Button>
                }
                title="删除所选定时任务？"
                description="此操作无法撤销。"
                destructive
                pending={batch.isPending}
                onConfirm={() => batch.mutate("delete")}
              />
            </div>
          ) : null}
          {form.isError ? (
            <QueryError error={form.error} retry={() => void form.refetch()} />
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
              emptyTitle="暂无定时任务"
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
    </div>
  );
}

function ScheduleDialog({
  trigger,
  task,
  form,
  pending,
  onSave,
}: {
  trigger: ReactElement;
  task?: ScheduledDnsTask;
  form?: ScheduleForm;
  pending: boolean;
  onSave: (body: Record<string, unknown>, close: () => void) => void;
}) {
  const initial = task
    ? {
        domainId: String(task.domainId),
        recordName: task.recordName,
        recordId: task.recordId,
        execution: task.execution,
        cycle: task.cycle,
        action: task.action,
        switchDate: task.switchDate ?? "",
        switchTime: task.switchTime,
        value: task.value ?? "",
        lineMode: task.lineMode,
        lineId: task.record?.lineId ?? "",
        lineLabel: task.record?.lineLabel ?? "",
        ttl: task.record?.ttl ?? 600,
        currentValue: task.record?.value ?? "",
        currentValues: task.record?.values,
        remark: task.remark ?? "",
      }
    : {
        ...form?.defaults,
        execution: "once",
        cycle: "daily",
        action: "update",
        switchDate: "",
        switchTime: "",
        lineMode: "unchanged",
        ttl: 600,
      };
  const managed = new Set([
    "domainId",
    "recordName",
    "recordId",
    "lineId",
    "lineLabel",
    "ttl",
    "currentValue",
  ]);
  return (
    <FormDialog
      trigger={trigger}
      title={task ? "编辑定时任务" : "添加定时任务"}
      initialValues={initial}
      pending={pending}
      onSubmit={(values, close) =>
        onSave(taskBody(values, form?.domains ?? []), close)
      }
    >
      {(values, onChange) => (
        <AutomationRecordFields
          domains={form?.domains ?? []}
          fields={scheduleFields(form, values).filter(
            (field) => !managed.has(field.name),
          )}
          values={values}
          onChange={(next) =>
            onChange(
              next.execution === "recurring" && next.action === "delete"
                ? { ...next, action: "update" }
                : next,
            )
          }
        />
      )}
    </FormDialog>
  );
}
