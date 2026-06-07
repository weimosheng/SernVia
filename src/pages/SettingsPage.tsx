import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Settings, Monitor, Trash2, Download, Info, ExternalLink, Loader2, FolderOpen, RotateCcw, Power } from "lucide-react";

export function SettingsPage() {
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataPath, setDataPath] = useState<string>("%APPDATA%/sernvia/activity_data.json");
  const [pathMsg, setPathMsg] = useState<string>("");
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(true);

  // Load autostart status on mount
  useEffect(() => {
    invoke<boolean>("plugin:autostart|is_enabled")
      .then(setAutostartEnabled)
      .catch(() => {})
      .finally(() => setAutostartLoading(false));
  }, []);

  const handleToggleAutostart = async () => {
    setAutostartLoading(true);
    try {
      if (autostartEnabled) {
        await invoke("plugin:autostart|disable");
        setAutostartEnabled(false);
      } else {
        await invoke("plugin:autostart|enable");
        setAutostartEnabled(true);
      }
    } catch (err) {
      console.error("Autostart toggle failed:", err);
    } finally {
      setAutostartLoading(false);
    }
  };

  // Load the actual data path on mount
  useEffect(() => {
    invoke<string>("get_data_path").then(setDataPath).catch(() => {});
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const path = await save({
        defaultPath: "sernvia-export.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) {
        await invoke("export_data", { path });
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm("确定要清除所有统计数据吗？此操作不可恢复！")) {
      return;
    }
    setClearing(true);
    try {
      await invoke("clear_data");
      alert("数据已清除");
    } catch (err) {
      console.error("Clear failed:", err);
    } finally {
      setClearing(false);
    }
  };

  const handleChangePath = async () => {
    const dir = await open({
      directory: true,
      multiple: false,
      title: "选择数据存储目录",
    });
    if (dir) {
      setSaving(true);
      setPathMsg("");
      try {
        const newPath = `${dir}\\sernvia_data.json`;
        await invoke("set_data_path", { newPath });
        const actualPath = await invoke<string>("get_data_path");
        setDataPath(actualPath);
        setPathMsg("存储位置已更新");
      } catch (err) {
        setPathMsg("更新失败: " + err);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleResetPath = async () => {
    setSaving(true);
    setPathMsg("");
    try {
      const defaultPath = await invoke<string>("get_default_data_path");
      await invoke("set_data_path", { newPath: defaultPath });
      const actualPath = await invoke<string>("get_data_path");
      setDataPath(actualPath);
      setPathMsg("已恢复默认位置");
    } catch (err) {
      setPathMsg("恢复失败: " + err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6" />
          设置
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          配置应用行为和统计数据管理
        </p>
      </div>

      {/* 监控设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            监控设置
          </CardTitle>
          <CardDescription>配置哪些应用和网站需要被统计</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">进程监控</p>
              <p className="text-xs text-muted-foreground">
                每秒轮询前台窗口，记录使用时长
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-green-500">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              运行中
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">浏览器监控</p>
              <p className="text-xs text-muted-foreground">
                自动检测 Chrome、Edge、Firefox 等浏览器窗口
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-green-500">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              已启用
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">支持的应用</p>
              <p className="text-xs text-muted-foreground">
                VS Code、Word、Excel、QQ、微信、钉钉等常见应用
              </p>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">开机自启动</p>
              <p className="text-xs text-muted-foreground">
                开机后自动运行并显示在系统托盘中
              </p>
            </div>
            <Button
              variant={autostartEnabled ? "default" : "outline"}
              size="sm"
              className="flex items-center gap-1"
              onClick={handleToggleAutostart}
              disabled={autostartLoading}
            >
              {autostartLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              {autostartLoading ? "检查中..." : autostartEnabled ? "已开启" : "未开启"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 数据管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            数据管理
          </CardTitle>
          <CardDescription>管理统计数据，清除或导出</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">数据存储位置</p>
              <p className="text-xs text-muted-foreground select-all break-all mt-1">
                {dataPath}
              </p>
              {pathMsg && (
                <p className="text-xs text-green-500 mt-1">{pathMsg}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={handleResetPath}
                disabled={saving}
                title="恢复默认"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={handleChangePath}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderOpen className="h-4 w-4" />
                )}
                {saving ? "保存中..." : "更改目录"}
              </Button>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">导出数据</p>
              <p className="text-xs text-muted-foreground">
                将统计数据导出为 JSON 格式
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {exporting ? "导出中..." : "导出"}
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-destructive">清除数据</p>
              <p className="text-xs text-muted-foreground">
                清除所有统计数据（不可恢复）
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="flex items-center gap-1"
              onClick={handleClear}
              disabled={clearing}
            >
              {clearing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {clearing ? "清除中..." : "清除"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 关于 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-5 w-5" />
            关于
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">应用版本</p>
            <p className="text-sm text-muted-foreground">v0.1.0</p>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">技术栈</p>
            <p className="text-sm text-muted-foreground">
              Tauri v2 + React + Rust
            </p>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
               <ExternalLink className="h-4 w-4" />
              <p className="text-sm font-medium">GitHub</p>
            </div>
            <p className="text-sm text-muted-foreground">SernVia</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
