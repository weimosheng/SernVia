import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Image as ImageIcon,
  FolderOpen,
  RefreshCcw,
  Lock,
  ShieldCheck,
  Download,
  X,
  Copy,
  CheckSquare,
  Square,
  Trash2,
  Plus,
  FolderPlus,
  Sparkles,
  Trash,
  Edit3,
  Check,
  Calendar,
  ArrowLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { PasswordGuard } from "@/components/PasswordGuard";
import { useToast } from "@/components/Toast";

type Screenshot = {
  path: string;
  filename: string;
  date: string;      // "YYYY-MM-DD"
  time: string;      // "HH:MM:SS"
  base64?: string;
  loadError?: string; // 加载失败时记录错误信息
};

type Collection = {
  id: string;
  name: string;
  created_at: number;
  screenshot_paths: string[];
  auto_app_name?: string | null;
};

type DisplayMode = "timeline" | "detail";
type TimelineView = "day" | "week" | "month" | "year";
type CollectionFilter = { kind: "all" } | { kind: "collection"; id: string; name: string };

const PAGE_SIZE_OPTIONS = [20, 30, 40, 50];
const DEFAULT_PAGE_SIZE = 30;
const TIMELINE_THUMBNAIL_COUNT = 6;   // 每个时间卡片显示多少张代表截图

// ---------- 工具函数 ----------
function parseFilenameDate(filename: string): { date: string; time: string } {
  const nameNoExt = filename.replace(/\.ssv$/, "");
  const parts = nameNoExt.split("_");
  return {
    date: parts.slice(0, 3).join("-"),
    time: parts.slice(3).join(":"),
  };
}

function formatDisplayDate(dateStr: string): string {
  // dateStr: "YYYY-MM-DD" (本地日期)
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  if (dateStr === todayStr) return `今天 · ${dateStr}`;
  if (dateStr === yesterdayStr) return `昨天 · ${dateStr}`;
  return dateStr;
}

// ---------- 小截图项 ----------
const ScreenshotItem = memo(function ScreenshotItem({
  ss,
  isSelected,
  onClick,
  onToggleSelect,
  onCategorize,
  onCopy,
  onExport,
  onDelete,
  onRetry,
}: {
  ss: Screenshot;
  isSelected: boolean;
  onClick: () => void;
  onToggleSelect: () => void;
  onCategorize: () => void;
  onCopy: () => void;
  onExport: () => void;
  onDelete: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      className={`group relative aspect-video bg-muted rounded-lg overflow-hidden cursor-pointer transition-all min-w-0 max-w-full ${
        isSelected ? "ring-2 ring-primary ring-offset-2" : "hover:ring-2 hover:ring-primary"
      }`}
      onClick={onClick}
    >
      {ss.base64 ? (
        <img
          src={ss.base64}
          alt={ss.filename}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : ss.loadError ? (
        <div className="w-full h-full flex items-center justify-center bg-red-50 p-2">
          <div className="flex flex-col items-center gap-2 min-w-0">
            <AlertCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(); }}
              className="text-xs text-red-600 hover:text-red-800 underline whitespace-nowrap"
            >
              加载失败，点击重试
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-muted/50 p-2">
          <div className="animate-pulse flex flex-col items-center min-w-0">
            <ImageIcon className="h-8 w-8 opacity-30 mb-2 flex-shrink-0" />
            <div className="text-xs whitespace-nowrap">加载中...</div>
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />

      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full transition-colors text-white"
        >
          {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
        </button>
      </div>

      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); onCategorize(); }}
          className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full transition-colors text-white"
          title="自动归类"
        >
          <Sparkles className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onCopy(); }}
          className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full transition-colors text-white"
          title="复制"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onExport(); }}
          className="p-1.5 bg-black/60 hover:bg-black/80 rounded-full transition-colors text-white"
          title="导出"
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 bg-black/60 hover:bg-red-600 rounded-full transition-colors text-white"
          title="删除"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-colors min-h-[44px] flex flex-col justify-end z-10">
        <p className="text-xs text-white whitespace-nowrap overflow-hidden text-ellipsis">{ss.date}</p>
        <p className="text-xs text-white/80 whitespace-nowrap overflow-hidden text-ellipsis">{ss.time}</p>
      </div>
    </div>
  );
});

