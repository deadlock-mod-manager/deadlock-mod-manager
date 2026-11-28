export interface DbHealth {
  alive: boolean;
  error?: string;
}

interface RetiredDependencyHealth {
  alive: false;
  configured: false;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  db: DbHealth;
  redis: RetiredDependencyHealth;
  s3: RetiredDependencyHealth;
  version: string;
  uptime: number;
  timestamp: string;
}
