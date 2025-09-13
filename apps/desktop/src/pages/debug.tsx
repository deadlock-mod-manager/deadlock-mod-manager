import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePersistedStore } from '@/lib/store';

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
      <h1>State: </h1>
      <State />
      <Button onClick={() => toast('Hello, world!')}>Toast</Button>
    </div>
  );
};

export default Debug;
