import { Flame, Map, MapPin, UserRound } from "lucide-react";
import type { HowItWorksItem } from "@/data/marketing";

export interface HowItWorksStepProps {
  index: number;
  step: HowItWorksItem;
}

const iconMap = [UserRound, MapPin, Flame, Map] as const;
const toneMap = [
  "bg-[#edf3ff] text-[#3f7cff]",
  "bg-[#eaf8ef] text-[#19bf73]",
  "bg-[#fff0f0] text-[#ff5c58]",
  "bg-[#f7eaff] text-[#f43dff]"
] as const;

export function HowItWorksStep({ index, step }: HowItWorksStepProps) {
  const Icon = iconMap[index] ?? Map;
  const tone = toneMap[index] ?? toneMap[0];

  return (
    <div className="flex items-start gap-3 md:gap-4">
      <span
        className={`mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-[0.65rem] md:size-8 ${tone}`}
      >
        <Icon className="size-4 stroke-[2.1]" />
      </span>
      <div className="max-w-[31rem]">
        <h3 className="text-[1.15rem] font-extrabold leading-[1.18] tracking-[-0.03em] text-ink md:text-[1.2rem]">
          {step.title}
        </h3>
        <p className="mt-1.5 max-w-[25rem] text-[0.97rem] leading-[1.38] text-[#656565] md:text-[0.99rem]">
          {step.description}
        </p>
      </div>
    </div>
  );
}
