export interface DbHealth {
  alive: boolean;
  error?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: DbHealth;
}
