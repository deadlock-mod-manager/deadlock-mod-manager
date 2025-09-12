import { ModStatusIcon } from '@/components/mod-status-icon';
import { ModStatus } from '@/types/mods';

const ModIcons = () => {
  return Object.values(ModStatus).map((status) => (
    <div className="flex items-center gap-2" key={status}>
      <ModStatusIcon status={status} /> <span>{status}</span>
    </div>
  ));
};

const Debug = () => {
  return (
    <div>
      <h1>Mod Icons: </h1>
      <div className="flex flex-wrap gap-2">
        <ModIcons />
      </div>
    </div>
  );
};

export default Debug;
