import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesGrid } from "@/components/landing/FeaturesGrid";
import { CtaSection } from "@/components/landing/CtaSection";
import { EarningsCalculator } from "@/components/landing/EarningsCalculator";
import { FaqItem } from "@/components/landing/FaqItem";
import { HowItWorksStep } from "@/components/landing/HowItWorksStep";
import { PricingCard } from "@/components/landing/PricingCard";
import { TestimonialCard } from "@/components/landing/TestimonialCard";
import {
  faqs,
  howItWorks,
  pricingPlans,
  testimonials
} from "@/data/marketing";
import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <HeroSection />
      <FeaturesGrid />

      <section id="how-it-works" className="bg-white py-20 lg:py-[5.65rem]">
        <div className="mx-auto grid max-w-[1110px] gap-10 px-4 lg:grid-cols-[528px_minmax(0,1fr)] lg:items-stretch lg:gap-[3.4rem] lg:px-[14px]">
          <div className="mx-auto w-full max-w-[528px] overflow-hidden rounded-[1.95rem] lg:min-h-[557px] lg:self-stretch">
            <Image
              src="/assets/landing-how-it-works.png"
              alt="RideSpot app on a mounted phone inside a car"
              width={528}
              height={557}
              quality={100}
              unoptimized
              sizes="(max-width: 1023px) 100vw, 528px"
              className="h-auto w-full lg:h-full lg:object-cover"
            />
          </div>
          <div className="mx-auto flex w-full max-w-[31.5rem] flex-col pt-2 lg:mx-0 lg:min-h-[557px] lg:pt-[0.15rem]">
            <p className="inline-flex w-fit self-start whitespace-nowrap rounded-[0.72rem] bg-[#f1f2f4] px-3 py-[0.45rem] text-[1.02rem] font-semibold leading-none tracking-[-0.02em] text-[#6c6c6c]">
              How it Works
            </p>
            <h2 className="mt-4 max-w-[34rem] [font-family:Inter,sans-serif] text-[1.75rem] font-semibold leading-none tracking-[-0.08em] text-ink lg:text-[2.5rem] lg:font-semibold lg:leading-none lg:tracking-[-0.08em]">
              <span className="block lg:whitespace-nowrap">From sign-up to your first</span>
              <span className="block lg:whitespace-nowrap">hotspot in 60 seconds</span>
            </h2>
            <div className="mt-10 space-y-9 lg:mt-[2.55rem] lg:space-y-[2.55rem]">
              {howItWorks.map((step, index) => (
                <HowItWorksStep key={step.title} index={index} step={step} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <EarningsCalculator />

      <section id="pricing" className="bg-white py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-[14px]">
          <div className="text-left md:text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
              Simple Pricing
            </p>
            <h2 className="mt-4 [font-family:Inter,sans-serif] text-[1.75rem] font-semibold leading-none tracking-[-0.08em] text-ink md:text-[2.5rem] md:font-semibold md:leading-none md:tracking-[-0.08em]">
              Start free. <span className="text-brand">Upgrade</span> when you&apos;re ready.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <PricingCard key={plan.tier} plan={plan} />
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="bg-white py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-4 md:px-6 lg:px-[14px]">
          <div className="text-left md:text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
              Faq
            </p>
            <h2 className="mt-4 [font-family:Inter,sans-serif] text-[1.75rem] font-semibold leading-none tracking-[-0.08em] text-ink md:text-[2.5rem] md:font-semibold md:leading-none md:tracking-[-0.08em]">
              Questions drivers ask
            </h2>
          </div>
          <div className="mt-12">
            {faqs.map((item) => (
              <FaqItem key={item.question} item={item} />
            ))}
          </div>
          <div className="mt-10 flex justify-center">
            <Link
              href="/contact"
              className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-ink px-6 text-base font-semibold text-white transition duration-200 hover:bg-ink-soft"
            >
              Load More Questions
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-[14px]">
          <div className="text-left md:text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
              Driver Stories
            </p>
            <h2 className="mt-4 [font-family:Inter,sans-serif] text-[1.75rem] font-semibold leading-none tracking-[-0.08em] text-ink md:text-[2.5rem] md:font-semibold md:leading-none md:tracking-[-0.08em]">
              Real drivers. Real results.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <TestimonialCard key={testimonial.name} testimonial={testimonial} />
            ))}
          </div>
        </div>
      </section>

      <CtaSection />
      <Footer />
    </main>
  );
}
