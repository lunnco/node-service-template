// src/shared/config/env.ts
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local first, fallback to .env
const envFile = resolve(process.cwd(), '.env.local');
const fallbackEnvFile = resolve(process.cwd(), '.env');

config({ path: envFile });
config({ path: fallbackEnvFile }); // Fallback if .env.local doesn't exist
