export function getApiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as {
    response?: {
      data?: {
        error?: {
          code?: string;
          message?: string;
          details?: {
            providerMessage?: string;
            remediation?: string;
          };
        };
      };
    };
  };

  const message =
    apiError.response?.data?.error?.message ??
    apiError.response?.data?.error?.details?.providerMessage ??
    fallback;
  const remediation = apiError.response?.data?.error?.details?.remediation;

  if (remediation && !message.includes(remediation)) {
    return `${message} ${remediation}`;
  }

  return message;
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
