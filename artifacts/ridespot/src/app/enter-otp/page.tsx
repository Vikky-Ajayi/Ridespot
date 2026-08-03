"use client";

import { useState } from "react";
import { useLocation } from 'wouter';
import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { AuthShell } from "@/components/layout/AuthShell";
import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import { OtpInput } from "@/components/ui/OtpInput";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import { useOtpTimer } from "@/hooks/useOtpTimer";
import { getApiErrorMessage } from "@/lib/apiError";
import { authRepository } from "@/services/repositories";

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return "your email";
  }

  return `${local.slice(0, 4)}*****@${domain}`;
}

export default function EnterOtpPage() {
  const [, navigate] = useLocation();
  const searchParams = useLocationSearchParams();
  const email = searchParams.get("email") ?? "";
  const [otp, setOtp] = useState(searchParams.get("code") ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const { secondsRemaining, reset } = useOtpTimer(60);

  return (
    <AuthShell
      footer={
        <Button
          fullWidth
          className="rounded-2xl"
          disabled={!email || otp.length !== 6}
          onClick={() =>
            navigate(
              `/set-new-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(otp)}`
            )
          }
        >
          Submit
        </Button>
      }
    >
      <div className="space-y-8 pt-4">
        <BackButton href="/forgot-password" />
        <AuthPageHeader
          title="Enter OTP"
          subtitle={
            <>
              A 6 digit Code was sent to{" "}
              <span className="font-semibold text-ink">{maskEmail(email)}</span>
            </>
          }
        />
        <div className="space-y-6">
          {formError ? (
            <div className="rounded-2xl bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-danger">
              {formError}
            </div>
          ) : null}
          <label className="block text-sm font-medium text-ink">Enter Code</label>
          <OtpInput value={otp} onChange={setOtp} />
          <p className="text-center text-lg text-ink">
            Didn&apos;t get Code?{" "}
            {secondsRemaining > 0 ? (
              <CountdownTimer secondsRemaining={secondsRemaining} />
            ) : (
              <button
                type="button"
                className="font-semibold text-brand-deep"
                onClick={async () => {
                  setFormError(null);

                  try {
                    const response = await authRepository.resendOtp({
                      email,
                      type: "password_reset"
                    });
                    if (response.devOtp) {
                      setOtp(response.devOtp);
                    }
                    reset();
                  } catch (error) {
                    setFormError(getApiErrorMessage(error, "Unable to resend code."));
                  }
                }}
              >
                Resend Code
              </button>
            )}
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
