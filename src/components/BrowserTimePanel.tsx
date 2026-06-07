import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Globe } from "lucide-react";
import { formatDurationShort, getFaviconUrl } from "@/lib/format";
import type { BrowserStats } from "@/types";

interface Props {
  browsers: BrowserStats[];
  totalSeconds: number;
}

export function BrowserTimePanel({ browsers, totalSeconds }: Props) {
  if (browsers.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" />
            网页浏览时间
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            暂无浏览数据
          </div>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...browsers].sort((a, b) => b.total_secs - a.total_secs);
  const maxSeconds = sorted[0]?.total_secs || 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="h-5 w-5" />
          网页浏览时间
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {sorted.map((b) => (
              <div key={b.domain} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 truncate max-w-[250px]">
                    <img
                      src={getFaviconUrl(b.domain)}
                      alt=""
                      className="h-4 w-4 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <span className="font-medium truncate">{b.domain}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0 ml-2">
                    {formatDurationShort(b.total_secs)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress
                    value={(b.total_secs / maxSeconds) * 100}
                    className="h-2"
                  />
                  <span className="text-xs text-muted-foreground w-10 text-right">
                    {Math.round((b.total_secs / totalSeconds) * 100)}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate pl-6">
                  {b.title}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
