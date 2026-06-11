export function getApiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as {
    response?: {
      data?: {
        error?: {
          code?: string;
          message?: string;
          details?: {
            providerMessage?: string;
          };
        };
      };
    };
  };

  return (
    apiError.response?.data?.error?.message ??
    apiError.response?.data?.error?.details?.providerMessage ??
    fallback
  );
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
