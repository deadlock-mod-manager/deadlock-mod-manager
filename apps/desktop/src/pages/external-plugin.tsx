import { useParams } from "react-router";
import { PluginLoadError } from "@/components/plugins/page/plugin-load-error";
import { NotInstalledState } from "@/components/plugins/page/not-installed-state";
import { PluginPage } from "@/components/plugins/page/plugin-page";
import { useExternalPlugins } from "@/hooks/use-external-plugins";

const ExternalPluginPage = () => {
  const { pluginId = "" } = useParams();
  const pluginsQuery = useExternalPlugins();
  const plugin = pluginsQuery.data?.find((entry) => entry.id === pluginId);

  if (pluginsQuery.isPending) return null;
  if (pluginsQuery.isError && !plugin) {
    return (
      <PluginLoadError
        error={pluginsQuery.error}
        onRetry={() => void pluginsQuery.refetch()}
      />
    );
  }
  if (!plugin) {
    return (
      <div className='flex h-full min-h-0 w-full flex-1 flex-col'>
        <NotInstalledState />
      </div>
    );
  }
  return <PluginPage key={plugin.id} plugin={plugin} />;
};

export default ExternalPluginPage;
