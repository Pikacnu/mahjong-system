import {
  Client,
  Metadata,
  credentials,
  type CallOptions,
  type ChannelCredentials,
  type ClientOptions,
  type ClientUnaryCall,
  type ServiceError,
} from '@grpc/grpc-js';

type GrpcClientConstructor<TClient extends Client> = new (
  address: string,
  credentials: ChannelCredentials,
  options?: Partial<ClientOptions>,
) => TClient;

export type UnaryInvoke<TRequest, TResponse> = (
  request: TRequest,
  metadata: Metadata,
  options: Partial<CallOptions>,
  callback: (error: ServiceError | null, response: TResponse) => void,
) => ClientUnaryCall;

export interface UnaryCallConfig {
  metadata?: Metadata;
  options?: Partial<CallOptions>;
  deadlineMs?: number;
}

export function createGrpcClient<TClient extends Client>(
  ClientCtor: GrpcClientConstructor<TClient>,
  address: string,
  clientCredentials: ChannelCredentials = credentials.createInsecure(),
  options?: Partial<ClientOptions>,
): TClient {
  return new ClientCtor(address, clientCredentials, options);
}

export function unaryCall<TRequest, TResponse>(
  invoke: UnaryInvoke<TRequest, TResponse>,
  request: TRequest,
  config: UnaryCallConfig = {},
): Promise<TResponse> {
  const metadata = config.metadata ?? new Metadata();
  const options: Partial<CallOptions> = {
    ...(config.options ?? {}),
    ...(config.deadlineMs ? { deadline: Date.now() + config.deadlineMs } : {}),
  };

  return new Promise<TResponse>((resolve, reject) => {
    invoke(request, metadata, options, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}
