;
import { Link } from 'wouter';

function HeroReviewBlock({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center justify-center gap-3 lg:justify-start">
        <p className="text-[1.15rem] font-medium tracking-[-0.03em] text-ink lg:text-[1.05rem]">
          Excellent
        </p>
        <div className="flex items-center gap-[2px]">
          {Array.from({ length: 5 }).map((_, index) => (
            <span
              key={index}
              className="inline-flex size-8 items-center justify-center bg-brand text-[1rem] leading-none text-white"
            >
              ★
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-[0.98rem] leading-[1.2] text-ink lg:text-left lg:text-[0.94rem]">
        Based on verified customer feedback
      </p>
    </div>
  );
}

function HeroMetrics({ className = "" }: { className?: string }) {
  const metricValueClassName =
    "[font-family:Inter,sans-serif] text-[1.25rem] font-bold leading-none tracking-[-0.03em] text-brand";

  return (
    <div className={`grid grid-cols-3 gap-5 text-center lg:gap-10 lg:text-left ${className}`}>
      <div>
        <p className={metricValueClassName}>
          2.4×
        </p>
        <p className="mt-1 whitespace-nowrap text-[0.95rem] leading-[1.2] text-[#6f6f6f] lg:text-[0.98rem]">
          Earnings boost
        </p>
      </div>
      <div>
        <p className={metricValueClassName}>
          94%
        </p>
        <p className="mt-1 whitespace-nowrap text-[0.95rem] leading-[1.2] text-[#6f6f6f] lg:text-[0.98rem]">
          Map accuracy
        </p>
      </div>
      <div>
        <p className={metricValueClassName}>
          12K
        </p>
        <p className="mt-1 whitespace-nowrap text-[0.95rem] leading-[1.2] text-[#6f6f6f] lg:text-[0.98rem]">
          Active drivers
        </p>
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section id="about-us" className="overflow-hidden bg-white py-12 lg:py-[6.1rem]">
      <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-[14px]">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_528px] lg:items-stretch lg:gap-[4.2rem]">
          <div className="lg:flex lg:min-h-[541px] lg:flex-col">
            <h1 className="[font-family:Inter,sans-serif] text-[3.25rem] font-semibold leading-none tracking-[-0.08em] text-ink sm:text-[4rem] lg:text-[4rem] lg:font-semibold lg:leading-none lg:tracking-[-0.08em]">
              <span className="block whitespace-nowrap">Stop guessing.</span>
              <span className="block whitespace-nowrap">Drive where the</span>
              <span className="block whitespace-nowrap text-brand">money is.</span>
            </h1>
            <p className="mt-6 max-w-[23rem] text-[1.01rem] leading-[1.18] text-[#686868] sm:max-w-[30rem] lg:mt-5 lg:max-w-[28rem] lg:text-[0.98rem]">
              RideSpot shows your real-time demand hotspots, surge zones, and peak
              hours, so every kilometer you drive counts.
            </p>
            <div className="mt-6 flex flex-col gap-4 sm:max-w-[27rem] lg:mt-8 lg:max-w-none lg:flex-row lg:items-center lg:gap-4">
              <Link
                href="/register"
                className="inline-flex min-h-[3.8rem] items-center justify-center rounded-[0.85rem] bg-[#050505] px-7 text-[1rem] font-semibold text-white transition hover:bg-[#111111] lg:min-h-[3rem] lg:min-w-[256px] lg:px-6 lg:text-[0.95rem]"
              >
                Start Driving Smarter Now - Free
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-[3.8rem] items-center justify-center rounded-[0.85rem] bg-[#eef0f4] px-6 text-[1rem] font-semibold text-ink transition hover:bg-[#e3e6eb] lg:min-h-[3rem] lg:min-w-[92px] lg:px-5 lg:text-[0.95rem]"
              >
                Sign in
              </Link>
            </div>

            <div className="mt-6 overflow-hidden rounded-[2rem] lg:hidden">
              <img
                src="/assets/landing-hero.png"
                alt="RideSpot city traffic illustration"
                className="h-auto w-full"
              />
            </div>

            <HeroReviewBlock className="mt-8 lg:hidden" />
            <HeroMetrics className="mt-7 lg:hidden" />

            <div className="mt-auto hidden lg:block">
              <HeroReviewBlock />
              <HeroMetrics className="mt-6 max-w-[25rem]" />
            </div>
          </div>

          <div className="relative hidden overflow-hidden rounded-[2rem] lg:block lg:h-[541px] lg:w-[528px]">
            <img
              src="/assets/landing-hero.png"
              alt="RideSpot city traffic illustration"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
