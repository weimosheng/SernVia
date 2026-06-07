import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Globe, Monitor, Clock } from "lucide-react";
import { formatDuration } from "@/lib/format";
import type { CurrentActivity } from "@/types";

interface Props {
  activity: CurrentActivity | null;
}

export function ActiveAppCard({ activity }: Props) {
  const navigate = useNavigate();

  if (!activity || !activity.app_name) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            当前活动
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mb-2" />
            <p className="text-sm">暂无活动数据</p>
            <p className="text-xs">等待采集...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/details/${encodeURIComponent(activity.app_name)}`)}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          当前活动
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {activity.is_browser ? (
                <Globe className="h-5 w-5 text-blue-500" />
              ) : (
                <Monitor className="h-5 w-5 text-green-500" />
              )}
              <span className="font-semibold text-lg">{activity.app_name}</span>
              {activity.is_browser && (
                <Badge variant="secondary" className="text-xs">
                  浏览器
                </Badge>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              已用 {formatDuration(activity.active_seconds)}
            </span>
          </div>

          <div className="text-sm text-muted-foreground truncate">
            {activity.window_title || "（无窗口标题）"}
          </div>

          {activity.browser_domain && (
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-blue-400" />
              <span className="text-blue-500">{activity.browser_domain}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
