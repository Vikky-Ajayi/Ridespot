"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useLocation } from 'wouter';
import { DesktopShell } from "@/components/app/DesktopShell";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import { useToast } from "@/hooks/useToast";
import { getApiErrorMessage } from "@/lib/apiError";
import { withPreviewParam } from "@/lib/appPreview";
import { profileRepository } from "@/services/repositories";

function PasswordField({
  label,
  placeholder,
  value,
  onChange
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-3 block text-[1rem] font-medium text-ink">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-14 w-full rounded-[18px] border-0 bg-[#F5F6F8] px-4 text-[1rem] text-ink outline-none placeholder:text-[#8A8F98]"
      />
    </label>
  );
}

export default function ChangePasswordPage() {
  const [, navigate] = useLocation();
  const searchParams = useLocationSearchParams();
  const preview = searchParams.get("preview") === "app";
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <DesktopShell className="bg-white">
      <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-white px-4 pb-6 pwa-safe-top">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(withPreviewParam("/app/profile", preview))}
            className="flex size-10 items-center justify-center rounded-2xl bg-[#F5F6F8] text-[#6B7280]"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h1 className="[font-family:Inter,sans-serif] text-[1.25rem] font-semibold leading-none tracking-[-0.08em] text-ink">
            Change Password
          </h1>
        </div>

        <div className="mt-12 space-y-5">
          {formError ? (
            <div className="rounded-2xl bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-danger">
              {formError}
            </div>
          ) : null}
          <PasswordField
            label="Current Password"
            placeholder="Enter current password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <PasswordField
            label="New Password"
            placeholder="Enter new password"
            value={newPassword}
            onChange={setNewPassword}
          />
          <PasswordField
            label="Confirm New Password"
            placeholder="Confirm new password"
            value={confirmNewPassword}
            onChange={setConfirmNewPassword}
          />
        </div>

        <button
          type="button"
          onClick={async () => {
            setFormError(null);

            try {
              await profileRepository.changePassword(
                currentPassword,
                newPassword,
                confirmNewPassword
              );
              showToast({ title: "Password Changed", variant: "success" });
              navigate(withPreviewParam("/app/profile", preview));
            } catch (error) {
              setFormError(getApiErrorMessage(error, "Unable to change password."));
            }
          }}
          className="mt-auto w-full rounded-2xl bg-black px-4 py-4 text-[1.06rem] font-semibold text-white"
        >
          Save Changes
        </button>
      </div>
    </DesktopShell>
  );
}
