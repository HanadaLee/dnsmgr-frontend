import type { LucideIcon } from "lucide-react";
import { useEffect } from "react";
import {
  BookOpenIcon,
  CalendarClockIcon,
  ChevronsUpDownIcon,
  CloudIcon,
  FileClockIcon,
  GaugeIcon,
  Globe2Icon,
  KeyRoundIcon,
  LogOutIcon,
  MoonIcon,
  NetworkIcon,
  RadioTowerIcon,
  ScanSearchIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SunIcon,
  TagsIcon,
  UserRoundIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useSession } from "@/auth/session-context";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { initials } from "@/lib/format";

type NavItem = {
  to?: string;
  href?: string;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  exact?: boolean;
};
type NavGroup = { label: string; items: NavItem[] };

const titleMap: Array<[RegExp, string]> = [
  [/^\/domains\/\d+/, "解析记录"],
  [/^\/domains/, "域名管理"],
  [/^\/domain-accounts/, "域名账户"],
  [/^\/domain-categories/, "域名分类"],
  [/^\/record-tools/, "高级解析工具"],
  [/^\/monitoring/, "解析监控"],
  [/^\/schedules/, "定时任务"],
  [/^\/optimize-ip/, "优选 IP"],
  [/^\/certificate-accounts/, "证书账户"],
  [/^\/certificate-orders/, "证书订单"],
  [/^\/certificate-deployments/, "自动部署"],
  [/^\/certificate-cnames/, "CNAME 代理"],
  [/^\/certificate-settings/, "证书设置"],
  [/^\/cloudflare/, "Cloudflare"],
  [/^\/users/, "用户管理"],
  [/^\/logs/, "操作日志"],
  [/^\/system/, "系统设置"],
  [/^\/profile/, "个人资料"],
  [/^\/$/, "运行概览"],
];

function currentTitle(pathname: string): string {
  return (
    titleMap.find(([pattern]) => pattern.test(pathname))?.[1] ?? "DNS 控制台"
  );
}

export function AppShell() {
  return (
    <SidebarProvider>
      <AppShellContent />
    </SidebarProvider>
  );
}

