export const HEALTH_OPTIONS = Symbol('HEALTH_OPTIONS');

export interface HealthOptions {
  database?: boolean;
  rabbitmq?: boolean;
}
