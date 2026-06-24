import axios from "axios";

export const adminApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 15000
});

adminApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("ridespot_admin_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  config.headers["Content-Type"] = "application/json";
  return config;
});

adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const errorCode = error.response?.data?.error?.code;
    const shouldClearSession = errorCode === "UNAUTHORIZED" || errorCode === "FORBIDDEN";

    if (typeof window !== "undefined" && (status === 401 || status === 403)) {
      const requestUrl = String(error.config?.url ?? "");
      if (requestUrl.includes("/api/admin/auth/login")) {
        return Promise.reject(error);
      }

      if (!shouldClearSession) {
        return Promise.reject(error);
      }

      window.localStorage.removeItem("ridespot_admin_token");
      window.localStorage.removeItem("ridespot-admin-auth");
      window.location.href = "/admin/login";
    }

    return Promise.reject(error);
  }
);
