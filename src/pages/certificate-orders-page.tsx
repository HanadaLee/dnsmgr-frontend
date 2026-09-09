import { useEffect, useRef, useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CopyIcon,
  DownloadIcon,
  FileClockIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  ShieldOffIcon,
  Trash2Icon,
} from "lucide-react";
import { Link } from "react-router-dom";

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/api/client";
import type {
  CertificateArtifacts,
  CertificateOrderDetail,
  CertificateOrderSummary,
  DataResponse,
  OperationResult,
  PageResponse,
  ProcessLog,
} from "@/api/types";
import { ConfirmAction } from "@/components/confirm-action";
import { DataTable, type DataColumn } from "@/components/data-table";
import { ListPagination } from "@/components/list-pagination";
import { LoadingTable } from "@/components/loading-table";
import { PageHeader } from "@/components/page-header";
import { QueryError } from "@/components/query-error";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuSeparator,
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
import { formatDateTime, splitLines } from "@/lib/format";

type OrderForm = {
  accounts: Array<{ id: number; label: string; type: string }>;
  keyOptions: { RSA: number[]; ECC: number[] };
  defaults: { mode: "managed"; keyType: "RSA"; keySize: number };
};
type OrderAction = {
  id: number;
  action: "reset" | "revoke" | "process" | "renew";
};
const pendingOrderStatus: Record<OrderAction["action"], string> = {
  process: "正在发起证书处理…",
  renew: "正在发起证书续签…",
  reset: "正在重置证书流程…",
  revoke: "正在吊销证书…",
};
const failureLabels: Record<string, string> = {
  purchase: "购买证书失败",
  create: "创建订单失败",
  "add-dns": "添加 DNS 失败",
  "check-dns": "验证 DNS 失败",
  validate: "验证订单失败",
  rejected: "订单验证未通过",
  issue: "签发证书失败",
};

