export interface DbHealth {
  alive: boolean;
  error?: string;
}

export interface RedisHealth {
  alive: boolean;
  error?: string;
  configured: boolean;
}

export interface S3Health {
  alive: boolean;
  error?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  db: DbHealth;
  redis: RedisHealth;
  s3: S3Health;
  version: string;
  uptime?: number;
  timestamp?: string;
}
