// Cloud Sync API Module
// HTTP 请求通过 Rust 后端（reqwest）发起，绕过了 webview 的 CORS/网络限制

import { invoke } from "@tauri-apps/api/core";

export interface ServerConfig {
  id: string;
  name: string;
  url: string;
  is_official?: boolean;
}

export interface LoginResponse {
  access_token: string;
  user_id: string;
  display_name: string;
}

export interface RegisterResponse {
  user_id: string;
  access_token: string;
  display_name: string;
}

export interface DeviceInfo {
  id: string;
  device_name: string;
  platform: string;
  last_sync_at?: number;
  unique_id?: number;
  alias?: string | null;
}

export interface SyncEntry {
  app_name: string;
  process_name: string;
  window_title: string | null;
  is_browser: boolean;
  browser_domain: string | null;
  start_time: number;
  end_time: number;
  duration_secs: number;
}

export interface SyncResult {
  inserted: number;
  duplicate: number;
  source_hashes?: string[];
}

export interface PullResult {
  entries: SyncEntry[];
  has_more: boolean;
  next_from_time: number;
}

export type SyncScope = "today" | "last_n" | "this_week" | "none";
export type SyncTarget = "activity" | "screenshot";

export interface SyncScopeConfig {
  activity: { scope: SyncScope; count: number };
  screenshot: { scope: SyncScope; count: number };
  categories: { enabled: boolean };
}

export interface SyncScreenshotInfo {
  path: string;
  date: string;
  timestamp: number;
}

/** Get activity entries from local storage by scope and count */
export async function getActivityEntriesForSync(scope: SyncScope, count: number = 100): Promise<{ entries: SyncEntry[]; total: number }> {
  const result = await invoke<[Record<string, unknown>[], number]>("get_activity_entries_for_sync", { scope, count });
  const entries: SyncEntry[] = result[0].map((e: any) => ({
    app_name: String(e.app_name ?? ""),
    process_name: String(e.process_name ?? ""),
    window_title: e.window_title != null ? String(e.window_title) : null,
    is_browser: Boolean(e.is_browser),
    browser_domain: e.browser_domain != null ? String(e.browser_domain) : null,
    start_time: Number(e.start_time ?? 0),
    end_time: Number(e.end_time ?? 0),
    duration_secs: Number(e.duration_secs ?? 0),
  }));
  return { entries, total: result[1] };
}

/** Get screenshot paths from local storage by scope and count */
export async function getScreenshotsForSync(scope: SyncScope, count: number = 50): Promise<SyncScreenshotInfo[]> {
  return invoke<SyncScreenshotInfo[]>("get_screenshots_for_sync", { scope, count });
}

// ==================== Categories & Aliases ====================

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface AppAssignment {
  process_name: string;
  category_id: string | null;
  alias: string | null;
}

export interface BarSegment {
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  secs: number;
}

export interface CategoryBarEntry {
  label: string;
  total_secs: number;
  segments: BarSegment[];
}

export interface AppWithMeta {
  name: string;
  process_name: string;
  total_secs: number;
  session_count: number;
  alias: string | null;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
}

export async function getCategories(): Promise<Category[]> {
  return invoke<Category[]>("cmd_get_categories");
}

export async function addCategory(name: string, color: string): Promise<Category> {
  return invoke<Category>("cmd_add_category", { name, color });
}

export async function updateCategory(id: string, patch: { name?: string; color?: string }): Promise<boolean> {
  return invoke<boolean>("cmd_update_category", { id, name: patch.name ?? null, color: patch.color ?? null });
}

export async function deleteCategory(id: string): Promise<boolean> {
  return invoke<boolean>("cmd_delete_category", { id });
}

export async function getAssignments(): Promise<AppAssignment[]> {
  return invoke<AppAssignment[]>("cmd_get_assignments");
}

export async function setAppCategory(processName: string, categoryId: string | null): Promise<void> {
  await invoke("cmd_set_app_category", { processName, categoryId });
}

export async function setAppAlias(processName: string, alias: string | null): Promise<void> {
  await invoke("cmd_set_app_alias", { processName, alias });
}

export async function removeAppAssignment(processName: string): Promise<void> {
  await invoke("cmd_remove_app_assignment", { processName });
}

export async function getCategoryBarData(range: string, offsetDays: number = 0): Promise<CategoryBarEntry[]> {
  return invoke<CategoryBarEntry[]>("get_category_bar_data", { range, offsetDays });
}

