import { Link } from "wouter";
import { MapPin } from "lucide-react";
import { Logo } from "@/components/layout/Logo";

export function Footer() {
  return (
    <footer id="site-footer" className="relative overflow-hidden bg-ink text-white">
      <div className="relative z-10 mx-auto max-w-[1080px] px-4 pb-[10.75rem] pt-7 md:px-6 md:pb-[18.5rem] md:pt-[3.1rem] lg:px-[14px]">
        <div className="grid gap-8 md:grid-cols-[1.45fr_0.6fr_0.68fr] md:gap-x-[5.75rem] md:gap-y-10">
          <div className="max-w-[24rem]">
            <Logo light />
            <p className="mt-6 max-w-none text-[0.915rem] leading-[1.3] tracking-[-0.02em] text-white/66 md:mt-7 md:max-w-[23rem] md:text-[0.98rem] md:leading-[1.36]">
              Real-time demand intelligence for ride-hailing drivers in Nigeria.
              Stop guessing. Start earning more.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-0 text-[0.95rem] font-medium text-white/68 md:col-span-2 md:grid-cols-[auto_auto] md:justify-end md:gap-x-[6.15rem] md:text-[1rem]">
            <div className="space-y-6 md:space-y-[1.75rem]">
              <Link href="/#about-us" className="block transition hover:text-white">
                About us
              </Link>
              <Link href="/contact" className="block transition hover:text-white">
                Contact
              </Link>
              <Link href="/#faq" className="block transition hover:text-white">
                Faq
              </Link>
            </div>

            <div className="space-y-6 md:space-y-[1.75rem]">
              <Link href="/privacy-policy" className="block transition hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/terms-of-service" className="block transition hover:text-white">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-[7.65rem] max-w-[18rem] text-[0.92rem] leading-[1.35] text-white/58 md:mt-[9.1rem] md:max-w-none md:text-[0.93rem]">
          &copy; 2026 RideSpot Technologies Ltd. Lagos, Nigeria. All rights
          reserved.
        </p>

        <div
          aria-hidden
        className="pointer-events-none absolute bottom-[-2.95rem] left-[-1.8rem] select-none whitespace-nowrap text-[8.8rem] font-extrabold leading-none tracking-[-0.085em] text-white/[0.08] md:bottom-[-8.65rem] md:left-[calc((100vw-1080px)/-2-4.4rem)] md:text-[23rem] md:text-white/[0.09]"
        >
          <span className="inline-flex items-end gap-[0.03em]">
            <span className="relative inline-flex size-[0.77em] items-center justify-center">
              <MapPin className="size-[0.77em]" strokeWidth={2.1} />
              <span className="absolute bottom-[0.08em] h-[0.07em] w-[0.135em] rounded-full bg-current" />
            </span>
            <span>ridespot</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
