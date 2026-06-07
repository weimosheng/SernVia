import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, Minus, Square, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark" ||
        (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  const toggleTheme = () => setDark((prev) => !prev);

  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setMaximized);
    });
    return () => { unlisten.then((f) => f()); };
  }, []);

  const handleMinimize = () => getCurrentWindow().minimize();
  const handleMaximize = async () => {
    const win = getCurrentWindow();
    if (await win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  };
  const handleClose = () => getCurrentWindow().close();

  return (
    <div
      data-tauri-drag-region
      className="flex h-10 items-center justify-between bg-background border-b select-none shrink-0"
    >
      {/* Left: App name */}
      <div data-tauri-drag-region className="flex items-center gap-2 px-4 text-sm font-semibold text-muted-foreground">
        <span data-tauri-drag-region className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-bold">
          S
        </span>
        <span data-tauri-drag-region>SernVia</span>
      </div>

      {/* Center: drag region */}
      <div data-tauri-drag-region className="flex-1 h-full" />

      {/* Right: window controls */}
      <div className="flex h-full">
        <button
          onClick={toggleTheme}
          className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title={dark ? "切换亮色模式" : "切换暗黑模式"}
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          onClick={handleMinimize}
          className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title="最小化"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title={maximized ? "还原" : "最大化"}
        >
          <Square className={cn("h-3.5 w-3.5", maximized && "scale-90")} />
        </button>
        <button
          onClick={handleClose}
          className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
