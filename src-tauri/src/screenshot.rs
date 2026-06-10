
use chrono::{Datelike, Local, Timelike};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub id: usize,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum LayoutMode {
    Horizontal,
    Position,
}

impl Default for LayoutMode {
    fn default() -> Self {
        LayoutMode::Horizontal
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotSettings {
    pub enabled: bool,
    pub interval_secs: u64,
    pub save_folder: PathBuf,
    #[serde(default)]
    pub password_set: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password_verifier_salt: Option<Vec<u8>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub password_verifier_hash: Option<Vec<u8>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub screenshot_key: Option<Vec<u8>>,
    #[serde(default)]
    pub selected_monitors: Vec<usize>,
    #[serde(default)]
    pub layout_mode: LayoutMode,
    /// 最大存储容量（MB），0 表示不限制
    #[serde(default)]
    pub max_storage_mb: u64,
}

impl Default for ScreenshotSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            interval_secs: 60,
            save_folder: get_default_screenshots_folder(),
            password_set: false,
            password_verifier_salt: None,
            password_verifier_hash: None,
            screenshot_key: None,
            selected_monitors: vec![],
            layout_mode: LayoutMode::default(),
            max_storage_mb: 0,
        }
    }
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
#[allow(non_snake_case)]
extern "system" {
    fn EnumDisplayMonitors(
        hdc: *mut std::ffi::c_void,
        lprcClip: *const std::ffi::c_void,
        lpfnEnum: extern "system" fn(
            hMonitor: *mut std::ffi::c_void,
            hdcMonitor: *mut std::ffi::c_void,
            lprcMonitor: *const RECT,
            lParam: isize,
        ) -> i32,
        lParam: isize,
    ) -> i32;
    fn GetMonitorInfoW(
        hMonitor: *mut std::ffi::c_void,
        lpmi: *mut MONITORINFOEXW,
    ) -> i32;
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct RECT {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct MONITORINFOEXW {
    cb_size: u32,
    rc_monitor: RECT,
    rc_work: RECT,
    dw_flags: u32,
    sz_device: [u16; 32],
}

#[cfg(target_os = "windows")]
struct MonitorEnumState {
    monitors: Vec<MonitorInfo>,
    counter: usize,
}

#[cfg(target_os = "windows")]
extern "system" fn monitor_enum_proc(
    h_monitor: *mut std::ffi::c_void,
    _hdc_monitor: *mut std::ffi::c_void,
    lprc_monitor: *const RECT,
    l_param: isize,
) -> i32 {
    unsafe {
        let state = &mut *(l_param as *mut MonitorEnumState);
        let rect = &*lprc_monitor;
        let mut info: MONITORINFOEXW = std::mem::zeroed();
        info.cb_size = std::mem::size_of::<MONITORINFOEXW>() as u32;
        let is_primary = if GetMonitorInfoW(h_monitor, &mut info) != 0 {
            info.dw_flags & 1u32 != 0
        } else {
            false
        };
        let width = (rect.right - rect.left) as u32;
        let height = (rect.bottom - rect.top) as u32;
        state.monitors.push(MonitorInfo {
            id: state.counter,
            x: rect.left,
            y: rect.top,
            width,
            height,
            is_primary,
        });
        state.counter += 1;
    }
    1
}

#[cfg(target_os = "windows")]
fn get_monitors_via_winapi() -> Vec<MonitorInfo> {
    let mut state = MonitorEnumState {
        monitors: Vec::new(),
        counter: 0,
    };
    unsafe {
        EnumDisplayMonitors(
            std::ptr::null_mut(),
            std::ptr::null(),
            monitor_enum_proc,
            &mut state as *mut MonitorEnumState as isize,
        );
    }
    state.monitors.sort_by(|a, b| {
        b.is_primary.cmp(&a.is_primary)
            .then_with(|| a.y.cmp(&b.y))
            .then_with(|| a.x.cmp(&b.x))
    });
    for (i, m) in state.monitors.iter_mut().enumerate() {
        m.id = i;
    }
    state.monitors
}

#[cfg(not(target_os = "windows"))]
fn get_monitors_via_winapi() -> Vec<MonitorInfo> {
    Vec::new()
}

pub fn get_settings_path() -> PathBuf {
    let app_data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
        .join("sernvia");
    fs::create_dir_all(&app_data_dir).ok();
    app_data_dir.join("screenshot_settings.json")
}

pub fn load_settings() -> ScreenshotSettings {
    let path = get_settings_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str(&content) {
                return settings;
            }
        }
    }
    ScreenshotSettings::default()
}

