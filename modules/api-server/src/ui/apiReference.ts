export type ApiReferenceRow = {
  category: string;
  method: string;
  path: string;
  description: string;
  request: string;
  response: string;
  note: string;
};

export const apiReferenceRows: ApiReferenceRow[] = [
  {
    category: 'Core',
    method: 'GET',
    path: '/',
    description: 'Render the dashboard demo page.',
    request: 'Browser navigation',
    response: 'HTML page',
    note: 'Primary demo surface for the backend-first UI.',
  },
  {
    category: 'Core',
    method: 'GET',
    path: '/docs',
    description: 'Render the API documentation page.',
    request: 'Browser navigation',
    response: 'HTML page',
    note: 'Contains the full API reference and plugin teaching notes.',
  },
  {
    category: 'Core',
    method: 'GET',
    path: '/health',
    description: 'Return a basic health status.',
    request: 'None',
    response: '{ status: "ok" }',
    note: 'Used for basic service health checks.',
  },
  {
    category: 'Game',
    method: 'POST',
    path: '/api/game/management',
    description: 'Create a room and return a new gameId.',
    request: '{ status?: "waiting" | "playing" | "finished" }',
    response: '{ gameId, status, createdAt, updatedAt }',
    note: 'Main room creation endpoint.',
  },
  {
    category: 'Game',
    method: 'GET',
    path: '/api/game/management?gameId=...',
    description: 'Read the current room summary by gameId.',
    request: 'gameId query parameter',
    response: '{ gameId, status, createdAt, updatedAt }',
    note: 'Useful for room summary lookups.',
  },
  {
    category: 'Player',
    method: 'POST',
    path: '/api/player/management',
    description: 'Create a player profile.',
    request: '{ playerName }',
    response: '{ id, name }',
    note: 'Basic player registration route.',
  },
  {
    category: 'Player',
    method: 'GET',
    path: '/api/player/management?playerId=...',
    description: 'Read a player profile by playerId.',
    request: 'playerId query parameter',
    response: 'player object or null',
    note: 'Supports player lookup for the demo flow.',
  },
  {
    category: 'Room',
    method: 'POST',
    path: '/api/room/management',
    description: 'Bind a player to a room.',
    request: '{ playerId, roomId }',
    response: '{ message } or { error }',
    note: 'Used to attach a player to a game room.',
  },
  {
    category: 'Room',
    method: 'GET',
    path: '/api/room/management?gameId=...',
    description: 'Read room status and bound players.',
    request: 'gameId query parameter',
    response: '{ status, playerInfo }',
    note: 'Shows the current room binding state.',
  },
  {
    category: 'Plugin',
    method: 'POST',
    path: '/api/plugin/management',
    description: 'Register plugin metadata and default store.',
    request: '{ methodInfo, defaultStore? }',
    response: '{ message }',
    note: 'Plugin definition registration.',
  },
  {
    category: 'Plugin',
    method: 'GET',
    path: '/api/plugin/management?name=...&version=...',
    description: 'Read plugin metadata and default store.',
    request: 'name/version query parameters',
    response: '{ methodInfo, defaultStore, dependencies }',
    note: 'Browser-friendly lookup route.',
  },
  {
    category: 'Plugin',
    method: 'POST',
    path: '/api/plugin/resource',
    description: 'Upload plugin code and dependency list.',
    request: '{ methodInfo, data, resourceType, dependencies }',
    response: '{ message }',
    note: 'Executable resource upload.',
  },
  {
    category: 'Plugin',
    method: 'GET',
    path: '/api/plugin/resource?name=...&version=...&resourceType=...',
    description: 'Read the stored plugin code.',
    request: 'name/version/resourceType query parameters',
    response: '{ code, hash }',
    note: 'Gets the source payload from storage.',
  },
  {
    category: 'Runner',
    method: 'GET',
    path: '/api/runner/execute',
    description: 'Describe the temporary function-runner call shape.',
    request: 'None',
    response: 'Usage and sample request',
    note: 'Documentation helper for the temp runner endpoint.',
  },
  {
    category: 'Runner',
    method: 'POST',
    path: '/api/runner/execute',
    description:
      'Store optional code and execute a function through function-runner.',
    request: '{ methodInfo, code?, payload?, dependencies? }',
    response: '{ result, rawResult, storedCode }',
    note: 'Temporary smoke-test endpoint.',
  },
];

export const pluginDefinitionGuideSteps = [
  'Register the plugin definition first so the system knows the name, version, and defaultStore shape.',
  'Upload the plugin resource separately when you need the executable source or module payload.',
  'Keep the exported entry function small and explicit. For the temp runner endpoint, export an entry function.',
  'Use the docs page for the complete API reference and the dashboard only for the basic call flow.',
];

export const runnerQuickGuide = [
  'The temp runner endpoint expects a function name and version.',
  'If you provide code, the server stores it first through function-storage, then calls function-runner.',
  'The simplest sample is a module that exports an entry function and returns JSON-safe data.',
];

export const runtimeNotes = [
  'api-server runs migrations at startup, so the image must contain the generated migration files.',
  'For local validation, rebuild the api-server image, load it into kind, and restart only the api-server deployment.',
  'The dashboard is a demo surface and will be removed once the product UI is ready.',
];
