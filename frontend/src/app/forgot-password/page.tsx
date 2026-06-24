"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { AuthShell } from "@/components/layout/AuthShell";
import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getApiErrorMessage } from "@/lib/apiError";
import { authRepository } from "@/services/repositories";
import { useState } from "react";

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address.")
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: ""
    }
  });
  const submitForgotPassword = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const response = await authRepository.forgotPassword(values);
      const params = new URLSearchParams({ email: values.email });
      if (response.devOtp) {
        params.set("code", response.devOtp);
      }
      router.push(`/enter-otp?${params.toString()}`);
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to send reset code. Please try again."));
    }
  });

  return (
    <AuthShell
      formProps={{
        onSubmit: (event) => {
          event.preventDefault();
          void submitForgotPassword();
        }
      }}
      footer={
        <Button
          type="button"
          fullWidth
          loading={isSubmitting}
          className="rounded-2xl"
          onClick={() => void submitForgotPassword()}
        >
          Submit
        </Button>
      }
    >
      <div className="space-y-8 pt-4">
        <BackButton href="/login" />
        <AuthPageHeader
          title="Forgot Password?"
          subtitle="Enter email address, you will receive a code to reset your password"
        />
        <div className="space-y-6">
          {formError ? (
            <div className="rounded-2xl bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-danger">
              {formError}
            </div>
          ) : null}
          <Input
            label="Email address"
            placeholder="e.g Johndoe@email.com"
            error={errors.email?.message}
            {...register("email")}
          />
        </div>
      </div>
    </AuthShell>
  );
}
