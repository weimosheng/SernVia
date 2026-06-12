import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Settings, Monitor, Trash2, Download, Info, ExternalLink, Loader2, FolderOpen, RotateCcw, Power, Image as ImageIcon, Cloud, Plus, X, LogIn, LogOut, User } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/Toast";
import { createApiClient, getActivityEntriesForSync, getScreenshotsForSync, getCategoriesAndAssignmentsForSync } from "@/lib/cloud-api";

export function SettingsPage() {
  const { showToast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataPath, setDataPath] = useState<string>("%APPDATA%/sernvia/activity_data.json");
  const [pathMsg, setPathMsg] = useState<string>("");
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(true);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<string>("duration");
  const [importMessage, setImportMessage] = useState<string>("");
  const [selectedTaiDb, setSelectedTaiDb] = useState<string | null>(null);
  const [taiDbTables, setTaiDbTables] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  
  // Screenshot settings
  const [screenshotEnabled, setScreenshotEnabled] = useState<boolean>(false);
  const [screenshotInterval, setScreenshotInterval] = useState<string>("60");
  const [screenshotPath, setScreenshotPath] = useState<string>("");
  const [screenshotSettingsLoading, setScreenshotSettingsLoading] = useState<boolean>(true);
  const [maxStorageMb, setMaxStorageMb] = useState<string>("0");
  const [storageUsage, setStorageUsage] = useState<number | null>(null);
  const [storageUsageLimit, setStorageUsageLimit] = useState<number>(0);
  const [savingMaxStorage, setSavingMaxStorage] = useState<boolean>(false);
  const [maxStorageLoaded, setMaxStorageLoaded] = useState<boolean>(false);
  
  // Password change state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [hasScreenshotPassword, setHasScreenshotPassword] = useState(false);
  
  // Monitor selection
  const [monitors, setMonitors] = useState<Array<{id: number, x: number, y: number, width: number, height: number, is_primary: boolean}>>([]);
  const [selectedMonitors, setSelectedMonitors] = useState<number[]>([]);
  const [layoutMode, setLayoutMode] = useState<string>("horizontal");

  // Cloud sync state
  const [serverList, setServerList] = useState<Array<{id: string, name: string, url: string, is_official: boolean}>>([]);
  const [loginSession, setLoginSession] = useState<{server_id: string, server_url: string, token: string, user_id: string, display_name: string, device_id: string, device_unique_id: number | null, device_alias: string | null} | null>(null);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [loginServerUrl, setLoginServerUrl] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [addServerDialogOpen, setAddServerDialogOpen] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [newServerUrl, setNewServerUrl] = useState("");
  const [addServerLoading, setAddServerLoading] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<{last_sync_time: number | null; inserted: number; duplicate: number}>({
    last_sync_time: null,
    inserted: 0,
    duplicate: 0,
  });
  const [deviceList, setDeviceList] = useState<Array<{id: string; device_name: string; platform: string; last_sync_at?: number; unique_id?: number; alias?: string | null}>>([]);
  const [editingDeviceAlias, setEditingDeviceAlias] = useState(false);
  const [deviceAliasInput, setDeviceAliasInput] = useState("");
  const [syncConfig, setSyncConfig] = useState<{
    activity: { scope: "today" | "last_n" | "this_week" | "none"; count: number };
    screenshot: { scope: "today" | "last_n" | "this_week" | "none"; count: number };
    categories: boolean;
  }>({
    activity: { scope: "today", count: 100 },
    screenshot: { scope: "last_n", count: 20 },
    categories: true,
  });
  const [syncConfigOpen, setSyncConfigOpen] = useState(false);

  // Load screenshot settings on mount
  useEffect(() => {
    Promise.all([
      invoke<boolean>("get_screenshot_enabled").catch(() => false),
      invoke<number>("get_screenshot_interval").catch(() => 60),
      invoke<string>("get_screenshots_folder").catch(() => ""),
      invoke<Array<{id: number, x: number, y: number, width: number, height: number, is_primary: boolean}>>("get_monitor_list").catch(() => []),
      invoke<number[]>("get_selected_monitors").catch(() => []),
      invoke<string>("get_layout_mode").catch(() => "horizontal"),
      invoke<number>("get_max_storage_mb").catch(() => 0),
      invoke<number>("get_storage_usage_mb").catch(() => 0),
      invoke<boolean>("screenshot_has_password").catch(() => false),
    ]).then(([enabled, interval, path, monitorList, selected, mode, maxMb, usageMb, hasPw]) => {
      setScreenshotEnabled(enabled);
      setScreenshotInterval(interval.toString());
      setScreenshotPath(path);
      setMonitors(monitorList);
      setSelectedMonitors(selected.length > 0 ? selected : monitorList.map(m => m.id));
      setLayoutMode(mode);
      setMaxStorageMb(maxMb.toString());
      setStorageUsageLimit(maxMb);
      setStorageUsage(usageMb);
      setMaxStorageLoaded(true);
      setHasScreenshotPassword(hasPw);
    }).finally(() => {
      setScreenshotSettingsLoading(false);
    });
  }, []);

  // Load cloud sync state on mount
  useEffect(() => {
    const loadCloudState = async () => {
      try {
        const servers = await invoke<Array<{id: string, name: string, url: string, is_official: boolean}>>("get_cloud_server_list");
        const session = await invoke<{server_id: string, server_url: string, token: string, user_id: string, display_name: string, device_id: string, device_unique_id: number | null, device_alias: string | null} | null>("get_login_session");
        setServerList(servers);
        setLoginSession(session);
      } catch (err) {
        console.error("Failed to load cloud state:", err);
      }
    };
    loadCloudState();
  }, []);

  // Load device list when logged in
  useEffect(() => {
    if (loginSession) {
      loadDeviceList();
    } else {
      setDeviceList([]);
    }
  }, [loginSession]);

  const handleToggleScreenshot = async () => {
    try {
      if (screenshotEnabled) {
        await invoke("set_screenshot_enabled", { enabled: false });
        setScreenshotEnabled(false);
      } else {
        await invoke("set_screenshot_enabled", { enabled: true });
        setScreenshotEnabled(true);
      }
    } catch (err) {
      console.error("Screenshot toggle failed:", err);
    }
  };

  const handleMonitorToggle = async (monitorId: number) => {
    try {
      const newSelection = selectedMonitors.includes(monitorId)
        ? selectedMonitors.filter(id => id !== monitorId)
        : [...selectedMonitors, monitorId];
      
      // 如果取消选择所有，则默认选择所有
      const finalSelection = newSelection.length === 0 
        ? monitors.map(m => m.id) 
        : newSelection;
      
      await invoke("set_selected_monitors", { monitors: finalSelection });
      setSelectedMonitors(finalSelection);
    } catch (err) {
      console.error("Monitor selection failed:", err);
    }
  };

  const handleSelectAllMonitors = async () => {
    try {
      await invoke("set_selected_monitors", { monitors: [] });
      setSelectedMonitors(monitors.map(m => m.id));
    } catch (err) {
      console.error("Select all monitors failed:", err);
    }
  };

  const handleLayoutModeChange = async (mode: string) => {
    try {
      await invoke("set_layout_mode", { mode });
      setLayoutMode(mode);
    } catch (err) {
      console.error("Layout mode change failed:", err);
    }
  };

  const handleChangeScreenshotInterval = async (value: string) => {
    try {
      const interval = parseInt(value, 10);
      await invoke("set_screenshot_interval", { interval });
      setScreenshotInterval(value);
    } catch (err) {
      console.error("Screenshot interval change failed:", err);
    }
  };

  const handleSaveMaxStorage = async () => {
    try {
      const mb = parseInt(maxStorageMb, 10);
      if (isNaN(mb) || mb < 0) {
        alert("请输入有效的数字（0 或正整数）");
        return;
      }
      setSavingMaxStorage(true);
      await invoke("set_max_storage_mb", { mb });
      setStorageUsageLimit(mb);
      const newUsage = await invoke<number>("get_storage_usage_mb").catch(() => 0);
      setStorageUsage(newUsage);
    } catch (err) {
      console.error("Save max storage failed:", err);
      alert("保存失败：" + err);
    } finally {
      setSavingMaxStorage(false);
    }
  };

  const handleChangeScreenshotPath = async () => {
    const dir = await open({
      directory: true,
      multiple: false,
      title: "选择截图存储目录",
    });
    if (dir) {
      try {
        await invoke("set_screenshots_folder", { path: dir });
        const newPath = await invoke<string>("get_screenshots_folder");
        setScreenshotPath(newPath);
      } catch (err) {
        console.error("Screenshot path change failed:", err);
      }
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      showToast("请填写完整密码信息", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("两次输入的密码不一致", "error");
      return;
    }
    if (newPassword.length < 4) {
      showToast("密码至少需要4个字符", "error");
      return;
    }
    setChangingPassword(true);
    try {
      await invoke("change_screenshot_password", {
        oldPassword: hasScreenshotPassword ? oldPassword : "",
        newPassword,
      });
      showToast("密码已更新", "success");
      setPasswordDialogOpen(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setHasScreenshotPassword(true);
    } catch (err) {
      console.error("Change password failed:", err);
      showToast("密码更新失败：" + err, "error");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleResetScreenshotPath = async () => {
    try {
      await invoke("reset_screenshots_folder");
      const newPath = await invoke<string>("get_screenshots_folder");
      setScreenshotPath(newPath);
    } catch (err) {
      console.error("Reset screenshot path failed:", err);
    }
  };

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

  // Cloud sync handlers
  const handleAddServer = async () => {
    if (!newServerName.trim() || !newServerUrl.trim()) {
      showToast("请填写服务器名称和地址", "error");
      return;
    }
    
    // Basic URL validation
    let url = newServerUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "http://" + url;
    }
    
    setAddServerLoading(true);
    try {
      const server = await invoke<{id: string, name: string, url: string, is_official: boolean}>("add_cloud_server", {
        name: newServerName.trim(),
        url,
      });
      setServerList([...serverList, server]);
      setAddServerDialogOpen(false);
      setNewServerName("");
      setNewServerUrl("");
      showToast("服务器添加成功", "success");
    } catch (err) {
      console.error("Add server failed:", err);
      showToast("添加失败：" + err, "error");
    } finally {
      setAddServerLoading(false);
    }
  };

  const handleRemoveServer = async (serverId: string) => {
    try {
      await invoke("remove_cloud_server", { serverId });
      setServerList(serverList.filter(s => s.id !== serverId));
      if (loginSession?.server_id === serverId) {
        await handleLogout();
      }
      showToast("服务器已删除", "success");
    } catch (err) {
      console.error("Remove server failed:", err);
      showToast("删除失败：" + err, "error");
    }
  };

  const handleLogin = async (serverUrl: string) => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      showToast("请填写用户名和密码", "error");
      return;
    }

    setLoginLoading(true);
    try {
      const api = createApiClient(serverUrl);
      const result = await api.login(loginUsername.trim(), loginPassword);

      // Register device
      const computerName = await invoke<string>("get_computer_name");
      const deviceResult = await api.registerDevice(result.access_token, computerName, "windows");

      // 从 serverList 中查找匹配 URL 的 id
      const matched = serverList.find(
        (s) => s.url.replace(/\/$/, "") === serverUrl.replace(/\/$/, "")
      );
      const serverId = matched ? matched.id : serverUrl;

      // Save session locally
      await invoke("save_session", {
        serverId,
        serverUrl,
        token: result.access_token,
        userId: result.user_id,
        displayName: result.display_name,
        deviceId: deviceResult.device_id,
        deviceUniqueId: deviceResult.unique_id || null,
        deviceAlias: deviceResult.alias || null,
      });

      setLoginSession({
        server_id: serverId,
        server_url: serverUrl,
        token: result.access_token,
        user_id: result.user_id,
        display_name: result.display_name,
        device_id: deviceResult.device_id,
        device_unique_id: deviceResult.unique_id || null,
        device_alias: deviceResult.alias || null,
      });

      setLoginDialogOpen(false);
      setLoginUsername("");
      setLoginPassword("");
      showToast("登录成功", "success");
    } catch (err) {
      console.error("Login failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      showToast("登录失败：" + msg, "error");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerUsername.trim() || !registerPassword.trim() || !registerConfirmPassword.trim()) {
      showToast("请填写所有字段", "error");
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      showToast("两次输入的密码不一致", "error");
      return;
    }
    if (registerPassword.length < 6) {
      showToast("密码至少需要6个字符", "error");
      return;
    }
    
    setRegisterLoading(true);
    try {
      const api = createApiClient(loginServerUrl);
      await api.register(registerUsername.trim(), registerPassword, registerConfirmPassword);
      
      // Auto login after register
      setLoginPassword(registerPassword);
      await handleLogin(loginServerUrl);
      
      setRegisterDialogOpen(false);
      setRegisterUsername("");
      setRegisterPassword("");
      setRegisterConfirmPassword("");
    } catch (err) {
      console.error("Register failed:", err);
      showToast("注册失败：" + err, "error");
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await invoke("clear_session");
      setLoginSession(null);
      setDeviceList([]);
      setSyncStats({ last_sync_time: null, inserted: 0, duplicate: 0 });
      showToast("已退出登录", "success");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleSyncNow = async () => {
    if (!loginSession) return;

    setSyncing(true);
    try {
      const api = createApiClient(loginSession.server_url);
      let totalInserted = 0;
      let syncMessages: string[] = [];

      // === Upload activity data ===
      if (syncConfig.activity.scope !== "none") {
        const { entries, total } = await getActivityEntriesForSync(
          syncConfig.activity.scope,
          syncConfig.activity.count
        );

        if (entries.length > 0) {
          const pushResult = await api.pushActivity(
            loginSession.token,
            loginSession.device_id,
            loginSession.device_unique_id,
            entries
          );
          totalInserted += pushResult.inserted;
          syncMessages.push(`活动记录：上传 ${pushResult.inserted} 条 (共 ${total} 条)`);
        } else {
          syncMessages.push("活动记录：无可上传数据");
        }
      }

      // === Upload screenshots ===
      if (syncConfig.screenshot.scope !== "none") {
        const screenshots = await getScreenshotsForSync(
          syncConfig.screenshot.scope,
          syncConfig.screenshot.count
        );

        if (screenshots.length > 0) {
          let uploaded = 0;
          let skipped = 0;
          let failed = 0;
          const errorMessages: string[] = [];

          // Upload screenshots one by one (multipart upload requires separate requests)
          for (const s of screenshots) {
            try {
              const result = await api.uploadScreenshot(
                loginSession.token,
                loginSession.device_id,
                loginSession.device_unique_id,
                s.path,
                s.timestamp,
                undefined,
                undefined
              );
              if (result.already_existed) {
                skipped++;
              } else {
                uploaded++;
              }
            } catch (err) {
              failed++;
              if (errorMessages.length < 3) {
                const msg = err instanceof Error ? err.message : String(err);
                errorMessages.push(msg);
              }
            }
          }

          totalInserted += uploaded;
          const msgParts: string[] = [];
          if (uploaded > 0) msgParts.push(`新上传 ${uploaded} 张`);
          if (skipped > 0) msgParts.push(`已存在 ${skipped} 张`);
          if (failed > 0) msgParts.push(`失败 ${failed} 张`);
          msgParts.push(`共 ${screenshots.length} 张`);
          syncMessages.push(`截图：${msgParts.join("，")}`);
          if (errorMessages.length > 0) {
            syncMessages.push(`截图错误示例：${errorMessages[0]}`);
          }
        } else {
          syncMessages.push("截图：无可上传数据");
        }
      }

      // === Push & pull categories ===
      if (syncConfig.categories) {
        try {
          const catPayload = await getCategoriesAndAssignmentsForSync();
          if (catPayload.categories.length > 0 || catPayload.assignments.length > 0) {
            const catResult = await api.pushCategories(
              loginSession.token,
              loginSession.device_id,
              loginSession.device_unique_id,
              catPayload
            );
            const parts: string[] = [];
            if (catResult.categories_inserted > 0) parts.push(`分类新增 ${catResult.categories_inserted}`);
            if (catResult.categories_updated > 0) parts.push(`分类更新 ${catResult.categories_updated}`);
            if (catResult.assignments_inserted > 0) parts.push(`别名新增 ${catResult.assignments_inserted}`);
            if (catResult.assignments_updated > 0) parts.push(`别名更新 ${catResult.assignments_updated}`);
            if (parts.length > 0) {
              syncMessages.push(`分类：${parts.join("，")}`);
            }
          }

          // Pull remote categories and overwrite local store
          const pulledCategories = await api.pullCategories(
            loginSession.token,
            loginSession.device_id,
            syncStats.last_sync_time ?? 0
          );
          await invoke("cmd_replace_categories_store", {
            categories: pulledCategories.categories,
            assignments: pulledCategories.assignments,
          });
          const catCount = pulledCategories.categories.length;
          const asgnCount = pulledCategories.assignments.length;
          if (catCount > 0 || asgnCount > 0) {
            syncMessages.push(`分类拉取：${catCount} 个分类，${asgnCount} 个应用映射`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          syncMessages.push(`分类同步失败：${msg}`);
        }
      }

      // === Pull other devices' activity ===
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayStartTs = Math.floor(dayStart.getTime() / 1000);
      const pullResult = await api.pullActivity(
        loginSession.token,
        loginSession.device_id,
        syncStats.last_sync_time ?? dayStartTs
      );
      const pullCount = pullResult.entries?.length ?? 0;
      if (pullCount > 0) {
        syncMessages.push(`拉取 ${pullCount} 条来自其他设备的记录`);
      }

      const now = Math.floor(Date.now() / 1000);
      setSyncStats({
        last_sync_time: now,
        inserted: totalInserted,
        duplicate: 0,
      });

      setLoginSession({ ...loginSession });

      try {
        const devices = await api.getDevices(loginSession.token);
        setDeviceList(devices);
      } catch {
        // ignore device list errors
      }

      showToast(syncMessages.join("；"), "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("同步失败：" + msg, "error");
    } finally {
      setSyncing(false);
    }
  };

  const loadDeviceList = async () => {
    if (!loginSession) return;
    try {
      const api = createApiClient(loginSession.server_url);
      const devices = await api.getDevices(loginSession.token);
      setDeviceList(devices);
    } catch {
      // silently fail
    }
  };

  const openLoginDialog = (serverUrl: string = "") => {
    setLoginServerUrl(serverUrl);
    setLoginUsername("");
    setLoginPassword("");
    setLoginDialogOpen(true);
  };

  // Load admin status and data path on mount
  useEffect(() => {
    invoke<string>("get_data_path").then(setDataPath).catch(() => {});
    invoke<boolean>("is_admin").then(setIsAdmin).catch(() => {});
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
    setClearing(true);
    try {
      await invoke("clear_data");
      showToast("数据已清除", "success");
    } catch (err) {
      console.error("Clear failed:", err);
      showToast("清除失败：" + err, "error");
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

  const handleOpenGithub = async () => {
    await openUrl("https://github.com/weimosheng/SernVia");
  };

  const handleOpenTaiImport = async () => {
    setShowImportDialog(true);
    setImportMessage("");
    setSelectedTaiDb(null);
    setTaiDbTables([]);
  };

  const handleSelectTaiDb = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "Tai Database", extensions: ["db", "sqlite", "sqlite3"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (selected && typeof selected === "string") {
      setSelectedTaiDb(selected);
      // First get list of tables
      try {
        const tables = await invoke<string[]>("get_tai_db_tables", { dbPath: selected });
        setTaiDbTables(tables);
        setImportMessage(`数据库包含以下表：${tables.join(", ")}`);
      } catch (err) {
        console.error("Failed to get tables:", err);
        setImportMessage(`无法读取数据库表：${err}`);
      }
    }
  };

  const handleSelectTaiDir = async () => {
    const selected = await open({
      multiple: false,
      directory: true,
    });
    if (selected && typeof selected === "string") {
      // Try to find data.db in the directory
      const dbPath = `${selected}\\Data\\data.db`;
      setSelectedTaiDb(dbPath);
      // First get list of tables
      try {
        const tables = await invoke<string[]>("get_tai_db_tables", { dbPath });
        setTaiDbTables(tables);
        setImportMessage(`数据库包含以下表：${tables.join(", ")}`);
      } catch (err) {
        console.error("Failed to get tables:", err);
        setImportMessage(`无法读取数据库表：${err}`);
      }
    }
  };

  const doImport = async () => {
    if (!selectedTaiDb) return;
    setImporting(true);
    setImportMessage("正在导入...");
    try {
      const count = await invoke<number>("import_from_tai", {
        dbPath: selectedTaiDb,
        mode: importMode,
      });
      setImportMessage(`导入成功！共导入 ${count} 条活动记录`);
      setTimeout(() => {
        setShowImportDialog(false);
        // Refresh the page to show updated data
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error("Import failed:", err);
      setImportMessage(`导入失败：${err}`);
    } finally {
      setImporting(false);
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
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">管理员权限</p>
              <p className="text-xs text-muted-foreground">
                以管理员权限运行可提升监控精度，包括更多系统应用
              </p>
            </div>
            <div className={`flex items-center gap-1 text-xs ${isAdmin ? "text-green-500" : "text-yellow-600"}`}>
              <span className={`h-2 w-2 rounded-full ${isAdmin ? "bg-green-500" : "bg-yellow-600"}`} />
              {isAdmin ? "已获取" : "未获取"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 截图设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            截图回顾
          </CardTitle>
          <CardDescription>配置自动截图，记录您的屏幕使用情况</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {screenshotSettingsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">启用自动截图</p>
                  <p className="text-xs text-muted-foreground">
                    按设定的时间间隔自动捕获屏幕截图
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`flex items-center gap-1 text-xs ${screenshotEnabled ? "text-green-500" : "text-gray-400"}`}>
                    <span className={`h-2 w-2 rounded-full ${screenshotEnabled ? "bg-green-500" : "bg-gray-400"}`} />
                    {screenshotEnabled ? "已开启" : "未开启"}
                  </div>
                  <Switch
                    checked={screenshotEnabled}
                    onCheckedChange={handleToggleScreenshot}
                  />
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">截图间隔</p>
                  <p className="text-xs text-muted-foreground">
                    每隔多长时间截取一次屏幕
                  </p>
                </div>
                <Select
                  value={screenshotInterval}
                  onValueChange={handleChangeScreenshotInterval}
                  disabled={!screenshotEnabled}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 秒</SelectItem>
                    <SelectItem value="60">1 分钟</SelectItem>
                    <SelectItem value="300">5 分钟</SelectItem>
                    <SelectItem value="600">10 分钟</SelectItem>
                    <SelectItem value="1800">30 分钟</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">截图保存位置</p>
                  <p className="text-xs text-muted-foreground select-all break-all mt-1">
                    {screenshotPath}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1"
                    onClick={handleResetScreenshotPath}
                    disabled={!screenshotEnabled}
                    title="恢复默认"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1"
                    onClick={handleChangeScreenshotPath}
                    disabled={!screenshotEnabled}
                  >
                    <FolderOpen className="h-4 w-4" />
                    更改目录
                  </Button>
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">选择显示器</p>
                    <p className="text-xs text-muted-foreground">
                      选择要截图的显示器
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllMonitors}
                    disabled={!screenshotEnabled}
                  >
                    选择全部
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">拼接方式</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleLayoutModeChange("horizontal")}
                      disabled={!screenshotEnabled}
                      className={`p-3 rounded-lg border text-left text-sm transition-all ${
                        layoutMode === "horizontal"
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      } ${!screenshotEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <p className="font-medium">水平拼接</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        选中的显示器从左到右依次排列
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLayoutModeChange("position")}
                      disabled={!screenshotEnabled}
                      className={`p-3 rounded-lg border text-left text-sm transition-all ${
                        layoutMode === "position"
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      } ${!screenshotEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <p className="font-medium">按系统位置拼接</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        按显示器在系统中的实际位置拼接
                      </p>
                    </button>
                  </div>
                </div>

                {monitors.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {monitors.map((monitor) => (
                      <label
                        key={monitor.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedMonitors.includes(monitor.id)
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        } ${!screenshotEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMonitors.includes(monitor.id)}
                          onChange={() => handleMonitorToggle(monitor.id)}
                          disabled={!screenshotEnabled}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            显示器 {monitor.id + 1}
                            {monitor.is_primary && (
                              <span className="ml-2 text-xs text-primary">(主屏)</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {monitor.width} × {monitor.height}
                            {typeof monitor.x === 'number' && typeof monitor.y === 'number' && (monitor.x !== 0 || monitor.y !== 0) && (
                              <span className="ml-2">[{monitor.x}, {monitor.y}]</span>
                            )}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">未检测到显示器</p>
                )}

                {monitors.length > 1 && (() => {
                  const minX = Math.min(...monitors.map(m => m.x));
                  const minY = Math.min(...monitors.map(m => m.y));
                  const maxX = Math.max(...monitors.map(m => m.x + m.width));
                  const maxY = Math.max(...monitors.map(m => m.y + m.height));
                  const totalW = maxX - minX;
                  const totalH = maxY - minY;
                  const SVG_W = 480;
                  const SVG_H = 200;
                  const scale = Math.min(SVG_W / totalW, SVG_H / totalH);
                  const offsetX = (SVG_W - totalW * scale) / 2;
                  const offsetY = (SVG_H - totalH * scale) / 2;
                  return (
                    <div className="mt-2 p-3 border border-border rounded-lg bg-muted/20">
                      <p className="text-xs text-muted-foreground mb-2">显示器布局示意</p>
                      <svg
                        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                        className="w-full h-auto"
                        style={{ maxHeight: '200px' }}
                      >
                        <rect
                          x={0}
                          y={0}
                          width={SVG_W}
                          height={SVG_H}
                          fill="transparent"
                        />
                        {monitors.map((m) => {
                          const rectX = offsetX + (m.x - minX) * scale;
                          const rectY = offsetY + (m.y - minY) * scale;
                          const rectW = m.width * scale;
                          const rectH = m.height * scale;
                          const isSelected = selectedMonitors.includes(m.id);
                          return (
                            <g key={m.id}>
                              <rect
                                x={rectX}
                                y={rectY}
                                width={rectW}
                                height={rectH}
                                fill={isSelected ? "rgb(99,102,241)" : "rgb(229,231,235)"}
                                fillOpacity={isSelected ? 0.6 : 0.4}
                                stroke={isSelected ? "rgb(79,70,229)" : "rgb(156,163,175)"}
                                strokeWidth={1.5}
                                rx={6}
                              />
                              <text
                                x={rectX + rectW / 2}
                                y={rectY + rectH / 2 - 4}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={Math.min(rectW / 6, 14)}
                                fill={isSelected ? "white" : "rgb(55,65,81)"}
                                fontWeight={600}
                              >
                                显示器 {m.id + 1}{m.is_primary ? " (主屏)" : ""}
                              </text>
                              <text
                                x={rectX + rectW / 2}
                                y={rectY + rectH / 2 + 12}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={Math.min(rectW / 8, 11)}
                                fill={isSelected ? "white" : "rgb(107,114,128)"}
                              >
                                {m.width} × {m.height}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  );
                })()}

                {selectedMonitors.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    已选择全部显示器
                  </p>
                )}
              </div>

              <Separator />

              {/* 存储容量限制 */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">最大存储容量</p>
                    <p className="text-xs text-muted-foreground">
                      超过该大小后，自动删除最旧的截图（0 = 不限制）
                    </p>
                    {maxStorageLoaded && storageUsage !== null && (
                      <p className="text-xs mt-2">
                        当前已使用: <span className={storageUsageLimit > 0 && storageUsage > storageUsageLimit ? "text-destructive" : "text-muted-foreground"}>
                          {storageUsage.toFixed(1)} MB
                        </span>
                        {storageUsageLimit > 0 && (
                          <span className="text-muted-foreground"> / {storageUsageLimit} MB</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      min="0"
                      className="w-[120px] text-sm"
                      value={maxStorageMb}
                      onChange={(e) => setMaxStorageMb(e.target.value)}
                      disabled={!screenshotEnabled}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveMaxStorage}
                      disabled={!screenshotEnabled || savingMaxStorage}
                    >
                      {savingMaxStorage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : "保存"}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  单位：MB（兆字节）。例如 500 = 500MB，1024 = 1GB。
                </p>
              </div>
              
              <Separator />
              
              {/* 密码设置 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">截图密码</p>
                    <p className="text-xs text-muted-foreground">
                      {hasScreenshotPassword ? "更改截图查看密码" : "设置截图查看密码"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setOldPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                      setPasswordDialogOpen(true);
                    }}
                  >
                    {hasScreenshotPassword ? "更改密码" : "设置密码"}
                  </Button>
                </div>
              </div>
              
              <Separator />
              
              {/* 清除截图 */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-destructive">清除所有截图</p>
                  <p className="text-xs text-muted-foreground">
                    删除所有截图文件并重置密码设置（不可恢复）
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={async () => {
                    try {
                      await invoke("clear_all_screenshots");
                      showToast("截图和密码已清除", "success");
                      setHasScreenshotPassword(false);
                      // 刷新页面
                      window.location.reload();
                    } catch (err) {
                      console.error("Clear screenshots failed:", err);
                      showToast("清除失败：" + err, "error");
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  清除截图
                </Button>
              </div>
            </>
          )}
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
              <p className="text-sm font-medium">从 Tai 导入数据</p>
              <p className="text-xs text-muted-foreground">
                从 Tai 应用的数据库文件导入使用记录
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
              onClick={handleOpenTaiImport}
            >
              <FolderOpen className="h-4 w-4" />
              导入 Tai 数据
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

      {/* 云同步 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            云同步
          </CardTitle>
          <CardDescription>登录账号后自动同步使用数据到云端</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current login status */}
          {loginSession ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{loginSession.display_name}</p>
                  <p className="text-xs text-muted-foreground">{loginSession.server_url}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                退出
              </Button>
            </div>
          ) : (
            <div className="text-center py-4 text-sm text-muted-foreground">
              未登录云同步账号
            </div>
          )}

          {/* Sync status (when logged in) */}
          {loginSession && (
            <>
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className={`h-4 w-4 ${syncing ? "animate-spin text-primary" : "text-muted-foreground"}`} />
                  <span className="text-muted-foreground">
                    {syncStats.last_sync_time
                      ? `上次同步：${new Date(syncStats.last_sync_time * 1000).toLocaleString()}`
                      : "尚未同步"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {syncStats.last_sync_time && (
                    <span className="text-xs text-muted-foreground">
                      上传 {syncStats.inserted} 条
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1"
                    onClick={handleSyncNow}
                    disabled={syncing}
                  >
                    {syncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    {syncing ? "同步中..." : "立即同步"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSyncConfigOpen(true)}
                    title="同步设置"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Sync scope summary */}
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground px-1">
                <span>
                  活动：{syncConfig.activity.scope === "today" ? "今天" : syncConfig.activity.scope === "this_week" ? "本周" : `最近 ${syncConfig.activity.count} 条`}
                </span>
                <span>
                  截图：{syncConfig.screenshot.scope === "today" ? "今天" : syncConfig.screenshot.scope === "this_week" ? "本周" : `最近 ${syncConfig.screenshot.count} 张`}
                </span>
                <span>
                  分类：{syncConfig.categories ? "全量同步" : "不同步"}
                </span>
              </div>

              {/* Connected devices */}
              {deviceList.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="text-xs font-medium text-foreground">已连接设备</p>
                  {deviceList.map((d) => {
                    const isCurrent = d.id === loginSession.device_id;
                    const displayLabel = d.alias || d.device_name;
                    return (
                      <div key={d.id} className="flex items-center gap-2">
                        <div className={`h-1.5 w-1.5 rounded-full ${isCurrent ? "bg-green-500" : "bg-blue-500"}`} />
                        <span className="truncate max-w-[180px]">{displayLabel}</span>
                        {d.alias && <span className="text-[10px] opacity-60">({d.device_name})</span>}
                        <span className="text-[10px]">({d.platform})</span>
                        {d.last_sync_at && (
                          <span className="text-[10px]">- {new Date(d.last_sync_at * 1000).toLocaleString()}</span>
                        )}
                        {isCurrent && d.unique_id && (
                          <span className="text-[10px] bg-muted px-1 rounded">ID: {d.unique_id}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Current device alias editor */}
              {loginSession?.device_unique_id && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">本机别名：</span>
                  {editingDeviceAlias ? (
                    <>
                      <Input
                        value={deviceAliasInput}
                        onChange={(e) => setDeviceAliasInput(e.target.value)}
                        placeholder={loginSession.device_alias || "输入别名"}
                        className="h-7 w-32 text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const api = createApiClient(loginSession.server_url);
                            api.setDeviceAlias(loginSession.token, loginSession.device_unique_id!, deviceAliasInput)
                              .then(() => {
                                setLoginSession({ ...loginSession, device_alias: deviceAliasInput || null });
                                setEditingDeviceAlias(false);
                                loadDeviceList();
                              })
                              .catch(console.error);
                          }
                          if (e.key === "Escape") {
                            setEditingDeviceAlias(false);
                            setDeviceAliasInput("");
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          const api = createApiClient(loginSession.server_url);
                          api.setDeviceAlias(loginSession.token, loginSession.device_unique_id!, deviceAliasInput)
                            .then(() => {
                              setLoginSession({ ...loginSession, device_alias: deviceAliasInput || null });
                              setEditingDeviceAlias(false);
                              loadDeviceList();
                            })
                            .catch(console.error);
                        }}
                      >
                        保存
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">
                        {loginSession.device_alias || "未设置"}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1 text-xs"
                        onClick={() => {
                          setDeviceAliasInput(loginSession.device_alias || "");
                          setEditingDeviceAlias(true);
                        }}
                      >
                        编辑
                      </Button>
                    </>
                  )}
                </div>
              )}

              <Separator />
            </>
          )}
          
          {/* Server list */}
          <div className="space-y-2">
            <p className="text-sm font-medium">服务器列表</p>
            {serverList.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无服务器，请添加自定义服务器</p>
            ) : (
              <div className="space-y-2">
                {serverList.map((server) => {
                  const isCurrentServer = loginSession?.server_id === server.id;
                  return (
                    <div key={server.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{server.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{server.url}</p>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant={isCurrentServer ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => isCurrentServer ? {} : openLoginDialog(server.url)}
                          disabled={isCurrentServer}
                        >
                          <LogIn className="h-3 w-3 mr-1" />
                          {isCurrentServer ? "已登录" : "登录"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveServer(server.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          <Separator />
          
          {/* Add server button */}
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
              onClick={() => {
                setNewServerName("");
                setNewServerUrl("");
                setAddServerDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              添加自定义服务器
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
            <p className="text-sm text-muted-foreground">v0.3.2</p>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">技术栈</p>
            <p className="text-sm text-muted-foreground">
              Tauri v2 + React + Rust
            </p>
          </div>
          <Separator />
          <div className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity" onClick={handleOpenGithub}>
            <div className="flex items-center gap-2">
               <ExternalLink className="h-4 w-4" />
              <p className="text-sm font-medium">GitHub</p>
            </div>
            <p className="text-sm text-muted-foreground">SernVia</p>
          </div>
        </CardContent>
      </Card>

      {/* Tai Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>从 Tai 导入数据</CardTitle>
              <CardDescription>
                选择 Tai 的数据库文件或安装目录来导入使用记录
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">选择导入方式</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={handleSelectTaiDb}
                    disabled={importing}
                    className="justify-start"
                  >
                    <FolderOpen className="h-4 w-4 mr-2" />
                    选择数据库文件
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSelectTaiDir}
                    disabled={importing}
                    className="justify-start"
                  >
                    <FolderOpen className="h-4 w-4 mr-2" />
                    选择 Tai 目录
                  </Button>
                </div>
              </div>

              {selectedTaiDb && (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">已选择的数据库</p>
                    <p className="text-xs text-muted-foreground break-all">{selectedTaiDb}</p>
                  </div>
                  
                  {taiDbTables.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">数据库中的表</p>
                      <div className="flex flex-wrap gap-2">
                        {taiDbTables.map((table, i) => (
                          <span key={i} className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {table}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <Separator />

              {selectedTaiDb && (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">展开方式（时间分配策略）</p>
                    <div className="space-y-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="importMode"
                          value="duration"
                          checked={importMode === "duration"}
                          onChange={(e) => setImportMode(e.target.value)}
                          disabled={importing}
                        />
                        <span className="text-sm">
                          按使用时长排序（推荐）：长时长的应用排前面
                        </span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="importMode"
                          value="name"
                          checked={importMode === "name"}
                          onChange={(e) => setImportMode(e.target.value)}
                          disabled={importing}
                        />
                        <span className="text-sm">
                          按应用名称排序：按字母顺序分配时间
                        </span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="importMode"
                          value="middle"
                          checked={importMode === "middle"}
                          onChange={(e) => setImportMode(e.target.value)}
                          disabled={importing}
                        />
                        <span className="text-sm">
                          居中放置：每个应用放在该小时的中间
                        </span>
                      </label>
                    </div>
                  </div>

                  <Separator />
                </>
              )}

              {importMessage && (
                <p
                  className={`text-sm ${
                    importMessage.includes("成功") || importMessage.includes("数据库包含以下表")
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {importMessage}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowImportDialog(false)}
                  disabled={importing}
                >
                  取消
                </Button>
                {selectedTaiDb && (
                  <Button
                    onClick={doImport}
                    disabled={importing || taiDbTables.length === 0}
                    className="flex items-center gap-1"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在导入...
                      </>
                    ) : (
                      "开始导入"
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Password Change Dialog */}
      {passwordDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>{hasScreenshotPassword ? "更改密码" : "设置密码"}</CardTitle>
              <CardDescription>
                {hasScreenshotPassword
                  ? "请输入旧密码验证身份，然后设置新密码"
                  : "设置密码后，查看截图时需要输入密码"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasScreenshotPassword && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">旧密码</label>
                  <Input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="请输入旧密码"
                  />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">新密码</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="请输入新密码（至少4个字符）"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">确认新密码</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入新密码"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPasswordDialogOpen(false);
                    setOldPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                >
                  取消
                </Button>
                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                >
                  {changingPassword ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      保存中...
                    </>
                  ) : "保存"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Server Dialog */}
      {addServerDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>添加自定义服务器</CardTitle>
              <CardDescription>
                添加你自己的 SernVia 服务器地址
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">服务器名称</label>
                <Input
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  placeholder="例如：我的服务器"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">服务器地址</label>
                <Input
                  value={newServerUrl}
                  onChange={(e) => setNewServerUrl(e.target.value)}
                  placeholder="例如：http://192.168.1.100:8080"
                />
                <p className="text-xs text-muted-foreground">
                  请输入服务器的完整地址，包括 http:// 或 https://
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddServerDialogOpen(false);
                    setNewServerName("");
                    setNewServerUrl("");
                  }}
                >
                  取消
                </Button>
                <Button
                  onClick={handleAddServer}
                  disabled={addServerLoading}
                >
                  {addServerLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      添加中...
                    </>
                  ) : "添加"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Login Dialog */}
      {loginDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>登录账号</CardTitle>
              <CardDescription>
                登录到 {loginServerUrl}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">用户名</label>
                <Input
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="请输入用户名"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">密码</label>
                <Input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="请输入密码"
                />
              </div>
              <div className="flex justify-between pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLoginDialogOpen(false);
                    setRegisterDialogOpen(true);
                    setRegisterUsername("");
                    setRegisterPassword("");
                    setRegisterConfirmPassword("");
                  }}
                >
                  没有账号？注册
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setLoginDialogOpen(false);
                      setLoginUsername("");
                      setLoginPassword("");
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    onClick={() => handleLogin(loginServerUrl)}
                    disabled={loginLoading}
                  >
                    {loginLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        登录中...
                      </>
                    ) : "登录"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Register Dialog */}
      {registerDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>注册账号</CardTitle>
              <CardDescription>
                创建新账号用于 {loginServerUrl}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">用户名</label>
                <Input
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value)}
                  placeholder="请输入用户名（3-30个字符）"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">密码</label>
                <Input
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder="请输入密码（至少6个字符）"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">确认密码</label>
                <Input
                  type="password"
                  value={registerConfirmPassword}
                  onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                  placeholder="请再次输入密码"
                />
              </div>
              <div className="flex justify-between pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRegisterDialogOpen(false);
                    setLoginDialogOpen(true);
                  }}
                >
                  已有账号？登录
                </Button>
                <Button
                  onClick={handleRegister}
                  disabled={registerLoading}
                >
                  {registerLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      注册中...
                    </>
                  ) : "注册"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sync Config Dialog */}
      {syncConfigOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>同步设置</CardTitle>
              <CardDescription>
                选择需要同步的数据范围和数量
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Activity sync config */}
              <div className="space-y-3">
                <p className="text-sm font-medium">活动记录同步</p>
                <div className="flex items-center gap-2">
                  <Select
                    value={syncConfig.activity.scope}
                    onValueChange={(v) => setSyncConfig({ ...syncConfig, activity: { ...syncConfig.activity, scope: v as any } })}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="选择范围" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">今天</SelectItem>
                      <SelectItem value="this_week">本周</SelectItem>
                      <SelectItem value="last_n">最近 N 条</SelectItem>
                    </SelectContent>
                  </Select>
                  {syncConfig.activity.scope === "last_n" && (
                    <Input
                      type="number"
                      className="w-24"
                      min={10}
                      max={5000}
                      value={syncConfig.activity.count}
                      onChange={(e) => setSyncConfig({ ...syncConfig, activity: { ...syncConfig.activity, count: Number(e.target.value) || 100 } })}
                    />
                  )}
                </div>
              </div>

              {/* Screenshot sync config */}
              <div className="space-y-3">
                <p className="text-sm font-medium">截图同步</p>
                <div className="flex items-center gap-2">
                  <Select
                    value={syncConfig.screenshot.scope}
                    onValueChange={(v) => setSyncConfig({ ...syncConfig, screenshot: { ...syncConfig.screenshot, scope: v as any } })}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="选择范围" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">今天</SelectItem>
                      <SelectItem value="this_week">本周</SelectItem>
                      <SelectItem value="last_n">最近 N 张</SelectItem>
                    </SelectContent>
                  </Select>
                  {syncConfig.screenshot.scope === "last_n" && (
                    <Input
                      type="number"
                      className="w-24"
                      min={5}
                      max={1000}
                      value={syncConfig.screenshot.count}
                      onChange={(e) => setSyncConfig({ ...syncConfig, screenshot: { ...syncConfig.screenshot, count: Number(e.target.value) || 20 } })}
                    />
                  )}
                </div>
              </div>

              {/* Categories sync config */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">分类与别名同步</p>
                  <Switch
                    checked={syncConfig.categories}
                    onCheckedChange={(v) => setSyncConfig({ ...syncConfig, categories: v })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {syncConfig.categories
                    ? "开启后，将全量同步所有分类和别名配置"
                    : "关闭后，不进行任何分类相关同步"}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setSyncConfigOpen(false)}
                >
                  关闭
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
