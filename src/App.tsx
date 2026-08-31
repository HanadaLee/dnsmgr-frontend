import { lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { ApiClientError } from '@/api/client'
import type { SessionCapabilities, WebSession } from '@/api/types'
import { AuthBoundary } from '@/auth/session'
import { useSession } from '@/auth/session-context'
import { AppShell } from '@/components/app-shell'
import { LoadingTable } from '@/components/loading-table'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toast'
const DashboardPage = lazy(() => import('@/pages/dashboard-page').then((module) => ({ default: module.DashboardPage })))
const CertificateAccountsPage = lazy(() => import('@/pages/certificate-accounts-page').then((module) => ({ default: module.CertificateAccountsPage })))
const CertificateCnamesPage = lazy(() => import('@/pages/certificate-cnames-page').then((module) => ({ default: module.CertificateCnamesPage })))
const CertificateDeploymentsPage = lazy(() => import('@/pages/certificate-deployments-page').then((module) => ({ default: module.CertificateDeploymentsPage })))
const CertificateOrdersPage = lazy(() => import('@/pages/certificate-orders-page').then((module) => ({ default: module.CertificateOrdersPage })))
const CertificateSettingsPage = lazy(() => import('@/pages/certificate-settings-page').then((module) => ({ default: module.CertificateSettingsPage })))
const CloudflarePage = lazy(() => import('@/pages/cloudflare-page').then((module) => ({ default: module.CloudflarePage })))
const DomainAccountsPage = lazy(() => import('@/pages/domain-accounts-page').then((module) => ({ default: module.DomainAccountsPage })))
const DomainCategoriesPage = lazy(() => import('@/pages/domain-categories-page').then((module) => ({ default: module.DomainCategoriesPage })))
const DomainsPage = lazy(() => import('@/pages/domains-page').then((module) => ({ default: module.DomainsPage })))
const LogsPage = lazy(() => import('@/pages/logs-page').then((module) => ({ default: module.LogsPage })))
const MonitoringPage = lazy(() => import('@/pages/monitoring-page').then((module) => ({ default: module.MonitoringPage })))
const OptimizeIpPage = lazy(() => import('@/pages/optimize-ip-page').then((module) => ({ default: module.OptimizeIpPage })))
const ProfilePage = lazy(() => import('@/pages/profile-page').then((module) => ({ default: module.ProfilePage })))
const RecordsPage = lazy(() => import('@/pages/records-page').then((module) => ({ default: module.RecordsPage })))
const RecordToolsPage = lazy(() => import('@/pages/record-tools-page').then((module) => ({ default: module.RecordToolsPage })))
const SchedulesPage = lazy(() => import('@/pages/schedules-page').then((module) => ({ default: module.SchedulesPage })))
const SystemPage = lazy(() => import('@/pages/system-page').then((module) => ({ default: module.SystemPage })))
const UsersPage = lazy(() => import('@/pages/users-page').then((module) => ({ default: module.UsersPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiClientError && error.status === 401) return false
        return failureCount < 1
      },
    },
  },
})

const routerBase = import.meta.env.BASE_URL === '/'
  ? undefined
  : import.meta.env.BASE_URL.replace(/\/$/, '')

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Toaster>
          <BrowserRouter basename={routerBase}>
            <Routes>
              <Route element={<AuthBoundary />}>
                <Route element={<AppShell />}>
                  <Route element={<Suspense fallback={<LoadingTable rows={8} />}><RouteOutlet /></Suspense>}>
                  <Route index element={<HomeRoute />} />
                  <Route path="domains" element={<CapabilityRoute capability="domains" excludeDomainUser><DomainsPage /></CapabilityRoute>} />
                  <Route path="domains/:domainId" element={<CapabilityRoute capability="domains"><RecordsPage /></CapabilityRoute>} />
                  <Route path="record-tools" element={<CapabilityRoute capability="domains" excludeDomainUser><RecordToolsPage /></CapabilityRoute>} />
                  <Route path="domain-accounts" element={<CapabilityRoute capability="domainAccounts"><DomainAccountsPage /></CapabilityRoute>} />
                  <Route path="domain-categories" element={<CapabilityRoute capability="domainCategories"><DomainCategoriesPage /></CapabilityRoute>} />
                  <Route path="monitoring" element={<CapabilityRoute capability="monitoring"><MonitoringPage /></CapabilityRoute>} />
                  <Route path="schedules" element={<CapabilityRoute capability="schedules"><SchedulesPage /></CapabilityRoute>} />
                  <Route path="optimize-ip" element={<CapabilityRoute capability="optimizeIp"><OptimizeIpPage /></CapabilityRoute>} />
                  <Route path="certificate-accounts" element={<CapabilityRoute capability="certificates"><CertificateAccountsPage /></CapabilityRoute>} />
                  <Route path="certificate-orders" element={<CapabilityRoute capability="certificates"><CertificateOrdersPage /></CapabilityRoute>} />
                  <Route path="certificate-deployments" element={<CapabilityRoute capability="certificates"><CertificateDeploymentsPage /></CapabilityRoute>} />
                  <Route path="certificate-cnames" element={<CapabilityRoute capability="certificates"><CertificateCnamesPage /></CapabilityRoute>} />
                  <Route path="certificate-settings" element={<CapabilityRoute capability="certificates"><CertificateSettingsPage /></CapabilityRoute>} />
                  <Route path="cloudflare" element={<CapabilityRoute capability="domainAccounts"><CloudflarePage /></CapabilityRoute>} />
                  <Route path="users" element={<CapabilityRoute capability="users"><UsersPage /></CapabilityRoute>} />
                  <Route path="logs" element={<CapabilityRoute capability="logs"><LogsPage /></CapabilityRoute>} />
                  <Route path="system" element={<CapabilityRoute capability="systemSettings"><SystemPage /></CapabilityRoute>} />
                  <Route path="profile" element={<ProfilePage />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </Toaster>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

function RouteOutlet() {
  return <Outlet />
}

function landingPath(session: WebSession) {
  if (session.capabilities.dashboard) return '/'
  if (session.user.domainId) return `/domains/${session.user.domainId}`
  if (session.capabilities.domains) return '/domains'
  return '/profile'
}

function HomeRoute() {
  const session = useSession()
  return session.capabilities.dashboard ? <DashboardPage /> : <Navigate to={landingPath(session)} replace />
}

function CapabilityRoute({ capability, excludeDomainUser = false, children }: {
  capability: keyof SessionCapabilities
  excludeDomainUser?: boolean
  children: React.ReactNode
}) {
  const session = useSession()
  const allowed = session.capabilities[capability] && (!excludeDomainUser || session.user.type !== 'domain')
  return allowed ? children : <Navigate to={landingPath(session)} replace />
}
