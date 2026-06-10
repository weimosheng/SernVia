import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Plus, Trash2, Tag, FolderOpen, Check, X, Palette } from "lucide-react";
import {
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  setAppCategory,
  setAppAlias,
  removeAppAssignment,
  getAppsWithMeta,
  type Category,
  type AppWithMeta,
} from "@/lib/cloud-api";

type TimeRange = "day" | "week" | "month" | "year";

const RANGE_LABELS: Record<TimeRange, string> = {
  day: "今日",
  week: "本周",
  month: "本月",
  year: "本年",
};

// A balanced palette — shown when user is editing a category color.
const PALETTE = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#10b981", // emerald
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#94a3b8", // slate (default for uncategorized)
];

function formatDuration(secs: number): string {
  if (!secs || secs <= 0) return "0秒";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}小时${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

export function CategoriesPage() {
  const [range, setRange] = useState<TimeRange>("day");
  const [categories, setCategories] = useState<Category[]>([]);
  const [apps, setApps] = useState<AppWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  // New category form
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#3b82f6");
  const [showNewColorPicker, setShowNewColorPicker] = useState(false);

  // Edit-in-place state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Per-row editing: alias
  const [aliasEditing, setAliasEditing] = useState<Map<string, string>>(new Map());

  const refresh = async () => {
    setLoading(true);
    try {
      const [cats, appsData] = await Promise.all([
        getCategories(),
        getAppsWithMeta(range, 0),
      ]);
      setCategories(cats);
      setApps(appsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [range]);

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    try {
      await addCategory(name, newCatColor);
      setNewCatName("");
      setShowNewColorPicker(false);
      refresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
  };

  const handleSaveEdit = (id: string) => {
    const name = editName.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    updateCategory(id, { name })
      .then(() => refresh())
      .catch((e) => console.error(e))
      .finally(() => setEditingId(null));
  };

  const handleUpdateColor = (id: string, color: string) => {
    updateCategory(id, { color })
      .then(() => refresh())
      .catch((e) => console.error(e));
  };

  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm("确定要删除此分类吗？相关应用的分类将被清除。")) return;
    try {
      await deleteCategory(id);
      refresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleChangeAppCategory = (proc: string, newCatId: string | null) => {
    setAppCategory(proc, newCatId)
      .then(() => refresh())
      .catch((e) => console.error(e));
  };

  const handleChangeAlias = (proc: string, alias: string) => {
    setAliasEditing((prev) => new Map(prev).set(proc, alias));
  };

  const handleCommitAlias = (proc: string) => {
    const v = aliasEditing.get(proc);
    if (v === undefined) return;
    const trimmed = v.trim();
    setAppAlias(proc, trimmed === "" ? null : trimmed)
      .then(() => {
        setAliasEditing((prev) => {
          const next = new Map(prev);
          next.delete(proc);
          return next;
        });
        refresh();
      })
      .catch((e) => console.error(e));
  };

  const handleCancelAlias = (proc: string) => {
    setAliasEditing((prev) => {
      const next = new Map(prev);
      next.delete(proc);
      return next;
    });
  };

  // Summary rows: group apps by category for a quick overview
  const totalSeconds = apps.reduce((s, a) => s + a.total_secs, 0);
  const summaryByCategory = () => {
    const map = new Map<string, { secs: number; count: number; color: string; name: string }>();
    map.set("__none__", { secs: 0, count: 0, color: "#94a3b8", name: "未分类" });
    for (const c of categories) {
      map.set(c.id, { secs: 0, count: 0, color: c.color, name: c.name });
    }
    for (const a of apps) {
      const key = a.category_id ?? "__none__";
      const row = map.get(key) ?? { secs: 0, count: 0, color: "#94a3b8", name: "未分类" };
      row.secs += a.total_secs;
      row.count += 1;
      map.set(key, row);
    }
    const rows = Array.from(map.entries())
      .filter(([, r]) => r.secs > 0 || r.count > 0)
      .sort((a, b) => b[1].secs - a[1].secs);
    return rows;
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Tag className="h-6 w-6" />
          应用分类 & 别名
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          为应用添加自定义名称，并组织到不同分类；分类将在统计页面的柱状图中以堆叠颜色显示。
        </p>
      </div>

      {/* Time range selector */}
      <div className="flex items-center gap-2">
        {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
              range === r
                ? "bg-primary text-white border-primary"
                : "bg-background hover:bg-muted border-muted-foreground/20"
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {/* Summary: per category usage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            分类使用概况
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {summaryByCategory().map(([key, row]) => {
                const percent = totalSeconds > 0 ? Math.round((row.secs / totalSeconds) * 100) : 0;
                return (
                  <div key={key} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="h-3 w-3 rounded-full inline-block shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="text-sm font-medium truncate">{row.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.count} 个应用
                    </div>
                    <div className="text-sm mt-1">{formatDuration(row.secs)}</div>
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${percent}%`, backgroundColor: row.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category manager */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" />
            分类管理
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowNewColorPicker((v) => !v)}
                className="h-8 w-8 rounded-md border"
                style={{ backgroundColor: newCatColor }}
                title="选择颜色"
              />
              {showNewColorPicker && (
                <div className="absolute left-0 top-10 z-10 p-2 bg-background border rounded-md shadow-lg grid grid-cols-4 gap-1">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        setNewCatColor(c);
                        setShowNewColorPicker(false);
                      }}
                      className="h-6 w-6 rounded-md border hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              )}
            </div>
            <Input
              placeholder="新分类名称，例如：工作"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); }}
              className="flex-1 h-9"
            />
            <Button size="sm" onClick={handleAddCategory}>
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </div>

          {/* List of categories */}
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有任何分类，添加第一个分类开始组织应用吧。</p>
          ) : (
            <div className="space-y-2">
              {categories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 border rounded-md p-2"
                >
                  {/* Color swatch with quick change */}
                  <ColorPickerButton
                    color={c.color}
                    onChange={(color) => handleUpdateColor(c.id, color)}
                  />
                  {/* Name — inline editable */}
                  {editingId === c.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(c.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-8 flex-1"
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" onClick={() => handleSaveEdit(c.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm flex-1 truncate">{c.name}</span>
                      <Button size="sm" variant="ghost" onClick={() => handleStartEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteCategory(c.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apps list — for assigning categories & aliases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            应用列表 — 分配分类与别名
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : apps.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚未记录任何活动数据。使用应用后再返回此处。</p>
          ) : (
            <div className="space-y-1">
              {apps.map((a) => {
                const displayName = aliasEditing.has(a.process_name)
                  ? aliasEditing.get(a.process_name) ?? ""
                  : a.alias ?? a.name;
                return (
                  <div
                    key={a.process_name || a.name}
                    className="flex items-center gap-3 border rounded-md p-2"
                  >
                    {/* Current category color */}
                    <span
                      className="h-6 w-6 rounded-md shrink-0 border"
                      style={{ backgroundColor: a.category_color ?? "#e2e8f0" }}
                      title={a.category_name ?? "未分类"}
                    />
                    {/* App name / alias */}
                    <div className="flex-1 min-w-0">
                      {aliasEditing.has(a.process_name) ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={aliasEditing.get(a.process_name) ?? a.alias ?? ""}
                            onChange={(e) => handleChangeAlias(a.process_name, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleCommitAlias(a.process_name);
                              if (e.key === "Escape") handleCancelAlias(a.process_name);
                            }}
                            placeholder={a.name}
                            className="h-8 text-sm"
                            autoFocus
                          />
                          <Button size="sm" variant="ghost" onClick={() => handleCommitAlias(a.process_name)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleCancelAlias(a.process_name)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm font-medium truncate">
                            {displayName}
                            {a.alias && !aliasEditing.has(a.process_name) && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ({a.name})
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {a.process_name || "-"} · {formatDuration(a.total_secs)}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Category selector */}
                    <select
                      value={a.category_id ?? ""}
                      onChange={(e) =>
                        handleChangeAppCategory(a.process_name, e.target.value === "" ? null : e.target.value)
                      }
                      className="h-8 text-sm border rounded-md px-2 bg-background"
                    >
                      <option value="">未分类</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>

                    {/* Alias edit button */}
                    {!aliasEditing.has(a.process_name) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleChangeAlias(a.process_name, a.alias ?? "")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    {/* Clear */}
                    {(a.category_id || a.alias) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm("清除此应用的分类和别名？")) {
                            removeAppAssignment(a.process_name)
                              .then(() => refresh())
                              .catch((e) => console.error(e));
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Small helper: a color swatch that opens an inline palette on click.
function ColorPickerButton({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 w-8 rounded-md border hover:scale-105 transition-transform"
        style={{ backgroundColor: color }}
        title="修改颜色"
      />
      {open && (
        <div className="absolute left-0 top-10 z-10 p-2 bg-background border rounded-md shadow-lg grid grid-cols-4 gap-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className="h-6 w-6 rounded-md border hover:scale-110 transition-transform"
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      )}
    </div>
  );
}
