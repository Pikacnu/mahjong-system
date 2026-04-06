export const WORKER_MEMORY_LIMIT: number =
  parseInt(process.env.WORKER_MEMORY_LIMIT || '') || 24 * Math.pow(1024, 2);
export const TASK_TIMEOUT_MS: number =
  parseInt(process.env.TASK_TIMEOUT_MS || '') || 5 * 1000;

export const VM_MAX_STACK_SIZE: number =
  parseInt(process.env.VM_MAX_STACK_SIZE || '') || 1024 * 1024;
export const VM_EXECUTION_TIMEOUT_MS: number =
  parseInt(process.env.VM_EXECUTION_TIMEOUT_MS || '') || 5 * 1000;

export const MAX_WORKERS: number = parseInt(process.env.MAX_WORKERS || '') || 8;
export const MIN_WORKERS: number = parseInt(process.env.MIN_WORKERS || '') || 1;
export const MAX_TASKS_PER_WORKER: number =
  parseInt(process.env.MAX_TASKS_PER_WORKER || '') || 1;

export const API_KEY: string = process.env.API_KEY || '';

export const FUNCTION_STORAGE_URL: string =
  process.env.FUNCTION_STORAGE_URL || 'http://localhost:4001';

export const RELOAD_BUILTIN_INTERVAL: number =
  parseInt(process.env.RELOAD_BUILTIN_INTERVAL || '') || 5 * 60 * 1000;
