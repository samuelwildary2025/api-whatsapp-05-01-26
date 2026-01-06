import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
    // Server
    PORT: z.string().default('3000'),
    HOST: z.string().default('0.0.0.0'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // Database
    DATABASE_URL: z.string(),

    // Redis
    REDIS_URL: z.string().default('redis://localhost:6379'),

    // JWT
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('7d'),

    // Admin
    ADMIN_TOKEN: z.string().min(16),

    // Logs
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // Webhooks
    WEBHOOK_TIMEOUT: z.string().default('30000'),
    WEBHOOK_RETRY_ATTEMPTS: z.string().default('3'),

    // WhatsApp
    WA_SESSION_PATH: z.string().default('./sessions'),
    WA_MAX_INSTANCES: z.string().default('10'),

    // Whatsmeow service
    WHATSMEOW_URL: z.string().default('http://localhost:8081'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.format());
    process.exit(1);
}

export const env = {
    port: parseInt(parsed.data.PORT),
    host: parsed.data.HOST,
    nodeEnv: parsed.data.NODE_ENV,
    isDev: parsed.data.NODE_ENV === 'development',
    isProd: parsed.data.NODE_ENV === 'production',

    databaseUrl: parsed.data.DATABASE_URL,
    redisUrl: parsed.data.REDIS_URL,

    jwtSecret: parsed.data.JWT_SECRET,
    jwtExpiresIn: parsed.data.JWT_EXPIRES_IN,

    adminToken: parsed.data.ADMIN_TOKEN,

    logLevel: parsed.data.LOG_LEVEL,

    webhookTimeout: parseInt(parsed.data.WEBHOOK_TIMEOUT),
    webhookRetryAttempts: parseInt(parsed.data.WEBHOOK_RETRY_ATTEMPTS),

    waSessionPath: parsed.data.WA_SESSION_PATH,
    waMaxInstances: parseInt(parsed.data.WA_MAX_INSTANCES),

    // Whatsmeow service URL (Go microservice)
    whatsmeowUrl: parsed.data.WHATSMEOW_URL,
};

export type Env = typeof env;
