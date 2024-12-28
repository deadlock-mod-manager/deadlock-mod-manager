"use client";

import { RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";

type Status = "operational" | "downtime" | "degraded";

interface StatusWidgetProps {
  className?: string;
}

export const StatusWidget: React.FC<StatusWidgetProps> = ({ className }) => {
  const [status, setStatus] = useState<Status>("operational");
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/status", {
        cache: 'no-store'
      });
      const data = await response.json();
      setStatus(data.status.toLowerCase() as Status);
    } catch (error) {
      console.error("Failed to fetch status:", error);
      setStatus("downtime");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

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
    }
  };

  return (
    <div className={`flex items-center gap-2 justify-center ${className}`}>
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-secondary">
        <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
        <span className="text-sm">
          {loading ? "Checking status..." : getStatusText()}
        </span>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="ml-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label="Refresh status"
        >
          <RefreshCwIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}; 