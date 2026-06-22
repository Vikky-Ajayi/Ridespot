import Link from "next/link";

export function CtaSection() {
  return (
    <section className="bg-brand py-16 text-center text-ink md:py-24">
      <div className="mx-auto max-w-4xl px-4 md:px-6 lg:px-[14px]">
        <h2 className="[font-family:Inter,_system-ui,_sans-serif] text-[1.75rem] font-semibold leading-none tracking-[-0.08em] md:text-[2.5rem] md:font-semibold md:leading-none md:tracking-[-0.08em]">
          <span className="block md:inline">Ready to</span>{" "}
          <span className="block md:inline">
            earn <em className="italic text-[#004825]">more</em> with
          </span>{" "}
          <span className="block">every trip?</span>
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-ink/78 md:text-lg">
          Join 12,000+ drivers who use RideSpot to position smarter, catch surges
          faster, and take home more at the end of every shift.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 md:flex-row">
          <Link
            href="/register"
            className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-ink px-6 text-base font-semibold text-white transition duration-200 hover:bg-ink-soft md:w-auto md:min-w-[28rem]"
          >
            Get Started for Free
          </Link>
        </div>
        <p className="mt-3 text-sm font-medium text-ink/72">
          No credit card required · Cancel anytime
        </p>
        <Link href="/register" className="sr-only">
          Register for RideSpot
        </Link>
      </div>
    </section>
  );
}
