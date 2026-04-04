export interface DbHealth {
  alive: boolean;
  error?: string;
}

export interface RedisHealth {
  alive: boolean;
  error?: string;
  configured: boolean;
}

export interface DiscordHealth {
  alive: boolean;
  error?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  db: DbHealth;
  redis: RedisHealth;
  discord: DiscordHealth;
  version: string;
}
