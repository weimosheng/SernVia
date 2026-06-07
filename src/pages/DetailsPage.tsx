import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDurationShort } from "@/lib/format";
import { ListTree, Search, Globe, Monitor } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import type { ActivityData, AppStats, BrowserStats, WeekData } from "@/types";

type TimeRange = "day" | "week" | "month" | "year";

const RANGE_DAYS: Record<TimeRange, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};



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

export function DetailsPage() {
  const [range, setRange] = useState<TimeRange>("day");
  const [offsetDays, setOffsetDays] = useState(0);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [dayData, setDayData] = useState<ActivityData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = useCallback(async () => {
    try {
      if (range === "day") {
        // For single day, get full ActivityData with history
        const data = await invoke<ActivityData>("get_stats_for_date", { offsetDays });
        setDayData(data);
        setWeekData(null);
      } else {
        // For multi-day ranges, use WeekData
        const data = await invoke<WeekData>("get_stats_by_range_offset", {
          days: RANGE_DAYS[range],
          offsetDays,
        });
        setWeekData(data);
        setDayData(null);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
  }, [range, offsetDays]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Compute display data from either source
  const displayStats = range === "day" ? dayData : null;
  const displayWeek = range !== "day" ? weekData : null;

  const appsSource = displayStats?.apps ?? displayWeek?.apps ?? [];
  const browsersSource = displayStats?.browsers ?? displayWeek?.browsers ?? [];

  const filteredApps = appsSource.filter((app) =>
    !searchTerm || app.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBrowsers = browsersSource.filter((b) =>
    !searchTerm || b.domain.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  const dateInfo = range === "day" && displayStats
    ? ` · ${displayStats.date}`
    : displayWeek?.days && displayWeek.days.length > 0
      ? ` · ${displayWeek.days[0].date} 起`
      : "";

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ListTree className="h-6 w-6" />
            详细记录
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {getRangeLabel(range, offsetDays)}数据{dateInfo}
          </p>
        </div>

        {/* Controls */}
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

          {/* Search */}
          <div className="relative w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue="apps" className="w-full">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="apps" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" /> 应用
          </TabsTrigger>
          <TabsTrigger value="browsers" className="flex items-center gap-2">
            <Globe className="h-4 w-4" /> 网站
          </TabsTrigger>
        </TabsList>

        <TabsContent value="apps" className="mt-4">
          <AppDetailList apps={filteredApps} />
        </TabsContent>

        <TabsContent value="browsers" className="mt-4">
          <BrowserDetailList browsers={filteredBrowsers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AppDetailList({ apps }: { apps: AppStats[] }) {
  const navigate = useNavigate();

  if (apps.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>暂无匹配的应用记录</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...apps].sort((a, b) => b.total_secs - a.total_secs);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">应用使用详情</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-1">
            {sorted.map((app, idx) => (
              <div key={app.name}>
                <div
                  className="flex items-center justify-between py-3 cursor-pointer rounded-md hover:bg-muted/50 px-2 -mx-2 transition-colors"
                  onClick={() => navigate(`/details/${encodeURIComponent(app.name)}`)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                      {app.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{app.name}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {formatDurationShort(app.total_secs)}
                  </Badge>
                </div>
                {idx < sorted.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function BrowserDetailList({ browsers }: { browsers: BrowserStats[] }) {
  if (browsers.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>暂无匹配的网站记录</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...browsers].sort((a, b) => b.total_secs - a.total_secs);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">网站浏览详情</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-1">
            {sorted.map((b, idx) => (
              <div key={b.domain}>
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${b.domain}&sz=32`}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{b.domain}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {b.title}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {formatDurationShort(b.total_secs)}
                  </Badge>
                </div>
                {idx < sorted.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