pub fn save_settings(settings: &ScreenshotSettings) {
    let path = get_settings_path();
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(&path, json);
    }
}

pub fn get_default_screenshots_folder() -> PathBuf {
    let app_data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
        .join("sernvia");
    let screenshots_dir = app_data_dir.join("screenshots");
    fs::create_dir_all(&screenshots_dir).ok();
    screenshots_dir
}

pub fn get_monitor_list() -> Vec<MonitorInfo> {
    // 先用 Windows API 获取真实位置信息
    let win_monitors = get_monitors_via_winapi();
    if !win_monitors.is_empty() {
        return win_monitors;
    }
    // 回退到 xcap
    let mut monitors = Vec::new();
    match xcap::Monitor::all() {
        Ok(all_monitors) => {
            for (id, monitor) in all_monitors.iter().enumerate() {
                monitors.push(MonitorInfo {
                    id,
                    x: 0,
                    y: 0,
                    width: monitor.width().unwrap_or(1920),
                    height: monitor.height().unwrap_or(1080),
                    is_primary: id == 0,
                });
            }
        }
        Err(e) => {
            eprintln!("Failed to get monitors: {}", e);
        }
    }
    monitors
}

pub fn set_screenshots_folder(path: &str) {
    let mut settings = load_settings();
    settings.save_folder = PathBuf::from(path);
    fs::create_dir_all(&settings.save_folder).ok();
    save_settings(&settings);
}

pub fn reset_screenshots_folder() {
    let mut settings = load_settings();
    settings.save_folder = get_default_screenshots_folder();
    fs::create_dir_all(&settings.save_folder).ok();
    save_settings(&settings);
}

pub fn set_screenshot_enabled(enabled: bool) {
    let mut settings = load_settings();
    settings.enabled = enabled;
    save_settings(&settings);
}

pub fn set_screenshot_interval(interval: u64) {
    let mut settings = load_settings();
    settings.interval_secs = interval;
    save_settings(&settings);
}

pub fn set_selected_monitors(monitors: Vec<usize>) {
    let mut settings = load_settings();
    settings.selected_monitors = monitors;
    save_settings(&settings);
}

pub fn get_selected_monitors() -> Vec<usize> {
    let settings = load_settings();
    settings.selected_monitors
}

pub fn set_layout_mode(mode: &str) {
    let mut settings = load_settings();
    settings.layout_mode = match mode {
        "position" => LayoutMode::Position,
        _ => LayoutMode::Horizontal,
    };
    save_settings(&settings);
}

pub fn get_layout_mode() -> String {
    let settings = load_settings();
    match settings.layout_mode {
        LayoutMode::Position => "position".to_string(),
        LayoutMode::Horizontal => "horizontal".to_string(),
    }
}

pub fn get_max_storage_mb() -> u64 {
    let settings = load_settings();
    settings.max_storage_mb
}

pub fn set_max_storage_mb(mb: u64) {
    let mut settings = load_settings();
    settings.max_storage_mb = mb;
    save_settings(&settings);
}

/// 计算当前截图目录的总大小（字节）
pub fn get_total_screenshot_size() -> u64 {
    let settings = load_settings();
    let mut total: u64 = 0;
    if let Ok(entries) = fs::read_dir(&settings.save_folder) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    if let Ok(meta) = entry.metadata() {
                        total += meta.len();
                    }
                }
            }
        }
    }
    total
}

