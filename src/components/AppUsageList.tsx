import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { Monitor } from "lucide-react";
import { formatDurationShort } from "@/lib/format";
import type { AppStats } from "@/types";

interface Props {
  apps: AppStats[];
  totalSeconds: number;
}

export function AppUsageList({ apps, totalSeconds }: Props) {
  const navigate = useNavigate();

  if (apps.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            应用使用情况
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            暂无数据
          </div>
        </CardContent>
      </Card>
    );
  }

  const topApps = apps.slice(0, 15);
  const maxSeconds = topApps[0]?.total_secs || 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          应用使用情况
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {topApps.map((app) => (
              <div
                key={app.name}
                className="space-y-1.5 cursor-pointer rounded-md hover:bg-muted/50 px-2 -mx-2 py-2 transition-colors"
                onClick={() => navigate(`/details/${encodeURIComponent(app.name)}`)}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate max-w-[200px]">
                    {app.name}
                  </span>
                  <span className="text-muted-foreground shrink-0 ml-2">
                    {formatDurationShort(app.total_secs)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress
                    value={(app.total_secs / maxSeconds) * 100}
                    className="h-2"
                  />
                  <span className="text-xs text-muted-foreground w-10 text-right">
                    {Math.round((app.total_secs / totalSeconds) * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
