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
import type { AppStats, BrowserStats, WeekData, BarEntry, ActivityData } from "@/types";

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
  const [barData, setBarData] = useState<BarEntry[]>([]);

  const [selectedBarIdx, setSelectedBarIdx] = useState<number | null>(null);
  const [filteredData, setFilteredData] = useState<ActivityData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [data, bars] = await Promise.all([
        invoke<WeekData>("get_stats_by_range_offset", { days: RANGE_DAYS[range], offsetDays }),
        invoke<BarEntry[]>("get_bar_data_offset", { range, offsetDays }),
      ]);
      setStats(data);
      setBarData(bars);
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
                    const heightPct = (bar.total_secs / maxSecs) * 100;
                    const spread = range === "week" || range === "year";
                    const isSelected = selectedBarIdx === barIdx;
                    return (
                      <Tooltip key={bar.label}>
                        <TooltipTrigger asChild>
                          <div
                            className={`flex flex-col items-center gap-0 h-full cursor-pointer ${spread ? "flex-1" : "min-w-[24px]"}`}
                            onClick={() => handleBarClick(barIdx)}
                          >
                            <div className="flex-1 w-full flex flex-col justify-end min-h-0">
                              <div
                                className={`w-full rounded-t transition-colors ${
                                  isSelected
                                    ? "bg-primary"
                                    : "bg-primary/70 hover:bg-primary"
                                }`}
                                style={{ height: `${Math.max(heightPct, 3)}%`, maxWidth: spread ? "48px" : undefined, marginInline: spread ? "auto" : undefined }}
                              />
                            </div>
                            <span className={`text-[9px] leading-none mt-0.5 ${isSelected ? "text-primary font-bold" : "text-muted-foreground"}`}>
                              {bar.label}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{bar.label}: {formatDurationShort(bar.total_secs)}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                  </div>
                </TooltipProvider>
              </div>
            </div>
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