/// 根据设置的容量上限删除最旧的截图，
/// 直到总大小不超过上限为止。返回被删除的文件数。
pub fn enforce_storage_limit() -> usize {
    let settings = load_settings();
    if settings.max_storage_mb == 0 {
        return 0;
    }
    let limit_bytes = settings.max_storage_mb.saturating_mul(1024 * 1024);
    let mut total = get_total_screenshot_size();
    if total <= limit_bytes {
        return 0;
    }

    // 收集所有截图文件，按文件名时间排序（最旧在前）
    let mut files: Vec<(PathBuf, u64, String)> = Vec::new();
    if let Ok(entries) = fs::read_dir(&settings.save_folder) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let path = entry.path();
                    let ext = path.extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_string();
                    if ext.eq_ignore_ascii_case("ssv") || ext.eq_ignore_ascii_case("jpg") || ext.eq_ignore_ascii_case("jpeg") || ext.eq_ignore_ascii_case("png") {
                        let fname = path.file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("")
                            .to_string();
                        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        files.push((path, size, fname));
                    }
                }
            }
        }
    }
    // 按文件名排序（2026_06_09_19_00_17 这种前缀天然按时间排序）
    files.sort_by(|a, b| a.2.cmp(&b.2));

    let mut deleted = 0;
    for (path, size, _) in files {
        if total <= limit_bytes {
            break;
        }
        if fs::remove_file(&path).is_ok() {
            total = total.saturating_sub(size);
            deleted += 1;
        }
    }
    deleted
}

