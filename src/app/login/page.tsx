"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { AuthShell } from "@/components/layout/AuthShell";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { getApiErrorMessage } from "@/lib/apiError";
import { authRepository } from "@/services/repositories";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Enter your password.")
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });
  const submitLogin = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const response = await authRepository.login(values);
      login({ token: response.token, user: response.user });
      router.push("/app/home");
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to sign in. Please try again."));
    }
  });

  return (
    <AuthShell
      formProps={{
        onSubmit: submitLogin
      }}
      footer={
        <div className="space-y-8">
          <Button
            type="submit"
            fullWidth
            loading={isSubmitting}
            className="rounded-2xl"
          >
            Log in
          </Button>
          <p className="text-center text-lg text-ink">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-semibold text-brand-deep">
              Create account
            </Link>
          </p>
        </div>
      }
    >
      <div className="space-y-8 pt-8">
        <AuthPageHeader
          title="Welcome back"
          subtitle="Sign in to see live demand maps in your city."
        />
        <div className="space-y-8">
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
          <div className="space-y-4">
            <PasswordInput
              label="Password"
              placeholder="--- --- --- --"
              error={errors.password?.message}
              {...register("password")}
            />
            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xl font-semibold text-brand-deep">
                Forgot Password?
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
