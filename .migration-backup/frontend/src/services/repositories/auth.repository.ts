import { api } from "@/services/api";
import { mapDriverSummaryToAuthUser, unwrapData, type BackendDriverSummary, type BackendProfile } from "./shared";

type DevelopmentOtpResponse = {
  devOtp?: string;
};

export const authRepository = {
  async register(payload: {
    fullName: string;
    email: string;
    phoneNumber: string;
    country: string;
    password: string;
  }) {
    const response = await api.post("/api/auth/register", {
      fullName: payload.fullName,
      email: payload.email,
      phone: payload.phoneNumber,
      country: payload.country,
      password: payload.password
    });

    return unwrapData<DevelopmentOtpResponse>(response);
  },

  async login(payload: { email: string; password: string }) {
    const response = await api.post("/api/auth/login", payload);
    const data = unwrapData<{ token: string; driver: BackendDriverSummary }>(response);

    return {
      token: data.token,
      user: mapDriverSummaryToAuthUser(data.driver)
    };
  },

  async verifyEmail(payload: { email: string; code: string }) {
    const response = await api.post("/api/auth/verify-email", payload);
    const data = unwrapData<{ token: string; driver: BackendDriverSummary }>(response);

    return {
      token: data.token,
      user: mapDriverSummaryToAuthUser(data.driver)
    };
  },

  async resendOtp(payload: { email: string; type: "email_verification" | "password_reset" }) {
    const response = await api.post("/api/auth/resend-otp", payload);
    return unwrapData<DevelopmentOtpResponse>(response);
  },

  async forgotPassword(payload: { email: string }) {
    const response = await api.post("/api/auth/forgot-password", payload);
    return unwrapData<DevelopmentOtpResponse>(response);
  },

  async resetPassword(payload: { email: string; code: string; newPassword: string }) {
    const response = await api.post("/api/auth/reset-password", payload);
    return response.data;
  },

  async getMe() {
    const response = await api.get("/api/auth/me");
    return unwrapData<BackendProfile>(response);
  },

  async logout() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("ridespot_token");
    }
  }
};