export async function getAppsWithMeta(range: string, offsetDays: number = 0): Promise<AppWithMeta[]> {
  return invoke<AppWithMeta[]>("get_apps_with_meta", { range, offsetDays });
}

// === Categories & assignments sync helpers ===
// The server stores categories keyed by client-generated IDs (a stable GUID/UUID).
// Each device pushes its own snapshot; the server merges by (user_id, id).
// App assignments are linked by process_name (lowercased, normalised).

export interface CategoryPayload {
  id: string;                 // client-generated stable ID (UUID)
  name: string;               // display label
  color: string;              // CSS hex: "#3b82f6"
  updated_at: number;         // unix timestamp (seconds) – for server-side merge resolution
}

export interface AppAssignmentPayload {
  process_name: string;       // lowercased, normalised process name
  category_id: string | null; // references CategoryPayload.id; null = uncategorised
  alias: string | null;       // user-provided display name; null = no alias
  updated_at: number;         // unix timestamp (seconds)
}

export interface CategoriesSyncPayload {
  categories: CategoryPayload[];
  assignments: AppAssignmentPayload[];
}

export interface CategoriesSyncResult {
  categories_inserted: number;
  categories_updated: number;
  assignments_inserted: number;
  assignments_updated: number;
}

/** Fetch the local category + assignment store in a shape ready to push */
export async function getCategoriesAndAssignmentsForSync(): Promise<CategoriesSyncPayload> {
  const [cats, assignments] = await Promise.all([
    invoke<Category[]>("cmd_get_categories"),
    invoke<AppAssignment[]>("cmd_get_assignments"),
  ]);

  const now = Math.floor(Date.now() / 1000);
  return {
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      updated_at: now,
    })),
    assignments: assignments.map((a) => ({
      process_name: a.process_name,
      category_id: a.category_id,
      alias: a.alias,
      updated_at: now,
    })),
  };
}