pub fn get_screenshots() -> Vec<String> {
    let settings = load_settings();
    let mut result = Vec::new();
    
    if let Ok(entries) = fs::read_dir(&settings.save_folder) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let path = entry.path();
                    let ext = path.extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.to_lowercase())
                        .unwrap_or_default();
                    if ext == "ssv" {
                        result.push(path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    
    result.sort_by(|a, b| b.cmp(a));
    result
}

pub fn take_screenshot() -> Option<PathBuf> {
    let settings = load_settings();
    if !settings.enabled {
        return None;
    }

    fs::create_dir_all(&settings.save_folder).ok();

    let now = Local::now();
    let filename = format!(
        "{:04}_{:02}_{:02}_{:02}_{:02}_{:02}",
        now.year(),
        now.month(),
        now.day(),
        now.hour(),
        now.minute(),
        now.second()
    );
    let ssv_path = settings.save_folder.join(format!("{}.ssv", filename));

    // 1) 通过 WinAPI 获取显示器列表（包含真实 x/y/尺寸，并保证与设置页的 id 顺序一致）
    let winapi_monitors = get_monitor_list();

    // 2) 用 xcap 获取所有显示器截图；xcap 的枚举顺序可能与 WinAPI 不同，
    //    所以通过 (width, height, x, y) 进行匹配。
    //    先把所有 xcap 截图收集起来。
    match xcap::Monitor::all() {
        Ok(xcap_monitors) => {
            // 捕获所有 xcap 显示器的图像，保存为 (width, height, 图像)
            struct XcapCapture {
                width: u32,
                height: u32,
                image: image::RgbImage,
            }
            let mut xcap_captures: Vec<XcapCapture> = Vec::new();
            for mon in xcap_monitors.iter() {
                if let Ok(rgba) = mon.capture_image() {
                    let rgb = image::DynamicImage::ImageRgba8(rgba).to_rgb8();
                    xcap_captures.push(XcapCapture {
                        width: rgb.width(),
                        height: rgb.height(),
                        image: rgb,
                    });
                }
            }

            // 3) 决定要截图的显示器（按设置页的 id，即 WinAPI 顺序）
            let winapi_indices_to_capture: Vec<usize> = if settings.selected_monitors.is_empty() {
                winapi_monitors.iter().enumerate().map(|(i, _)| i).collect()
            } else {
                settings.selected_monitors.clone()
            };

            // 4) 对每个 WinAPI 显示器，匹配一个最相近的 xcap 截图（按分辨率+坐标）
            struct Capture {
                x: i32,
                y: i32,
                image: image::RgbImage,
                winapi_idx: usize,
            }
            let mut captures: Vec<Capture> = Vec::new();
            let mut used_xcap: std::collections::HashSet<usize> = std::collections::HashSet::new();

            for wi in &winapi_indices_to_capture {
                let Some(wm) = winapi_monitors.get(*wi) else { continue };

                // 找一个未被使用、分辨率最接近（优先完全一致）的 xcap 捕获
                let mut best: Option<(usize, u64)> = None; // (xcap_idx, score)
                for (xi, cap) in xcap_captures.iter().enumerate() {
                    if used_xcap.contains(&xi) { continue; }
                    let dw = (cap.width as i64 - wm.width as i64).unsigned_abs();
                    let dh = (cap.height as i64 - wm.height as i64).unsigned_abs();
                    let score = dw + dh; // 越小越好
                    match best {
                        None => best = Some((xi, score)),
                        Some((_, best_score)) if score < best_score => best = Some((xi, score)),
                        _ => {}
                    }
                }
                if let Some((xi, _)) = best {
                    used_xcap.insert(xi);
                    captures.push(Capture {
                        x: wm.x,
                        y: wm.y,
                        image: xcap_captures[xi].image.clone(),
                        winapi_idx: *wi,
                    });
                }
            }

            // 回退：如果匹配到的截图数量少于期望数量（可能 WinAPI 没返回位置），
            // 则直接用 xcap 的顺序与剩余索引
            if captures.is_empty() && !xcap_captures.is_empty() {
                for (i, cap) in xcap_captures.iter().enumerate() {
                    captures.push(Capture {
                        x: 0,
                        y: 0,
                        image: cap.image.clone(),
                        winapi_idx: i,
                    });
                }
            }

            if captures.is_empty() {
                return None;
            }

            // 5) 拼接图片
            let combined_image = if captures.len() == 1 {
                captures.remove(0).image
            } else {
                match settings.layout_mode {
                    LayoutMode::Position => {
                        // 按系统实际位置拼接
                        let min_x = captures.iter().map(|c| c.x).min().unwrap_or(0);
                        let min_y = captures.iter().map(|c| c.y).min().unwrap_or(0);
                        let max_x = captures
                            .iter()
                            .map(|c| c.x + c.image.width() as i32)
                            .max()
                            .unwrap_or(0);
                        let max_y = captures
                            .iter()
                            .map(|c| c.y + c.image.height() as i32)
                            .max()
                            .unwrap_or(0);

                        let total_width = (max_x - min_x) as u32;
                        let total_height = (max_y - min_y) as u32;

                        let mut combined = image::RgbImage::new(total_width, total_height);
                        for pixel in combined.pixels_mut() {
                            *pixel = image::Rgb([0, 0, 0]);
                        }

                        for cap in &captures {
                            let offset_x = (cap.x - min_x) as i64;
                            let offset_y = (cap.y - min_y) as i64;
                            image::imageops::overlay(&mut combined, &cap.image, offset_x, offset_y);
                        }

                        combined
                    }
                    LayoutMode::Horizontal => {
                        // 水平拼接（按 WinAPI id 排序，与设置页顺序一致）
                        captures.sort_by_key(|c| c.winapi_idx);
                        let total_width: u32 = captures.iter().map(|c| c.image.width()).sum();
                        let max_height = captures.iter().map(|c| c.image.height()).max().unwrap_or(0);

                        let mut combined = image::RgbImage::new(total_width, max_height);
                        let mut x_offset = 0i64;
                        for cap in &captures {
                            image::imageops::overlay(&mut combined, &cap.image, x_offset, 0);
                            x_offset += cap.image.width() as i64;
                        }

                        combined
                    }
                }
            };

            // 6) 编码为 JPEG
            let mut buf = Vec::new();
            {
                let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 60);
                if encoder
                    .encode(
                        &combined_image,
                        combined_image.width(),
                        combined_image.height(),
                        image::ExtendedColorType::Rgb8,
                    )
                    .is_err()
                {
                    return None;
                }
            }

            // 7) 加密并保存
            if let Ok(enc_key) = super::screenshot_crypto::get_or_create_encryption_key() {
                if let Ok(encrypted) = super::screenshot_crypto::encrypt_data_with_key(&buf, &enc_key)
                {
                    if fs::write(&ssv_path, encrypted).is_ok() {
                        enforce_storage_limit();
                        return Some(ssv_path);
                    }
                }
            } else if fs::write(&ssv_path, &buf).is_ok() {
                enforce_storage_limit();
                return Some(ssv_path);
            }
        }
        Err(e) => {
            eprintln!("xcap Monitor::all failed: {}", e);
        }
    }

    None
}

