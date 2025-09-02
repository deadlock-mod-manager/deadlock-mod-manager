'use client';

import { RefreshCwIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Status = 'operational' | 'downtime' | 'degraded';

type StatusWidgetProps = {
  className?: string;
};

export const StatusWidget: React.FC<StatusWidgetProps> = ({ className }) => {
  const [status, setStatus] = useState<Status>('operational');
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/status', {
        cache: 'no-store',
      });
      const data = await response.json();
      setStatus(data.status.toLowerCase() as Status);
    } catch (_error) {
      setStatus('downtime');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const getStatusColor = () => {
    switch (status) {
      case 'operational':
        return 'bg-green-500';
      case 'downtime':
        return 'bg-red-500';
      case 'degraded':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'operational':
        return 'All systems are operational';
      case 'downtime':
        return 'All systems are down';
      case 'degraded':
        return 'Some systems are degraded';
      default:
        return 'Unknown status';
    }
  };

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <div className="flex items-center gap-2 rounded-full border border-secondary bg-card px-3 py-1">
        <div className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
        <Link className="text-sm" href="/status" target="_blank">
          {loading ? 'Checking status...' : getStatusText()}
        </Link>
        <button
          aria-label="Refresh status"
          className="ml-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
          disabled={loading}
          onClick={fetchStatus}
        >
          <RefreshCwIcon className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};
