import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2Icon,
  CopyIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";

import { apiDelete, apiGet, apiPost, apiPut } from "@/api/client";
import type {
  CertificateCnameProxy,
  CertificateDcvDelegationTemplate,
  CertificateSettings,
  DataResponse,
  OperationResult,
  PageResponse,
} from "@/api/types";
import { ConfirmAction } from "@/components/confirm-action";
import { DataTable, type DataColumn } from "@/components/data-table";
import { FormDialog } from "@/components/form-dialog";
import { ListPagination } from "@/components/list-pagination";
import { LoadingTable } from "@/components/loading-table";
import { PageHeader } from "@/components/page-header";
import { QueryError } from "@/components/query-error";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { formatDateTime } from "@/lib/format";

type CnameForm = { domains: Array<{ id: number; name: string }> };
type CnameCheck = { status: "verified" | "unverified" };
const CUSTOM_TEMPLATE_VALUE = "__custom__";

function automaticRecordName(domain: string, template: string) {
  const value = domain.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
  return value
    ? template.replaceAll("{domainWithDashes}", value.replaceAll(".", "-")).replaceAll("{domain}", value)
    : "";
}

function allowedDomain(domain: string, template: CertificateDcvDelegationTemplate | undefined) {
  if (!template || template.allowedDomains.length === 0) return true;
  const value = domain.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
  return template.allowedDomains.some((allowed) => value === allowed || value.endsWith(`.${allowed}`));
}

function selectedDcvTemplate(
  values: Record<string, unknown>,
  settings: CertificateSettings["dcvDelegation"] | undefined,
  fallback: CertificateDcvDelegationTemplate | undefined,
) {
  if (values.dcvTemplateId === CUSTOM_TEMPLATE_VALUE) return undefined;
  const requestedId = String(values.dcvTemplateId ?? "");
  return requestedId
    ? settings?.templates.find((template) => template.id === requestedId)
    : fallback;
}

function DcvTemplateFields({
  values,
  onChange,
  settings,
  defaultTemplate,
  domainOptions,
  domainEditable,
}: {
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  settings: CertificateSettings["dcvDelegation"] | undefined;
  defaultTemplate: CertificateDcvDelegationTemplate | undefined;
  domainOptions: Array<{ value: string; label: string }>;
  domainEditable: boolean;
}) {
  const usesCustomTemplate = values.dcvTemplateId === CUSTOM_TEMPLATE_VALUE;
  const selectedTemplate = selectedDcvTemplate(values, settings, defaultTemplate);
  const domain = String(values.domain ?? "");
  const targetDomain = domainOptions.find(
    (option) => option.value === String(selectedTemplate?.targetDomainId),
  )?.label;

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>DCV 模板</FieldLabel>
        <Select
          items={[
            ...(settings?.templates ?? []).map((template) => ({
              value: template.id,
              label: template.name,
            })),
            { value: CUSTOM_TEMPLATE_VALUE, label: "自定义" },
          ]}
          value={usesCustomTemplate
            ? CUSTOM_TEMPLATE_VALUE
            : (selectedTemplate?.id ?? null)}
          onValueChange={(value) => onChange({ ...values, dcvTemplateId: value ?? "" })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="请选择模板" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(settings?.templates ?? []).map((template) => (
                <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
              ))}
              <SelectItem value={CUSTOM_TEMPLATE_VALUE}>自定义</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        {!domainEditable && selectedTemplate ? (
          <FieldDescription>
            {selectedTemplate.targetDomainId
              ? `将使用 ${automaticRecordName(domain, selectedTemplate.targetRecordNameTemplate)}.${targetDomain ?? "目标域名"}`
              : "请先在证书设置中为这个模板选择 CNAME 目标域名。"}
          </FieldDescription>
        ) : null}
      </Field>
      {domainEditable ? (
        <Field>
          <FieldLabel htmlFor="cname-domain">证书域名</FieldLabel>
          <Input
            id="cname-domain"
            value={domain}
            placeholder="example.com"
            required
            onChange={(event) => onChange({ ...values, domain: event.target.value })}
          />
          {selectedTemplate ? (
            <FieldDescription>
              {selectedTemplate.targetDomainId
                ? `将创建 ${automaticRecordName(domain || "example.com", selectedTemplate.targetRecordNameTemplate)}.${targetDomain ?? "目标域名"}`
                : "请先在证书设置中为这个模板选择 CNAME 目标域名。"}
            </FieldDescription>
          ) : null}
        </Field>
      ) : null}
      {usesCustomTemplate ? (
        <>
          <Field>
            <FieldLabel>目标域名</FieldLabel>
            <Select
              items={domainOptions}
              value={String(values.targetDomainId ?? "") || null}
              onValueChange={(value) => onChange({ ...values, targetDomainId: value ?? "" })}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="请选择目标域名" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {domainOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={domainEditable ? "cname-record" : "edit-cname-record"}>目标主机记录</FieldLabel>
            <Input
              id={domainEditable ? "cname-record" : "edit-cname-record"}
              value={String(values.targetRecordName ?? "")}
              placeholder="example-com.cname"
              required
              onChange={(event) => onChange({ ...values, targetRecordName: event.target.value })}
            />
          </Field>
        </>
      ) : null}
    </FieldGroup>
  );
}

