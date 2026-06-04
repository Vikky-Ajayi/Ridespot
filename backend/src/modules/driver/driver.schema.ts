import { z } from "zod";

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().min(8).optional().nullable(),
  country: z.string().min(1).optional()
});

export const updatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(8)
      .regex(/\d/, "New password must include at least one number"),
    confirmNewPassword: z.string().min(8)
  })
  .refine((value) => value.newPassword === value.confirmNewPassword, {
    message: "Passwords do not match",
    path: ["confirmNewPassword"]
  });

export const notificationPreferencesSchema = z.object({
  mailNotifications: z.boolean(),
  demandNotifications: z.boolean(),
  nightModeAlerts: z.boolean()
});

export const fcmTokenSchema = z.object({
  token: z.string().min(1)
});

export const feedbackSchema = z.object({
  hotspotId: z.string().uuid(),
  feedbackScore: z.number().min(0).max(5).optional(),
  actedOn: z.boolean().optional(),
  tripsCompleted: z.number().int().min(0).optional()
});
