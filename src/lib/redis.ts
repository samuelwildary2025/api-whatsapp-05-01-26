// @ts-nocheck - ioredis is CommonJS
import IORedis from 'ioredis';
import { env } from '../config/env.js';

export const redis = new IORedis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

redis.on('error', (err: Error) => {
    console.error('Redis connection error:', err);
});

redis.on('connect', () => {
    console.log('✅ Redis connected');
});
