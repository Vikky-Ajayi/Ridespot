
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer
} from "recharts";
import type { Hotspot } from "@/types";

export interface DemandByHourChartProps {
  hotspot: Hotspot;
}

export function DemandByHourChart({ hotspot }: DemandByHourChartProps) {
  const chartData = hotspot.demandByHour.map((value, index) => ({
    value,
    isCurrent: index === hotspot.currentHourIndex
  }));

  return (
    <div>
      <div className="h-[120px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={26}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.isCurrent ? "#00D46A" : "#E5E7EB"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div
        className="mt-1 grid text-[0.72rem] font-semibold"
        style={{ gridTemplateColumns: `repeat(${chartData.length}, minmax(0, 1fr))` }}
      >
        {chartData.map((entry, index) => (
          <div key={index} className="text-center">
            {index === 0 ? (
              <span className="text-[#7A7A7A]">9AM</span>
            ) : entry.isCurrent ? (
              <span className="text-[#00A856]">NOW</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