function createApiClient(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, "");

  return {
    async login(username: string, password: string): Promise<LoginResponse> {
      const raw = await invoke<Record<string, unknown>>("cloud_http_login", {
        serverUrl: trimmed,
        username,
        password,
      });
      return {
        access_token: String(raw.access_token ?? ""),
        user_id: String(raw.user_id ?? ""),
        display_name: String(raw.display_name ?? ""),
      };
    },

    async register(
      username: string,
      password: string,
      confirmPassword: string
    ): Promise<RegisterResponse> {
      const raw = await invoke<Record<string, unknown>>("cloud_http_register", {
        serverUrl: trimmed,
        username,
        password,
        confirmPassword,
      });
      return {
        access_token: String(raw.access_token ?? ""),
        user_id: String(raw.user_id ?? ""),
        display_name: String(raw.display_name ?? ""),
      };
    },

    async registerDevice(
      token: string,
      deviceName: string,
      platform: string
    ): Promise<{ device_id: string; unique_id: number; alias: string | null }> {
      const raw = await invoke<Record<string, unknown>>("cloud_http_register_device", {
        serverUrl: trimmed,
        token,
        deviceName,
        platform,
      });
      return {
        device_id: String(raw.device_id ?? ""),
        unique_id: Number(raw.unique_id ?? 0),
        alias: raw.alias ? String(raw.alias) : null,
      };
    },

    async setDeviceAlias(
      token: string,
      uniqueId: number,
      alias: string
    ): Promise<{ device_id: string; unique_id: number; alias: string }> {
      const raw = await invoke<Record<string, unknown>>("cloud_http_set_device_alias", {
        serverUrl: trimmed,
        token,
        uniqueId,
        alias,
      });
      return {
        device_id: String(raw.device_id ?? ""),
        unique_id: Number(raw.unique_id ?? 0),
        alias: String(raw.alias ?? ""),
      };
    },

    async pushActivity(
      token: string,
      deviceId: string,
      deviceUniqueId: number | null,
      entries: SyncEntry[]
    ): Promise<SyncResult> {
      const raw = await invoke<Record<string, unknown>>("cloud_http_push_activity", {
        serverUrl: trimmed,
        token,
        deviceId,
        deviceUniqueId,
        entries,
      });
      return {
        inserted: Number(raw.inserted ?? 0),
        duplicate: Number(raw.duplicate ?? 0),
        source_hashes: raw.source_hashes as string[] | undefined,
      };
    },

    async uploadScreenshot(
      token: string,
      deviceId: string,
      deviceUniqueId: number | null,
      screenshotPath: string,
      captureTime: number,
      appName?: string,
      windowTitle?: string
    ): Promise<{ screenshot_id: string; download_url: string; already_existed: boolean }> {
      const raw = await invoke<Record<string, unknown>>("cloud_http_upload_screenshot", {
        serverUrl: trimmed,
        token,
        deviceId,
        deviceUniqueId,
        screenshotPath,
        captureTime,
        appName: appName ?? null,
        windowTitle: windowTitle ?? null,
      });
      return {
        screenshot_id: String(raw.screenshot_id ?? raw.screenshotId ?? ""),
        download_url: String(raw.download_url ?? raw.downloadUrl ?? ""),
        already_existed: Boolean(raw.already_existed ?? raw.alreadyExisted ?? false),
      };
    },

    async pushCategories(
      token: string,
      deviceId: string,
      deviceUniqueId: number | null,
      payload: CategoriesSyncPayload
    ): Promise<CategoriesSyncResult> {
      const raw = await invoke<Record<string, unknown>>("cloud_http_push_categories", {
        serverUrl: trimmed,
        token,
        deviceId,
        deviceUniqueId,
        categories: payload.categories,
        assignments: payload.assignments,
      });
      return {
        categories_inserted: Number(raw.categories_inserted ?? 0),
        categories_updated: Number(raw.categories_updated ?? 0),
        assignments_inserted: Number(raw.assignments_inserted ?? 0),
        assignments_updated: Number(raw.assignments_updated ?? 0),
      };
    },

    async pullCategories(
      token: string,
      deviceId: string,
      lastSyncTime: number
    ): Promise<CategoriesSyncPayload & { server_updated_at: number }> {
      const raw = await invoke<Record<string, unknown>>("cloud_http_pull_categories", {
        serverUrl: trimmed,
        token,
        deviceId,
        lastSyncTime,
      });
      return {
        categories: ((raw.categories as CategoryPayload[]) || []).map((c) => ({
          id: String(c.id ?? ""),
          name: String(c.name ?? ""),
          color: String(c.color ?? "#64748b"),
          updated_at: Number(c.updated_at ?? 0),
        })),
        assignments: ((raw.assignments as AppAssignmentPayload[]) || []).map((a) => ({
          process_name: String(a.process_name ?? ""),
          category_id: a.category_id == null ? null : String(a.category_id),
          alias: a.alias == null ? null : String(a.alias),
          updated_at: Number(a.updated_at ?? 0),
        })),
        server_updated_at: Number(raw.server_updated_at ?? 0),
      };
    },

    async pullActivity(
      token: string,
      deviceId: string,
      fromTime: number
    ): Promise<PullResult> {
      const raw = await invoke<Record<string, unknown>>("cloud_http_pull_activity", {
        serverUrl: trimmed,
        token,
        deviceId,
        fromTime,
      });
      return {
        entries: (raw.entries as SyncEntry[]) || [],
        has_more: Boolean(raw.has_more),
        next_from_time: Number(raw.next_from_time ?? 0),
      };
    },

    async getDevices(token: string): Promise<DeviceInfo[]> {
      const raw = await invoke<unknown[]>("cloud_http_get_devices", {
        serverUrl: trimmed,
        token,
      });
      return (raw || []).map((d: any) => ({
        id: String(d.id ?? ""),
        device_name: String(d.device_name ?? ""),
        platform: String(d.platform ?? ""),
        last_sync_at: d.last_sync_at ? Number(d.last_sync_at) : undefined,
        unique_id: d.unique_id != null ? Number(d.unique_id) : undefined,
        alias: d.alias ? String(d.alias) : null,
      }));
    },

    async testConnection(): Promise<boolean> {
      try {
        return await invoke<boolean>("cloud_http_test", { serverUrl: trimmed });
      } catch {
        return false;
      }
    },
  };
}

// 存储当前使用的 API 客户端
let currentApiClient: ReturnType<typeof createApiClient> | null = null;
let currentToken: string | null = null;
let currentServerId: string | null = null;

export function getCloudApi() {
  return currentApiClient;
}

export function getCloudToken() {
  return currentToken;
}

export function getCurrentServerId() {
  return currentServerId;
}

export function setCloudConfig(serverUrl: string, token: string, serverId: string) {
  currentApiClient = createApiClient(serverUrl);
  currentToken = token;
  currentServerId = serverId;
}

export function clearCloudConfig() {
  currentApiClient = null;
  currentToken = null;
  currentServerId = null;
}

export { createApiClient };
