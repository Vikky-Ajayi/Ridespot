

import { Link } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { useState } from "react";
import { z } from "zod";
import { AuthPageHeader } from "@/components/layout/AuthPageHeader";
import { AuthShell } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PhoneField } from "@/components/ui/PhoneField";
import { SelectField } from "@/components/ui/SelectField";
import { useToast } from "@/hooks/useToast";
import { getApiErrorMessage } from "@/lib/apiError";
import { COUNTRY_SELECT_OPTIONS } from "@/lib/markets";
import { authRepository } from "@/services/repositories";

const registerSchema = z.object({
  fullName: z.string().min(2, "Enter your full name."),
  email: z.string().email("Enter a valid email address."),
  phoneNumber: z.string().min(10, "Enter a valid phone number."),
  country: z.string().min(1, "Select a country."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .regex(/\d/, "Password must include at least one number.")
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phoneNumber: "",
      country: "",
      password: ""
    }
  });
  const submitRegistration = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const response = await authRepository.register(values);
      showToast({ title: "Account Created", variant: "success" });
      const params = new URLSearchParams({ email: values.email });
      if (response.devOtp) {
        params.set("code", response.devOtp);
      }
      navigate(`/verify-email?${params.toString()}`);
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to create account. Please try again."));
    }
  });

  return (
    <AuthShell
      formProps={{
        onSubmit: submitRegistration
      }}
      footer={
        <div className="space-y-8">
          <Button
            type="submit"
            fullWidth
            loading={isSubmitting}
            className="rounded-2xl"
          >
            Register
          </Button>
          <p className="text-center text-lg text-ink">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand-deep">
              Sign in
            </Link>
          </p>
        </div>
      }
    >
      <div className="space-y-8 pt-8">
        <AuthPageHeader
          title="Create account"
          subtitle="Set up on account, takes less the 2 minutes"
        />
        <div className="space-y-6">
          {formError ? (
            <div className="rounded-2xl bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-danger">
              {formError}
            </div>
          ) : null}
          <Input
            label="Full Name"
            placeholder="e.g John Doe"
            error={errors.fullName?.message}
            {...register("fullName")}
          />
          <Input
            label="Email address"
            placeholder="e.g Johndoe@email.com"
            error={errors.email?.message}
            {...register("email")}
          />
          <Controller
            control={control}
            name="phoneNumber"
            render={({ field }) => (
              <PhoneField
                label="Phone number"
                value={field.value}
                onChange={field.onChange}
                error={errors.phoneNumber?.message}
              />
            )}
          />
          <SelectField
            label="Country"
            error={errors.country?.message}
            options={COUNTRY_SELECT_OPTIONS}
            {...register("country")}
          />
          <PasswordInput
            label="Password"
            placeholder="--- --- --- --"
            error={errors.password?.message}
            {...register("password")}
          />
        </div>
      </div>
    </AuthShell>
  );
}