pub fn get_screenshot_base64(path: &str) -> Result<String, String> {
    super::screenshot_crypto::decrypt_to_base64(path)
}

/// Structure for sync screenshot info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncScreenshotInfo {
    pub path: String,
    pub date: String, // YYYY-MM-DD
    pub timestamp: i64,
}

/// Get screenshots for cloud sync, filtered by scope and count.
/// scope: "today" | "last_n" | "this_week"
/// Filename format: YYYY_MM_DD_HH_MM_SS.ssv
pub fn get_screenshots_for_sync(scope: &str, count: u32) -> Vec<SyncScreenshotInfo> {
    let all = get_screenshots();
    let today = chrono::Local::now().date_naive();

    let mut filtered: Vec<SyncScreenshotInfo> = Vec::new();

    for path_str in all {
        // Extract filename without extension
        let path = std::path::Path::new(&path_str);
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => continue,
        };

        // Parse YYYY_MM_DD_HH_MM_SS => timestamp
        let parts: Vec<&str> = stem.split('_').collect();
        if parts.len() < 6 { continue; }
        let (y, m, d, h, min, s) = (
            parts[0].parse::<i32>().unwrap_or(0),
            parts[1].parse::<u32>().unwrap_or(0),
            parts[2].parse::<u32>().unwrap_or(0),
            parts[3].parse::<u32>().unwrap_or(0),
            parts[4].parse::<u32>().unwrap_or(0),
            parts[5].parse::<u32>().unwrap_or(0),
        );
        let date = match chrono::NaiveDate::from_ymd_opt(y, m, d) {
            Some(d) => d,
            None => continue,
        };
        let time = match chrono::NaiveTime::from_hms_opt(h, min, s) {
            Some(t) => t,
            None => continue,
        };
        let dt = match chrono::NaiveDateTime::new(date, time)
            .and_local_timezone(chrono::Local)
            .single()
        {
            Some(dt) => dt,
            None => continue,
        };
        let ts = dt.timestamp();

        let should_include = match scope {
            "today" => date == today,
            "this_week" => {
                let weekday = today.weekday().num_days_from_monday();
                let monday = today - chrono::Duration::days(weekday as i64);
                let sunday = monday + chrono::Duration::days(6);
                date >= monday && date <= sunday
            }
            _ => true, // "last_n" or others
        };

        if should_include {
            filtered.push(SyncScreenshotInfo {
                path: path_str,
                date: date.format("%Y-%m-%d").to_string(),
                timestamp: ts,
            });
        }
    }

    // Sort by timestamp descending (newest first)
    filtered.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // Apply count limit for "last_n"
    if scope == "last_n" && (count as usize) < filtered.len() {
        filtered.truncate(count as usize);
    }

    filtered
}

pub fn delete_screenshot(path: &str) -> Result<(), String> {
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

pub fn delete_screenshots(paths: Vec<String>) -> Result<usize, String> {
    let mut deleted = 0;
    for path in paths {
        if delete_screenshot(&path).is_ok() {
            deleted += 1;
        }
    }
    Ok(deleted)
}

pub fn clear_all_screenshots_and_password() -> Result<(), String> {
    let settings = load_settings();
    
    // 删除所有截图文件
    if let Ok(entries) = fs::read_dir(&settings.save_folder) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }
    
    // 重置密码设置
    let mut new_settings = ScreenshotSettings::default();
    new_settings.save_folder = settings.save_folder;
    new_settings.enabled = settings.enabled;
    new_settings.interval_secs = settings.interval_secs;
    save_settings(&new_settings);

    // 清空所有合集的截图路径
    let mut collections = load_collections();
    for c in &mut collections {
        c.screenshot_paths.clear();
    }
    save_collections(&collections);

    Ok(())
}

// ------------------------------
// 截图合集 (Collections)
// ------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotCollection {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub screenshot_paths: Vec<String>,
    /// 如果是自动合集，这里存对应的 app 名称
    /// 前端可据此显示「自动归类」标记
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_app_name: Option<String>,
}

fn get_collections_path() -> PathBuf {
    let app_data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
        .join("sernvia");
    fs::create_dir_all(&app_data_dir).ok();
    app_data_dir.join("screenshot_collections.json")
}

