import { QueryClient, QueryClientProvider } from 'react-query'
import { Outlet } from 'react-router'
import { AppProvider } from './components/providers/app'
import { ThemeProvider } from './components/providers/theme'
import { TooltipProvider } from './components/ui/tooltip'
import { Layout } from './layout'
import { cn } from './lib/utils'

const queryClient = new QueryClient()

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="deadlock-theme">
        <AppProvider>
          <TooltipProvider>
            <Layout>
              <div className={cn('flex p-8')}>
                <Outlet />
              </div>
            </Layout>
          </TooltipProvider>
        </AppProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
