import ErrorBoundary from '@/components/error-boundary'
import { ModsTable } from '@/components/mods-table'
import { usePersistedStore } from '@/lib/store'

const MyMods = () => {
  const mods = usePersistedStore((state) => state.mods)
  return (
    <div className="h-[calc(100vh-160px)] overflow-y-auto px-4 gap-4 w-full scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin">
      <h3 className="text-2xl font-bold mb-4">My Mods</h3>
      <ErrorBoundary>
        <ModsTable mods={mods} />
      </ErrorBoundary>
    </div>
  )
}

export default MyMods