fn load_collections() -> Vec<ScreenshotCollection> {
    let path = get_collections_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(collections) = serde_json::from_str::<Vec<ScreenshotCollection>>(&content) {
                return collections;
            }
        }
    }
    Vec::new()
}

fn save_collections(collections: &Vec<ScreenshotCollection>) {
    let path = get_collections_path();
    if let Ok(json) = serde_json::to_string_pretty(collections) {
        let _ = fs::write(&path, json);
    }
}

pub fn get_collections() -> Vec<ScreenshotCollection> {
    load_collections()
}

pub fn create_collection(name: &str, auto_app_name: Option<String>) -> String {
    let mut collections = load_collections();

    // 自动合集：如果已存在同名 app 的自动合集，就复用
    let mut existing_id: Option<String> = None;
    if let Some(ref app_name) = auto_app_name {
        if let Some(existing) = collections.iter_mut().find(|c| c.auto_app_name.as_deref() == Some(app_name.as_str())) {
            existing.name = name.to_string();
            existing_id = Some(existing.id.clone());
        }
    }
    if let Some(id) = existing_id {
        save_collections(&collections);
        return id;
    }

    let id = if let Some(ref app_name) = auto_app_name {
        format!("auto_{}", app_name.replace(|c: char| !c.is_alphanumeric(), "_"))
    } else {
        format!("manual_{}", Local::now().timestamp_millis())
    };

    collections.push(ScreenshotCollection {
        id: id.clone(),
        name: name.to_string(),
        created_at: Local::now().timestamp(),
        screenshot_paths: Vec::new(),
        auto_app_name,
    });
    save_collections(&collections);
    id
}

pub fn delete_collection(id: &str) -> Result<(), String> {
    let mut collections = load_collections();
    collections.retain(|c| c.id != id);
    save_collections(&collections);
    Ok(())
}

pub fn rename_collection(id: &str, new_name: &str) -> Result<(), String> {
    let mut collections = load_collections();
    if let Some(c) = collections.iter_mut().find(|c| c.id == id) {
        c.name = new_name.to_string();
        save_collections(&collections);
        Ok(())
    } else {
        Err(format!("合集不存在: {}", id))
    }
}

pub fn add_screenshot_to_collection(id: &str, screenshot_path: &str) -> Result<(), String> {
    let mut collections = load_collections();
    if let Some(c) = collections.iter_mut().find(|c| c.id == id) {
        if !c.screenshot_paths.iter().any(|p| p == screenshot_path) {
            c.screenshot_paths.push(screenshot_path.to_string());
            save_collections(&collections);
        }
        Ok(())
    } else {
        Err(format!("合集不存在: {}", id))
    }
}

pub fn remove_screenshot_from_collection(id: &str, screenshot_path: &str) -> Result<(), String> {
    let mut collections = load_collections();
    if let Some(c) = collections.iter_mut().find(|c| c.id == id) {
        c.screenshot_paths.retain(|p| p != screenshot_path);
        save_collections(&collections);
        Ok(())
    } else {
        Err(format!("合集不存在: {}", id))
    }
}

pub fn get_screenshots_in_collection(id: &str) -> Result<Vec<String>, String> {
    let collections = load_collections();
    if let Some(c) = collections.iter().find(|c| c.id == id) {
        let mut result: Vec<String> = c.screenshot_paths.iter()
            .filter(|p| std::path::Path::new(p).exists())
            .cloned()
            .collect();
        result.sort_by(|a, b| b.cmp(a));
        Ok(result)
    } else {
        Err(format!("合集不存在: {}", id))
    }
}

/// 将截图按 app 名称自动归类到对应自动合集
/// 如果截图对应的 app 合不存在则自动创建
/// 参数：截图文件路径（绝对路径）和关联的 app_name
pub fn auto_categorize_screenshot(screenshot_path: &str, app_name: &str) -> String {
    let collection_name = app_name.trim().to_string();
    if collection_name.is_empty() {
        return String::new();
    }
    let id = create_collection(&collection_name, Some(collection_name.clone()));
    let _ = add_screenshot_to_collection(&id, screenshot_path);
    id
}
