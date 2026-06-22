import {
  BellRing,
  Compass,
  Flame,
  MoonStar,
  TrendingUp
} from "lucide-react";
import type { FeatureItem } from "@/data/marketing";

const iconMap = {
  heatmap: Flame,
  surge: BellRing,
  prediction: TrendingUp,
  navigation: Compass,
  night: MoonStar
} as const;

const toneMap = {
  heatmap: "bg-[#261611] text-[#ff5b44]",
  surge: "bg-[#2a1d0d] text-[#ff9b29]",
  prediction: "bg-[#112035] text-[#5590ff]",
  navigation: "bg-[#251539] text-[#b45cff]",
  night: "bg-[#0f281e] text-[#1dd574]"
} as const;

export interface FeatureCardProps {
  feature: FeatureItem;
}

export function FeatureCard({ feature }: FeatureCardProps) {
  const Icon = iconMap[feature.icon];

  return (
    <article className="min-h-[10.75rem] rounded-[1.15rem] border border-white/8 bg-[#131516] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <span
        className={`mb-4 inline-flex size-9 items-center justify-center rounded-[0.65rem] ${toneMap[feature.icon]}`}
      >
        <Icon className="size-5" />
      </span>
      <h3 className="text-[1.05rem] font-extrabold text-white">{feature.title}</h3>
      <p className="mt-3 max-w-[17rem] text-sm leading-6 text-white/64">
        {feature.description}
      </p>
    </article>
  );
}
