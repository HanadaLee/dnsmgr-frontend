import { useSearchParams } from "react-router-dom";

import type { CertificateAccountKind } from "@/api/types";
import { useSession } from "@/auth/session-context";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CertificateAccountCreateButton,
  CertificateAccountsPage,
} from "@/pages/certificate-accounts-page";
import {
  DomainAccountCreateButton,
  DomainAccountsPage,
} from "@/pages/domain-accounts-page";

type AccountTab = "domains" | CertificateAccountKind;

export function AccountsPage() {
  const session = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs: Array<{ value: AccountTab; label: string }> = [
    ...(session.capabilities.domainAccounts
      ? [{ value: "domains" as const, label: "域名账户" }]
      : []),
    ...(session.capabilities.certificates
      ? [
          { value: "issuance" as const, label: "CA账户" },
          { value: "deployment" as const, label: "部署账户" },
        ]
      : []),
  ];
  const requestedTab = searchParams.get("tab");
  const activeTab = tabs.some((tab) => tab.value === requestedTab)
    ? (requestedTab as AccountTab)
    : (tabs[0]?.value ?? "domains");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="管理"
        title="账户管理"
        description="统一管理域名、证书签发和证书部署所需的平台账户。"
      />
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setSearchParams({ tab: value }, { replace: true })
        }
      >
        <div className="flex items-center justify-between gap-4">
          <TabsList variant="line">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {activeTab === "domains" && session.capabilities.domainAccounts ? (
            <DomainAccountCreateButton />
          ) : activeTab !== "domains" && session.capabilities.certificates ? (
            <CertificateAccountCreateButton kind={activeTab} />
          ) : null}
        </div>
        {session.capabilities.domainAccounts ? (
          <TabsContent value="domains">
            <DomainAccountsPage />
          </TabsContent>
        ) : null}
        {session.capabilities.certificates ? (
          <>
            <TabsContent value="issuance">
              <CertificateAccountsPage kind="issuance" />
            </TabsContent>
            <TabsContent value="deployment">
              <CertificateAccountsPage kind="deployment" />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
}
