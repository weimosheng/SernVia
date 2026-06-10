import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDurationShort, getFaviconUrl } from "@/lib/format";
import { BarChart3, Globe, Monitor, Trophy, Calendar } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import type { AppStats, BrowserStats, WeekData, ActivityData } from "@/types";

// Category-aware bar data (used in stacked-bar chart on Stats page)
interface BarSegment {
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  secs: number;
}
interface CategoryBarEntry {
  label: string;
  total_secs: number;
  segments: BarSegment[];
}

type TimeRange = "day" | "week" | "month" | "year";

const RANGE_DAYS: Record<TimeRange, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};



function getRangeLabel(range: TimeRange, offsetDays: number): string {
  if (offsetDays === 0) {
    const labels: Record<TimeRange, string> = {
      day: "今日",
      week: "本周",
      month: "本月",
      year: "本年",
    };
    return labels[range];
  }
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (range === "day") return dateStr;
  if (range === "week") return `${dateStr} 起一周`;
  if (range === "month") {
    const m = d.getMonth() + 1;
    return `${d.getFullYear()}年${m}月`;
  }
  return `${d.getFullYear()}年`;
}

const BAR_TITLES: Record<TimeRange, string> = {
  day: "每小时活跃时间",
  week: "每日活跃时间",
  month: "每日活跃时间",
  year: "每月活跃时间",
};

function emptyData(date: Date): ActivityData {
  const ys = date.getFullYear();
  const ms = String(date.getMonth() + 1).padStart(2, "0");
  const ds = String(date.getDate()).padStart(2, "0");
  return {
    date: `${ys}-${ms}-${ds}`,
    total_active_secs: 0,
    apps: [],
    browsers: [],
    history: [],
  };
}

