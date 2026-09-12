import { useSearchParams } from "react-router-dom";

import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AxisNowDomainsPage } from "@/pages/axisnow-domains-page";
import { AxisNowEipsPage } from "@/pages/axisnow-eips-page";
import { AxisNowRulesPage } from "@/pages/axisnow-rules-page";
import { AxisNowTagsPage } from "@/pages/axisnow-tags-page";

type AxisNowTab = "domains" | "eips" | "tags";

const tabs: Array<{ value: AxisNowTab; label: string }> = [
  { value: "domains", label: "DNS 路由" },
  { value: "eips", label: "EIP 管理" },
  { value: "tags", label: "标签管理" },
];

export function AxisNowPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = tabs.some((tab) => tab.value === requestedTab)
    ? (requestedTab as AxisNowTab)
    : "domains";
  const accountId = Number(searchParams.get("accountId"));
  const domainUuid = searchParams.get("domainUuid") ?? "";
  const domainName = searchParams.get("domain")?.trim() ?? "";
  const showRules =
    activeTab === "domains" && accountId > 0 && Boolean(domainUuid);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="第三方高级功能"
        title={showRules && domainName ? domainName : "AxisNow调度"}
        description={showRules ? "管理当前域名的 AxisNow DNS 路由规则。" : "集中管理 AxisNow DNS 路由、EIP 和标签。"}
      />
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setSearchParams({ tab: value }, { replace: true })
        }
      >
        <TabsList variant="line">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="domains">
          {showRules ? (
            <AxisNowRulesPage
              accountId={accountId}
              domainUuid={domainUuid}
            />
          ) : (
            <AxisNowDomainsPage />
          )}
        </TabsContent>
        <TabsContent value="eips">
          <AxisNowEipsPage />
        </TabsContent>
        <TabsContent value="tags">
          <AxisNowTagsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
