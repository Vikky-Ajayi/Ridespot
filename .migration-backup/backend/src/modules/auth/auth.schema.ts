import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/\d/, "Password must include at least one number");

export const registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8).optional().nullable(),
  country: z.string().min(1),
  password: passwordSchema
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6)
});

export const resendOtpSchema = z.object({
  email: z.string().email(),
  type: z.enum(["email_verification", "password_reset"])
});

export const forgotPasswordSchema = z.object({
  email: z.string().email()
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: passwordSchema
});
