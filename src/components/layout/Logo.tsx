import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface LogoProps {
  href?: string;
  className?: string;
  light?: boolean;
  variant?: "light" | "dark";
  priority?: boolean;
}

export function Logo({
  href = "/",
  className,
  light = false,
  variant,
  priority = false
}: LogoProps) {
  const resolvedVariant = variant ?? (light ? "light" : "dark");
  const src = resolvedVariant === "light" ? "/assets/logo-light.png" : "/assets/logo-primary.png";
  const dimensions =
    resolvedVariant === "light" ? { width: 1429, height: 280 } : { width: 139, height: 32 };

  return (
    <Link href={href} className={cn("inline-flex items-center", className)}>
      <Image
        src={src}
        alt="RideSpot"
        width={dimensions.width}
        height={dimensions.height}
        className="h-auto w-[8.7rem] md:w-[9.4rem]"
        priority={priority}
      />
    </Link>
  );
}
