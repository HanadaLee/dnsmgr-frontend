import { createContext, useContext } from 'react'

import type { WebSession } from '@/api/types'

export const SessionContext = createContext<WebSession | undefined>(undefined)

export function useSession(): WebSession {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession 必须在 AuthBoundary 内使用')
  return session
}
