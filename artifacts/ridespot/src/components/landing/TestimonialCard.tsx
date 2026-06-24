import { Quote } from "lucide-react";
import type { TestimonialItem } from "@/data/marketing";

export interface TestimonialCardProps {
  testimonial: TestimonialItem;
}

export function TestimonialCard({ testimonial }: TestimonialCardProps) {
  return (
    <article className="rounded-[1.5rem] bg-[#f6f7f8] p-6 shadow-soft">
      <Quote className="size-7 text-brand" />
      <p className="mt-6 text-base leading-8 text-ink">{testimonial.quote}</p>
      <div className="mt-8">
        <p className="text-base font-extrabold text-ink">{testimonial.name}</p>
        <p className="mt-1 text-sm text-ink-muted">{testimonial.role}</p>
      </div>
    </article>
  );
}
