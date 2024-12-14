import { QueryClient, QueryClientProvider } from 'react-query'
import { Outlet } from 'react-router'
import { Layout } from './layout'
import { cn } from './lib/utils'
const queryClient = new QueryClient()

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <Layout>
        <div className={cn('flex p-8')}>
          <Outlet />
        </div>
      </Layout>
    </QueryClientProvider>
  )
}

export default App
