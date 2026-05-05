import { z } from 'zod';
import { ResourceType } from 'proto/src/generated/services/storage';
import { PluginHookDefinitionSchema } from 'utils';

// MethodInfo schema
export const methodInfoSchema = z.object({
  name: z.string().min(1, 'Method name is required'),
  version: z
    .number()
    .int()
    .nonnegative('Version must be a non-negative integer'),
});

// Dependency schema
export const dependencySchema = z.object({
  name: z.string().min(1, 'Dependency name is required'),
  version: z.number().int(),
});

// ===== pluginResource.ts schemas =====
export const pluginResourcePostSchema = z.object({
  methodInfo: methodInfoSchema,
  resourceType: z.number().int().min(0).max(1, 'Invalid resource type'),
  data: z.string().min(1, 'Data is required'),
  dependencies: z.array(dependencySchema).optional().default([]),
});

export const pluginResourceGetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  version: z
    .number()
    .int()
    .nonnegative('Version must be a non-negative integer'),
  resourceType: z.number().int().min(0).max(1, 'Invalid resource type'),
});

// ===== runner.ts schemas =====
export const runnerPayloadSchema = z.object({
  methodInfo: methodInfoSchema.optional(),
  code: z.string().optional(),
  payload: z
    .object({
      thisValue: z.unknown().optional(),
      args: z.array(z.unknown()).optional(),
    })
    .optional(),
  dependencies: z.array(dependencySchema).optional().default([]),
});

// ===== playerManager.ts schemas =====
export const createPlayerSchema = z.object({
  playerName: z
    .string()
    .min(1, 'Player name is required')
    .max(50, 'Player name must be at most 50 characters')
    .refine(
      (val) => !['\n', '\r', '\t'].some((char) => val.includes(char)),
      'Player name cannot contain newline, carriage return, or tab characters',
    ),
});

// ===== gameManager.ts schemas =====
export const createGameSchema = z.object({
  roomId: z.number(),
  status: z
    .enum(['waiting', 'playing', 'finished'])
    .optional()
    .default('waiting'),
});

export const getGameSchema = z.object({
  gameId: z.number().int().positive('Game ID must be a positive integer'),
});

// ===== roomManager.ts schemas =====
export const addPlayerToRoomSchema = z.object({
  playerId: z.number().int().positive('Player ID must be a positive integer'),
  roomId: z.number().int().positive('Room ID must be a positive integer'),
});

export const createRoomSchema = z.object({});

// ===== pluginManager.ts schemas =====
export const getPluginDefinitionSchema = z.object({
  methodInfo: methodInfoSchema,
});

export const storePluginDefinitionSchema = z.object({
  methodInfo: methodInfoSchema,
  defaultStore: z.record(z.string(), z.any()).optional(),
  hooks: z.array(PluginHookDefinitionSchema).optional().default([]),
});

// Helper function to handle validation errors
export function handleValidationError(error: z.ZodError<unknown>) {
  return {
    message: 'Validation failed',
    errors: error.issues.map((issue: z.ZodIssue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}
