import type { PlanTier } from "@/types";

export interface FeatureItem {
  title: string;
  description: string;
  icon: "heatmap" | "surge" | "prediction" | "navigation" | "night";
}

export interface HowItWorksItem {
  title: string;
  description: string;
}

export interface PricingItem {
  tier: PlanTier;
  name: string;
  monthlyPriceLabel: string;
  subtitle: string;
  ctaLabel: string;
  featured?: boolean;
  features: Array<{
    copy: string;
    included: boolean;
  }>;
}

export interface FaqItemData {
  question: string;
  answer: string;
}

export interface TestimonialItem {
  quote: string;
  name: string;
  role: string;
}

export const marketingFeatures: FeatureItem[] = [
  {
    title: "Live Heatmaps",
    description: "Updated every 30 seconds from real booking data across your city.",
    icon: "heatmap"
  },
  {
    title: "Surge Alerts",
    description: "Get notified the moment a surge zone activates near you.",
    icon: "surge"
  },
  {
    title: "Peak Predictions",
    description: "See forecasted demand spikes 45 minutes before they happen.",
    icon: "prediction"
  },
  {
    title: "Smart Navigation",
    description: "One tap takes you to the hotspot with the fastest route.",
    icon: "navigation"
  },
  {
    title: "Nightlife Mode",
    description: "See club closing times, venues, and late-night demand corridors.",
    icon: "night"
  }
];

export const howItWorks: HowItWorksItem[] = [
  {
    title: "Create your free driver account",
    description: "Sign up with your email. No documents needed, just your name and city."
  },
  {
    title: "Enable location and go online",
    description: "Flip the Online toggle. RideSpot immediately shows demand around you."
  },
  {
    title: "Read the live heatmap",
    description: "Red = high demand. Orange = building surge. Green = quieter but good."
  },
  {
    title: "Navigate and earn more",
    description: "Tap a hotspot, hit Navigate, and arrive ahead of the rush. See the difference by end of day."
  }
];

export const pricingPlans: PricingItem[] = [
  {
    tier: "free",
    name: "Free",
    monthlyPriceLabel: "₦0",
    subtitle: "At start, no credit card needed.",
    ctaLabel: "Get Started for Free",
    features: [
      { copy: "Live heatmap (30 min delay)", included: true },
      { copy: "Top 3 hotspots per city", included: true },
      { copy: "Basic earnings tracker", included: true },
      { copy: "Real-time surge alerts", included: false },
      { copy: "Peak hour predictions", included: false }
    ]
  },
  {
    tier: "pro",
    name: "Pro",
    monthlyPriceLabel: "₦4,900",
    subtitle: "For serious drivers who want every edge.",
    ctaLabel: "Start 3-day Free Trial",
    featured: true,
    features: [
      { copy: "Live heatmap (0 min delay)", included: true },
      { copy: "Top 3 hotspots per city", included: true },
      { copy: "Basic earnings tracker", included: true },
      { copy: "Real-time surge alerts", included: true },
      { copy: "Peak hour predictions", included: true }
    ]
  },
  {
    tier: "fleet",
    name: "Fleet",
    monthlyPriceLabel: "₦18,000",
    subtitle: "For teams managing multiple drivers.",
    ctaLabel: "Contact Sales",
    features: [
      { copy: "Everything in Pro", included: true },
      { copy: "Up to 20 driver seats", included: true },
      { copy: "Fleet-wide dashboard", included: true },
      { copy: "Driver performance rankings", included: true },
      { copy: "Dedicated account manager", included: true }
    ]
  }
];

export const faqs: FaqItemData[] = [
  {
    question: "How accurate are the hotspot predictions?",
    answer:
      "Our demand model blends live booking activity with historical trip density. The 45-minute predictive model stays actionable and continuously improves."
  },
  {
    question: "How often does the heatmap refresh?",
    answer:
      "Heatmaps refresh every 30 seconds on Free and in real time on Pro, so the map always reflects the latest booking pressure."
  },
  {
    question: "Can I use RideSpot while I am already driving?",
    answer:
      "Yes. The app is designed for quick glances, bottom-sheet access, and one-tap navigation so you can reposition safely between rides."
  },
  {
    question: "Does RideSpot work in multiple cities?",
    answer:
      "Yes. Your account stays with you as long as the selected city is covered, and Fleet plans can manage multiple driver territories."
  },
  {
    question: "Do I need a credit card to start?",
    answer:
      "No. The Free tier starts instantly without a card, and Pro includes a 3-day free trial before billing begins."
  }
];

export const testimonials: TestimonialItem[] = [
  {
    quote:
      "Before RideSpot I would just drive around guessing. Now I check the map every morning and I know exactly where to position myself.",
    name: "Adewale Kolade",
    role: "Uber driver · Lagos Island · 3 years driving"
  },
  {
    quote:
      "The surge alerts are the best part. I have caught three 2.5x surges this week that I would have missed completely.",
    name: "Funmi Nwachukwu",
    role: "Bolt driver · Victoria Island · 4 years driving"
  },
  {
    quote:
      "Works well in Abuja too. The Garki Wuse predictions are accurate. The map gives a faster read than scrolling ride apps.",
    name: "Emmanuel Musa",
    role: "InDrive driver · Abuja · 2 years driving"
  }
];
