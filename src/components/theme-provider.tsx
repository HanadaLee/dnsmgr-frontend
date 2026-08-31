import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'
type ThemeContextValue = { theme: Theme; resolvedTheme: 'light' | 'dark'; setTheme: (theme: Theme) => void }

const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('dnsmgr-theme')
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  })
  const [system, setSystem] = useState<'light' | 'dark'>(systemTheme)
  const resolvedTheme = theme === 'system' ? system : theme

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const change = () => setSystem(media.matches ? 'dark' : 'light')
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const value = useMemo(() => ({
    theme,
    resolvedTheme,
    setTheme: (next: Theme) => {
      localStorage.setItem('dnsmgr-theme', next)
      setThemeState(next)
    },
  }), [resolvedTheme, theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme 必须在 ThemeProvider 中使用')
  return value
}
