import { marketingFeatures } from "@/data/marketing";
import { FeatureCard } from "@/components/landing/FeatureCard";

export function FeaturesGrid() {
  return (
    <section id="features" className="bg-ink py-20 text-white md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-[14px]">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/48">
            Features
          </p>
          <h2 className="mt-4 [font-family:Inter,sans-serif] text-[1.75rem] font-semibold leading-none tracking-[-0.08em] md:text-[4rem] md:font-extrabold md:leading-[0.95] md:tracking-[-0.05em]">
            Everything you need to drive smarter
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/62 md:text-lg">
            Built for real drivers in Nigerian cities. No fluff, only actionable
            intelligence that puts more money in your pocket.
          </p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {marketingFeatures.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
