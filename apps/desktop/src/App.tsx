import { Outlet } from 'react-router'
import { Layout } from './layout'
import { cn } from './lib/utils'

const App = () => {
  return (
    <Layout>
      <div className={cn('p-4')}>
        <Outlet />
      </div>
    </Layout>
  )
}

export default App
