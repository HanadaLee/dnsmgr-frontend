import { useEffect, useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheckIcon,
  CopyIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { apiDelete, apiGet, apiGetAll, apiPost, apiPut } from "@/api/client";
import type {
  CloudflareCustomHostname,
  CloudflareDnsLine,
  CloudflareTunnel,
  CloudflareTunnelCidrRoute,
  CloudflareTunnelHostnameRoute,
  CloudflareTunnelPublicHostname,
  CloudflareTxtTargetCandidate,
  DataResponse,
  DomainAccountSummary,
  DomainSummary,
  OperationResult,
} from "@/api/types";
import { ConfirmAction } from "@/components/confirm-action";
import { CloudflareBatchTools } from "@/components/cloudflare-batch-tools";
import { CloudflareOptimizeDialog } from "@/components/cloudflare-optimize-dialog";
import { DataTable, type DataColumn } from "@/components/data-table";
import { FormDialog } from "@/components/form-dialog";
import { LoadingTable } from "@/components/loading-table";
import { PageHeader } from "@/components/page-header";
import { QueryError } from "@/components/query-error";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { recordValueForSave } from "@/lib/dns-record-value";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { formatDateTime, splitLines } from "@/lib/format";

type FallbackOrigin = { origin: string | null };
type DcvDelegation = { uuid: string };
type TunnelToken = { token: string; command: string };

const hostnameFields = [
  {
    name: "customOrigin",
    label: "自定义源站",
    placeholder: "origin.example.com",
    description: "留空使用 Fallback Origin。",
  },
  {
    name: "validationMethod",
    label: "验证方式",
    kind: "select" as const,
    options: [
      { value: "txt", label: "TXT" },
      { value: "http", label: "HTTP" },
    ],
    required: true,
  },
  {
    name: "minTlsVersion",
    label: "最低 TLS 版本",
    kind: "select" as const,
    options: ["1.0", "1.1", "1.2", "1.3"].map((value) => ({
      value,
      label: `TLS ${value}`,
    })),
    required: true,
  },
];

export function CloudflarePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(
    searchParams.get("tab") === "tunnels" ? "tunnels" : "hostnames",
  );
  const domains = useQuery({
    queryKey: ["domains", "cloudflare-options"],
    queryFn: () =>
      apiGetAll<DomainSummary>("/api/web/v1/domains", {
        provider: "cloudflare",
        sort: "name",
        order: "asc",
      }),
  });
  const accounts = useQuery({
    queryKey: ["domain-accounts", "cloudflare-options"],
    queryFn: () =>
      apiGetAll<DomainAccountSummary>("/api/web/v1/domain-accounts", {
        sort: "name",
        order: "asc",
      }),
  });
  const cloudflareAccounts = (accounts.data ?? []).filter(
    (account) => account.provider.type.toLowerCase() === "cloudflare",
  );
  const initialDomain = searchParams.get("domainId") ?? "";
  const initialAccount = searchParams.get("accountId") ?? "";
  const [domainId, setDomainId] = useState(initialDomain);
  const [accountId, setAccountId] = useState(initialAccount);
  useEffect(() => {
    if (!domainId && domains.data?.[0]) setDomainId(String(domains.data[0].id));
  }, [domainId, domains.data]);
  useEffect(() => {
    if (!accountId && cloudflareAccounts[0])
      setAccountId(String(cloudflareAccounts[0].id));
  }, [accountId, cloudflareAccounts]);
  const changeTab = (value: string) => {
    setTab(value);
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next, { replace: true });
  };
  if (domains.isError || accounts.isError)
    return (
      <QueryError
        error={domains.error ?? accounts.error}
        retry={() => {
          void domains.refetch();
          void accounts.refetch();
        }}
      />
    );
  if (domains.isPending || accounts.isPending) return <LoadingTable rows={6} />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="第三方高级功能"
        title="CloudFlare"
        description="管理 SaaS 自定义主机名、验证记录、Fallback Origin 与 Tunnel 路由。"
      />
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList variant="line">
          <TabsTrigger value="hostnames">自定义主机名</TabsTrigger>
          <TabsTrigger value="tunnels">Tunnel</TabsTrigger>
        </TabsList>
        <TabsContent value="hostnames">
          <CustomHostnames
            domainId={domainId}
            setDomainId={(value) => {
              setDomainId(value);
              const next = new URLSearchParams(searchParams);
              next.set("domainId", value);
              setSearchParams(next, { replace: true });
            }}
            domains={domains.data}
          />
        </TabsContent>
        <TabsContent value="tunnels">
          <Tunnels
            accountId={accountId}
            setAccountId={(value) => {
              setAccountId(value);
              const next = new URLSearchParams(searchParams);
              next.set("accountId", value);
              setSearchParams(next, { replace: true });
            }}
            accounts={cloudflareAccounts}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CustomHostnames({
  domainId,
  setDomainId,
  domains,
}: {
  domainId: string;
  setDomainId: (value: string) => void;
  domains: DomainSummary[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const list = useQuery({
    queryKey: ["cloudflare-hostnames", domainId],
    queryFn: () =>
      apiGetAll<CloudflareCustomHostname>(
        `/api/web/v1/cloudflare/domains/${domainId}/custom-hostnames`,
        { pageSize: 100 },
      ),
    enabled: Boolean(domainId),
  });
  const fallback = useQuery({
    queryKey: ["cloudflare-fallback", domainId],
    queryFn: async () =>
      (
        await apiGet<DataResponse<FallbackOrigin>>(
          `/api/web/v1/cloudflare/domains/${domainId}/fallback-origin`,
        )
      ).data,
    enabled: Boolean(domainId),
  });
  const dcv = useQuery({
    queryKey: ["cloudflare-dcv", domainId],
    queryFn: async () =>
      (
        await apiGet<DataResponse<DcvDelegation>>(
          `/api/web/v1/cloudflare/domains/${domainId}/dcv-delegation`,
        )
      ).data,
    enabled: Boolean(domainId),
  });
  const invalidate = [["cloudflare-hostnames", domainId]] as const;
  const save = useApiMutation<
    { id?: string; body: Record<string, unknown> },
    DataResponse<OperationResult>
  >({
    mutationFn: ({ id, body }) =>
      id
        ? apiPut(
            `/api/web/v1/cloudflare/domains/${domainId}/custom-hostnames/${id}`,
            body,
          )
        : apiPost(
            `/api/web/v1/cloudflare/domains/${domainId}/custom-hostnames`,
            body,
          ),
    successMessage: (_, variables) =>
      variables.id ? "自定义主机名已更新" : "自定义主机名已添加",
    invalidate: [...invalidate],
  });
  const remove = useApiMutation<
    CloudflareCustomHostname,
    DataResponse<OperationResult>
  >({
    mutationFn: (item) =>
      apiDelete(
        `/api/web/v1/cloudflare/domains/${domainId}/custom-hostnames/${item.id}`,
        { hostname: item.hostname },
      ),
    successMessage: "自定义主机名已删除",
    invalidate: [...invalidate],
  });
  const refresh = useApiMutation<string, DataResponse<OperationResult>>({
    mutationFn: (id) =>
      apiPost(
        `/api/web/v1/cloudflare/domains/${domainId}/custom-hostnames/${id}/refresh`,
        {},
      ),
    successMessage: "已重新发起验证",
    invalidate: [...invalidate],
  });
  const batchAdd = useApiMutation<
    Record<string, unknown>,
    DataResponse<OperationResult>
  >({
    mutationFn: (body) =>
      apiPost(
        `/api/web/v1/cloudflare/domains/${domainId}/custom-hostnames/batch-add`,
        body,
      ),
    successMessage: (result) => result.message ?? "自定义主机名已批量添加",
    invalidate: [...invalidate],
  });
  const batchUpdate = useApiMutation<
    Record<string, unknown>,
    DataResponse<OperationResult>
  >({
    mutationFn: (body) =>
      apiPut(
        `/api/web/v1/cloudflare/domains/${domainId}/custom-hostnames/batch`,
        body,
      ),
    successMessage: (result) => result.message ?? "所选主机名已更新",
    invalidate: [...invalidate],
    onSuccess: () => setSelected(new Set()),
  });
  const batchDelete = useApiMutation<void, DataResponse<OperationResult>>({
    mutationFn: () =>
      apiPost(
        `/api/web/v1/cloudflare/domains/${domainId}/custom-hostnames/batch-delete`,
        { ids: Array.from(selected) },
      ),
    successMessage: (result) => result.message ?? "所选主机名已删除",
    invalidate: [...invalidate],
    onSuccess: () => setSelected(new Set()),
  });
  const fallbackSave = useApiMutation<string, DataResponse<OperationResult>>({
    mutationFn: (origin) =>
      apiPut(`/api/web/v1/cloudflare/domains/${domainId}/fallback-origin`, {
        origin,
      }),
    successMessage: "Fallback Origin 已保存",
    invalidate: [["cloudflare-fallback", domainId]],
  });
  const fallbackDelete = useApiMutation<void, DataResponse<OperationResult>>({
    mutationFn: () =>
      apiDelete(`/api/web/v1/cloudflare/domains/${domainId}/fallback-origin`),
    successMessage: "Fallback Origin 已清空",
    invalidate: [["cloudflare-fallback", domainId]],
  });
  const defaultValues = {
    customOrigin: "",
    validationMethod: "txt",
    minTlsVersion: "1.0",
  };
  const batchUpdateFields = [
    {
      name: "customOrigin",
      label: "自定义源站",
      placeholder: "origin.example.com",
      description: "留空会清空自定义源站。",
    },
    {
      name: "validationMethod",
      label: "验证方式",
      kind: "select" as const,
      options: [
        { value: "unchanged", label: "保持不变" },
        { value: "txt", label: "TXT" },
        { value: "http", label: "HTTP" },
      ],
    },
    {
      name: "minTlsVersion",
      label: "最低 TLS 版本",
      kind: "select" as const,
      options: [
        { value: "unchanged", label: "保持不变" },
        ...["1.0", "1.1", "1.2", "1.3"].map((value) => ({
          value,
          label: `TLS ${value}`,
        })),
      ],
    },
  ];
  const selectedItems = (list.data ?? []).filter((item) =>
    selected.has(item.id),
  );
  const visibleItems = (list.data ?? []).filter(
    (item) =>
      !search.trim() ||
      item.hostname.toLowerCase().includes(search.trim().toLowerCase()) ||
      (item.customOrigin ?? "")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const columns: DataColumn<CloudflareCustomHostname>[] = [
    {
      key: "hostname",
      label: "主机名",
      render: (item) => (
        <div className="min-w-56">
          <p className="font-medium">{item.hostname}</p>
          <p className="text-xs text-muted-foreground">
            {item.customOrigin ?? "使用 Fallback Origin"}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      label: "主机名状态",
      render: (item) => <StatusBadge value={item.status} />,
    },
    {
      key: "ssl",
      label: "SSL",
      render: (item) => (
        <div>
          <StatusBadge value={item.ssl.status} />
          <p className="mt-1 text-xs text-muted-foreground">
            {item.ssl.method.toUpperCase()} · TLS{" "}
            {item.ssl.minTlsVersion ?? "—"}
          </p>
        </div>
      ),
    },
    {
      key: "time",
      label: "创建时间",
      render: (item) => formatDateTime(item.createdAt),
    },
    {
      key: "actions",
      label: "",
      className: "w-12",
      render: (item) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`管理 ${item.hostname}`}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <HostnameDetails domainId={Number(domainId)} item={item} />
              <FormDialog
                trigger={
                  <DropdownMenuItem closeOnClick={false}>
                    <PencilIcon />
                    编辑
                  </DropdownMenuItem>
                }
                title="编辑自定义主机名"
                fields={hostnameFields}
                initialValues={{
                  customOrigin: item.customOrigin ?? "",
                  validationMethod:
                    item.ssl.method === "unknown" ? "txt" : item.ssl.method,
                  minTlsVersion: item.ssl.minTlsVersion ?? "1.0",
                }}
                pending={save.isPending}
                onSubmit={(values, close) =>
                  save.mutate(
                    {
                      id: item.id,
                      body: {
                        customOrigin: String(values.customOrigin ?? "") || null,
                        validationMethod: values.validationMethod,
                        minTlsVersion: values.minTlsVersion,
                      },
                    },
                    { onSuccess: close },
                  )
                }
              />
              <DropdownMenuItem onClick={() => refresh.mutate(item.id)}>
                <RefreshCwIcon />
                重新验证
              </DropdownMenuItem>
              <ConfirmAction
                trigger={
                  <DropdownMenuItem variant="destructive" closeOnClick={false}>
                    <Trash2Icon />
                    删除
                  </DropdownMenuItem>
                }
                title="删除自定义主机名？"
                description={item.hostname}
                destructive
                pending={remove.isPending}
                onConfirm={() => remove.mutate(item)}
              />
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_minmax(12rem,1fr)_auto_auto] lg:items-end">
            <Field>
              <FieldLabel>CloudFlare 域名</FieldLabel>
              <Select
                items={domains.map((domain) => ({
                  value: String(domain.id),
                  label: domain.name,
                }))}
                value={domainId || null}
                onValueChange={(value) => {
                  setSelected(new Set());
                  setSearch("");
                  setDomainId(value ?? "");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="请选择 CloudFlare 域名" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {domains.map((domain) => (
                      <SelectItem key={domain.id} value={String(domain.id)}>
                        {domain.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="cloudflare-hostname-search">
                搜索主机名
              </FieldLabel>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="cloudflare-hostname-search"
                  className="pl-9"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setSelected(new Set());
                  }}
                  placeholder="主机名或源站"
                />
              </div>
            </Field>
            <FormDialog
              trigger={
                <Button variant="outline">
                  <PlusIcon data-icon="inline-start" />
                  批量添加
                </Button>
              }
              title="批量添加自定义主机名"
              initialValues={defaultValues}
              fields={[
                {
                  name: "hostnames",
                  label: "主机名",
                  kind: "textarea",
                  description: "每行一个主机名。",
                  required: true,
                },
                ...hostnameFields,
              ]}
              pending={batchAdd.isPending}
              onSubmit={(values, close) =>
                batchAdd.mutate(
                  {
                    hostnames: splitLines(String(values.hostnames)),
                    customOrigin: String(values.customOrigin ?? "") || null,
                    validationMethod: values.validationMethod,
                    minTlsVersion: values.minTlsVersion,
                  },
                  { onSuccess: close },
                )
              }
            />
            <FormDialog
              trigger={
                <Button>
                  <PlusIcon data-icon="inline-start" />
                  添加主机名
                </Button>
              }
              title="添加自定义主机名"
              initialValues={defaultValues}
              fields={[
                {
                  name: "hostname",
                  label: "主机名",
                  placeholder: "app.example.com",
                  required: true,
                },
                ...hostnameFields,
              ]}
              pending={save.isPending}
              onSubmit={(values, close) =>
                save.mutate(
                  {
                    body: {
                      hostname: values.hostname,
                      customOrigin: String(values.customOrigin ?? "") || null,
                      validationMethod: values.validationMethod,
                      minTlsVersion: values.minTlsVersion,
                    },
                  },
                  { onSuccess: close },
                )
              }
            />
          </div>
          {selected.size ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <span className="mr-auto text-sm">已选择 {selected.size} 项</span>
              <CloudflareBatchTools
                domainId={Number(domainId)}
                items={selectedItems}
                dcvUuid={dcv.data?.uuid}
                onFinished={() => void list.refetch()}
              />
              <CloudflareOptimizeDialog
                domainId={Number(domainId)}
                items={selectedItems}
                onFinished={() => void list.refetch()}
              />
              <FormDialog
                trigger={
                  <Button size="sm" variant="outline">
                    批量修改
                  </Button>
                }
                title="批量修改主机名"
                initialValues={{
                  customOrigin: "",
                  validationMethod: "unchanged",
                  minTlsVersion: "unchanged",
                }}
                fields={batchUpdateFields}
                pending={batchUpdate.isPending}
                onSubmit={(values, close) =>
                  batchUpdate.mutate(
                    {
                      ids: Array.from(selected),
                      customOrigin: String(values.customOrigin ?? "") || null,
                      ...(values.validationMethod !== "unchanged"
                        ? { validationMethod: values.validationMethod }
                        : {}),
                      ...(values.minTlsVersion !== "unchanged"
                        ? { minTlsVersion: values.minTlsVersion }
                        : {}),
                    },
                    { onSuccess: close },
                  )
                }
              />
              <ConfirmAction
                trigger={
                  <Button size="sm" variant="destructive">
                    批量删除
                  </Button>
                }
                title="删除所选自定义主机名？"
                description="此操作无法撤销。"
                destructive
                pending={batchDelete.isPending}
                onConfirm={() => batchDelete.mutate()}
              />
            </div>
          ) : null}
          {list.isError ? (
            <QueryError error={list.error} retry={() => void list.refetch()} />
          ) : list.isPending && domainId ? (
            <LoadingTable />
          ) : (
            <DataTable
              rows={visibleItems}
              columns={columns}
              rowKey={(item) => item.id}
              selected={selected}
              onSelectedChange={setSelected}
              emptyTitle={
                search ? "没有匹配的自定义主机名" : "暂无自定义主机名"
              }
            />
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fallback Origin</CardTitle>
            <CardDescription>
              未单独设置源站的主机名将使用该域名。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <code className="mr-auto rounded-md bg-muted px-2 py-1">
              {fallback.data?.origin ?? "未设置"}
            </code>
            <FormDialog
              trigger={
                <Button size="sm" variant="outline">
                  <SettingsIcon data-icon="inline-start" />
                  设置
                </Button>
              }
              title="设置 Fallback Origin"
              initialValues={{ origin: fallback.data?.origin ?? "" }}
              fields={[
                {
                  name: "origin",
                  label: "源站域名",
                  placeholder: "origin.example.com",
                  required: true,
                },
              ]}
              pending={fallbackSave.isPending}
              onSubmit={(values, close) =>
                fallbackSave.mutate(String(values.origin), { onSuccess: close })
              }
            />
            {fallback.data?.origin ? (
              <ConfirmAction
                trigger={
                  <Button size="sm" variant="ghost">
                    清空
                  </Button>
                }
                title="清空 Fallback Origin？"
                description="没有单独配置源站的主机名可能失去回源目标。"
                destructive
                pending={fallbackDelete.isPending}
                onConfirm={() => fallbackDelete.mutate()}
              />
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>DCV 委派</CardTitle>
            <CardDescription>
              用于证书域名控制权验证的委派标识。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1">
                {dcv.data?.uuid ?? "—"}
              </code>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="复制委派标识"
                onClick={() =>
                  dcv.data && void navigator.clipboard.writeText(dcv.data.uuid)
                }
              >
                <CopyIcon />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HostnameDetails({
  domainId,
  item,
}: {
  domainId: number;
  item: CloudflareCustomHostname;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<DropdownMenuItem closeOnClick={false} />}>
        <BadgeCheckIcon />
        验证详情
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item.hostname}</DialogTitle>
          <DialogDescription>所有权与 SSL 验证记录。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">所有权验证</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <StatusBadge value={item.ownershipVerification.status} />
              {item.ownershipVerification.name &&
              item.ownershipVerification.value ? (
                <ValidationRecord
                  domainId={domainId}
                  name={item.ownershipVerification.name}
                  value={item.ownershipVerification.value}
                  type="TXT"
                />
              ) : null}
              {item.ownershipVerification.httpUrl ? (
                <VerificationValue
                  label="验证请求"
                  value={item.ownershipVerification.httpUrl}
                />
              ) : null}
              {item.ownershipVerification.httpBody ? (
                <VerificationValue
                  label="验证响应"
                  value={item.ownershipVerification.httpBody}
                  multiline
                />
              ) : null}
            </CardContent>
          </Card>
          {item.ssl.validationRecords.length ? (
            item.ssl.validationRecords.map((record, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-sm">
                    SSL 验证记录 {index + 1}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {record.status ? <StatusBadge value={record.status} /> : null}
                  {record.txtName && record.txtValue ? (
                    <ValidationRecord
                      domainId={domainId}
                      name={record.txtName}
                      value={record.txtValue}
                      type="TXT"
                    />
                  ) : null}
                  {record.cnameName && record.cnameTarget ? (
                    <ValidationRecord
                      domainId={domainId}
                      name={record.cnameName}
                      value={record.cnameTarget}
                      type="CNAME"
                    />
                  ) : null}
                  {record.httpUrl ? (
                    <VerificationValue
                      label="验证请求"
                      value={record.httpUrl}
                    />
                  ) : null}
                  {record.httpBody ? (
                    <VerificationValue
                      label="验证响应"
                      value={record.httpBody}
                      multiline
                    />
                  ) : null}
                  {record.emails.length ? (
                    <VerificationValue
                      label="邮箱地址"
                      value={record.emails.join("\n")}
                      multiline
                    />
                  ) : null}
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              CloudFlare 尚未返回 SSL 验证记录，请稍后刷新验证状态。
            </div>
          )}
          {item.validationErrors.length ? (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {item.validationErrors.join("；")}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VerificationValue({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 flex items-center gap-2">
        <p className="flex-1 text-xs text-muted-foreground">{label}</p>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`复制${label}`}
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.add({ title: `${label}已复制`, type: "success" });
          }}
        >
          <CopyIcon />
        </Button>
      </div>
      {multiline ? (
        <pre className="overflow-x-auto text-xs whitespace-pre-wrap break-all">
          {value}
        </pre>
      ) : (
        <code className="block break-all text-xs">{value}</code>
      )}
    </div>
  );
}

function ValidationRecord({
  domainId,
  name,
  value,
  type,
}: {
  domainId: number;
  name: string;
  value: string;
  type: "TXT" | "CNAME";
}) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const targets = useQuery({
    queryKey: ["cloudflare-txt-targets", domainId, name],
    queryFn: async () =>
      (
        await apiGet<
          DataResponse<{
            hostname: string;
            candidates: CloudflareTxtTargetCandidate[];
          }>
        >(`/api/web/v1/cloudflare/domains/${domainId}/txt-targets`, {
          hostname: name,
        })
      ).data,
    enabled: open,
  });
  useEffect(() => {
    if (targets.data && !targetId)
      setTargetId(
        String(
          (
            targets.data.candidates.find((item) => item.currentDomain) ??
            targets.data.candidates[0]
          )?.domainId ?? "",
        ),
      );
  }, [targetId, targets.data]);
  const create = useApiMutation<void, DataResponse<OperationResult>>({
    mutationFn: async () => {
      const target = targets.data?.candidates.find(
        (item) => String(item.domainId) === targetId,
      );
      if (!target) throw new Error("请选择 DNS 域名");
      const line = (
        await apiGet<
          DataResponse<{ defaultLine: string; lines: CloudflareDnsLine[] }>
        >(`/api/web/v1/cloudflare/domains/${target.domainId}/default-line`)
      ).data;
      return apiPost(`/api/web/v1/domains/${target.domainId}/records`, {
        name: target.recordName,
        type,
        value: recordValueForSave(target.accountType, type, value),
        lineId: line.defaultLine,
        ttl: 600,
        mxPriority: 1,
        weight: 0,
        remark: "CloudFlare 验证",
      });
    },
    successMessage: "验证记录已写入 DNS",
    invalidate: [["records"]],
  });
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{type}</p>
          <code className="block break-all">{name}</code>
          <code className="mt-1 block break-all text-muted-foreground">
            {value}
          </code>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`复制 ${type} 验证记录`}
          onClick={() => {
            void navigator.clipboard.writeText(`${name}\n${value}`);
            toast.add({ title: "验证记录已复制", type: "success" });
          }}
        >
          <CopyIcon />
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" variant="outline" />}>
            写入 DNS
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>写入验证记录</DialogTitle>
              <DialogDescription>
                选择由当前系统管理的 DNS 域名。
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel>目标域名</FieldLabel>
              <Select
                items={(targets.data?.candidates ?? []).map((target) => ({
                  value: String(target.domainId),
                  label: `${target.domainName} · ${target.accountDisplayName}`,
                }))}
                value={targetId || null}
                onValueChange={(next) => setTargetId(next ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(targets.data?.candidates ?? []).map((target) => (
                      <SelectItem
                        key={target.domainId}
                        value={String(target.domainId)}
                      >
                        {target.domainName} · {target.accountDisplayName}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {targets.isError ? (
              <QueryError
                error={targets.error}
                retry={() => void targets.refetch()}
              />
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                disabled={create.isPending || !targetId}
                onClick={() =>
                  create.mutate(undefined, { onSuccess: () => setOpen(false) })
                }
              >
                {create.isPending ? <Spinner data-icon="inline-start" /> : null}
                创建记录
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function Tunnels({
  accountId,
  setAccountId,
  accounts,
}: {
  accountId: string;
  setAccountId: (value: string) => void;
  accounts: DomainAccountSummary[];
}) {
  const list = useQuery({
    queryKey: ["cloudflare-tunnels", accountId],
    queryFn: () =>
      apiGetAll<CloudflareTunnel>(
        `/api/web/v1/cloudflare/accounts/${accountId}/tunnels`,
        { pageSize: 100 },
      ),
    enabled: Boolean(accountId),
  });
  const create = useApiMutation<string, DataResponse<OperationResult>>({
    mutationFn: (name) =>
      apiPost(`/api/web/v1/cloudflare/accounts/${accountId}/tunnels`, { name }),
    successMessage: "Tunnel 已创建",
    invalidate: [["cloudflare-tunnels", accountId]],
  });
  const remove = useApiMutation<string, DataResponse<OperationResult>>({
    mutationFn: (id) =>
      apiDelete(`/api/web/v1/cloudflare/accounts/${accountId}/tunnels/${id}`),
    successMessage: "Tunnel 已删除",
    invalidate: [["cloudflare-tunnels", accountId]],
  });
  const columns: DataColumn<CloudflareTunnel>[] = [
    {
      key: "name",
      label: "Tunnel",
      render: (tunnel) => (
        <div className="min-w-56">
          <p className="font-medium">{tunnel.name}</p>
          <code className="text-xs text-muted-foreground">{tunnel.id}</code>
        </div>
      ),
    },
    {
      key: "status",
      label: "状态",
      render: (tunnel) => <StatusBadge value={tunnel.status} />,
    },
    {
      key: "connections",
      label: "连接数",
      render: (tunnel) => tunnel.connectionCount,
    },
    {
      key: "active",
      label: "最近活动",
      render: (tunnel) => formatDateTime(tunnel.activeAt),
    },
    {
      key: "actions",
      label: "",
      className: "w-12",
      render: (tunnel) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`管理 ${tunnel.name}`}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <TunnelManager accountId={Number(accountId)} tunnel={tunnel} />
              <TunnelTokenDialog
                accountId={Number(accountId)}
                tunnel={tunnel}
              />
              <ConfirmAction
                trigger={
                  <DropdownMenuItem variant="destructive" closeOnClick={false}>
                    <Trash2Icon />
                    删除
                  </DropdownMenuItem>
                }
                title="删除 Tunnel？"
                description="Tunnel、入口规则和私网路由将被删除。"
                destructive
                pending={remove.isPending}
                onConfirm={() => remove.mutate(tunnel.id)}
              />
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field className="flex-1">
            <FieldLabel>CloudFlare 账户</FieldLabel>
            <Select
              items={accounts.map((account) => ({
                value: String(account.id),
                label: account.name,
              }))}
              value={accountId || null}
              onValueChange={(value) => setAccountId(value ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="请选择 CloudFlare 账户" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={String(account.id)}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <FormDialog
            trigger={
              <Button>
                <PlusIcon data-icon="inline-start" />
                创建 Tunnel
              </Button>
            }
            title="创建 CloudFlare Tunnel"
            fields={[{ name: "name", label: "Tunnel 名称", required: true }]}
            pending={create.isPending}
            onSubmit={(values, close) =>
              create.mutate(String(values.name), { onSuccess: close })
            }
          />
        </div>
        {list.isError ? (
          <QueryError error={list.error} retry={() => void list.refetch()} />
        ) : list.isPending && accountId ? (
          <LoadingTable />
        ) : (
          <DataTable
            rows={list.data ?? []}
            columns={columns}
            rowKey={(tunnel) => tunnel.id}
            emptyTitle="暂无 CloudFlare Tunnel"
          />
        )}
      </CardContent>
    </Card>
  );
}

function TunnelTokenDialog({
  accountId,
  tunnel,
}: {
  accountId: number;
  tunnel: CloudflareTunnel;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["cloudflare-tunnel-token", accountId, tunnel.id],
    queryFn: async () =>
      (
        await apiGet<DataResponse<TunnelToken>>(
          `/api/web/v1/cloudflare/accounts/${accountId}/tunnels/${tunnel.id}/token`,
        )
      ).data,
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<DropdownMenuItem closeOnClick={false} />}>
        <KeyRoundIcon />
        启动 Token
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tunnel 启动 Token</DialogTitle>
          <DialogDescription>
            这是敏感凭据，仅在明确需要时读取。
          </DialogDescription>
        </DialogHeader>
        {query.isError ? (
          <QueryError error={query.error} retry={() => void query.refetch()} />
        ) : query.isPending ? (
          <LoadingTable rows={2} />
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>Token</FieldLabel>
              <Textarea readOnly rows={4} value={query.data.token} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(query.data.token);
                  toast.add({ title: "Token 已复制", type: "success" });
                }}
              >
                <CopyIcon data-icon="inline-start" />
                复制 Token
              </Button>
            </div>
            <Field>
              <FieldLabel>启动命令</FieldLabel>
              <Textarea readOnly rows={5} value={query.data.command} />
            </Field>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(query.data.command);
                toast.add({ title: "启动命令已复制", type: "success" });
              }}
            >
              <CopyIcon data-icon="inline-start" />
              复制命令
            </Button>
          </FieldGroup>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TunnelManager({
  accountId,
  tunnel,
}: {
  accountId: number;
  tunnel: CloudflareTunnel;
}) {
  const [open, setOpen] = useState(false);
  const base = `/api/web/v1/cloudflare/accounts/${accountId}/tunnels/${tunnel.id}`;
  const publicHosts = useQuery({
    queryKey: ["tunnel-public-hostnames", accountId, tunnel.id],
    queryFn: () =>
      apiGetAll<CloudflareTunnelPublicHostname>(`${base}/public-hostnames`, {
        pageSize: 100,
      }),
    enabled: open,
  });
  const cidrs = useQuery({
    queryKey: ["tunnel-cidrs", accountId, tunnel.id],
    queryFn: () =>
      apiGetAll<CloudflareTunnelCidrRoute>(`${base}/cidr-routes`, {
        pageSize: 100,
      }),
    enabled: open,
  });
  const hostRoutes = useQuery({
    queryKey: ["tunnel-hostname-routes", accountId, tunnel.id],
    queryFn: () =>
      apiGetAll<CloudflareTunnelHostnameRoute>(`${base}/hostname-routes`, {
        pageSize: 100,
      }),
    enabled: open,
  });
  const publicSave = useApiMutation<
    Record<string, unknown>,
    DataResponse<OperationResult>
  >({
    mutationFn: (body) => apiPut(`${base}/public-hostnames`, body),
    successMessage: "公网主机名已保存",
    invalidate: [["tunnel-public-hostnames", accountId, tunnel.id]],
  });
  const publicDelete = useApiMutation<
    CloudflareTunnelPublicHostname,
    DataResponse<OperationResult>
  >({
    mutationFn: (item) =>
      apiDelete(`${base}/public-hostnames`, {
        hostname: item.hostname,
        path: item.path ?? null,
      }),
    successMessage: "公网主机名已删除",
    invalidate: [["tunnel-public-hostnames", accountId, tunnel.id]],
  });
  const cidrCreate = useApiMutation<
    Record<string, unknown>,
    DataResponse<OperationResult>
  >({
    mutationFn: (body) => apiPost(`${base}/cidr-routes`, body),
    successMessage: "CIDR 路由已添加",
    invalidate: [["tunnel-cidrs", accountId, tunnel.id]],
  });
  const cidrDelete = useApiMutation<string, DataResponse<OperationResult>>({
    mutationFn: (routeId) => apiDelete(`${base}/cidr-routes`, { routeId }),
    successMessage: "CIDR 路由已删除",
    invalidate: [["tunnel-cidrs", accountId, tunnel.id]],
  });
  const hostCreate = useApiMutation<
    Record<string, unknown>,
    DataResponse<OperationResult>
  >({
    mutationFn: (body) => apiPost(`${base}/hostname-routes`, body),
    successMessage: "主机名路由已添加",
    invalidate: [["tunnel-hostname-routes", accountId, tunnel.id]],
  });
  const hostDelete = useApiMutation<string, DataResponse<OperationResult>>({
    mutationFn: (routeId) => apiDelete(`${base}/hostname-routes`, { routeId }),
    successMessage: "主机名路由已删除",
    invalidate: [["tunnel-hostname-routes", accountId, tunnel.id]],
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<DropdownMenuItem closeOnClick={false} />}>
        <SettingsIcon />
        管理路由
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{tunnel.name}</DialogTitle>
          <DialogDescription>
            管理公网入口、CIDR 私网路由和主机名路由。
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="public">
          <TabsList>
            <TabsTrigger value="public">公网主机名</TabsTrigger>
            <TabsTrigger value="cidr">CIDR 路由</TabsTrigger>
            <TabsTrigger value="hostname">主机名路由</TabsTrigger>
          </TabsList>
          <TabsContent value="public">
            <RouteSection
              title="公网主机名"
              action={
                <FormDialog
                  trigger={
                    <Button size="sm">
                      <PlusIcon data-icon="inline-start" />
                      添加
                    </Button>
                  }
                  title="保存公网主机名"
                  fields={[
                    { name: "hostname", label: "主机名", required: true },
                    {
                      name: "service",
                      label: "服务地址",
                      placeholder: "http://127.0.0.1:8080",
                      required: true,
                    },
                    { name: "path", label: "路径匹配", placeholder: "/api/*" },
                  ]}
                  pending={publicSave.isPending}
                  onSubmit={(values, close) =>
                    publicSave.mutate(
                      {
                        hostname: values.hostname,
                        service: values.service,
                        path: String(values.path ?? "") || null,
                      },
                      { onSuccess: close },
                    )
                  }
                />
              }
            >
              {publicHosts.isError ? (
                <QueryError
                  error={publicHosts.error}
                  retry={() => void publicHosts.refetch()}
                />
              ) : (
                <DataTable
                  rows={publicHosts.data ?? []}
                  rowKey={(item) => `${item.hostname}:${item.path ?? ""}`}
                  columns={[
                    {
                      key: "hostname",
                      label: "主机名",
                      render: (item) => item.hostname,
                    },
                    {
                      key: "path",
                      label: "路径",
                      render: (item) => item.path ?? "全部",
                    },
                    {
                      key: "service",
                      label: "服务",
                      render: (item) => <code>{item.service}</code>,
                    },
                    {
                      key: "action",
                      label: "",
                      render: (item) => (
                        <ConfirmAction
                          trigger={
                            <Button size="icon-sm" variant="ghost">
                              <Trash2Icon />
                            </Button>
                          }
                          title="删除公网主机名？"
                          description={item.hostname}
                          destructive
                          pending={publicDelete.isPending}
                          onConfirm={() => publicDelete.mutate(item)}
                        />
                      ),
                    },
                  ]}
                />
              )}
            </RouteSection>
          </TabsContent>
          <TabsContent value="cidr">
            <RouteSection
              title="CIDR 路由"
              action={
                <FormDialog
                  trigger={
                    <Button size="sm">
                      <PlusIcon data-icon="inline-start" />
                      添加
                    </Button>
                  }
                  title="添加 CIDR 路由"
                  fields={[
                    {
                      name: "network",
                      label: "CIDR 网段",
                      placeholder: "10.0.0.0/8",
                      required: true,
                    },
                    { name: "comment", label: "备注" },
                  ]}
                  pending={cidrCreate.isPending}
                  onSubmit={(values, close) =>
                    cidrCreate.mutate(
                      {
                        network: values.network,
                        comment: String(values.comment ?? "") || null,
                      },
                      { onSuccess: close },
                    )
                  }
                />
              }
            >
              {cidrs.isError ? (
                <QueryError
                  error={cidrs.error}
                  retry={() => void cidrs.refetch()}
                />
              ) : (
                <DataTable
                  rows={cidrs.data ?? []}
                  rowKey={(item) => item.id}
                  columns={[
                    {
                      key: "network",
                      label: "网段",
                      render: (item) => <code>{item.network}</code>,
                    },
                    {
                      key: "comment",
                      label: "备注",
                      render: (item) => item.comment ?? "—",
                    },
                    {
                      key: "action",
                      label: "",
                      render: (item) => (
                        <ConfirmAction
                          trigger={
                            <Button size="icon-sm" variant="ghost">
                              <Trash2Icon />
                            </Button>
                          }
                          title="删除 CIDR 路由？"
                          description={item.network}
                          destructive
                          pending={cidrDelete.isPending}
                          onConfirm={() => cidrDelete.mutate(item.id)}
                        />
                      ),
                    },
                  ]}
                />
              )}
            </RouteSection>
          </TabsContent>
          <TabsContent value="hostname">
            <RouteSection
              title="主机名路由"
              action={
                <FormDialog
                  trigger={
                    <Button size="sm">
                      <PlusIcon data-icon="inline-start" />
                      添加
                    </Button>
                  }
                  title="添加主机名路由"
                  fields={[
                    { name: "hostname", label: "主机名", required: true },
                    { name: "comment", label: "备注" },
                  ]}
                  pending={hostCreate.isPending}
                  onSubmit={(values, close) =>
                    hostCreate.mutate(
                      {
                        hostname: values.hostname,
                        comment: String(values.comment ?? "") || null,
                      },
                      { onSuccess: close },
                    )
                  }
                />
              }
            >
              {hostRoutes.isError ? (
                <QueryError
                  error={hostRoutes.error}
                  retry={() => void hostRoutes.refetch()}
                />
              ) : (
                <DataTable
                  rows={hostRoutes.data ?? []}
                  rowKey={(item) => item.id}
                  columns={[
                    {
                      key: "hostname",
                      label: "主机名",
                      render: (item) => item.hostname,
                    },
                    {
                      key: "comment",
                      label: "备注",
                      render: (item) => item.comment ?? "—",
                    },
                    {
                      key: "action",
                      label: "",
                      render: (item) => (
                        <ConfirmAction
                          trigger={
                            <Button size="icon-sm" variant="ghost">
                              <Trash2Icon />
                            </Button>
                          }
                          title="删除主机名路由？"
                          description={item.hostname}
                          destructive
                          pending={hostDelete.isPending}
                          onConfirm={() => hostDelete.mutate(item.id)}
                        />
                      ),
                    },
                  ]}
                />
              )}
            </RouteSection>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function RouteSection({
  title,
  action,
  children,
}: {
  title: string;
  action: ReactElement;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center">
        <CardTitle className="flex-1 text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
