"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { getApiErrorMessage } from "@/lib/apiError";
import { adminRepository } from "@/services/repositories/admin.repository";
import { useAdminAuthStore } from "@/store/admin-auth-store";

export default function AdminLoginPage() {
  const router = useRouter();
  const login = useAdminAuthStore((state) => state.login);
  const [email, setEmail] = useState("ops@ridespot.app");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await adminRepository.login({ email, password });
      login({ token: response.token, admin: response.admin });
      router.replace("/admin/hotspots");
    } catch (loginError) {
      setError(getApiErrorMessage(loginError, "Email or password is incorrect."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F4F6F8] px-4 py-8 text-ink">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <div className="rounded-lg border border-[#E4E7EC] bg-white p-6 shadow-soft">
          <Logo href="/admin/hotspots" />
          <div className="mt-8 flex size-12 items-center justify-center rounded-lg bg-brand-soft text-brand-deep">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="mt-5 text-2xl font-bold">Admin sign in</h1>
          <p className="mt-2 text-sm font-medium text-[#667085]">
            Manage live demand, market settings, events, and notifications.
          </p>

          <form onSubmit={submitLogin} className="mt-8 space-y-4">
            <label className="block">
              <span className="text-sm font-bold">Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                className="mt-2 h-12 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-sm font-semibold outline-none focus:border-ink"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold">Password</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                className="mt-2 h-12 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-sm font-semibold outline-none focus:border-ink"
                placeholder="Enter admin password"
              />
            </label>

            {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-lg bg-ink px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
