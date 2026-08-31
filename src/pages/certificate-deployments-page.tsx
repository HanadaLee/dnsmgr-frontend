import { useEffect, useRef, useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileClockIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/api/client";
import type {
  CertificateAccountTypeDefinition,
  CertificateDeploymentDetail,
  CertificateDeploymentSummary,
  DataResponse,
  OperationResult,
  PageResponse,
  ProcessLog,
} from "@/api/types";
import { ConfirmAction } from "@/components/confirm-action";
import { DataTable, type DataColumn } from "@/components/data-table";
import { defaultsForFields, DynamicFields } from "@/components/dynamic-fields";
import { FormDialog } from "@/components/form-dialog";
import { ListPagination } from "@/components/list-pagination";
import { LoadingTable } from "@/components/loading-table";
import { PageHeader } from "@/components/page-header";
import { QueryError } from "@/components/query-error";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { formatDateTime } from "@/lib/format";

type DeploymentForm = {
  accounts: Array<{ id: number; type: string; label: string }>;
  orders: Array<{ id: number; label: string }>;
  accountTypes: CertificateAccountTypeDefinition[];
};
type DeploymentAction = {
  id: number;
  action: "reset" | "process" | "redeploy";
};
const pendingDeploymentStatus: Record<DeploymentAction["action"], string> = {
  process: "正在发起证书部署…",
  redeploy: "正在发起重新部署…",
  reset: "正在重置部署流程…",
};

export function CertificateDeploymentsPage() {
  const [searchParams] = useSearchParams();
  const requestedOrderId = Number(searchParams.get("orderId"));
  const initialOrderId =
    Number.isSafeInteger(requestedOrderId) && requestedOrderId > 0
      ? requestedOrderId
      : undefined;
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [searchBy, setSearchBy] = useState("domain");
  const [accountFilter, setAccountFilter] = useState("all");
  const [orderFilter, setOrderFilter] = useState(
    initialOrderId ? String(initialOrderId) : "all",
  );
  const [accountTypeFilter, setAccountTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("id");
  const [order, setOrder] = useState("desc");
  const form = useQuery({
    queryKey: ["certificate-deployments-form"],
    queryFn: async () =>
      (
        await apiGet<DataResponse<DeploymentForm>>(
          "/api/web/v1/certificate-deployments/form",
        )
      ).data,
  });
  const tasks = useQuery({
    queryKey: [
      "certificate-deployments",
      page,
      queryText,
      searchBy,
      accountFilter,
      orderFilter,
      accountTypeFilter,
      statusFilter,
      sort,
      order,
    ],
    queryFn: () =>
      apiGet<PageResponse<CertificateDeploymentSummary>>(
        "/api/web/v1/certificate-deployments",
        {
          page,
          pageSize: 20,
          domain: searchBy === "domain" ? queryText : undefined,
          remark: searchBy === "remark" ? queryText : undefined,
          accountId:
            accountFilter === "all" ? undefined : Number(accountFilter),
          orderId: orderFilter === "all" ? undefined : Number(orderFilter),
          accountType:
            accountTypeFilter === "all" ? undefined : accountTypeFilter,
          status: statusFilter === "all" ? undefined : statusFilter,
          sort,
          order,
        },
      ),
  });
  const invalidate = [["certificate-deployments"], ["dashboard"]] as const;
  const remove = useApiMutation<number, DataResponse<OperationResult>>({
    mutationFn: (id) => apiDelete(`/api/web/v1/certificate-deployments/${id}`),
    successMessage: "部署任务已删除",
    invalidate: [...invalidate],
  });
  const status = useApiMutation<
    CertificateDeploymentSummary,
    DataResponse<OperationResult>
  >({
    mutationFn: (task) =>
      apiPatch(`/api/web/v1/certificate-deployments/${task.id}/status`, {
        enabled: !task.active,
      }),
    successMessage: "部署任务状态已更新",
    invalidate: [...invalidate],
  });
  const action = useApiMutation<DeploymentAction, DataResponse<OperationResult>>({
    mutationFn: ({ id, action: operation }) =>
      apiPost(
        `/api/web/v1/certificate-deployments/${id}/${operation === "redeploy" ? "process" : operation}`,
        operation === "process" || operation === "redeploy"
          ? { reset: operation === "redeploy" }
          : {},
      ),
    successMessage: (result, variables) =>
      result.message ?? (variables.action === "process" || variables.action === "redeploy"
        ? "部署任务已完成"
        : "部署任务已重置"),
    pendingMessage: ({ id, action: operation }) =>
      `${pendingDeploymentStatus[operation].replace("…", "")}（任务 #${id}）`,
    invalidate: [...invalidate],
  });
  const batch = useApiMutation<
    { action: string; orderId?: number },
    DataResponse<OperationResult>
  >({
    mutationFn: (payload) =>
      apiPost("/api/web/v1/certificate-deployments/batch", {
        ids: Array.from(selected, Number),
        ...payload,
      }),
    successMessage: (result) => result.message ?? "批量操作已完成",
    invalidate: [...invalidate],
    onSuccess: () => setSelected(new Set()),
  });
  const columns: DataColumn<CertificateDeploymentSummary>[] = [
    {
      key: "target",
      label: "部署目标",
      render: (task) => (
        <div className="min-w-48">
          <p className="font-medium">
            {task.account.name ?? task.account.label}
          </p>
          <p className="text-xs text-muted-foreground">
            {task.remark ?? task.account.remark ?? task.account.type}
          </p>
        </div>
      ),
    },
    {
      key: "certificate",
      label: "证书",
      render: (task) => (
        <div>
          <p>{task.order.domains[0] ?? `订单 #${task.order.id}`}</p>
          <p className="text-xs text-muted-foreground">
            {task.order.sourceLabel}
          </p>
        </div>
      ),
    },
    {
      key: "result",
      label: "上次结果",
      render: (task) => {
        const pendingAction = action.isPending && action.variables?.id === task.id
          ? action.variables.action
          : undefined;
        return (
          <div>
            <StatusBadge value={pendingAction ? "processing" : task.status} />
            <p className="mt-1 text-xs text-muted-foreground">
              {pendingAction
                ? pendingDeploymentStatus[pendingAction]
                : task.error ?? formatDateTime(task.lastRunAt)}
            </p>
          </div>
        );
      },
    },
    {
      key: "active",
      label: "状态",
      render: (task) => (
        <Switch
          checked={task.active}
          onCheckedChange={() => status.mutate(task)}
        />
      ),
    },
    {
      key: "actions",
      label: "",
      className: "w-12",
      render: (task) => (
        <DeploymentActions
          task={task}
          form={form.data}
          remove={remove}
          action={action}
        />
      ),
    },
  ];
  const accountTypes = Array.from(
    new Set((form.data?.accounts ?? []).map((account) => account.type)),
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Certificates"
        title="自动部署"
        description="将已签发证书自动部署到服务器、CDN、负载均衡或其他目标。"
        action={
          <DeploymentEditor
            trigger={
              <Button>
                <PlusIcon data-icon="inline-start" />
                添加任务
              </Button>
            }
            form={form.data}
            initialOrderId={initialOrderId}
          />
        }
      />
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <form
            className="grid gap-2 md:grid-cols-2 xl:grid-cols-[9rem_minmax(12rem,1fr)_12rem_12rem_10rem_10rem_11rem_8rem_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSelected(new Set());
              setQueryText(search.trim());
            }}
          >
            <Select
              items={[
                { value: "domain", label: "按域名搜索" },
                { value: "remark", label: "按备注搜索" },
              ]}
              value={searchBy}
              onValueChange={(value) => {
                setSearchBy(value ?? "domain");
                setPage(1);
                setSelected(new Set());
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="domain">按域名搜索</SelectItem>
                  <SelectItem value="remark">按备注搜索</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchBy === "remark" ? "任务备注" : "证书域名"}
              />
            </div>
            <Select
              items={[
                { value: "all", label: "全部部署账户" },
                ...(form.data?.accounts ?? []).map((item) => ({
                  value: String(item.id),
                  label: item.label,
                })),
              ]}
              value={accountFilter}
              onValueChange={(value) => {
                setAccountFilter(value ?? "all");
                setPage(1);
                setSelected(new Set());
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部部署账户</SelectItem>
                  {(form.data?.accounts ?? []).map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={[
                { value: "all", label: "全部证书订单" },
                ...(form.data?.orders ?? []).map((item) => ({
                  value: String(item.id),
                  label: item.label,
                })),
              ]}
              value={orderFilter}
              onValueChange={(value) => {
                setOrderFilter(value ?? "all");
                setPage(1);
                setSelected(new Set());
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部证书订单</SelectItem>
                  {(form.data?.orders ?? []).map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={[
                { value: "all", label: "全部目标类型" },
                ...accountTypes.map((value) => ({ value, label: value })),
              ]}
              value={accountTypeFilter}
              onValueChange={(value) => {
                setAccountTypeFilter(value ?? "all");
                setPage(1);
                setSelected(new Set());
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部目标类型</SelectItem>
                  {accountTypes.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={[
                { value: "all", label: "全部结果" },
                { value: "pending", label: "待处理" },
                { value: "succeeded", label: "部署成功" },
                { value: "failed", label: "部署失败" },
              ]}
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value ?? "all");
                setPage(1);
                setSelected(new Set());
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部结果</SelectItem>
                  <SelectItem value="pending">待处理</SelectItem>
                  <SelectItem value="succeeded">部署成功</SelectItem>
                  <SelectItem value="failed">部署失败</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={[
                { value: "id", label: "按添加顺序" },
                { value: "accountType", label: "按目标类型" },
                { value: "remark", label: "按备注" },
                { value: "active", label: "按启用状态" },
                { value: "lastRunAt", label: "按执行时间" },
                { value: "status", label: "按结果" },
              ]}
              value={sort}
              onValueChange={(value) => {
                setSort(value ?? "id");
                setPage(1);
                setSelected(new Set());
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="id">按添加顺序</SelectItem>
                  <SelectItem value="accountType">按目标类型</SelectItem>
                  <SelectItem value="remark">按备注</SelectItem>
                  <SelectItem value="active">按启用状态</SelectItem>
                  <SelectItem value="lastRunAt">按执行时间</SelectItem>
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
                setSelected(new Set());
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
                onClick={() => batch.mutate({ action: "enable" })}
              >
                启用
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => batch.mutate({ action: "disable" })}
              >
                停用
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => batch.mutate({ action: "reset" })}
              >
                重置
              </Button>
              <FormDialog
                trigger={
                  <Button size="sm" variant="outline">
                    更换证书
                  </Button>
                }
                title="批量更换证书"
                fields={[
                  {
                    name: "orderId",
                    label: "证书订单",
                    kind: "select",
                    options: (form.data?.orders ?? []).map((order) => ({
                      value: String(order.id),
                      label: order.label,
                    })),
                    required: true,
                  },
                ]}
                pending={batch.isPending}
                onSubmit={(values, close) =>
                  batch.mutate(
                    {
                      action: "assign-certificate",
                      orderId: Number(values.orderId),
                    },
                    { onSuccess: close },
                  )
                }
              />
              <ConfirmAction
                trigger={
                  <Button size="sm" variant="destructive">
                    删除
                  </Button>
                }
                title="删除所选部署任务？"
                description="此操作无法撤销。"
                destructive
                pending={batch.isPending}
                onConfirm={() => batch.mutate({ action: "delete" })}
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
              emptyTitle="暂无自动部署任务"
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

function DeploymentActions({
  task,
  form,
  remove,
  action,
}: {
  task: CertificateDeploymentSummary;
  form?: DeploymentForm;
  remove: ReturnType<
    typeof useApiMutation<number, DataResponse<OperationResult>>
  >;
  action: ReturnType<
    typeof useApiMutation<DeploymentAction, DataResponse<OperationResult>>
  >;
}) {
  const pendingAction = action.isPending && action.variables?.id === task.id
    ? action.variables.action
    : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={pendingAction ? `部署任务 ${task.id} 正在处理` : `管理部署任务 ${task.id}`}
            aria-busy={Boolean(pendingAction)}
          />
        }
      >
        {pendingAction ? <Spinner /> : <MoreHorizontalIcon />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DeploymentEditor
            trigger={
              <DropdownMenuItem closeOnClick={false}>
                <PencilIcon />
                编辑
              </DropdownMenuItem>
            }
            task={task}
            form={form}
          />
          <DropdownMenuItem
            disabled={action.isPending}
            onClick={() => action.mutate({ id: task.id, action: task.status === "succeeded" ? "redeploy" : "process" })}
          >
            {pendingAction === "process" || pendingAction === "redeploy" ? <Spinner /> : <PlayIcon />}
            {pendingAction === "process" || pendingAction === "redeploy"
              ? "正在部署"
              : task.status === "succeeded" ? "重新部署" : "立即部署"}
          </DropdownMenuItem>
          {task.status === "failed" ? (
            <DropdownMenuItem
              disabled={action.isPending}
              onClick={() => action.mutate({ id: task.id, action: "reset" })}
            >
              {pendingAction === "reset" ? <Spinner /> : <RotateCcwIcon />}
              {pendingAction === "reset" ? "正在重置" : "重置流程"}
            </DropdownMenuItem>
          ) : null}
          {task.processId ? <DeploymentLogDialog task={task} /> : null}
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
            title="删除自动部署任务？"
            description="部署目标配置将被移除。"
            destructive
            pending={remove.isPending}
            onConfirm={() => remove.mutate(task.id)}
          />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeploymentEditor({
  trigger,
  task,
  form,
  initialOrderId,
}: {
  trigger: ReactElement;
  task?: CertificateDeploymentSummary;
  form?: DeploymentForm;
  initialOrderId?: number;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [remark, setRemark] = useState("");
  const detail = useQuery({
    queryKey: ["certificate-deployment", task?.id],
    queryFn: async () =>
      (
        await apiGet<DataResponse<CertificateDeploymentDetail>>(
          `/api/web/v1/certificate-deployments/${task?.id}`,
        )
      ).data,
    enabled: open && Boolean(task),
  });
  const save = useApiMutation<
    Record<string, unknown>,
    DataResponse<OperationResult>
  >({
    mutationFn: (payload) =>
      task
        ? apiPut(`/api/web/v1/certificate-deployments/${task.id}`, payload)
        : apiPost("/api/web/v1/certificate-deployments", payload),
    successMessage: task ? "部署任务已更新" : "部署任务已添加",
    invalidate: [["certificate-deployments"], ["dashboard"]],
  });
  const account = form?.accounts.find((item) => String(item.id) === accountId);
  const definition = form?.accountTypes.find(
    (item) => item.type === account?.type,
  );
  useEffect(() => {
    if (!open || task) return;
    const first = form?.accounts[0];
    const requestedOrder = form?.orders.find(
      (item) => item.id === initialOrderId,
    );
    setAccountId(String(first?.id ?? ""));
    setOrderId(String(requestedOrder?.id ?? form?.orders[0]?.id ?? ""));
    const type = form?.accountTypes.find((item) => item.type === first?.type);
    setConfig(type ? defaultsForFields(type.taskFields) : {});
    setRemark("");
  }, [form, initialOrderId, open, task]);
  useEffect(() => {
    if (!detail.data) return;
    setAccountId(String(detail.data.accountId));
    setOrderId(String(detail.data.orderId));
    setConfig(detail.data.config);
    setRemark(detail.data.remark ?? "");
  }, [detail.data]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(
              {
                accountId: Number(accountId),
                orderId: Number(orderId),
                config,
                remark: remark || null,
              },
              { onSuccess: () => setOpen(false) },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {task ? "编辑自动部署任务" : "添加自动部署任务"}
            </DialogTitle>
            <DialogDescription>
              选择部署账户和证书后，填写目标类型要求的任务配置。
            </DialogDescription>
          </DialogHeader>
          <div className="py-5">
            {detail.isPending && task ? (
              <LoadingTable rows={4} />
            ) : (
              <FieldGroup>
                <Field>
                  <FieldLabel>部署账户</FieldLabel>
                  <Select
                    items={(form?.accounts ?? []).map((item) => ({
                      value: String(item.id),
                      label: item.label,
                    }))}
                    value={accountId || null}
                    onValueChange={(value) => {
                      const next = value ?? "";
                      setAccountId(next);
                      const selected = form?.accounts.find(
                        (item) => String(item.id) === next,
                      );
                      const type = form?.accountTypes.find(
                        (item) => item.type === selected?.type,
                      );
                      setConfig(type ? defaultsForFields(type.taskFields) : {});
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(form?.accounts ?? []).map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>证书订单</FieldLabel>
                  <Select
                    items={(form?.orders ?? []).map((item) => ({
                      value: String(item.id),
                      label: item.label,
                    }))}
                    value={orderId || null}
                    onValueChange={(value) => setOrderId(value ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(form?.orders ?? []).map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {definition?.taskNote ? (
                  <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                    {definition.taskNote}
                  </p>
                ) : null}
                {definition ? (
                  <DynamicFields
                    fields={definition.taskFields}
                    values={config}
                    onChange={setConfig}
                  />
                ) : null}
                <Field>
                  <FieldLabel htmlFor="deployment-remark">备注</FieldLabel>
                  <Textarea
                    id="deployment-remark"
                    value={remark}
                    onChange={(event) => setRemark(event.target.value)}
                  />
                </Field>
              </FieldGroup>
            )}
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
            <Button
              type="submit"
              disabled={save.isPending || !accountId || !orderId}
            >
              {save.isPending ? <Spinner data-icon="inline-start" /> : null}保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeploymentLogDialog({ task }: { task: CertificateDeploymentSummary }) {
  const [open, setOpen] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const query = useQuery({
    queryKey: ["certificate-deployment-log", task.id, task.processId],
    queryFn: async () =>
      (
        await apiGet<DataResponse<ProcessLog>>(
          `/api/web/v1/certificate-deployments/${task.id}/log`,
          { processId: task.processId },
        )
      ).data,
    enabled: open,
    refetchInterval: open ? 1_500 : false,
  });
  const logModifiedAt = query.data?.modifiedAt;
  useEffect(() => {
    const element = logRef.current;
    if (element && logModifiedAt !== undefined) element.scrollTop = element.scrollHeight;
  }, [logModifiedAt]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <DropdownMenuItem closeOnClick={false} />
        }
      >
        <FileClockIcon />
        部署日志
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>证书部署日志</DialogTitle>
          <DialogDescription>
            任务 #{task.id} 的当前流程输出。
          </DialogDescription>
        </DialogHeader>
        {query.isError ? (
          <QueryError error={query.error} retry={() => void query.refetch()} />
        ) : query.isPending ? (
          <LoadingTable />
        ) : (
          <pre ref={logRef} className="max-h-[60svh] overflow-auto rounded-lg bg-muted p-4 text-xs whitespace-pre-wrap">
            {query.data.content}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}
