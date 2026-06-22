import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 15000
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("ridespot_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  config.headers["Content-Type"] = "application/json";
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const errorCode = error.response?.data?.error?.code;
    const errorMessage = String(error.response?.data?.error?.message ?? "");
    const tokenHasExpired = errorCode === "FORBIDDEN" && /expired/i.test(errorMessage);
    const shouldClearSession = errorCode === "UNAUTHORIZED" || tokenHasExpired;

    if (typeof window !== "undefined" && (status === 401 || status === 403)) {
      const requestUrl = String(error.config?.url ?? "");
      const authFormHandlesError = requestUrl.includes("/api/auth/login");

      if (authFormHandlesError || !shouldClearSession) {
        return Promise.reject(error);
      }

      window.localStorage.removeItem("ridespot_token");
      window.localStorage.removeItem("ridespot-auth");
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);
