export const PORT: number = parseInt(process.env.PORT || '3000');
// Bind host selection:
// - honor explicit BIND_HOST if provided
// - when running inside Kubernetes, bind to 0.0.0.0 so port-forward and NodePort work
// - otherwise fall back to process.env.HOSTNAME or localhost
export const HOSTNAME: string =
  process.env.BIND_HOST ||
  (process.env.KUBERNETES_SERVICE_HOST
    ? '0.0.0.0'
    : process.env.HOSTNAME || 'localhost');
export const GRPC_PORT: number = parseInt(process.env.GRPC_PORT || '4001');
export const FUNCTION_STORAGE_HOSTNAME: string =
  process.env.STORAGE_HOSTNAME || 'storage-service';
export const PLUGIN_RUNNER_HOSTNAME: string =
  process.env.PLUGIN_RUNNER_HOSTNAME || 'plugin-runner-service';
export const GAME_SERVER_HOSTNAME: string =
  process.env.GAME_SERVER_HOSTNAME || 'game-server-service';