export function CertificateOrdersPage() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [searchBy, setSearchBy] = useState("domain");
  const [accountFilter, setAccountFilter] = useState("all");
  const [accountTypeFilter, setAccountTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("id");
  const [order, setOrder] = useState("desc");
  const form = useQuery({
    queryKey: ["certificate-orders-form"],
    queryFn: async () =>
      (
        await apiGet<DataResponse<OrderForm>>(
          "/api/web/v1/certificate-orders/form",
        )
      ).data,
  });
  const orders = useQuery({
    queryKey: [
      "certificate-orders",
      page,
      queryText,
      searchBy,
      accountFilter,
      accountTypeFilter,
      statusFilter,
      sort,
      order,
    ],
    queryFn: () =>
      apiGet<PageResponse<CertificateOrderSummary>>(
        "/api/web/v1/certificate-orders",
        {
          page,
          pageSize: 20,
          id:
            searchBy === "id" && /^\d+$/.test(queryText)
              ? Number(queryText)
              : undefined,
          domain: searchBy === "domain" ? queryText : undefined,
          accountId:
            accountFilter === "all" ? undefined : Number(accountFilter),
          accountType:
            accountTypeFilter === "all" ? undefined : accountTypeFilter,
          status: statusFilter === "all" ? undefined : statusFilter,
          sort,
          order,
        },
      ),
  });
  const invalidate = [
    ["certificate-orders"],
    ["dashboard"],
    ["certificate-deployments-form"],
  ] as const;
  const remove = useApiMutation<number, DataResponse<OperationResult>>({
    mutationFn: (id) => apiDelete(`/api/web/v1/certificate-orders/${id}`),
    successMessage: "证书订单已删除",
    invalidate: [...invalidate],
  });
  const toggle = useApiMutation<
    CertificateOrderSummary,
    DataResponse<OperationResult>
  >({
    mutationFn: (order) =>
      apiPatch(`/api/web/v1/certificate-orders/${order.id}/auto-renew`, {
        enabled: !order.autoRenew,
      }),
    successMessage: "自动续签设置已更新",
    invalidate: [...invalidate],
  });
  const action = useApiMutation<OrderAction, DataResponse<OperationResult>>({
    mutationFn: ({ id, action: operation }) =>
      apiPost(
        `/api/web/v1/certificate-orders/${id}/${operation === "renew" ? "process" : operation}`,
        operation === "process" || operation === "renew"
          ? { reset: operation === "renew" }
          : {},
      ),
    successMessage: (result, variables) =>
      result.message ?? (variables.action === "process"
        ? "证书流程已完成"
        : variables.action === "renew"
          ? "证书续签已完成"
          : variables.action === "reset"
            ? "证书订单已重置"
            : "证书已吊销"),
    pendingMessage: ({ id, action: operation }) =>
      `${pendingOrderStatus[operation].replace("…", "")}（订单 #${id}）`,
    invalidate: [...invalidate],
  });
  const batch = useApiMutation<string, DataResponse<OperationResult>>({
    mutationFn: (operation) =>
      apiPost("/api/web/v1/certificate-orders/batch", {
        ids: Array.from(selected, Number),
        action: operation,
      }),
    successMessage: (result) => result.message ?? "批量操作已完成",
    invalidate: [...invalidate],
    onSuccess: () => setSelected(new Set()),
  });
  const columns: DataColumn<CertificateOrderSummary>[] = [
    {
      key: "domains",
      label: "证书域名",
      render: (order) => (
        <div className="min-w-56">
          <p className="font-medium">
            {order.domains[0] ?? `订单 #${order.id}`}
          </p>
          <p className="max-w-xs truncate text-xs text-muted-foreground">
            {order.domains.slice(1).join("、") ||
              (order.mode === "manual" ? "手动导入" : order.account?.label)}
          </p>
        </div>
      ),
    },
    {
      key: "key",
      label: "证书信息",
      render: (order) => (
        <div>
          <Badge variant="outline">
            {order.keyType} {order.keySize}
          </Badge>
          {order.issuer ? (
            <p className="mt-1 text-xs text-muted-foreground">{order.issuer}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      label: "状态",
      render: (order) => {
        const pendingAction = action.isPending && action.variables?.id === order.id
          ? action.variables.action
          : undefined;
        return (
          <div>
            <StatusBadge
              value={pendingAction === "process" || pendingAction === "renew" ? "processing" : order.status}
            />
            <p className="mt-1 max-w-52 text-xs text-muted-foreground">
              {pendingAction
                ? pendingOrderStatus[pendingAction]
                : order.error ??
                  (order.failureStage
                    ? (failureLabels[order.failureStage] ?? "处理失败")
                    : order.processing
                      ? "正在处理"
                      : "")}
              {!pendingAction && order.retryAt ? ` · ${formatDateTime(order.retryAt)} 后重试` : ""}
            </p>
          </div>
        );
      },
    },
    {
      key: "expires",
      label: "有效期",
      render: (order) => (
        <div>
          <p>{formatDateTime(order.expiresAt)}</p>
          <p className="text-xs text-muted-foreground">
            {order.remainingDays === undefined
              ? "—"
              : `剩余 ${order.remainingDays} 天`}
          </p>
        </div>
      ),
    },
    {
      key: "renew",
      label: "自动续签",
      render: (order) => (
        <Switch
          checked={order.autoRenew}
          onCheckedChange={() => toggle.mutate(order)}
        />
      ),
    },
    {
      key: "actions",
      label: "",
      className: "w-12",
      render: (order) => (
        <OrderActions
          order={order}
          form={form.data}
          remove={remove}
          action={action}
        />
      ),
    },
  ];
  const accountTypes = Array.from(
    new Map(
      (form.data?.accounts ?? []).map((account) => [
        account.type,
        account.type,
      ]),
    ).values(),
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Certificates"
        title="证书订单"
        description="申请、导入、续签、吊销证书并查看签发过程与制品。"
        action={
          <OrderEditor
            trigger={
              <Button>
                <PlusIcon data-icon="inline-start" />
                新建订单
              </Button>
            }
            form={form.data}
          />
        }
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <form
            className="grid gap-2 md:grid-cols-2 xl:grid-cols-[9rem_minmax(13rem,1fr)_12rem_10rem_11rem_11rem_8rem_auto]"
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
                { value: "id", label: "按订单 ID" },
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
                  <SelectItem value="id">按订单 ID</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchBy === "id" ? "订单 ID" : "证书域名"}
              />
            </div>
            <Select
              items={[
                { value: "all", label: "全部签发账户" },
                ...(form.data?.accounts ?? []).map((account) => ({
                  value: String(account.id),
                  label: account.label,
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
                  <SelectItem value="all">全部签发账户</SelectItem>
                  {(form.data?.accounts ?? []).map((account) => (
                    <SelectItem key={account.id} value={String(account.id)}>
                      {account.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={[
                { value: "all", label: "全部账户类型" },
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
                  <SelectItem value="all">全部账户类型</SelectItem>
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
                { value: "all", label: "全部状态" },
                { value: "pending", label: "待处理" },
                { value: "awaiting-validation", label: "等待验证" },
                { value: "validating", label: "验证中" },
                { value: "issued", label: "已签发" },
                { value: "revoked", label: "已吊销" },
                { value: "failed", label: "签发失败" },
                { value: "expiring", label: "即将过期" },
                { value: "expired", label: "已过期" },
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
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="pending">待处理</SelectItem>
                  <SelectItem value="awaiting-validation">等待验证</SelectItem>
                  <SelectItem value="validating">验证中</SelectItem>
                  <SelectItem value="issued">已签发</SelectItem>
                  <SelectItem value="revoked">已吊销</SelectItem>
                  <SelectItem value="failed">签发失败</SelectItem>
                  <SelectItem value="expiring">即将过期</SelectItem>
                  <SelectItem value="expired">已过期</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={[
                { value: "id", label: "按添加顺序" },
                { value: "accountType", label: "按账户类型" },
                { value: "keyType", label: "按密钥类型" },
                { value: "autoRenew", label: "按自动续签" },
                { value: "issuedAt", label: "按签发时间" },
                { value: "expiresAt", label: "按到期时间" },
                { value: "status", label: "按状态" },
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
                  <SelectItem value="accountType">按账户类型</SelectItem>
                  <SelectItem value="keyType">按密钥类型</SelectItem>
                  <SelectItem value="autoRenew">按自动续签</SelectItem>
                  <SelectItem value="issuedAt">按签发时间</SelectItem>
                  <SelectItem value="expiresAt">按到期时间</SelectItem>
                  <SelectItem value="status">按状态</SelectItem>
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
                onClick={() => batch.mutate("enable")}
              >
                开启续签
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => batch.mutate("disable")}
              >
                关闭续签
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => batch.mutate("reset")}
              >
                重置
              </Button>
              <ConfirmAction
                trigger={
                  <Button size="sm" variant="destructive">
                    删除
                  </Button>
                }
                title="删除所选证书订单？"
                description="被部署任务引用的订单无法删除。"
                destructive
                pending={batch.isPending}
                onConfirm={() => batch.mutate("delete")}
              />
            </div>
          ) : null}
          {form.isError ? (
            <QueryError error={form.error} retry={() => void form.refetch()} />
          ) : null}
          {orders.isError ? (
            <QueryError
              error={orders.error}
              retry={() => void orders.refetch()}
            />
          ) : orders.isPending ? (
            <LoadingTable />
          ) : (
            <DataTable
              rows={orders.data.data}
              columns={columns}
              rowKey={(order) => String(order.id)}
              selected={selected}
              onSelectedChange={setSelected}
              emptyTitle="暂无证书订单"
            />
          )}
          {orders.data ? (
            <ListPagination
              meta={orders.data.meta}
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

function OrderActions({
  order,
  form,
  remove,
  action,
}: {
  order: CertificateOrderSummary;
  form?: OrderForm;
  remove: ReturnType<
    typeof useApiMutation<number, DataResponse<OperationResult>>
  >;
  action: ReturnType<
    typeof useApiMutation<OrderAction, DataResponse<OperationResult>>
  >;
}) {
  const pendingAction = action.isPending && action.variables?.id === order.id
    ? action.variables.action
    : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={pendingAction ? `订单 ${order.id} 正在处理` : `管理订单 ${order.id}`}
            aria-busy={Boolean(pendingAction)}
          />
        }
      >
        {pendingAction ? <Spinner /> : <MoreHorizontalIcon />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <OrderEditor
            trigger={
              <DropdownMenuItem closeOnClick={false}>
                <PencilIcon />
                编辑
              </DropdownMenuItem>
            }
            order={order}
            form={form}
          />
          {order.mode === "managed" ? (
            order.status === "issued" || order.status === "revoked" ? (
              <DropdownMenuItem
                disabled={action.isPending}
                onClick={() => action.mutate({ id: order.id, action: "renew" })}
              >
                {pendingAction === "renew" ? <Spinner /> : <RotateCcwIcon />}
                {order.status === "issued" ? "立即续签" : "重新申请"}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={action.isPending}
                onClick={() => action.mutate({ id: order.id, action: "process" })}
              >
                {pendingAction === "process" ? <Spinner /> : <PlayIcon />}
                {pendingAction === "process" ? "正在处理" : "立即处理"}
              </DropdownMenuItem>
            )
          ) : null}
          {order.mode === "managed" && ["awaiting-validation", "validating", "failed"].includes(order.status) ? (
            <DropdownMenuItem
              disabled={action.isPending}
              onClick={() => action.mutate({ id: order.id, action: "reset" })}
            >
              {pendingAction === "reset" ? <Spinner /> : <RotateCcwIcon />}
              {pendingAction === "reset" ? "正在重置" : "重置流程"}
            </DropdownMenuItem>
          ) : null}
          {order.processId ? <ProcessLogDialog order={order} /> : null}
          {order.status === "issued" ? (
            <>
              <ArtifactsDialog order={order} />
              <DropdownMenuItem
                render={
                  <Link to={`/certificate-deployments?orderId=${order.id}`} />
                }
              >
                <PlayIcon />
                创建部署任务
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {order.status === "issued" && order.mode === "managed" ? (
          <ConfirmAction
            trigger={
              <DropdownMenuItem
                variant="destructive"
                closeOnClick={false}
              >
                <ShieldOffIcon />
                吊销证书
              </DropdownMenuItem>
            }
            title="吊销这张证书？"
            description="吊销后证书将无法继续使用，此操作无法撤销。"
            destructive
            pending={action.isPending}
            onConfirm={() => action.mutate({ id: order.id, action: "revoke" })}
          />
        ) : null}
        <ConfirmAction
          trigger={
            <DropdownMenuItem
              variant="destructive"
              closeOnClick={false}
            >
              <Trash2Icon />
              删除订单
            </DropdownMenuItem>
          }
          title="删除证书订单？"
          description="订单及相关证书制品将被移除。"
          destructive
          pending={remove.isPending}
          onConfirm={() => remove.mutate(order.id)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OrderEditor({
  trigger,
  order,
  form,
}: {
  trigger: ReactElement;
  order?: CertificateOrderSummary;
  form?: OrderForm;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"managed" | "manual">("managed");
  const [accountId, setAccountId] = useState("");
  const [keyType, setKeyType] = useState<"RSA" | "ECC">("RSA");
  const [keySize, setKeySize] = useState("2048");
  const [domains, setDomains] = useState("");
  const [certificate, setCertificate] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const detail = useQuery({
    queryKey: ["certificate-order", order?.id],
    queryFn: async () =>
      (
        await apiGet<DataResponse<CertificateOrderDetail>>(
          `/api/web/v1/certificate-orders/${order?.id}`,
        )
      ).data,
    enabled: open && Boolean(order),
  });
  const save = useApiMutation<
    Record<string, unknown>,
    DataResponse<OperationResult>
  >({
    mutationFn: (payload) =>
      order
        ? apiPut(`/api/web/v1/certificate-orders/${order.id}`, payload)
        : apiPost("/api/web/v1/certificate-orders", payload),
    successMessage: order ? "证书订单已更新" : "证书订单已创建",
    invalidate: [
      ["certificate-orders"],
      ["dashboard"],
      ["certificate-deployments-form"],
    ],
  });
  useEffect(() => {
    if (!open || order) return;
    setMode("managed");
    setAccountId(String(form?.accounts[0]?.id ?? ""));
    setKeyType("RSA");
    setKeySize(String(form?.keyOptions.RSA[0] ?? 2048));
    setDomains("");
    setCertificate("");
    setPrivateKey("");
  }, [form, open, order]);
  useEffect(() => {
    if (!detail.data) return;
    setMode(detail.data.mode);
    setAccountId(String(detail.data.account?.id ?? ""));
    setKeyType(detail.data.keyType === "ECC" ? "ECC" : "RSA");
    setKeySize(String(detail.data.keySize));
    setDomains(detail.data.domains.join("\n"));
    setCertificate(detail.data.certificate ?? "");
    setPrivateKey(detail.data.privateKey ?? "");
  }, [detail.data]);
  const sizes =
    form?.keyOptions[keyType] ??
    (keyType === "RSA" ? [2048, 3072] : [256, 384]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const payload =
              mode === "managed"
                ? {
                    mode,
                    accountId: Number(accountId),
                    keyType,
                    keySize: Number(keySize),
                    domains: splitLines(domains),
                  }
                : { mode, certificate, privateKey };
            save.mutate(payload, { onSuccess: () => setOpen(false) });
          }}
        >
          <DialogHeader>
            <DialogTitle>{order ? "编辑证书订单" : "新建证书订单"}</DialogTitle>
            <DialogDescription>
              选择托管签发，或导入现有 PEM 证书和私钥。
            </DialogDescription>
          </DialogHeader>
          <div className="py-5">
            {detail.isPending && order ? (
              <LoadingTable rows={4} />
            ) : (
              <FieldGroup>
                <Field>
                  <FieldLabel>来源</FieldLabel>
                  <Select
                    items={[
                      { value: "managed", label: "托管签发" },
                      { value: "manual", label: "手动导入" },
                    ]}
                    value={mode}
                    onValueChange={(value) =>
                      setMode(value as "managed" | "manual")
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="managed">托管签发</SelectItem>
                        <SelectItem value="manual">手动导入</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {mode === "managed" ? (
                  <>
                    <Field>
                      <FieldLabel>签发账户</FieldLabel>
                      <Select
                        items={(form?.accounts ?? []).map((account) => ({
                          value: String(account.id),
                          label: account.label,
                        }))}
                        value={accountId || null}
                        onValueChange={(value) => setAccountId(value ?? "")}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {(form?.accounts ?? []).map((account) => (
                              <SelectItem
                                key={account.id}
                                value={String(account.id)}
                              >
                                {account.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel>密钥算法</FieldLabel>
                        <Select
                          items={[
                            { value: "RSA", label: "RSA" },
                            { value: "ECC", label: "ECC" },
                          ]}
                          value={keyType}
                          onValueChange={(value) => {
                            const next = value === "ECC" ? "ECC" : "RSA";
                            setKeyType(next);
                            setKeySize(
                              String(
                                form?.keyOptions[next][0] ??
                                  (next === "RSA" ? 2048 : 256),
                              ),
                            );
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="RSA">RSA</SelectItem>
                              <SelectItem value="ECC">ECC</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel>密钥长度</FieldLabel>
                        <Select
                          items={sizes.map((size) => ({
                            value: String(size),
                            label: String(size),
                          }))}
                          value={keySize}
                          onValueChange={(value) => setKeySize(value ?? "")}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {sizes.map((size) => (
                                <SelectItem key={size} value={String(size)}>
                                  {size}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="order-domains">证书域名</FieldLabel>
                      <Textarea
                        id="order-domains"
                        rows={6}
                        value={domains}
                        required
                        onChange={(event) => setDomains(event.target.value)}
                        placeholder={"example.com\n*.example.com"}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field>
                      <FieldLabel htmlFor="order-cert">证书 PEM</FieldLabel>
                      <Input
                        type="file"
                        accept=".pem,.crt,.cer,text/plain,application/x-pem-file"
                        aria-label="从文件读取证书"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void file.text().then(setCertificate);
                        }}
                      />
                      <Textarea
                        id="order-cert"
                        rows={8}
                        value={certificate}
                        required
                        onChange={(event) => setCertificate(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="order-key">私钥 PEM</FieldLabel>
                      <Input
                        type="file"
                        accept=".pem,.key,text/plain,application/x-pem-file"
                        aria-label="从文件读取私钥"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void file.text().then(setPrivateKey);
                        }}
                      />
                      <Textarea
                        id="order-key"
                        rows={8}
                        value={privateKey}
                        required
                        onChange={(event) => setPrivateKey(event.target.value)}
                      />
                    </Field>
                  </>
                )}
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
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner data-icon="inline-start" /> : null}保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProcessLogDialog({ order }: { order: CertificateOrderSummary }) {
  const [open, setOpen] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const query = useQuery({
    queryKey: ["certificate-order-log", order.id, order.processId],
    queryFn: async () =>
      (
        await apiGet<DataResponse<ProcessLog>>(
          `/api/web/v1/certificate-orders/${order.id}/log`,
          { processId: order.processId },
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
        过程日志
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>证书签发日志</DialogTitle>
          <DialogDescription>
            订单 #{order.id} 的当前流程输出。
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

function ArtifactsDialog({ order }: { order: CertificateOrderSummary }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["certificate-artifacts", order.id],
    queryFn: async () =>
      (
        await apiGet<DataResponse<CertificateArtifacts>>(
          `/api/web/v1/certificate-orders/${order.id}/artifacts`,
        )
      ).data,
    enabled: open,
  });
  const download = () => {
    if (!query.data) return;
    const bytes = Uint8Array.from(atob(query.data.pfxBase64), (char) =>
      char.charCodeAt(0),
    );
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/x-pkcs12" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `certificate-${order.id}.pfx`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const downloadText = (filename: string, content: string) => {
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/x-pem-file;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <DropdownMenuItem closeOnClick={false} />
        }
      >
        <DownloadIcon />
        证书制品
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>证书制品</DialogTitle>
          <DialogDescription>
            敏感内容仅在此处显式读取。PFX 密码：
            {query.data?.pfxPassword ?? "加载中"}
          </DialogDescription>
        </DialogHeader>
        {query.isError ? (
          <QueryError error={query.error} retry={() => void query.refetch()} />
        ) : query.isPending ? (
          <LoadingTable />
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>证书 PEM</FieldLabel>
              <Textarea readOnly rows={8} value={query.data.certificate} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard.writeText(query.data.certificate)
                  }
                >
                  <CopyIcon data-icon="inline-start" />复制
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadText("fullchain.crt", query.data.certificate)
                  }
                >
                  <DownloadIcon data-icon="inline-start" />下载证书
                </Button>
              </div>
            </Field>
            <Field>
              <FieldLabel>私钥 PEM</FieldLabel>
              <Textarea readOnly rows={8} value={query.data.privateKey} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard.writeText(query.data.privateKey)
                  }
                >
                  <CopyIcon data-icon="inline-start" />复制
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadText("private.key", query.data.privateKey)
                  }
                >
                  <DownloadIcon data-icon="inline-start" />下载私钥
                </Button>
              </div>
            </Field>
            <Button type="button" onClick={download}>
              <DownloadIcon data-icon="inline-start" />
              下载 PFX
            </Button>
          </FieldGroup>
        )}
      </DialogContent>
    </Dialog>
  );
}
