import {
  GaugeIcon,
  Globe2Icon,
  LogOutIcon,
  NetworkIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { useSession } from '@/auth/session-context'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
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
} from '@/components/ui/sidebar'

function initials(value: string): string {
  const trimmed = value.trim()
  return trimmed ? Array.from(trimmed).slice(0, 2).join('').toUpperCase() : 'DNS'
}

function currentTitle(pathname: string): string {
  if (/^\/domains\/\d+/.test(pathname)) return '解析记录'
  if (pathname.startsWith('/domains')) return '域名管理'
  return '运行概览'
}

export function AppShell() {
  const session = useSession()
  const location = useLocation()
  const navigation = [
    { to: '/', label: '运行概览', icon: GaugeIcon, enabled: true, end: true },
    { to: '/domains', label: '域名管理', icon: Globe2Icon, enabled: session.capabilities.domains, end: false },
  ].filter((item) => item.enabled)

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="p-3">
          <NavLink to="/" className="flex h-10 items-center gap-2.5 overflow-hidden rounded-lg px-1.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <NetworkIcon />
            </span>
            <span className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm font-semibold">DNS 控制台</span>
              <span className="block truncate text-[11px] text-sidebar-foreground/55">dnsmgr helper</span>
            </span>
          </NavLink>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>控制台</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigation.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      tooltip={item.label}
                      isActive={item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)}
                      render={<NavLink to={item.to} end={item.end} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <div className="flex items-center gap-2 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/50 p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
            <Avatar size="sm">
              {session.user.avatar ? <AvatarImage src={session.user.avatar} alt="" /> : null}
              <AvatarFallback>{initials(session.user.displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-xs font-medium">{session.user.displayName}</p>
              <p className="truncate text-[11px] text-sidebar-foreground/55">{session.user.email ?? session.user.name}</p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              className="group-data-[collapsible=icon]:hidden"
              title="退出登录"
              nativeButton={false}
              render={<a href={session.sso.logoutPath} />}
            >
              <LogOutIcon data-icon="inline-start" />
            </Button>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-svh overflow-hidden">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium">{currentTitle(location.pathname)}</span>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant={session.sso.profileVerified ? 'default' : 'outline'} className="hidden sm:flex">
              <ShieldCheckIcon data-icon="inline-start" />
              {session.sso.profileVerified ? 'CAS 已验证' : 'dnsmgr 会话'}
            </Badge>
            <Badge variant="secondary">只读</Badge>
          </div>
        </header>
        <main className="flex-1 bg-muted/20 px-4 py-6 md:px-6 md:py-8">
          <div className="mx-auto w-full max-w-[1500px]">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