function CopyCode({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <code className="min-w-0 flex-1 break-all">{value}</code>
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
  );
}

export function CertificateCnamesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [sort, setSort] = useState("id");
  const [order, setOrder] = useState("desc");
  const form = useQuery({
    queryKey: ["certificate-cnames-form"],
    queryFn: async () =>
      (
        await apiGet<DataResponse<CnameForm>>(
          "/api/web/v1/certificate-cnames/form",
        )
      ).data,
  });
  const settings = useQuery({
    queryKey: ["certificate-settings"],
    queryFn: async () =>
      (await apiGet<DataResponse<CertificateSettings>>("/api/web/v1/certificate-settings")).data,
  });
  const query = useQuery({
    queryKey: ["certificate-cnames", page, queryText, sort, order],
    queryFn: () =>
      apiGet<PageResponse<CertificateCnameProxy>>(
        "/api/web/v1/certificate-cnames",
        { page, pageSize: 20, q: queryText, sort, order },
      ),
  });
  const save = useApiMutation<
    { id?: number; body: Record<string, unknown> },
    DataResponse<OperationResult>
  >({
    mutationFn: ({ id, body }) =>
      id
        ? apiPut(`/api/web/v1/certificate-cnames/${id}`, body)
        : apiPost("/api/web/v1/certificate-cnames", body),
    successMessage: (_, variables) =>
      variables.id ? "DCV 托管校验已更新" : "DCV 托管校验已添加",
    invalidate: [["certificate-cnames"]],
  });
  const remove = useApiMutation<{ id: number; domain: string }, DataResponse<OperationResult>>({
    mutationFn: ({ id, domain }) => apiDelete(`/api/web/v1/certificate-cnames/${id}`, { domain }),
    successMessage: "DCV 托管校验已删除",
    invalidate: [["certificate-cnames"]],
  });
  const check = useApiMutation<number, DataResponse<CnameCheck>>({
    mutationFn: (id) =>
      apiPost(`/api/web/v1/certificate-cnames/${id}/check`, {}),
    successMessage: (result) =>
      result.data.status === "verified"
        ? "CNAME 验证已通过"
        : "CNAME 验证未通过，请确认解析记录",
    invalidate: [["certificate-cnames"]],
  });
  const domainOptions = (form.data?.domains ?? []).map((domain) => ({
    value: String(domain.id),
    label: domain.name,
  }));
  const dcvSettings = settings.data?.dcvDelegation;
  const defaultDcvTemplate = dcvSettings?.templates.find(
    (template) => template.id === dcvSettings.defaultTemplateId,
  ) ?? dcvSettings?.templates[0];
  const columns: DataColumn<CertificateCnameProxy>[] = [
    {
      key: "domain",
      label: "证书域名",
      render: (item) => (
        <div className="min-w-56">
          <p className="font-medium">{item.domain}</p>
          <CopyCode value={item.challengeHost} label="主机记录" />
        </div>
      ),
    },
    {
      key: "target",
      label: "CNAME 目标",
      render: (item) => (
        <div className="min-w-56">
          <CopyCode value={item.target} label="CNAME 记录值" />
        </div>
      ),
    },
    {
      key: "status",
      label: "验证状态",
      render: (item) => <StatusBadge value={item.status} />,
    },
    {
      key: "time",
      label: "添加时间",
      render: (item) => formatDateTime(item.addedAt),
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
                aria-label={`管理 ${item.domain}`}
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <FormDialog
                trigger={
                  <DropdownMenuItem closeOnClick={false}>
                    <PencilIcon />
                    编辑
                  </DropdownMenuItem>
                }
                title="编辑 DCV 托管校验"
                description={item.domain}
                initialValues={{
                  domain: item.domain,
                  dcvTemplateId: item.templateId
                    && (!dcvSettings
                      || dcvSettings.templates.some((template) => template.id === item.templateId))
                    ? item.templateId
                    : CUSTOM_TEMPLATE_VALUE,
                  targetDomainId: String(item.targetDomainId),
                  targetRecordName: item.targetRecordName,
                }}
                pending={save.isPending}
                onSubmit={(values, close) => {
                  const usesCustomTemplate = values.dcvTemplateId === CUSTOM_TEMPLATE_VALUE;
                  const selectedTemplate = selectedDcvTemplate(values, dcvSettings, defaultDcvTemplate);
                  if (!usesCustomTemplate && !selectedTemplate) {
                    toast.add({ title: "所选模板不存在，请重新选择", type: "error" });
                    return;
                  }
                  if (!allowedDomain(item.domain, selectedTemplate)) {
                    toast.add({ title: "该证书域名不在允许托管的域名范围内", type: "error" });
                    return;
                  }
                  if (selectedTemplate && !selectedTemplate.targetDomainId) {
                    toast.add({ title: "所选模板尚未配置 CNAME 目标域名", type: "error" });
                    return;
                  }
                  save.mutate(
                    {
                      id: item.id,
                      body: usesCustomTemplate
                        ? {
                            domain: item.domain,
                            targetDomainId: Number(values.targetDomainId),
                            targetRecordName: values.targetRecordName,
                            dcvTemplateId: null,
                          }
                        : {
                            domain: item.domain,
                            dcvTemplateId: selectedTemplate?.id,
                          },
                    },
                    { onSuccess: close },
                  );
                }}
              >
                {(values, onChange) => (
                  <DcvTemplateFields
                    values={values}
                    onChange={onChange}
                    settings={dcvSettings}
                    defaultTemplate={defaultDcvTemplate}
                    domainOptions={domainOptions}
                    domainEditable={false}
                  />
                )}
              </FormDialog>
              <DropdownMenuItem onClick={() => check.mutate(item.id)}>
                <CheckCircle2Icon />
                立即验证
              </DropdownMenuItem>
              <ConfirmAction
                trigger={
                  <DropdownMenuItem variant="destructive" closeOnClick={false}>
                    <Trash2Icon />
                    删除
                  </DropdownMenuItem>
                }
                title="删除 DCV 托管校验？"
                description={item.domain}
                destructive
                pending={remove.isPending}
                onConfirm={() => remove.mutate({ id: item.id, domain: item.domain })}
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
        eyebrow="Certificates"
        title="DCV托管校验"
        description="集中托管证书域名的 ACME DCV 校验记录，并按配置写入目标 DNS。"
        action={
          <FormDialog
            trigger={
              <Button>
                <PlusIcon data-icon="inline-start" />
                添加托管校验
              </Button>
            }
            title="添加 DCV 托管校验"
            initialValues={{
              domain: "",
              targetDomainId: domainOptions[0]?.value ?? "",
              targetRecordName: "",
              dcvTemplateId: defaultDcvTemplate?.id ?? "",
            }}
            pending={save.isPending}
            onSubmit={(values, close) => {
              const usesCustomTemplate = values.dcvTemplateId === CUSTOM_TEMPLATE_VALUE;
              const selectedTemplate = selectedDcvTemplate(values, dcvSettings, defaultDcvTemplate);
              if (!usesCustomTemplate && !selectedTemplate) {
                toast.add({ title: "所选模板不存在，请重新选择", type: "error" });
                return;
              }
              if (!allowedDomain(String(values.domain ?? ""), selectedTemplate)) {
                toast.add({ title: "该证书域名不在允许托管的域名范围内", type: "error" });
                return;
              }
              if (selectedTemplate && !selectedTemplate.targetDomainId) {
                toast.add({ title: "所选模板尚未配置 CNAME 目标域名", type: "error" });
                return;
              }
              save.mutate(
                {
                  body: usesCustomTemplate
                    ? {
                        domain: values.domain,
                        targetDomainId: Number(values.targetDomainId),
                        targetRecordName: values.targetRecordName,
                        dcvTemplateId: null,
                      }
                    : {
                        domain: values.domain,
                        dcvTemplateId: selectedTemplate?.id,
                      },
                },
                { onSuccess: close },
              );
            }}
          >
            {(values, onChange) => (
              <DcvTemplateFields
                values={values}
                onChange={onChange}
                settings={dcvSettings}
                defaultTemplate={defaultDcvTemplate}
                domainOptions={domainOptions}
                domainEditable
              />
            )}
          </FormDialog>
        }
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <form
            className="grid gap-2 md:grid-cols-[minmax(14rem,1fr)_12rem_8rem_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQueryText(search.trim());
            }}
          >
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索证书域名"
              />
            </div>
            <Select
              items={[
                { value: "id", label: "按添加顺序" },
                { value: "domain", label: "按证书域名" },
                { value: "status", label: "按验证状态" },
                { value: "addedAt", label: "按添加时间" },
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
                  <SelectItem value="domain">按证书域名</SelectItem>
                  <SelectItem value="status">按验证状态</SelectItem>
                  <SelectItem value="addedAt">按添加时间</SelectItem>
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
          {form.isError ? (
            <QueryError error={form.error} retry={() => void form.refetch()} />
          ) : null}
          {settings.isError ? (
            <QueryError error={settings.error} retry={() => void settings.refetch()} />
          ) : null}
          {query.isError ? (
            <QueryError
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : query.isPending ? (
            <LoadingTable />
          ) : (
            <DataTable
              rows={query.data.data}
              columns={columns}
              rowKey={(item) => String(item.id)}
              emptyTitle="暂无 DCV 托管校验"
            />
          )}
          {query.data ? (
            <ListPagination meta={query.data.meta} onPageChange={setPage} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