export function ReviewPage() {
  // ---------- 基础状态 ----------
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [passwordGuardOpen, setPasswordGuardOpen] = useState(false);
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [checkingPassword, setCheckingPassword] = useState(true);
  const [passwordSkipped, setPasswordSkipped] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentScreenshot, setCurrentScreenshot] = useState<Screenshot | null>(null);
  const [selectedScreenshots, setSelectedScreenshots] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // ---------- 合集相关状态 ----------
  const [collections, setCollections] = useState<Collection[]>([]);
  const [filter, setFilter] = useState<CollectionFilter>({ kind: "all" });
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [pendingAddToCollection, setPendingAddToCollection] = useState<Screenshot[]>([]);

  // ---------- 分页状态（详情页用） ----------
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState<number>(1);
  // 加载版本号：每次切换合集/过滤器时递增，用于放弃过期的图片加载结果
  const loadVersionRef = useRef<number>(0);
  // 正在加载中的路径集合，防止重复发起 invoke
  const loadingRef = useRef<Set<string>>(new Set());

  // ---------- 视图状态 ----------
  const [displayMode, setDisplayMode] = useState<DisplayMode>("timeline");
  const [timelineView, setTimelineView] = useState<TimelineView>("day");
  const [selectedDate, setSelectedDate] = useState<string>(""); // 进入详情页的日期

  const { showToast } = useToast();

  // ---------- 懒加载图片 ----------
  const loadImages = useCallback(async (items: Screenshot[]) => {
    const version = loadVersionRef.current;
    // 过滤出还没有 base64 且未在加载中的图片
    const toLoad = items.filter(ss => !ss.base64 && !loadingRef.current.has(ss.path));
    if (toLoad.length === 0) return;

    // 标记为加载中 + 清除之前的错误
    for (const ss of toLoad) {
      loadingRef.current.add(ss.path);
    }
    setScreenshots(prev => {
      let changed = false;
      const next = prev.map(s => {
        if (toLoad.some(t => t.path === s.path) && s.loadError) {
          changed = true;
          return { ...s, loadError: undefined };
        }
        return s;
      });
      return changed ? next : prev;
    });

    const batch = 8;
    for (let i = 0; i < toLoad.length; i += batch) {
      if (loadVersionRef.current !== version) return;
      const chunk = toLoad.slice(i, i + batch);
      await Promise.all(chunk.map(async (ss) => {
        if (loadVersionRef.current !== version) return;
        try {
          const base64 = await invoke<string>("get_screenshot_base64", { path: ss.path });
          if (loadVersionRef.current !== version) return;
          setScreenshots(prev => {
            const item = prev.find(s => s.path === ss.path);
            if (!item || item.base64) return prev;
            return prev.map(s => s.path === ss.path ? { ...s, base64 } : s);
          });
        } catch (e) {
          console.error("Failed to load image:", e);
          setScreenshots(prev => {
            const item = prev.find(s => s.path === ss.path);
            if (!item || item.base64 || item.loadError) return prev;
            return prev.map(s => s.path === ss.path ? { ...s, loadError: String(e) } : s);
          });
        } finally {
          loadingRef.current.delete(ss.path);
        }
      }));
    }
  }, []);

  // ---------- 加载截图列表（带 filter 参数，避免闭包问题） ----------
  const loadScreenshotsForFilter = useCallback(async (f: CollectionFilter) => {
    setLoading(true);
    try {
      const files = f.kind === "collection"
        ? await invoke<string[]>("get_screenshots_in_collection", { id: f.id })
        : await invoke<string[]>("get_screenshots");
      // 递增版本号：丢弃旧批次的加载；清空加载中记录
      loadVersionRef.current += 1;
      loadingRef.current.clear();

      const data: Screenshot[] = (files || []).map((path) => {
        const parts = path.split(/[\\/]/);
        const filename = parts[parts.length - 1];
        const { date, time } = parseFilenameDate(filename);
        return { path, filename, date, time };
      });
      data.sort((a, b) => b.filename.localeCompare(a.filename));
      setScreenshots(data);
      setCurrentPage(1);
    } catch (e) {
      console.error("Failed to load screenshots", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCollections = async () => {
    try {
      const colls = await invoke<Collection[]>("get_collections");
      setCollections(colls || []);
    } catch (e) {
      console.error("Failed to load collections", e);
    }
  };

  // ---------- 初始加载 ----------
  useEffect(() => {
    Promise.all([
      invoke<boolean>("screenshot_has_password"),
      invoke<string[]>("get_screenshots"),
      invoke<Collection[]>("get_collections"),
    ]).then(([hasPwd, files, colls]) => {
      setHasPassword(hasPwd);
      setCheckingPassword(false);
      setCollections(colls || []);

      const hasScreenshots = files.length > 0;
      if (hasPwd || hasScreenshots) {
        setPasswordGuardOpen(true);
      } else {
        setScreenshots([]);
        setLoading(false);
      }
    }).catch(() => {
      setCheckingPassword(false);
      // 兜底：直接加载全部
      loadScreenshotsForFilter({ kind: "all" });
    });
  }, [loadScreenshotsForFilter]);

  // ---------- 当过滤器变化时：先加载列表，列表加载完成后再懒加载代表图 ----------
  useEffect(() => {
    if (!passwordVerified) return;
    // 直接调用并返回 promise，避免闭包捕获问题
    loadScreenshotsForFilter(filter);
  }, [passwordVerified, filter, loadScreenshotsForFilter]);

  // ---------- 键盘快捷键 ----------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'c') {
        if (viewerOpen && currentScreenshot) {
          e.preventDefault();
          copyToClipboard(currentScreenshot);
        } else if (selectedScreenshots.size === 1) {
          const selected = screenshots.find(ss => selectedScreenshots.has(ss.filename));
          if (selected) {
            e.preventDefault();
            copyToClipboard(selected);
          }
        }
      }
      if (e.key === 'Escape') {
        if (isMultiSelectMode) clearSelection();
        else if (viewerOpen) setViewerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewerOpen, currentScreenshot, selectedScreenshots, screenshots, isMultiSelectMode]);

  // ---------- 辅助操作 ----------
  const openScreenshotsFolder = async () => {
    try {
      const path = await invoke<string>("get_screenshots_folder");
      await revealItemInDir(path);
    } catch (e) { console.error("Failed to open folder", e); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadScreenshotsForFilter(filter);
    await refreshCollections();
    setRefreshing(false);
  };

  const handleVerified = () => {
    setPasswordGuardOpen(false);
    setPasswordVerified(true);
    // 由 useEffect[passwordVerified, filter] 触发加载
  };
  const handleSetPassword = () => {
    setPasswordGuardOpen(false);
    setPasswordVerified(true);
    // 由 useEffect[passwordVerified, filter] 触发加载
  };
  const handleSkip = () => {
    setPasswordGuardOpen(false);
    setPasswordSkipped(true);
    setPasswordVerified(true); // 跳过密码也视为已验证
    // 由 useEffect[passwordVerified, filter] 触发加载
  };

  const openViewer = (ss: Screenshot) => {
    setCurrentScreenshot(ss);
    setViewerOpen(true);
  };

  const handleRetryOne = (ss: Screenshot) => {
    loadImages([ss]);
  };

  const handleExport = async (ss?: Screenshot) => {
    const target = ss || currentScreenshot;
    if (!target) return;
    try {
      const defaultName = target.filename.replace('.ssv', '.jpg');
      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }],
      });
      if (filePath) {
        await invoke('export_screenshot', { filePath: target.path, outputPath: filePath });
        showToast('截图导出成功！', 'success');
      }
    } catch (e) {
      console.error('Export failed:', e);
      showToast('导出失败：' + e, 'error');
    }
  };

  const copyToClipboard = async (ss?: Screenshot) => {
    const target = ss || currentScreenshot;
    if (!target) return;
    try {
      const base64 = await invoke<string>('copy_screenshot_to_clipboard', { path: target.path });
      const img = new Image();
      img.src = `data:image/jpeg;base64,${base64}`;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片加载失败'));
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法获取画布上下文');
      ctx.drawImage(img, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => { if (b) resolve(b); else reject(new Error('Blob创建失败')); }, 'image/png');
      });
      const dataTransfer = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([dataTransfer]);
      showToast('图片已复制到剪贴板！', 'success');
    } catch (e) {
      console.error('Copy failed:', e);
      showToast('复制失败：' + e, 'error');
    }
  };

  const handleBatchExport = async () => {
    const selectedItems = screenshots.filter(s => selectedScreenshots.has(s.filename));
    if (selectedItems.length === 0) return;
    const folder = await save({ defaultPath: 'screenshots', filters: [{ name: 'Folder', extensions: [] }] });
    if (!folder) return;
    let exported = 0;
    for (const item of selectedItems) {
      try {
        const filename = item.filename.replace('.ssv', '.jpg');
        const outputPath = folder.endsWith('\\') || folder.endsWith('/')
          ? folder + filename : folder + '\\' + filename;
        await invoke('export_screenshot', { filePath: item.path, outputPath });
        exported++;
      } catch (e) { console.error('Export failed:', e); }
    }
    showToast(`已导出 ${exported}/${selectedItems.length} 张截图`, exported > 0 ? 'success' : 'info');
  };

  const handleDelete = async (ss?: Screenshot) => {
    let pathsToDelete: string[];
    let filenamesToDelete: string[];
    if (ss) {
      pathsToDelete = [ss.path];
      filenamesToDelete = [ss.filename];
    } else {
      const selectedItems = screenshots.filter(s => selectedScreenshots.has(s.filename));
      pathsToDelete = selectedItems.map(s => s.path);
      filenamesToDelete = selectedItems.map(s => s.filename);
    }
    if (pathsToDelete.length === 0) return;
    try {
      const count = await invoke<number>('delete_screenshots', { paths: pathsToDelete });
      showToast(`已删除 ${count} 张截图`, 'success');
      pathsToDelete.forEach(p => loadingRef.current.delete(p));
      setScreenshots(prev => prev.filter(s => !filenamesToDelete.includes(s.filename)));
      setSelectedScreenshots(new Set());
      setIsMultiSelectMode(false);
      setViewerOpen(false);
    } catch (e) {
      console.error('Delete failed:', e);
      showToast('删除失败：' + e, 'error');
    }
  };

  const toggleSelection = (filename: string) => {
    const newSelected = new Set(selectedScreenshots);
    if (newSelected.has(filename)) newSelected.delete(filename);
    else newSelected.add(filename);
    setSelectedScreenshots(newSelected);
    setIsMultiSelectMode(newSelected.size > 0);
  };

  const clearSelection = () => {
    setSelectedScreenshots(new Set());
    setIsMultiSelectMode(false);
  };

  const selectAll = () => {
    const list = displayMode === "detail"
      ? screenshots.filter(s => s.date === selectedDate)
      : screenshots;
    setSelectedScreenshots(new Set(list.map(s => s.filename)));
    setIsMultiSelectMode(true);
  };

  // ---------- 合集相关操作 ----------
  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) return;
    try {
      await invoke<string>("create_collection", { name, autoAppName: null as string | null });
      setNewCollectionName("");
      setCreatingCollection(false);
      await refreshCollections();
      showToast(`已创建合集「${name}」`, "success");
    } catch (e) {
      console.error("Create collection failed:", e);
      showToast("创建失败：" + e, "error");
    }
  };

  const handleDeleteCollection = async (id: string, name: string) => {
    if (!window.confirm(`确定要删除合集「${name}」吗？（不会删除截图文件本身）`)) return;
    try {
      await invoke("delete_collection", { id });
      await refreshCollections();
      if (filter.kind === "collection" && filter.id === id) setFilter({ kind: "all" });
      showToast("合集已删除", "success");
    } catch (e) { console.error(e); showToast("删除失败：" + e, "error"); }
  };

  const handleRenameCollection = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    try {
      await invoke("rename_collection", { id, newName: name });
      setEditingId(null);
      setEditingName("");
      await refreshCollections();
      showToast("已重命名", "success");
    } catch (e) { console.error(e); showToast("重命名失败：" + e, "error"); }
  };

  const handleAutoCategorizeAll = async () => {
    if (screenshots.length === 0) return;
    if (!window.confirm(`自动根据活动记录将 ${screenshots.length} 张截图按应用名称归类？（可能需要几秒）`)) return;
    let categorized = 0;
    for (const ss of screenshots) {
      try {
        const nameNoExt = ss.filename.replace(/\.ssv$/, "");
        const parts = nameNoExt.split("_").map(s => parseInt(s, 10));
        if (parts.some(isNaN)) continue;
        const [y, mo, d, h, mi, se] = parts;
        const dt = new Date(y, mo - 1, d, h, mi, se);
        const timestamp = Math.floor(dt.getTime() / 1000);
        const appName = await invoke<string | null>("get_activity_at_timestamp", { timestampSecs: timestamp });
        if (appName) {
          await invoke("auto_categorize_screenshot", { screenshotPath: ss.path, appName });
          categorized++;
        }
      } catch (e) { console.error("Categorize failed for", ss.filename, e); }
    }
    await refreshCollections();
    showToast(`已归类 ${categorized} 张截图`, "success");
  };

  const handleCategorizeOne = async (ss: Screenshot) => {
    try {
      const nameNoExt = ss.filename.replace(/\.ssv$/, "");
      const parts = nameNoExt.split("_").map(s => parseInt(s, 10));
      if (parts.some(isNaN)) { showToast("文件名不包含时间", "error"); return; }
      const [y, mo, d, h, mi, se] = parts;
      const dt = new Date(y, mo - 1, d, h, mi, se);
      const timestamp = Math.floor(dt.getTime() / 1000);
      const appName = await invoke<string | null>("get_activity_at_timestamp", { timestampSecs: timestamp });
      if (!appName) { showToast("没有找到对应的活动记录", "info"); return; }
      await invoke("auto_categorize_screenshot", { screenshotPath: ss.path, appName });
      await refreshCollections();
      showToast(`已添加到「${appName}」`, "success");
    } catch (e) { console.error(e); showToast("归类失败：" + e, "error"); }
  };

  const openAddToCollectionDialog = () => {
    const items = screenshots.filter(s => selectedScreenshots.has(s.filename));
    if (items.length === 0) return;
    setPendingAddToCollection(items);
    setAddDialogOpen(true);
  };

  const handleAddToCollection = async (collId: string, collName: string) => {
    const count = pendingAddToCollection.length;
    for (const ss of pendingAddToCollection) {
      try { await invoke("add_screenshot_to_collection", { id: collId, screenshotPath: ss.path }); }
      catch (e) { console.error("add failed", e); }
    }
    setPendingAddToCollection([]);
    setAddDialogOpen(false);
    clearSelection();
    await refreshCollections();
    showToast(`已添加 ${count} 张截图到「${collName}」`, "success");
  };

  // ---------- 派生数据：时间线分组 ----------
  const dayGroups = useMemo(() => {
    const groups: Map<string, Screenshot[]> = new Map();
    for (const ss of screenshots) {
      const existing = groups.get(ss.date) || [];
      existing.push(ss);
      groups.set(ss.date, existing);
    }
    return Array.from(groups.entries())
      .map(([date, items]) => ({ date, items }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [screenshots]);

  // 当进入时间线视图时，加载每一天的代表图（前 N 张）
  useEffect(() => {
    if (!passwordVerified || displayMode !== "timeline") return;
    const thumbs: Screenshot[] = [];
    for (const g of dayGroups) {
      thumbs.push(...g.items.slice(0, TIMELINE_THUMBNAIL_COUNT));
    }
    loadImages(thumbs);
  }, [passwordVerified, displayMode, dayGroups, loadImages]);

  // ---------- 派生数据：详情页 ----------
  const detailScreenshots = useMemo(() => {
    return screenshots.filter(s => s.date === selectedDate);
  }, [screenshots, selectedDate]);

  const totalPages = Math.max(1, Math.ceil(detailScreenshots.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, detailScreenshots.length);
  const pageScreenshots = detailScreenshots.slice(pageStart, pageEnd);

  // ---------- 加载状态计数 ----------
  const loadStatus = useMemo(() => {
    const visible = displayMode === "detail" ? pageScreenshots : 
      dayGroups.flatMap(g => g.items.slice(0, TIMELINE_THUMBNAIL_COUNT));
    const loaded = visible.filter(s => !!s.base64).length;
    const errors = visible.filter(s => !s.base64 && !!s.loadError).length;
    const pending = visible.filter(s => !s.base64 && !s.loadError).length;
    return { loaded, errors, pending, total: visible.length };
  }, [dayGroups, displayMode, pageScreenshots]);

  // 进入详情页：当前页图片加载
  useEffect(() => {
    if (!passwordVerified || displayMode !== "detail" || pageScreenshots.length === 0) return;
    loadImages(pageScreenshots);
  }, [passwordVerified, displayMode, pageScreenshots, loadImages]);

  // ---------- 视图路由 ----------
  const enterDetail = (date: string) => {
    setSelectedDate(date);
    setCurrentPage(1);
    setDisplayMode("detail");
  };

  const backToTimeline = () => {
    setDisplayMode("timeline");
    setSelectedDate("");
    clearSelection();
  };

  // ---------- 页码按钮 ----------
  const getPageNumbers = (): (number | "...")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "...")[] = [];
    if (safeCurrentPage <= 3) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push("...", totalPages);
    } else if (safeCurrentPage >= totalPages - 2) {
      pages.push(1, "...");
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1, "...");
      for (let i = safeCurrentPage - 1; i <= safeCurrentPage + 1; i++) pages.push(i);
      pages.push("...", totalPages);
    }
    return pages;
  };

  // ---------- 标题文本 ----------
  const filterLabel = filter.kind === "all" ? "全部截图" : filter.name;

  return (
    <div className="p-6 space-y-6 relative min-h-full overflow-x-hidden">
      <PasswordGuard
        open={passwordGuardOpen}
        hasPassword={hasPassword}
        onVerified={handleVerified}
        onSetPassword={handleSetPassword}
        onSkip={handleSkip}
      />

      {/* 顶部标题栏 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            {displayMode === "timeline" ? (
              <>
                {passwordVerified ? <ShieldCheck className="h-6 w-6 text-green-500" /> : <Calendar className="h-6 w-6" />}
                回顾 · 时间线
              </>
            ) : (
              <>
                <button
                  onClick={backToTimeline}
                  className="p-1.5 -ml-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {selectedDate && formatDisplayDate(selectedDate)}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  · 共 {detailScreenshots.length} 张
                </span>
              </>
            )}
            {isMultiSelectMode && (
              <span className="text-sm font-normal text-muted-foreground">
                (已选择 {selectedScreenshots.size} 张)
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {displayMode === "timeline"
              ? "按日期浏览您的屏幕记录，点击某天查看全部截图"
              : "分页查看当天的截图记录"}
          </p>
          {!isMultiSelectMode && loadStatus.total > 0 && (
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                已加载 {loadStatus.loaded}
              </span>
              {loadStatus.pending > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
                  加载中 {loadStatus.pending}
                </span>
              )}
              {loadStatus.errors > 0 && (
                <span className="inline-flex items-center gap-1 text-red-500">
                  <AlertCircle className="h-3 w-3" />
                  失败 {loadStatus.errors}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {isMultiSelectMode ? (
            <>
              <Button onClick={selectAll} variant="ghost" size="sm">全选</Button>
              <Button onClick={openAddToCollectionDialog} variant="ghost" size="sm">
                <FolderPlus className="h-4 w-4 mr-1" />添加到合集
              </Button>
              <Button onClick={handleBatchExport} variant="ghost" size="sm">
                <Download className="h-4 w-4 mr-1" />导出
              </Button>
              <Button onClick={() => setDeleteConfirmOpen(true)} variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-1" />删除
              </Button>
              <Button onClick={clearSelection} variant="ghost" size="sm">取消选择</Button>
            </>
          ) : (
            <>
              <Button onClick={handleRefresh} variant="ghost" disabled={refreshing}>
                <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
              <Button onClick={openScreenshotsFolder} variant="secondary" disabled={!passwordVerified}>
                <FolderOpen className="h-4 w-4 mr-2" />打开文件夹
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 时间线视图切换 + 过滤器名称 */}
      {displayMode === "timeline" && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" />
              <span>当前：<span className="text-foreground font-medium">{filterLabel}</span>（共 {screenshots.length} 张）</span>
            </span>
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1 text-sm">
            {[
              { key: "day", label: "按天" },
              { key: "week", label: "按周" },
              { key: "month", label: "按月" },
              { key: "year", label: "按年" },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setTimelineView(opt.key as TimelineView)}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  timelineView === opt.key
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 主体布局 */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6 overflow-hidden">
        {/* 左侧合集侧边栏（作为过滤器） */}
        <Card className="h-fit overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4" /> 过滤 / 合集
            </CardTitle>
            <div className="text-xs text-muted-foreground">按应用名称或合集筛选截图</div>
          </CardHeader>
          <CardContent className="space-y-2 overflow-x-hidden">
            <button
              onClick={() => setFilter({ kind: "all" })}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                filter.kind === "all" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
              }`}
            >
              <span className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> 全部截图
              </span>
              <span className="text-xs text-muted-foreground">{screenshots.length}</span>
            </button>

            {(collections || []).map((c) => {
              const isSelected = filter.kind === "collection" && filter.id === c.id;
              const isAuto = !!c.auto_app_name;
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-1 rounded-lg transition-colors overflow-hidden ${
                    isSelected ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <button
                    onClick={() => setFilter({ kind: "collection", id: c.id, name: c.name })}
                    className="flex-1 flex items-center justify-between px-3 py-2 text-left text-sm overflow-hidden"
                  >
                    <span className="flex items-center gap-2 min-w-0 max-w-[140px]">
                      {isAuto
                        ? <Sparkles className="h-4 w-4 flex-shrink-0 text-amber-500" />
                        : <FolderPlus className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                      {(c.screenshot_paths || []).length}
                    </span>
                  </button>
                  <div className="flex items-center pr-2">
                    {editingId === c.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRenameCollection(c.id); }}
                          className="h-7 w-28 text-xs"
                          autoFocus
                        />
                        <button onClick={() => handleRenameCollection(c.id)} className="p-1 hover:text-primary">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => { setEditingId(null); setEditingName(""); }} className="p-1 hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditingName(c.name); }}
                          className="p-1.5 hover:text-primary text-muted-foreground"
                          title="重命名"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteCollection(c.id, c.name); }}
                          className="p-1.5 hover:text-destructive text-muted-foreground"
                          title="删除合集"
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="pt-3 space-y-2 border-t mt-2">
              {creatingCollection ? (
                <div className="space-y-2">
                  <Input
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreateCollection(); }}
                    placeholder="合集名称"
                    autoFocus
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="flex-1" onClick={handleCreateCollection}>创建</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setCreatingCollection(false); setNewCollectionName(""); }}>取消</Button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" size="sm" className="w-full" onClick={() => setCreatingCollection(true)}>
                  <Plus className="h-4 w-4 mr-1" /> 新建合集
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={handleAutoCategorizeAll}
                disabled={!passwordVerified || screenshots.length === 0}
              >
                <Sparkles className="h-4 w-4 mr-1" /> 自动归类
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 右侧内容区：时间线 或 详情 */}
        <Card className="overflow-hidden">
          <CardContent className="overflow-x-hidden pt-6">
            {loading || (!passwordVerified && hasPassword) ? (
              <div className="text-center py-16 text-muted-foreground">
                {hasPassword && !passwordVerified ? (
                  <>
                    <Lock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>输入密码解锁截图</p>
                  </>
                ) : (<p>加载中...</p>)}
              </div>
            ) : screenshots.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">还没有截图</p>
                <p className="text-sm">您可以在设置中开启截图功能</p>
              </div>
            ) : displayMode === "timeline" ? (
              // ---- 时间线视图 ----
              <div className="space-y-4">
                {timelineView === "day" ? (
                  // 按天卡片
                  <div className="space-y-3">
                    {dayGroups.map((g) => (
                      <div
                        key={g.date}
                        className="border rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
                      >
                        <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{formatDisplayDate(g.date)}</span>
                            <span className="text-xs text-muted-foreground">· {g.items.length} 张截图</span>
                          </div>
                          <button
                            onClick={() => enterDetail(g.date)}
                            className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                          >
                            查看全部 <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="p-3 bg-background">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                            {g.items.slice(0, TIMELINE_THUMBNAIL_COUNT).map((ss) => (
                              <ScreenshotItem
                                key={ss.filename}
                                ss={ss}
                                isSelected={selectedScreenshots.has(ss.filename)}
                                onClick={() => {
                                  if (isMultiSelectMode) toggleSelection(ss.filename);
                                  else if (ss.base64) openViewer(ss);
                                }}
                                onToggleSelect={() => toggleSelection(ss.filename)}
                                onCategorize={() => handleCategorizeOne(ss)}
                                onCopy={() => copyToClipboard(ss)}
                                onExport={() => handleExport(ss)}
                                onDelete={() => { setCurrentScreenshot(ss); setDeleteConfirmOpen(true); }}
                                onRetry={() => handleRetryOne(ss)}
                              />
                            ))}
                            {g.items.length > TIMELINE_THUMBNAIL_COUNT && (
                              <button
                                onClick={() => enterDetail(g.date)}
                                className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/70 transition-colors"
                              >
                                <span className="text-lg font-semibold">+{g.items.length - TIMELINE_THUMBNAIL_COUNT}</span>
                                <span className="text-xs">查看更多</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // 按周 / 按月 / 按年：占位提示（后续实现）
                  <div className="text-center py-16 text-muted-foreground">
                    <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">{timelineView === "week" ? "按周" : timelineView === "month" ? "按月" : "按年"}视图即将上线</p>
                  </div>
                )}
              </div>
            ) : (
              // ---- 详情页（分页网格） ----
              <div className="space-y-4 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    日期筛选：<span className="text-foreground font-medium">{formatDisplayDate(selectedDate)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>每页</span>
                    <select
                      value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                      className="h-8 px-2 border rounded bg-background text-sm"
                    >
                      {PAGE_SIZE_OPTIONS.map(s => (
                        <option key={s} value={s}>{s} 张</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 min-w-0">
                  {pageScreenshots.map((ss) => (
                    <ScreenshotItem
                      key={ss.filename}
                      ss={ss}
                      isSelected={selectedScreenshots.has(ss.filename)}
                      onClick={() => {
                        if (isMultiSelectMode) toggleSelection(ss.filename);
                        else if (ss.base64) openViewer(ss);
                      }}
                      onToggleSelect={() => toggleSelection(ss.filename)}
                      onCategorize={() => handleCategorizeOne(ss)}
                      onCopy={() => copyToClipboard(ss)}
                      onExport={() => handleExport(ss)}
                      onDelete={() => { setCurrentScreenshot(ss); setDeleteConfirmOpen(true); }}
                      onRetry={() => handleRetryOne(ss)}
                    />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="text-sm text-muted-foreground">
                      第 {pageStart + 1}-{pageEnd} 张 / 共 {detailScreenshots.length} 张
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setCurrentPage(1)} disabled={safeCurrentPage === 1}>首页</Button>
                      <Button variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safeCurrentPage === 1}>上一页</Button>
                      {getPageNumbers().map((p, i) =>
                        p === "..." ? (
                          <span key={`dots-${i}`} className="px-2 text-muted-foreground">…</span>
                        ) : (
                          <Button
                            key={p}
                            variant={p === safeCurrentPage ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setCurrentPage(p)}
                          >{p}</Button>
                        )
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safeCurrentPage === totalPages}>下一页</Button>
                      <Button variant="ghost" size="sm" onClick={() => setCurrentPage(totalPages)} disabled={safeCurrentPage === totalPages}>末页</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 图片查看器 */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="sm:max-w-[90vw] sm:max-h-[90vh] p-0 overflow-hidden">
          <DialogTitle className="sr-only">
            {currentScreenshot ? `${currentScreenshot.date} ${currentScreenshot.time}` : 'Screenshot'}
          </DialogTitle>
          {currentScreenshot && currentScreenshot.base64 && (
            <div className="relative w-full h-full flex flex-col">
              <div className="flex items-center justify-between p-4 bg-background/80 backdrop-blur-sm border-b">
                <div className="text-sm">{currentScreenshot.date} {currentScreenshot.time}</div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => currentScreenshot && copyToClipboard(currentScreenshot)}>
                    <Copy className="h-4 w-4 mr-2" />复制
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => currentScreenshot && handleExport(currentScreenshot)}>
                    <Download className="h-4 w-4 mr-2" />导出
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setViewerOpen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/50">
                <img
                  src={currentScreenshot.base64}
                  alt={currentScreenshot.filename}
                  className="max-w-full max-h-full object-contain"
                  onDoubleClick={() => setViewerOpen(false)}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            {selectedScreenshots.size === 0
              ? `确定要删除这张截图吗？此操作不可撤销。`
              : `确定要删除选中的 ${selectedScreenshots.size} 张截图吗？此操作不可撤销。`}
          </DialogDescription>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => { setDeleteConfirmOpen(false); setCurrentScreenshot(null); }}>取消</Button>
            <Button variant="destructive" onClick={() => { handleDelete(currentScreenshot || undefined); setDeleteConfirmOpen(false); setCurrentScreenshot(null); }}>删除</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 添加到合集对话框 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>添加到合集</DialogTitle>
          <DialogDescription>选择要把 {pendingAddToCollection.length} 张截图添加到哪个合集</DialogDescription>
          <div className="mt-2 max-h-72 overflow-y-auto space-y-1">
            {(collections || []).length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">还没有合集，先新建一个吧</p>
            )}
            {(collections || []).map(c => (
              <button
                key={c.id}
                onClick={() => handleAddToCollection(c.id, c.name)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-muted text-left"
              >
                <span>{c.name}</span>
                <span className="text-xs text-muted-foreground">{(c.screenshot_paths || []).length} 张</span>
              </button>
            ))}
            <button
              onClick={() => {
                const name = window.prompt("新合集名称");
                if (!name || !name.trim()) return;
                (async () => {
                  const id = await invoke<string>("create_collection", { name: name.trim(), autoAppName: null as string | null });
                  await refreshCollections();
                  handleAddToCollection(id, name.trim());
                })();
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-primary hover:bg-primary/5 border border-dashed border-border mt-2"
            >
              <Plus className="h-4 w-4" /> 新建合集
            </button>
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={() => { setAddDialogOpen(false); setPendingAddToCollection([]); }}>取消</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="hidden">{checkingPassword}{passwordSkipped}{refreshing}</div>
    </div>
  );
}
