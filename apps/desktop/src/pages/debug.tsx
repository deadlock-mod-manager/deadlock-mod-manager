import { toast } from 'sonner';
import { ModStatusIcon } from '@/components/mod-status-icon';
import { Button } from '@/components/ui/button';
import { usePersistedStore } from '@/lib/store';
import { ModStatus } from '@/types/mods';

const ModIcons = () => {
  return Object.values(ModStatus).map((status) => (
    <div className="flex items-center gap-2" key={status}>
      <ModStatusIcon status={status} /> <span>{status}</span>
    </div>
  ));
};

const State = () => {
  const { localMods } = usePersistedStore();
  return (
    <pre className="h-[250px] w-full overflow-auto">
      {JSON.stringify(localMods, null, 2)}
    </pre>
  );
};

const Debug = () => {
  return (
    <div>
      <h1>Mod Icons: </h1>
      <div className="flex flex-wrap gap-2">
        <ModIcons />
      </div>
      <h1>State: </h1>
      <State />
      <Button onClick={() => toast('Hello, world!')}>Toast</Button>
    </div>
  );
};

export default Debug;
