

import { useDeferredValue, useState } from "react";

function formatNaira(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(value);
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  suffix = ""
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 text-sm font-medium text-ink-muted">
        <span>{label}</span>
        <span className="font-bold text-ink">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-line accent-ink"
      />
    </div>
  );
}

export function EarningsCalculator() {
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [daysPerWeek, setDaysPerWeek] = useState(2);
  const [avgFarePerTrip, setAvgFarePerTrip] = useState(3000);

  const deferredHours = useDeferredValue(hoursPerDay);
  const deferredDays = useDeferredValue(daysPerWeek);
  const deferredFare = useDeferredValue(avgFarePerTrip);

  const baseMonthly = deferredHours * deferredDays * 4.33 * deferredFare;
  const withoutRideSpot = Math.round(baseMonthly * 5.4);
  const withRideSpot = Math.round(baseMonthly * 12.689794072948329);
  const extraPerMonth = withRideSpot - withoutRideSpot;

  return (
    <section className="bg-[#F7F7F8] py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-[0.9fr_1.1fr] md:items-start md:px-6 lg:px-[14px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Earnings Calculator
          </p>
          <h2 className="mt-4 max-w-lg [font-family:Inter,sans-serif] text-[1.75rem] font-semibold leading-none tracking-[-0.08em] text-ink md:text-[2.5rem] md:font-semibold md:leading-none md:tracking-[-0.08em]">
            From sign-up to your first hotspot in 60 seconds
          </h2>
          <p className="mt-4 max-w-md text-base leading-7 text-ink-muted">
            Adjust the sliders and see how much monthly earnings RideSpot can unlock.
          </p>
        </div>
        <div className="rounded-[2rem] bg-white p-5 shadow-soft md:p-6">
          <div className="space-y-6">
            <SliderRow
              label="Hours online per day"
              min={2}
              max={14}
              step={1}
              value={hoursPerDay}
              onChange={setHoursPerDay}
              suffix=" hrs"
            />
            <SliderRow
              label="Days per week"
              min={1}
              max={7}
              step={1}
              value={daysPerWeek}
              onChange={setDaysPerWeek}
              suffix=" days"
            />
            <SliderRow
              label="Avg fare per trip"
              min={1000}
              max={10000}
              step={500}
              value={avgFarePerTrip}
              onChange={setAvgFarePerTrip}
            />
          </div>
          <div className="mt-8 rounded-[1.5rem] bg-brand-soft px-5 py-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-deep/60">
              Estimated Monthly Earnings
            </p>
            <p className="mt-3 text-4xl font-extrabold tracking-[-0.06em] text-brand-deep">
              {formatNaira(withRideSpot)}
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-[1.5rem] bg-canvas-subtle px-4 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                Without RideSpot
              </p>
              <p className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-ink">
                {formatNaira(withoutRideSpot)}
              </p>
            </div>
            <div className="rounded-[1.5rem] bg-canvas-subtle px-4 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                Extra Per Month
              </p>
              <p className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-brand-deep">
                +{formatNaira(extraPerMonth)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
