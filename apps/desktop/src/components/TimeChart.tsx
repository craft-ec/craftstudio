import {
  ResponsiveContainer,
  LineChart,
  AreaChart,
  BarChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type ChartType = "line" | "area" | "bar";

interface Series {
  key: string;
  label: string;
  color?: string;
}

interface TimeChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  series: Series[];
  type?: ChartType;
  height?: number;
  title?: string;
  formatValue?: (v: number) => string;
  formatX?: (v: string) => string;
}

const ACCENT = "#7c3aed"; // craftec purple
const COLORS = [ACCENT, "#06b6d4", "#f59e0b", "#10b981", "#ef4444"];

export default function TimeChart({
  data,
  xKey,
  series,
  type = "line",
  height = 220,
  title,
  formatValue = (v) => String(v),
  formatX,
}: TimeChartProps) {
  const seriesWithColor = series.map((s, i) => ({
    ...s,
    color: s.color || COLORS[i % COLORS.length],
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFormatter = (value: any, name: any) => {
    const s = seriesWithColor.find((x) => x.key === name);
    return [formatValue(Number(value) || 0), s?.label || String(name)];
  };

  const common = {
    data,
    margin: { top: 4, right: 8, left: 0, bottom: 0 },
  };

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
      <XAxis
        dataKey={xKey}
        tick={{ fill: "#6b7280", fontSize: 11 }}
        tickFormatter={formatX}
        axisLine={{ stroke: "#e5e7eb" }}
        tickLine={false}
      />
      <YAxis
        tick={{ fill: "#6b7280", fontSize: 11 }}
        tickFormatter={(v: number) => formatValue(v)}
        axisLine={false}
        tickLine={false}
        width={52}
      />
      <Tooltip
        contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}
        labelStyle={{ color: "#6b7280" }}
        formatter={tooltipFormatter}
      />
    </>
  );

  const renderChart = () => {
    if (type === "area") {
      return (
        <AreaChart {...common}>
          {axes}
          {seriesWithColor.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      );
    }
    if (type === "bar") {
      return (
        <BarChart {...common}>
          {axes}
          {seriesWithColor.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      );
    }
    return (
      <LineChart {...common}>
        {axes}
        {seriesWithColor.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    );
  };

  return (
    <div className="bg-white rounded-xl p-4">
      {title && <h2 className="text-sm font-semibold text-gray-700 mb-3">{title}</h2>}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
