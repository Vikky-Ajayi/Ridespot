import Image from "next/image";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AvatarProps {
  src?: string;
  alt?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const avatarSizeClassName = {
  sm: "size-10",
  md: "size-12",
  lg: "size-16"
} as const;

export function Avatar({
  src,
  alt = "Profile avatar",
  size = "md",
  className
}: AvatarProps) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FF6255] text-white",
        avatarSizeClassName[size],
        className
      )}
    >
      {src ? (
        <Image src={src} alt={alt} fill className="object-cover" />
      ) : (
        <UserRound className={cn(size === "lg" ? "size-8" : "size-6")} />
      )}
    </span>
  );
}
