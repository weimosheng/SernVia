import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatDurationShort } from "@/lib/format";
import { Clock, Globe, BarChart3, CalendarDays, Monitor } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { CurrentActivity, ActivityData, WeekData, AppStats } from "@/types";

export function HomePage() {
  const [activity, setActivity] = useState<CurrentActivity | null>(null);
  const [todayStats, setTodayStats] = useState<ActivityData | null>(null);
  const [weekStats, setWeekStats] = useState<WeekData | null>(null);
  const [tab, setTab] = useState("today");

  const fetchData = useCallback(async () => {
    try {
      const [current, data] = await Promise.all([
        invoke<CurrentActivity>("get_current_activity"),
        invoke<ActivityData>("get_stats"),
      ]);
      setActivity(current);
      setTodayStats(data);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    }
  }, []);

  const fetchWeek = useCallback(async () => {
    try {
      const week = await invoke<WeekData>("get_weekly_stats");
      setWeekStats(week);
    } catch (err) {
      console.error("Failed to fetch week stats:", err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchWeek();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData, fetchWeek]);

  const browserTime = todayStats?.browsers.reduce((sum, b) => sum + b.total_secs, 0) ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header + Compact Stats Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">首页</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {todayStats?.date ?? "今天"} · 使用情况概览
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Current activity - compact chip */}
          {activity?.app_name ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="font-medium truncate max-w-[120px]">{activity.app_name}</span>
              {activity.is_browser && <Globe className="h-3 w-3 text-blue-400" />}
              <span className="text-muted-foreground">{formatDurationShort(activity.active_seconds)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>等待中...</span>
            </div>
          )}
          {/* Summary pills */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5">
            <Clock className="h-3 w-3" />
            <span className="font-medium text-foreground">{formatDurationShort(todayStats?.total_active_secs ?? 0)}</span>
            <span className="hidden sm:inline">今日</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5">
            <Globe className="h-3 w-3 text-blue-400" />
            <span className="font-medium text-foreground">{formatDurationShort(browserTime)}</span>
            <span className="hidden sm:inline">网页</span>
          </div>
        </div>
      </div>

      {/* Today / Week Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v); if (v === "week") fetchWeek(); }}>
        <TabsList className="grid w-full max-w-[200px] grid-cols-2">
          <TabsTrigger value="today" className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> 今日
          </TabsTrigger>
          <TabsTrigger value="week" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> 本周
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4 space-y-6">
          {todayStats && todayStats.apps.length > 0 ? (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <BarChart3 className="h-5 w-5" /> 应用使用
              </h2>
              <AppCardGrid apps={todayStats.apps} totalSeconds={todayStats.total_active_secs} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Monitor className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">今日暂无数据</p>
              <p className="text-xs">打开应用后数据将自动记录</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="week" className="mt-4 space-y-6">
          <HomeWeekContent week={weekStats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HomeWeekContent({ week }: { week: WeekData | null }) {
  if (!week || week.total_active_secs === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <CalendarDays className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm">本周暂无数据</p>
        <p className="text-xs">使用应用后数据将自动记录</p>
      </div>
    );
  }

  return (
    <>
      {/* Week Summary Row - Compact */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-4 py-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-2xl font-bold">{formatDurationShort(week.total_active_secs)}</span>
          <span className="text-xs text-muted-foreground">本周活跃</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <Monitor className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{week.apps.length}</span> 应用
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <Globe className="h-3.5 w-3.5 text-blue-400" />
          <span className="font-medium text-foreground">{week.browsers.length}</span> 网站
        </div>
      </div>

      {/* Week Daily Chart - 折线图 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">每日活跃趋势</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={week.days.map(d => ({ ...d, label: d.date.slice(5) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v: number) => formatDurationShort(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    fontSize: 13,
                  }}
                  labelStyle={{ fontWeight: 600 }}
                  formatter={(value) => [formatDurationShort(Number(value ?? 0)), "活跃时长"]}
                  labelFormatter={(label) => `${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="total_secs"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Week App Usage */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> 本周应用排行
        </h2>
        <AppCardGrid apps={week.apps.slice(0, 12)} totalSeconds={week.total_active_secs} />
      </div>
    </>
  );
}

/* ====== App Icon Cache Hook ====== */
const iconCache = new Map<string, string>();

function useAppIcon(appName: string, processName?: string): string | null {
  const [icon, setIcon] = useState<string | null>(null);

  useEffect(() => {
    if (iconCache.has(appName)) {
      setIcon(iconCache.get(appName)!);
      return;
    }

    // Use process_name if available; otherwise derive from app name
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

/* ====== App Card Grid ====== */
const APP_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-amber-500",
  "bg-emerald-500", "bg-cyan-500", "bg-orange-500", "bg-indigo-500",
  "bg-rose-500", "bg-teal-500", "bg-violet-500", "bg-lime-500",
];

function AppCardGrid({ apps, totalSeconds }: { apps: AppStats[]; totalSeconds: number }) {
  if (apps.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm border rounded-lg">
        暂无应用使用数据
      </div>
    );
  }

  const sorted = [...apps].sort((a, b) => b.total_secs - a.total_secs);

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {sorted.map((app, idx) => {
        const pct = totalSeconds > 0 ? Math.round((app.total_secs / totalSeconds) * 100) : 0;
        const color = APP_COLORS[idx % APP_COLORS.length];
        return (
          <AppCard key={app.name} app={app} pct={pct} color={color} />
        );
      })}
    </div>
  );
}

function AppCard({ app, pct, color }: { app: AppStats; pct: number; color: string }) {
  const icon = useAppIcon(app.name, app.process_name);
  const navigate = useNavigate();

  return (
    <Card
      className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => navigate(`/details/${encodeURIComponent(app.name)}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {/* Icon */}
          {icon ? (
            <img src={icon} alt="" className="h-10 w-10 shrink-0 rounded-lg" />
          ) : (
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white text-sm font-bold ${color}`}>
              {app.name.charAt(0).toUpperCase()}
            </div>
          )}
          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{app.name}</p>
            <p className="text-xs text-muted-foreground">{formatDurationShort(app.total_secs)}</p>
          </div>
          {/* Percentage Badge */}
          <Badge variant="secondary" className="shrink-0">{pct}%</Badge>
        </div>
        <Progress value={pct} className="h-1 mt-3" />
      </CardContent>
    </Card>
  );
}
