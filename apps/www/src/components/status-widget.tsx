import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RefreshCwIcon } from "lucide-react";
import { orpc } from "@/utils/orpc";

type StatusWidgetProps = {
  className?: string;
};

export const StatusWidget: React.FC<StatusWidgetProps> = ({ className }) => {
  const statusQuery = useQuery(orpc.getStatus.queryOptions());

  const status = statusQuery.data?.status || "operational";
  const loading = statusQuery.isLoading;

  const getStatusColor = () => {
    switch (status) {
      case "operational":
        return "bg-green-500";
      case "downtime":
        return "bg-red-500";
      case "degraded":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "operational":
        return "All systems are operational";
      case "downtime":
        return "All systems are down";
      case "degraded":
        return "Some systems are degraded";
      default:
        return "Unknown status";
    }
  };

  const refetchStatus = () => {
    statusQuery.refetch();
  };

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <div className='flex items-center gap-2 rounded-full border border-secondary bg-card px-3 py-1'>
        <div className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
        <Link className='text-sm' to='/status'>
          {loading ? "Checking status..." : getStatusText()}
        </Link>
        <button
          aria-label='Refresh status'
          className='ml-2 text-muted-foreground hover:text-foreground disabled:opacity-50'
          disabled={loading}
          onClick={refetchStatus}>
          <RefreshCwIcon className='h-3 w-3' />
        </button>
      </div>
    </div>
  );
};
