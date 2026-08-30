import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ApiClientError } from '@/api/client'
import { AuthBoundary } from '@/auth/session'
import { AppShell } from '@/components/app-shell'
import { DashboardPage } from '@/pages/dashboard-page'
import { DomainsPage } from '@/pages/domains-page'
import { RecordsPage } from '@/pages/records-page'

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={routerBase}>
        <Routes>
          <Route element={<AuthBoundary />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="domains" element={<DomainsPage />} />
              <Route path="domains/:domainId" element={<RecordsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
