import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Clock, Globe, Monitor } from "lucide-react";
import { formatDurationShort, formatTimestamp } from "@/lib/format";
import type { ActivityEntry } from "@/types";

interface Props {
  history: ActivityEntry[];
}

export function ActivityHistory({ history }: Props) {
  if (history.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            活动历史
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            暂无历史记录
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          最近活动
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-1">
            {history.map((entry, index) => (
              <div key={index}>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {entry.is_browser ? (
                      <Globe className="h-4 w-4 text-blue-500 shrink-0" />
                    ) : (
                      <Monitor className="h-4 w-4 text-green-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">
                          {entry.app_name}
                        </span>
                        {entry.is_browser && entry.browser_domain && (
                          <span className="text-xs text-blue-500 truncate">
                            {entry.browser_domain}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {entry.window_title}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(entry.start_time)}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {formatDurationShort(entry.duration_secs)}
                    </Badge>
                  </div>
                </div>
                {index < history.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
