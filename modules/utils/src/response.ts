export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

export function createErrorResponse(
  code: string,
  message: string,
  details?: Record<string, any>,
): ApiResponse<any> {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}
