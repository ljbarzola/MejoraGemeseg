import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly redis: Redis | null;
  private readonly logger = new Logger(CacheService.name);
  private readonly DEFAULT_TTL = 60;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    const host = process.env.REDIS_HOST;
    const port = process.env.REDIS_PORT;

    if (redisUrl) {
      this.redis = new Redis(redisUrl);
      this.redis.on('error', (err) =>
        this.logger.warn(`Redis error: ${err.message}`),
      );
    } else if (host) {
      this.redis = new Redis({
        host,
        port: Number(port) || 6379,
        maxRetriesPerRequest: 3,
      });
      this.redis.on('error', (err) =>
        this.logger.warn(`Redis error: ${err.message}`),
      );
    } else {
      this.logger.warn('Redis not configured, cache disabled');
      this.redis = null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async set(
    key: string,
    value: unknown,
    ttl = this.DEFAULT_TTL,
  ): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch {}
  }

  async invalidate(pattern: string): Promise<void> {
    if (!this.redis) return;
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length) await this.redis.del(...keys);
    } catch {}
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }
}