function AppShellContent() {
  const session = useSession();
  const location = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const { setOpenMobile } = useSidebar();
  const closeMobileSidebar = () => setOpenMobile(false);

  useEffect(() => {
    setOpenMobile(false);
  }, [location.key, location.pathname, setOpenMobile]);

  const capabilities = session.capabilities;
  const groups: NavGroup[] = [
    {
      label: "概览",
      items: [
        {
          to: "/",
          label: "运行概览",
          icon: GaugeIcon,
          enabled: capabilities.dashboard,
          exact: true,
        },
      ],
    },
    {
      label: "DNS 管理",
      items: [
        {
          to: "/domains",
          label: "域名管理",
          icon: Globe2Icon,
          enabled: capabilities.domains,
        },
        {
          to: "/domain-accounts",
          label: "域名账户",
          icon: KeyRoundIcon,
          enabled: capabilities.domainAccounts,
        },
        {
          to: "/domain-categories",
          label: "域名分类",
          icon: TagsIcon,
          enabled: capabilities.domainCategories,
        },
        {
          to: "/record-tools",
          label: "高级解析",
          icon: ScanSearchIcon,
          enabled: capabilities.domains && session.user.type !== "domain",
        },
      ],
    },
    {
      label: "自动化",
      items: [
        {
          to: "/monitoring",
          label: "解析监控",
          icon: RadioTowerIcon,
          enabled: capabilities.monitoring,
        },
        {
          to: "/schedules",
          label: "定时任务",
          icon: CalendarClockIcon,
          enabled: capabilities.schedules,
        },
        {
          to: "/optimize-ip",
          label: "优选 IP",
          icon: ZapIcon,
          enabled: capabilities.optimizeIp,
        },
      ],
    },
    {
      label: "证书",
      items: [
        {
          to: "/certificate-accounts",
          label: "证书账户",
          icon: KeyRoundIcon,
          enabled: capabilities.certificates,
        },
        {
          to: "/certificate-orders",
          label: "证书订单",
          icon: ShieldCheckIcon,
          enabled: capabilities.certificates,
        },
        {
          to: "/certificate-deployments",
          label: "自动部署",
          icon: FileClockIcon,
          enabled: capabilities.certificates,
        },
        {
          to: "/certificate-cnames",
          label: "CNAME 代理",
          icon: NetworkIcon,
          enabled: capabilities.certificates,
        },
        {
          to: "/certificate-settings",
          label: "证书设置",
          icon: SettingsIcon,
          enabled: capabilities.certificates,
        },
      ],
    },
    {
      label: "Cloudflare",
      items: [
        {
          to: "/cloudflare",
          label: "Cloudflare",
          icon: CloudIcon,
          enabled: capabilities.domains && capabilities.domainAccounts,
        },
      ],
    },
    {
      label: "管理",
      items: [
        {
          to: "/users",
          label: "用户管理",
          icon: UsersIcon,
          enabled: capabilities.users,
        },
        {
          to: "/logs",
          label: "操作日志",
          icon: ScrollTextIcon,
          enabled: capabilities.logs,
        },
        {
          to: "/system",
          label: "系统设置",
          icon: SettingsIcon,
          enabled: capabilities.systemSettings,
        },
        {
          href: "https://www.showdoc.com.cn/dnsmgr/11058996709621562",
          label: "接口文档",
          icon: BookOpenIcon,
          enabled: capabilities.systemSettings,
        },
      ],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.enabled),
    }))
    .filter((group) => group.items.length);

  return (
    <>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="p-3 group-data-[collapsible=icon]:p-2">
          <NavLink
            to="/"
            onClick={closeMobileSidebar}
            className="flex h-10 items-center gap-2.5 overflow-hidden rounded-lg px-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <NetworkIcon />
            </span>
            <span className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm font-semibold">
                DNS 控制台
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                域名与证书管理
              </span>
            </span>
          </NavLink>
        </SidebarHeader>
        <SidebarContent>
          {groups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.to ?? item.href}>
                      <SidebarMenuButton
                        tooltip={item.label}
                        isActive={
                          item.to
                            ? item.exact
                              ? location.pathname === item.to
                              : location.pathname.startsWith(item.to)
                            : false
                        }
                        render={
                          item.href ? (
                            <a
                              href={item.href}
                              target="_blank"
                              rel="noreferrer"
                              onClick={closeMobileSidebar}
                            />
                          ) : (
                            <NavLink
                              to={item.to ?? "/"}
                              end={item.exact}
                              onClick={closeMobileSidebar}
                            />
                          )
                        }
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="p-3">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="flex w-full items-center gap-2 rounded-lg p-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0" />
              }
            >
              <Avatar size="sm">
                {session.user.avatar ? (
                  <AvatarImage src={session.user.avatar} alt="" />
                ) : null}
                <AvatarFallback>
                  {initials(session.user.displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <span className="block truncate text-xs font-medium">
                  {session.user.displayName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {session.user.email ?? session.user.name}
                </span>
              </span>
              <ChevronsUpDownIcon className="group-data-[collapsible=icon]:hidden" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{session.user.displayName}</DropdownMenuLabel>
                <DropdownMenuItem
                  render={
                    <NavLink to="/profile" onClick={closeMobileSidebar} />
                  }
                >
                  <UserRoundIcon />
                  个人资料
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    setTheme(resolvedTheme === "dark" ? "light" : "dark")
                  }
                >
                  {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
                  {resolvedTheme === "dark" ? "切换到浅色" : "切换到深色"}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  render={<a href={session.sso.logoutPath} />}
                >
                  <LogOutIcon />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="my-auto h-4" />
          <span className="text-sm font-medium">
            {currentTitle(location.pathname)}
          </span>
          <Button
            className="ml-auto"
            size="icon-sm"
            variant="ghost"
            aria-label={
              resolvedTheme === "dark" ? "切换到浅色主题" : "切换到深色主题"
            }
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
        </header>
        <main className="flex-1 bg-muted/20 px-4 py-6 md:px-6 md:py-8">
          <div className="mx-auto w-full max-w-[1500px]">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </>
  );
}
