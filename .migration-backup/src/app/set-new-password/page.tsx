"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { AuthShell } from "@/components/layout/AuthShell";
import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import { useToast } from "@/hooks/useToast";
import { getApiErrorMessage } from "@/lib/apiError";
import { authRepository } from "@/services/repositories";
import { useState } from "react";

const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Must be at least 8 characters.")
      .regex(/\d/, "Must include a number."),
    confirmPassword: z.string().min(8, "Confirm your new password.")
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"]
  });

type SetPasswordValues = z.infer<typeof setPasswordSchema>;

export default function SetNewPasswordPage() {
  const router = useRouter();
  const searchParams = useLocationSearchParams();
  const email = searchParams.get("email") ?? "";
  const code = searchParams.get("code") ?? "";
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: ""
    }
  });
  const submitPasswordReset = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await authRepository.resetPassword({
        email,
        code,
        newPassword: values.password
      });
      showToast({ title: "Password Changed", variant: "success" });
      router.push("/login");
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to reset password. Please try again."));
    }
  });

  return (
    <AuthShell
      formProps={{
        onSubmit: (event) => {
          event.preventDefault();
          void submitPasswordReset();
        }
      }}
      footer={
        <Button
          type="button"
          fullWidth
          loading={isSubmitting}
          className="rounded-2xl"
          onClick={() => void submitPasswordReset()}
        >
          Reset Password
        </Button>
      }
    >
      <div className="space-y-8 pt-4">
        <BackButton href={`/enter-otp?email=${encodeURIComponent(email)}`} />
        <AuthPageHeader
          title="Set new password"
          subtitle="Must be at least 8 characters and include a number."
        />
        <div className="space-y-6">
          {formError ? (
            <div className="rounded-2xl bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-danger">
              {formError}
            </div>
          ) : null}
          <PasswordInput
            label="New Password"
            placeholder="--- --- --- --"
            error={errors.password?.message}
            {...register("password")}
          />
          <PasswordInput
            label="Confirm New Password"
            placeholder="--- --- --- --"
            error={errors.confirmPassword?.message}
            {...register("confirmPassword")}
          />
        </div>
      </div>
    </AuthShell>
  );
}
