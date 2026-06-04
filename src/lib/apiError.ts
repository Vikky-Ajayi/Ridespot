export function getApiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as {
    response?: {
      data?: {
        error?: {
          message?: string;
        };
      };
    };
  };

  return apiError.response?.data?.error?.message ?? fallback;
}
