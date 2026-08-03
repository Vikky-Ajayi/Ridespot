"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, User } from "lucide-react";
import { useLocation } from 'wouter';
import { DesktopShell } from "@/components/app/DesktopShell";
import { useAuth } from "@/hooks/useAuth";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import { useToast } from "@/hooks/useToast";
import { getApiErrorMessage } from "@/lib/apiError";
import { withPreviewParam } from "@/lib/appPreview";
import {
  COUNTRY_SELECT_OPTIONS,
  countryFromPhoneCountry,
  normaliseMarketCountry,
  phoneCountryFromMarket
} from "@/lib/markets";
import { profileRepository } from "@/services/repositories";

const PHONE_FLAG_OPTIONS = [
  { value: "ng", label: "\u{1F1F3}\u{1F1EC}", dialCode: "+234" },
  { value: "gb", label: "\u{1F1EC}\u{1F1E7}", dialCode: "+44" }
] as const;

function InputField({
  label,
  placeholder,
  value,
  onChange,
  readOnly
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-3 block text-[1rem] font-medium text-ink">{label}</span>
      <input
        placeholder={placeholder}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full rounded-[18px] border-0 bg-[#F5F6F8] px-4 text-[1rem] text-ink outline-none placeholder:text-[#8A8F98]"
      />
    </label>
  );
}

function derivePhoneCountry(phone: string | null | undefined) {
  return phone?.startsWith("+44") ? "gb" : "ng";
}

function stripDialCode(phone: string | null | undefined) {
  if (!phone) {
    return "";
  }

  return phone.replace(/^\+\d+\s*/, "").trim();
}

export default function EditProfilePage() {
  const [, navigate] = useLocation();
  const searchParams = useLocationSearchParams();
  const preview = searchParams.get("preview") === "app";
  const { user } = useAuth();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [formError, setFormError] = useState<string | null>(null);
  const [phoneCountry, setPhoneCountry] =
    useState<(typeof PHONE_FLAG_OPTIONS)[number]["value"]>("ng");

  useEffect(() => {
    let cancelled = false;

    if (user) {
      const userCountry = normaliseMarketCountry(user.country) || "Nigeria";
      setFullName(user.fullName);
      setEmail(user.email);
      setCountry(userCountry);
      setPhoneCountry(user.phone ? derivePhoneCountry(user.phone) : phoneCountryFromMarket(userCountry));
      setPhoneNumber(stripDialCode(user.phone));
    }

    profileRepository
      .getProfile()
      .then((profile) => {
        if (cancelled) {
          return;
        }

        setFullName(profile.fullName);
        setEmail(profile.email);
        setCountry(normaliseMarketCountry(profile.country) || "Nigeria");
        setPhoneCountry(profile.phone ? derivePhoneCountry(profile.phone) : phoneCountryFromMarket(profile.country));
        setPhoneNumber(stripDialCode(profile.phone));
      })
      .catch(() => {
        // Keep the authenticated user's cached details instead of showing demo data.
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const activeDialCode = useMemo(
    () => PHONE_FLAG_OPTIONS.find((option) => option.value === phoneCountry)?.dialCode ?? "+234",
    [phoneCountry]
  );

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
          <h1 className="[font-family:Inter,sans-serif] text-[1rem] font-semibold leading-none tracking-[-0.03em] text-ink">
            Edit Profile
          </h1>
        </div>

        <div className="mt-12 flex flex-col items-center">
          <div className="flex size-[52px] items-center justify-center rounded-full bg-[#FF5656] text-white">
            <User className="size-6" aria-hidden="true" />
          </div>
          <button
            type="button"
            className="mt-4 rounded-2xl bg-[#E9F9EF] px-4 py-2 text-[0.96rem] font-medium text-[#00A856]"
          >
            Change Profile picture
          </button>
        </div>

        <div className="mt-10 space-y-5">
          {formError ? (
            <div className="rounded-2xl bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-danger">
              {formError}
            </div>
          ) : null}
          <InputField
            label="Full Name"
            placeholder="e.g John Doe"
            value={fullName}
            onChange={setFullName}
          />
          <InputField
            label="Email address"
            placeholder="e.g Johndoe@email.com"
            value={email}
            onChange={setEmail}
            readOnly
          />

          <label className="block">
            <span className="mb-3 block text-[1rem] font-medium text-ink">Phone number</span>
            <div className="flex h-14 overflow-hidden rounded-[18px] bg-[#F5F6F8]">
              <div className="relative w-[84px] border-r-2 border-white">
                <select
                  value={phoneCountry}
                  onChange={(event) =>
                    setPhoneCountry(
                      event.target.value as (typeof PHONE_FLAG_OPTIONS)[number]["value"]
                    )
                  }
                  aria-label="Phone country flag"
                  className="h-full w-full appearance-none bg-transparent pl-3 pr-8 text-center text-[1.05rem] outline-none"
                >
                  {PHONE_FLAG_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" />
              </div>
              <div className="flex items-center border-r-2 border-white px-3 text-[0.95rem] font-medium text-[#6B7280]">
                {activeDialCode}
              </div>
              <input
                placeholder="e.g 000 1234 8292 29"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                className="w-full border-0 bg-transparent px-4 text-[1rem] text-ink outline-none placeholder:text-[#8A8F98]"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-3 block text-[1rem] font-medium text-ink">Country</span>
            <div className="relative flex h-14 overflow-hidden rounded-[18px] bg-[#F5F6F8]">
              <select
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="h-full w-full appearance-none border-0 bg-transparent px-4 text-[1rem] text-[#6B7280] outline-none"
              >
                {COUNTRY_SELECT_OPTIONS.map((option) => (
                  <option key={option.value || "empty"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="flex w-[54px] items-center justify-center border-l-2 border-white text-ink">
                <ChevronDown className="size-5" />
              </div>
            </div>
          </label>
        </div>

        <button
          type="button"
          onClick={async () => {
            setFormError(null);

            try {
              const updatedProfile = await profileRepository.updateProfile({
                fullName,
                phone: `${activeDialCode}${phoneNumber.replace(/\s+/g, "")}`,
                country: country || countryFromPhoneCountry(phoneCountry)
              });
              showToast({ title: "Profile Updated", variant: "success" });
              setFullName(updatedProfile.fullName);
              setCountry(updatedProfile.country ?? country);
              navigate(withPreviewParam("/app/profile", preview));
            } catch (error) {
              setFormError(getApiErrorMessage(error, "Unable to update profile."));
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
