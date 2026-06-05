export function getApiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as {
    response?: {
      data?: {
        error?: {
          code?: string;
          message?: string;
        };
      };
    };
  };

  return apiError.response?.data?.error?.message ?? fallback;
}

export function getApiErrorCode(error: unknown) {
  const apiError = error as {
    response?: {
      data?: {
        error?: {
          code?: string;
        };
      };
    };
  };

  return apiError.response?.data?.error?.code ?? null;
}
