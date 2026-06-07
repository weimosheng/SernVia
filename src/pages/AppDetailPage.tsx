import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatDurationShort } from "@/lib/format";
import {
  ArrowLeft, Clock, CalendarDays, Calendar, CalendarCheck,
  TrendingUp, FolderOpen,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { DatePicker } from "@/components/ui/date-picker";
import type { AppTimeStats, BarEntry } from "@/types";

type TimeRange = "day" | "week" | "month" | "year";

const RANGES: { key: TimeRange; label: string; icon: typeof Clock }[] = [
  { key: "day", label: "今日", icon: Clock },
  { key: "week", label: "本周", icon: CalendarDays },
  { key: "month", label: "本月", icon: Calendar },
  { key: "year", label: "本年", icon: CalendarCheck },
];

const CHART_DAYS: Record<TimeRange, number> = {
  day: 1,
  week: 7,
  month: 31,
  year: 365,
};

const CHART_TITLES: Record<TimeRange, string> = {
  day: "每小时使用趋势",
  week: "每日使用趋势",
  month: "每日使用趋势",
  year: "每月使用趋势",
};

const APP_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-amber-500",
  "bg-emerald-500", "bg-cyan-500", "bg-orange-500", "bg-indigo-500",
];

// App icon cache (shared across all pages via module-level Map)
const iconCache = new Map<string, string>();

function useAppIcon(appName: string, processName?: string): string | null {
  const [icon, setIcon] = useState<string | null>(null);

  useEffect(() => {
    if (iconCache.has(appName)) {
      setIcon(iconCache.get(appName)!);
      return;
    }
    const procName = processName || `${appName.replace(/\s+/g, '').toLowerCase()}.exe`;
    invoke<string | null>("get_app_icon", { processName: procName })
      .then((base64) => {
        if (base64) {
          const dataUrl = `data:image/png;base64,${base64}`;
          iconCache.set(appName, dataUrl);
          setIcon(dataUrl);
        } else {
          setIcon(null);
        }
      })
      .catch(() => setIcon(null));
  }, [appName, processName]);

  return icon;
}

function getRangeLabel(range: TimeRange, offsetDays: number): string {
  if (offsetDays === 0) {
    const labels: Record<TimeRange, string> = { day: "今日", week: "本周", month: "本月", year: "本年" };
    return labels[range];
  }
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (range === "day") return dateStr;
  if (range === "week") return `${dateStr} 起一周`;
  if (range === "month") return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  return `${d.getFullYear()}年`;
}

