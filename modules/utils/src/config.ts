export const PORT: number = parseInt(process.env.PORT || '3000');
export const HOSTNAME: string = process.env.HOSTNAME || 'localhost';
export const GRPC_PORT: number = parseInt(process.env.GRPC_PORT || '4001');
export const FUNCTION_STORAGE_HOSTNAME: string =
  process.env.STORAGE_HOSTNAME || 'storage-service';
export const PLUGIN_RUNNER_HOSTNAME: string =
  process.env.PLUGIN_RUNNER_HOSTNAME || 'plugin-runner-service';
export const GAME_SERVER_HOSTNAME: string =
  process.env.GAME_SERVER_HOSTNAME || 'game-server-service';