export function StatsPage() {
  const [range, setRange] = useState<TimeRange>("day");
  const [offsetDays, setOffsetDays] = useState(0);
  const [stats, setStats] = useState<WeekData | null>(null);
  const [barData, setBarData] = useState<CategoryBarEntry[]>([]);

  // Global list of categories that actually appear in the data, with consistent colors
  // Each entry: { id, name, color, total_secs }
  // Uncategorised (id = null) is treated as a regular "category" for rendering purposes.
  const [categoryLegend, setCategoryLegend] = useState<
    { id: string | null; name: string; color: string; total_secs: number }[]
  >([]);

  const [selectedBarIdx, setSelectedBarIdx] = useState<number | null>(null);
  const [filteredData, setFilteredData] = useState<ActivityData | null>(null);

  // Default colour for uncategorised. Categories themselves carry a `category_color`
  // from the backend, which we use when provided (falls back to this palette otherwise).
  const FALLBACK_COLORS = [
    "#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6",
    "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
  ];
  const UNCATEGORIZED_COLOR = "#94a3b8";

  const fetchData = useCallback(async () => {
    try {
      const [data, bars] = await Promise.all([
        invoke<WeekData>("get_stats_by_range_offset", { days: RANGE_DAYS[range], offsetDays, range }),
        invoke<CategoryBarEntry[]>("get_category_bar_data", { range, offsetDays }),
      ]);
      setStats(data);
      setBarData(bars);

      // Build the legend: walk all segments, collect unique category IDs,
      // and sum total seconds per category across all bars for ordering.
      const byId = new Map<string | null, { name: string; color: string | null; total_secs: number }>();
      for (const b of bars) {
        for (const seg of b.segments) {
          const id = seg.category_id ?? null;
          const existing = byId.get(id);
          if (existing) {
            existing.total_secs += seg.secs;
          } else {
            byId.set(id, {
              name: seg.category_name ?? (id === null ? "未分类" : "未命名分类"),
              color: seg.category_color,
              total_secs: seg.secs,
            });
          }
        }
      }

      // Sorted by total seconds (largest first), uncategorised always at the very end.
      const sorted = Array.from(byId.entries())
        .sort((a, b) => {
          if (a[0] === null) return 1;
          if (b[0] === null) return -1;
          return b[1].total_secs - a[1].total_secs;
        });

      // Assign fallback colours for categories that the server didn't provide one,
      // and finalise the legend.
      let fallbackIdx = 0;
      const legend = sorted.map(([id, info]) => {
        let color = info.color;
        if (!color) {
          color = id === null ? UNCATEGORIZED_COLOR : FALLBACK_COLORS[fallbackIdx % FALLBACK_COLORS.length];
          fallbackIdx++;
        }
        return { id, name: info.name, color: color!, total_secs: info.total_secs };
      });
      setCategoryLegend(legend);

      setSelectedBarIdx(null);
      setFilteredData(null);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, [range, offsetDays]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // When a bar is selected, use filteredData for the ranking lists
  const displayApps = filteredData?.apps ?? stats?.apps ?? [];
  const displayBrowsers = filteredData?.browsers ?? stats?.browsers ?? [];
  const displayTotalSecs = filteredData?.total_active_secs ?? stats?.total_active_secs ?? 0;
  const totalApps = displayApps.length;
  const totalBrowsers = displayBrowsers.length;
  const activeDays = stats?.days.length ?? 0;

  const selectedDate = new Date();
  selectedDate.setDate(selectedDate.getDate() - offsetDays);

  const handleDateChange = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    setOffsetDays(Math.max(0, diff));
  };

  const handleReset = () => setOffsetDays(0);

  const handleBarClick = async (barIndex: number) => {
    if (selectedBarIdx === barIndex) {
      setSelectedBarIdx(null);
      setFilteredData(null);
      return;
    }

    const refDate = new Date();
    refDate.setDate(refDate.getDate() - offsetDays);

    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let result: ActivityData;
      let diff: number;

      if (range === "day") {
        result = await invoke<ActivityData>("get_stats_for_hour", { offsetDays, hour: barIndex });
      } else if (range === "week") {
        const dayOfWeek = refDate.getDay();
        const monOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(refDate);
        monday.setDate(refDate.getDate() + monOffset);
        const targetDate = new Date(monday);
        targetDate.setDate(monday.getDate() + barIndex);
        targetDate.setHours(0, 0, 0, 0);
        diff = Math.round((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diff < 0) { setFilteredData(emptyData(targetDate)); setSelectedBarIdx(barIndex); return; }
        result = await invoke<ActivityData>("get_stats_for_date", { offsetDays: diff });
      } else if (range === "month") {
        const targetDate = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
        targetDate.setDate(targetDate.getDate() + barIndex);
        if (targetDate.getMonth() !== refDate.getMonth()) return;
        targetDate.setHours(0, 0, 0, 0);
        diff = Math.round((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diff < 0) { setFilteredData(emptyData(targetDate)); setSelectedBarIdx(barIndex); return; }
        result = await invoke<ActivityData>("get_stats_for_date", { offsetDays: diff });
      } else {
        // year
        const targetDate = new Date(refDate.getFullYear(), barIndex, 1);
        targetDate.setHours(0, 0, 0, 0);
        diff = Math.round((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diff < 0) { setFilteredData(emptyData(targetDate)); setSelectedBarIdx(barIndex); return; }
        result = await invoke<ActivityData>("get_stats_for_date", { offsetDays: diff });
      }

      setFilteredData(result);
      setSelectedBarIdx(barIndex);
    } catch (err) {
      console.error("Failed to fetch filtered data:", err);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            统计
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {getRangeLabel(range, offsetDays)}数据总览
            {range === "day" && stats?.days[0] ? ` · ${stats.days[0].date}` : ""}
            {selectedBarIdx !== null && filteredData ? ` · 筛选: ${barData[selectedBarIdx]?.label} (${formatDurationShort(filteredData.total_active_secs)})` : ""}
          </p>
        </div>

        {/* Date navigation + Time range selector */}
        <div className="flex items-center gap-3">
          {/* Date picker */}
          <DatePicker value={selectedDate} onChange={handleDateChange} range={range} />
          {offsetDays > 0 && (
            <button
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground underline transition-colors shrink-0"
            >
              回到今天
            </button>
          )}

          {/* Time range selector */}
          <div className="flex rounded-lg border p-0.5 bg-muted/50">
            {(Object.keys(RANGE_DAYS) as TimeRange[]).map((key) => (
              <button
                key={key}
                onClick={() => { setRange(key); setOffsetDays(0); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  range === key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {key === "day" ? "日" : key === "week" ? "周" : key === "month" ? "月" : "年"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">总活跃时间</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatDurationShort(displayTotalSecs)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">使用应用数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{totalApps}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">浏览网页数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{totalBrowsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">活跃天数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-blue-500">{activeDays} 天</div>
          </CardContent>
        </Card>
      </div>

      {/* Bar chart */}
      {barData.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {BAR_TITLES[range]}
              <span className="text-[11px] font-normal text-muted-foreground ml-2">
                （按分类堆叠显示）
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {/* Y-axis labels */}
              <div className="flex flex-col justify-between shrink-0 py-[2px]" style={{ height: "7rem" }}>
                {(() => {
                  const maxSecs = Math.max(...barData.map((b) => b.total_secs), 1);
                  const formatAxis = (s: number) => {
                    if (s >= 3600) return `${Math.round(s / 3600)}小时`;
                    if (s >= 60) return `${Math.round(s / 60)}分钟`;
                    return `${s}秒`;
                  };
                  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxSecs * f));
                  return ticks.reverse().map((t, i) => (
                    <span key={i} className="text-[10px] text-muted-foreground/50 leading-none">
                      {t > 0 ? formatAxis(t) : ""}
                    </span>
                  ));
                })()}
              </div>
              {/* Bars */}
              <div className={`flex-1 min-w-0 ${range === "week" || range === "year" ? "" : "overflow-x-auto overflow-y-visible"}`}>
                <TooltipProvider delayDuration={100}>
                  <div className="flex items-end gap-[2px] h-28 pb-1 min-w-fit">
                  {barData.map((bar, barIdx) => {
                    const maxSecs = Math.max(...barData.map((b) => b.total_secs), 1);
                    const totalHeightPct = (bar.total_secs / maxSecs) * 100;
                    const spread = range === "week" || range === "year";
                    const isSelected = selectedBarIdx === barIdx;

                    // Ensure each segment uses a consistent colour across bars.
                    // Build a lookup from category_id → legend colour.
                    const legendColor = new Map<string | null, string>();
                    for (const l of categoryLegend) legendColor.set(l.id, l.color);

                    // Order segments by the legend order (so segment stacking
                    // matches the legend order top-to-bottom). Uncategorised
                    // goes last (= bottom).
                    const orderedSegs = [...bar.segments].sort((a, b) => {
                      const ai = categoryLegend.findIndex((l) => l.id === (a.category_id ?? null));
                      const bi = categoryLegend.findIndex((l) => l.id === (b.category_id ?? null));
                      if (ai < 0 && bi < 0) return 0;
                      if (ai < 0) return 1;
                      if (bi < 0) return -1;
                      return ai - bi;
                    });

                    // For the tooltip content
                    const tooltipLines = orderedSegs
                      .filter((s) => s.secs > 0)
                      .map((s) => {
                        const name =
                          categoryLegend.find((l) => l.id === (s.category_id ?? null))?.name
                          ?? s.category_name
                          ?? "未分类";
                        return `${name}: ${formatDurationShort(s.secs)}`;
                      });

                    return (
                      <Tooltip key={bar.label}>
                        <TooltipTrigger asChild>
                          <div
                            className={`flex flex-col items-center gap-0 h-full cursor-pointer ${spread ? "flex-1" : "min-w-[24px]"}`}
                            onClick={() => handleBarClick(barIdx)}
                          >
                            <div className="flex-1 w-full flex flex-col justify-end min-h-0">
                              <div
                                className={`w-full rounded-t overflow-hidden ${
                                  isSelected ? "ring-2 ring-primary" : ""
                                }`}
                                style={{
                                  height: `${Math.max(totalHeightPct, 3)}%`,
                                  maxWidth: spread ? "48px" : undefined,
                                  marginInline: spread ? "auto" : undefined,
                                }}
                              >
                                {/* Stacked segments — fill them from top down using the
                                    sorted-by-legend order. */}
                                <div className="w-full h-full flex flex-col justify-end">
                                  {orderedSegs.map((seg, segIdx) => {
                                    if (seg.secs <= 0 || bar.total_secs === 0) return null;
                                    const segPct = (seg.secs / bar.total_secs) * 100;
                                    if (segPct <= 0) return null;
                                    const color =
                                      legendColor.get(seg.category_id ?? null)
                                      ?? seg.category_color
                                      ?? UNCATEGORIZED_COLOR;
                                    // Only add tiny top/right border between segments
                                    const style: React.CSSProperties = {
                                      height: `${segPct}%`,
                                      backgroundColor: color,
                                    };
                                    if (segIdx > 0) {
                                      style.borderTop = "1px solid rgba(255,255,255,0.5)";
                                    }
                                    return (
                                      <div
                                        key={seg.category_id ?? "__uncat__"}
                                        style={style}
                                        title={`${
                                          categoryLegend.find((l) => l.id === (seg.category_id ?? null))?.name
                                          ?? seg.category_name
                                          ?? "未分类"
                                        }: ${formatDurationShort(seg.secs)}`}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                            <span className={`text-[9px] leading-none mt-0.5 ${isSelected ? "text-primary font-bold" : "text-muted-foreground"}`}>
                              {bar.label}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs space-y-0.5">
                            <div className="font-bold">{bar.label}: {formatDurationShort(bar.total_secs)}</div>
                            {tooltipLines.length > 0 ? (
                              tooltipLines.map((l, i) => <div key={i}>{l}</div>)
                            ) : (
                              <div className="text-muted-foreground">无活动</div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                  </div>
                </TooltipProvider>
              </div>
            </div>

            {/* Legend: category → colour */}
            {categoryLegend.length > 0 && (
              <div className="mt-4 pt-3 border-t flex flex-wrap gap-3">
                {categoryLegend.map((l) => (
                  <div key={l.id ?? "__uncat__"} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{ backgroundColor: l.color }}
                    />
                    <span className="max-w-[120px] truncate">{l.name}</span>
                    <span className="text-[10px]">
                      {formatDurationShort(l.total_secs)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="apps" className="w-full">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="apps" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" /> 应用排行
          </TabsTrigger>
          <TabsTrigger value="browsers" className="flex items-center gap-2">
            <Globe className="h-4 w-4" /> 网站排行
          </TabsTrigger>
        </TabsList>

        <TabsContent value="apps" className="mt-4">
          <AppRanking apps={displayApps} totalSeconds={displayTotalSecs} />
        </TabsContent>

        <TabsContent value="browsers" className="mt-4">
          <BrowserRanking browsers={displayBrowsers} totalSeconds={displayTotalSecs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AppRanking({ apps, totalSeconds }: { apps: AppStats[]; totalSeconds: number }) {
  const navigate = useNavigate();

  if (apps.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>暂无数据</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...apps].sort((a, b) => b.total_secs - a.total_secs);
  const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#f97316", "#6366f1"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          应用使用时长排行榜
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-2">
            {sorted.map((app, idx) => {
              const pct = totalSeconds > 0 ? (app.total_secs / totalSeconds) * 100 : 0;
              return (
                <div key={app.name}>
                  <div
                    className="flex items-center gap-3 py-2 cursor-pointer rounded-md hover:bg-muted/50 px-1 -mx-1 transition-colors"
                    onClick={() => navigate(`/details/${encodeURIComponent(app.name)}`)}
                  >
                    <span className={`w-6 text-center text-sm font-bold ${idx < 3 ? "text-lg" : "text-muted-foreground"}`}
                      style={{ color: idx < 3 ? colors[idx] : undefined }}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{app.name}</span>
                        <span className="text-sm text-muted-foreground shrink-0 ml-2">
                          {formatDurationShort(app.total_secs)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={pct} className="h-1.5" />
                        <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(pct)}%</span>
                      </div>
                    </div>
                  </div>
                  {idx < sorted.length - 1 && <Separator />}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function BrowserRanking({ browsers, totalSeconds }: { browsers: BrowserStats[]; totalSeconds: number }) {
  if (browsers.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>暂无浏览数据</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...browsers].sort((a, b) => b.total_secs - a.total_secs);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-5 w-5 text-blue-500" />
          网站浏览时长排行榜
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-1">
            {sorted.map((b, idx) => {
              const pct = totalSeconds > 0 ? (b.total_secs / totalSeconds) * 100 : 0;
              return (
                <div key={b.domain}>
                  <div className="flex items-center gap-3 py-2">
                    <span className="w-6 text-center text-sm text-muted-foreground">{idx + 1}</span>
                    <img
                      src={getFaviconUrl(b.domain)}
                      alt=""
                      className="h-4 w-4 shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <span className="text-sm font-medium truncate block">{b.domain}</span>
                          <span className="text-xs text-muted-foreground truncate block">{b.title}</span>
                        </div>
                        <span className="text-sm text-muted-foreground shrink-0 ml-2">
                          {formatDurationShort(b.total_secs)}
                        </span>
                      </div>
                      <Progress value={pct} className="h-1 mt-1" />
                    </div>
                  </div>
                  {idx < sorted.length - 1 && <Separator />}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
