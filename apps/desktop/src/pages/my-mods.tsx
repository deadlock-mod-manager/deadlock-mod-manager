import ErrorBoundary from '@/components/error-boundary';
import { ModsTable } from '@/components/mods-table';
import PageTitle from '@/components/page-title';
import { usePersistedStore } from '@/lib/store';

const MyMods = () => {
  const mods = usePersistedStore((state) => state.mods);
  return (
    <div className="h-[calc(100vh-160px)] overflow-y-auto px-4 gap-4 w-full scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin">
      <PageTitle className="mb-8" title="My Mods" />
      <ErrorBoundary>
        <ModsTable mods={mods} />
      </ErrorBoundary>
    </div>
  );
};

export default MyMods;