export function AppDetailPage() {
  const { appName } = useParams<{ appName: string }>();
  const navigate = useNavigate();
  const decodedName = appName ? decodeURIComponent(appName) : "";
  const [stats, setStats] = useState<AppTimeStats | null>(null);
  const [chartData, setChartData] = useState<BarEntry[] | null>(null);
  const [activeRange, setActiveRange] = useState<TimeRange>("day");
  const [offsetDays, setOffsetDays] = useState(0);
  const [appPath, setAppPath] = useState<string | null>(null);

  const icon = useAppIcon(decodedName, stats?.process_name);

  const fetchData = useCallback(async () => {
    if (!decodedName) return;
    try {
      const isHourly = CHART_DAYS[activeRange] === 1;
      const [data, bars] = await Promise.all([
        invoke<AppTimeStats>("get_app_time_stats", { appName: decodedName, offsetDays }),
        isHourly
          ? invoke<BarEntry[]>("get_app_hourly_stats", { appName: decodedName, offsetDays })
          : invoke<BarEntry[]>("get_app_daily_stats", {
              appName: decodedName,
              days: CHART_DAYS[activeRange],
              offsetDays,
            }),
      ]);
      setStats(data);
      setChartData(bars);
    } catch (err) {
      console.error("Failed to fetch app data:", err);
    }
  }, [decodedName, offsetDays, activeRange]);

  // Fetch app path once we have process_name
  useEffect(() => {
    if (stats?.process_name && !appPath) {
      invoke<string | null>("get_app_path", { processName: stats.process_name })
        .then(setAppPath)
        .catch(() => {});
    }
  }, [stats?.process_name, appPath]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getRangeSecs = (range: TimeRange): number => {
    if (!stats) return 0;
    switch (range) {
      case "day": return stats.day_secs;
      case "week": return stats.week_secs;
      case "month": return stats.month_secs;
      case "year": return stats.year_secs;
    }
  };

  const getTotalSecs = (range: TimeRange): number => {
    if (!stats) return 0;
    switch (range) {
      case "day": return stats.day_total_secs;
      case "week": return stats.week_total_secs;
      case "month": return stats.month_total_secs;
      case "year": return stats.year_total_secs;
    }
  };

  const currentSecs = getRangeSecs(activeRange);
  const totalSecs = getTotalSecs(activeRange);
  const pct = totalSecs > 0 ? Math.round((currentSecs / totalSecs) * 100) : 0;

  const selectedDate = new Date();
  selectedDate.setDate(selectedDate.getDate() - offsetDays);

  const handleDateChange = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    setOffsetDays(Math.max(0, diff));
  };

  // Generate color for this app
  const colorIndex = decodedName.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % APP_COLORS.length;
  const appColor = APP_COLORS[colorIndex];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <div className="flex items-center gap-2">
          <DatePicker value={selectedDate} onChange={handleDateChange} range={activeRange} />
          {offsetDays > 0 && (
            <button
              onClick={() => setOffsetDays(0)}
              className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
            >
              回到今天
            </button>
          )}
        </div>
      </div>

      {/* App Title + Icon + Path */}
      <div className="flex items-center gap-3">
        {icon ? (
          <img src={icon} alt="" className="h-12 w-12 shrink-0 rounded-xl" />
        ) : (
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white text-lg font-bold ${appColor}`}>
            {decodedName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{decodedName}</h1>
          {appPath ? (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
              <FolderOpen className="h-3 w-3 shrink-0" />
              {appPath}
            </p>
          ) : stats?.process_name ? (
            <p className="text-sm text-muted-foreground">{stats.process_name}</p>
          ) : null}
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border p-0.5 bg-muted/50 w-fit">
          {RANGES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveRange(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeRange === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">
          {getRangeLabel(activeRange, offsetDays)}
        </span>
      </div>

      {/* Summary + Chart side by side */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-5">
        {/* Left: Summary */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {RANGES.find((r) => r.key === activeRange)?.label}使用时长
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-2">
              <div className="text-5xl font-bold tracking-tight">
                {formatDurationShort(currentSecs)}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                占活跃时间的 {pct}%
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{decodedName}</span>
                <span className="font-medium">{formatDurationShort(currentSecs)}</span>
              </div>
              <Progress value={pct} className="h-3" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>总活跃: {formatDurationShort(totalSecs)}</span>
                <Badge variant="secondary">{pct}%</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right: Chart - always rendered */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {CHART_TITLES[activeRange]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-44">
              {chartData && chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" key={activeRange + "-" + offsetDays}>
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval={activeRange === "day" ? 2 : activeRange === "year" ? 1 : 0}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => {
                        if (v >= 3600) return `${Math.round(v / 3600)}h`;
                        if (v >= 60) return `${Math.round(v / 60)}m`;
                        return `${v}s`;
                      }}
                    />
                    <Tooltip
                      formatter={(value: any) => formatDurationShort(value as number)}
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Line
                      type="linear"
                      dataKey="total_secs"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "var(--color-primary)", strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  暂无趋势数据
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* All Ranges Overview - Compact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            各时段概览
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {RANGES.map(({ key, label, icon: Icon }) => {
              const secs = getRangeSecs(key);
              const total = getTotalSecs(key);
              const rangePct = total > 0 ? Math.round((secs / total) * 100) : 0;
              return (
                <button
                  key={key}
                  onClick={() => setActiveRange(key)}
                  className={`rounded-lg border p-3 text-left transition-all hover:shadow-md ${
                    activeRange === key ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                  <div className="text-base font-bold">{formatDurationShort(secs)}</div>
                  <div className="flex items-center gap-1 mt-1">
                    <Progress value={rangePct} className="h-1 flex-1" />
                    <span className="text-xs text-muted-foreground shrink-0">{rangePct}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
