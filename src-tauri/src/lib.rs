mod monitor;
mod windows_api;
mod screenshot;
mod screenshot_crypto;
mod categories;

use monitor::ActivityTracker;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use chrono::Datelike;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

struct AppState {
    tracker: Arc<ActivityTracker>,
    icon_cache: Arc<Mutex<HashMap<String, String>>>,
}

#[tauri::command]
fn get_current_activity(state: tauri::State<AppState>) -> monitor::CurrentActivity {
    state.tracker.get_current_activity()
}

#[tauri::command]
fn get_stats(state: tauri::State<AppState>) -> monitor::ActivityData {
    state.tracker.get_stats()
}

#[tauri::command]
fn get_app_name(state: tauri::State<AppState>) -> String {
    state.tracker.get_current_activity().app_name
}

#[tauri::command]
fn export_data(state: tauri::State<AppState>, path: String) -> Result<(), String> {
    let data = state.tracker.get_stats();
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_app_icon(state: tauri::State<AppState>, process_name: String) -> Option<String> {
    // Check cache first
    {
        if let Ok(cache) = state.icon_cache.lock() {
            if let Some(icon) = cache.get(&process_name) {
                return Some(icon.clone());
            }
        }
    }
    // Extract icon (this checks running processes, common paths, and registry)
    if let Some(base64) = windows_api::extract_app_icon(&process_name) {
        if let Ok(mut cache) = state.icon_cache.lock() {
            cache.insert(process_name.clone(), base64.clone());
        }
        return Some(base64);
    }
    // Fallback: check known app paths from Tai imports
    if let Some(exe_path) = monitor::get_app_path(&process_name) {
        let path = std::path::Path::new(&exe_path);
        if let Some(icon) = windows_api::extract_icon_from_path(path) {
            if let Ok(mut cache) = state.icon_cache.lock() {
                cache.insert(process_name, icon.clone());
            }
            return Some(icon);
        }
    }
    None
}

#[tauri::command]
fn get_weekly_stats(state: tauri::State<AppState>) -> monitor::WeekData {
    state.tracker.get_weekly_stats()
}

#[tauri::command]
fn get_stats_by_range(state: tauri::State<AppState>, days: u32) -> monitor::WeekData {
    state.tracker.get_stats_by_range(days)
}

#[tauri::command]
fn get_bar_data(state: tauri::State<AppState>, range: String) -> Vec<monitor::BarEntry> {
    state.tracker.get_bar_data(&range)
}

#[tauri::command]
fn get_stats_for_date(state: tauri::State<AppState>, offset_days: u32) -> monitor::ActivityData {
    state.tracker.get_stats_for_date(offset_days)
}

#[tauri::command]
fn get_stats_for_hour(state: tauri::State<AppState>, offset_days: u32, hour: u32) -> monitor::ActivityData {
    state.tracker.get_stats_for_hour(offset_days, hour)
}

#[tauri::command]
fn get_app_time_stats(state: tauri::State<AppState>, app_name: String, offset_days: u32) -> monitor::AppTimeStats {
    state.tracker.get_app_time_stats(&app_name, offset_days)
}

#[tauri::command]
fn get_stats_by_range_offset(state: tauri::State<AppState>, days: u32, offset_days: u32, range: String) -> monitor::WeekData {
    state.tracker.get_stats_by_range_offset(days, offset_days, &range)
}

#[tauri::command]
fn get_app_hourly_stats(state: tauri::State<AppState>, app_name: String, offset_days: u32) -> Vec<monitor::BarEntry> {
    state.tracker.get_app_hourly_stats(&app_name, offset_days)
}

#[tauri::command]
fn get_app_daily_stats(state: tauri::State<AppState>, app_name: String, days: u32, offset_days: u32) -> Vec<monitor::BarEntry> {
    state.tracker.get_app_daily_stats(&app_name, days, offset_days)
}

#[tauri::command]
fn get_app_path(process_name: String) -> Option<String> {
    monitor::get_app_path(&process_name)
}

#[tauri::command]
fn get_bar_data_offset(state: tauri::State<AppState>, range: String, offset_days: u32) -> Vec<monitor::BarEntry> {
    state.tracker.get_bar_data_offset(&range, offset_days)
}

#[tauri::command]
fn clear_data(state: tauri::State<AppState>) -> Result<(), String> {
    state.tracker.clear();
    Ok(())
}

#[tauri::command]
fn get_data_path() -> String {
    monitor::get_data_path().to_string_lossy().to_string()
}

#[tauri::command]
fn get_default_data_path() -> String {
    monitor::get_default_data_path().to_string_lossy().to_string()
}

#[tauri::command]
fn get_tai_db_tables(db_path: String) -> Result<Vec<String>, String> {
    monitor::get_tai_db_tables(&db_path)
}

#[tauri::command]
fn import_from_tai(db_path: String, mode: String, state: tauri::State<AppState>) -> Result<u32, String> {
    let import_mode = match mode.as_str() {
        "name" => monitor::TaiImportMode::ByName,
        "middle" => monitor::TaiImportMode::InMiddle,
        _ => monitor::TaiImportMode::ByDuration,
    };
    monitor::import_tai_data(&db_path, import_mode, Some(&state.tracker))
}

#[tauri::command]
fn is_admin() -> bool {
    windows_api::is_running_as_admin()
}

#[tauri::command]
fn set_data_path(new_path: String) -> Result<(), String> {
    monitor::set_data_path(&new_path)
}

#[tauri::command]
fn get_screenshot_enabled() -> bool {
    screenshot::load_settings().enabled
}

#[tauri::command]
fn get_screenshot_interval() -> u64 {
    screenshot::load_settings().interval_secs
}

#[tauri::command]
fn get_screenshots_folder() -> String {
    screenshot::load_settings().save_folder.to_string_lossy().to_string()
}

#[tauri::command]
fn get_screenshots() -> Vec<String> {
    screenshot::get_screenshots()
}

#[tauri::command]
fn set_screenshot_enabled(enabled: bool) {
    screenshot::set_screenshot_enabled(enabled)
}

#[tauri::command]
fn set_screenshot_interval(interval: u64) {
    screenshot::set_screenshot_interval(interval)
}

#[tauri::command]
fn get_monitor_list() -> Vec<screenshot::MonitorInfo> {
    screenshot::get_monitor_list()
}

#[tauri::command]
fn set_selected_monitors(monitors: Vec<usize>) {
    screenshot::set_selected_monitors(monitors)
}

#[tauri::command]
fn get_selected_monitors() -> Vec<usize> {
    screenshot::get_selected_monitors()
}

#[tauri::command]
fn set_layout_mode(mode: String) {
    screenshot::set_layout_mode(&mode)
}

#[tauri::command]
fn get_layout_mode() -> String {
    screenshot::get_layout_mode()
}

#[tauri::command]
fn get_max_storage_mb() -> u64 {
    screenshot::get_max_storage_mb()
}

#[tauri::command]
fn set_max_storage_mb(mb: u64) {
    screenshot::set_max_storage_mb(mb)
}

#[tauri::command]
fn change_screenshot_password(old_password: String, new_password: String) -> Result<(), String> {
    screenshot_crypto::change_password(&old_password, &new_password)
}

#[tauri::command]
fn get_storage_usage_mb() -> f64 {
    let bytes = screenshot::get_total_screenshot_size();
    (bytes as f64) / (1024.0 * 1024.0)
}

#[tauri::command]
fn get_activity_at_timestamp(timestamp_secs: i64) -> Option<String> {
    monitor::get_activity_at_timestamp(timestamp_secs)
}

#[tauri::command]
fn get_collections() -> Vec<screenshot::ScreenshotCollection> {
    screenshot::get_collections()
}

#[tauri::command]
fn create_collection(name: String, auto_app_name: Option<String>) -> String {
    screenshot::create_collection(&name, auto_app_name)
}

#[tauri::command]
fn delete_collection(id: String) -> Result<(), String> {
    screenshot::delete_collection(&id)
}

#[tauri::command]
fn rename_collection(id: String, new_name: String) -> Result<(), String> {
    screenshot::rename_collection(&id, &new_name)
}

#[tauri::command]
fn add_screenshot_to_collection(id: String, screenshot_path: String) -> Result<(), String> {
    screenshot::add_screenshot_to_collection(&id, &screenshot_path)
}

#[tauri::command]
fn remove_screenshot_from_collection(id: String, screenshot_path: String) -> Result<(), String> {
    screenshot::remove_screenshot_from_collection(&id, &screenshot_path)
}

#[tauri::command]
fn get_screenshots_in_collection(id: String) -> Result<Vec<String>, String> {
    screenshot::get_screenshots_in_collection(&id)
}

#[tauri::command]
fn auto_categorize_screenshot(screenshot_path: String, app_name: String) -> String {
    screenshot::auto_categorize_screenshot(&screenshot_path, &app_name)
}

#[tauri::command]
fn set_screenshots_folder(path: String) {
    screenshot::set_screenshots_folder(&path)
}

#[tauri::command]
fn reset_screenshots_folder() {
    screenshot::reset_screenshots_folder()
}

#[tauri::command]
fn get_screenshot_base64(path: String) -> Option<String> {
    screenshot::get_screenshot_base64(&path).ok()
}

#[tauri::command]
fn screenshot_has_password() -> bool {
    screenshot_crypto::has_password()
}

#[tauri::command]
fn screenshot_set_password(password: String) -> Result<(), String> {
    screenshot_crypto::set_screenshot_password(&password)
}

#[tauri::command]
fn screenshot_verify_password(password: String) -> Result<bool, String> {
    screenshot_crypto::verify_password(&password)
}

#[tauri::command]
fn export_screenshot(file_path: String, output_path: String) -> Result<(), String> {
    screenshot_crypto::decrypt_and_save(&file_path, &output_path)
}

#[tauri::command]
fn delete_screenshot(path: String) -> Result<(), String> {
    screenshot::delete_screenshot(&path)
}

#[tauri::command]
fn delete_screenshots(paths: Vec<String>) -> Result<usize, String> {
    screenshot::delete_screenshots(paths)
}

#[tauri::command]
fn clear_all_screenshots() -> Result<(), String> {
    screenshot::clear_all_screenshots_and_password()
}

#[tauri::command]
async fn copy_screenshot_to_clipboard(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| format!("读取文件失败: {}", e))?;
    let key = screenshot_crypto::get_or_create_encryption_key()?;
    let decrypted = if data.len() > 12 {
        screenshot_crypto::decrypt_data_with_key(&data, &key)?
    } else {
        data
    };
    
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&decrypted);
    
    Ok(b64)
}

fn start_monitoring(tracker: Arc<ActivityTracker>, _app_handle: tauri::AppHandle) {
    // Get this app's own executable name so we can skip tracking ourselves
    let self_exe_name = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase()))
        .unwrap_or_default();

    thread::spawn(move || {
        let mut last_screenshot = 0;
        
        loop {
            if let Some((title, class_name, process_name)) =
                windows_api::get_foreground_window_info()
            {
                // Skip tracking our own app
                if process_name == self_exe_name {
                    thread::sleep(Duration::from_secs(1));
                    continue;
                }

                // Map class name or process name to a friendly app name
                let app_name = map_to_app_name(&process_name, &class_name, &title);
                tracker.update(&app_name, &process_name, &class_name, &title);
            }

            // Save every 30 seconds
            let now = chrono::Local::now().timestamp();
            if now % 30 == 0 {
                tracker.save();
            }
            
            // Take screenshot if enabled and interval has passed
            let settings = screenshot::load_settings();
            if settings.enabled && now - last_screenshot >= settings.interval_secs as i64 {
                let _ = screenshot::take_screenshot();
                last_screenshot = now;
            }

            thread::sleep(Duration::from_secs(1));
        }
    });
}

fn map_to_app_name(process_name: &str, _class_name: &str, _title: &str) -> String {
    let lower_process = process_name.to_lowercase();

    // First check known browser processes (using process name, NOT class name,
    // because apps like QQ use CEF which has browser-like window classes)
    if lower_process.contains("msedge") {
        return "Microsoft Edge".to_string();
    } else if lower_process.contains("brave") {
        return "Brave".to_string();
    } else if lower_process.contains("opera") {
        return "Opera".to_string();
    } else if lower_process.contains("vivaldi") {
        return "Vivaldi".to_string();
    } else if lower_process.contains("firefox") {
        return "Firefox".to_string();
    } else if lower_process == "chrome.exe" {
        return "Google Chrome".to_string();
    }

    // Common process names to friendly names
    let friendly_names: &[(&str, &str)] = &[
        ("code.exe", "VS Code"),
        ("cursor.exe", "Cursor"),
        ("explorer.exe", "File Explorer"),
        ("devenv.exe", "Visual Studio"),
        ("winword.exe", "Microsoft Word"),
        ("excel.exe", "Microsoft Excel"),
        ("powerpnt.exe", "Microsoft PowerPoint"),
        ("outlook.exe", "Microsoft Outlook"),
        ("spotify.exe", "Spotify"),
        ("slack.exe", "Slack"),
        ("discord.exe", "Discord"),
        ("teams.exe", "Microsoft Teams"),
        ("zoom.exe", "Zoom"),
        ("notepad.exe", "Notepad"),
        ("notepad++.exe", "Notepad++"),
        ("terminal.exe", "Windows Terminal"),
        ("cmd.exe", "Command Prompt"),
        ("powershell.exe", "PowerShell"),
        ("git-bash.exe", "Git Bash"),
        ("python.exe", "Python"),
        ("node.exe", "Node.js"),
        ("obs64.exe", "OBS Studio"),
        ("vlc.exe", "VLC"),
        ("wmplayer.exe", "Windows Media Player"),
        ("mspaint.exe", "Paint"),
        ("calc.exe", "Calculator"),
        ("qq.exe", "QQ"),
        ("qqmusic.exe", "QQ音乐"),
        ("tim.exe", "TIM"),
        ("wechat.exe", "微信"),
        ("wechatdevtools.exe", "微信开发者工具"),
        ("dingtalk.exe", "钉钉"),
        ("wemeet.exe", "腾讯会议"),
        ("feishu.exe", "飞书"),
        ("bytedance.exe", "抖音"),
        ("thunder.exe", "迅雷"),
        ("baidunetdisk.exe", "百度网盘"),
        // Gaming & entertainment
        ("steam.exe", "Steam"),
        ("steamwebhelper.exe", "Steam"),
        ("galaxyclient.exe", "GOG Galaxy"),
        ("epicgameslauncher.exe", "Epic Games"),
        ("hl.exe", "Half-Life"),
        ("dota2.exe", "Dota 2"),
        ("csgo.exe", "CS:GO"),
        ("valorant.exe", "Valorant"),
        ("leagueclient.exe", "League of Legends"),
        ("lolclient.exe", "League of Legends"),
        ("wow.exe", "World of Warcraft"),
        ("gopeed.exe", "Gopeed"),
        // System processes
        ("taskmgr.exe", "Task Manager"),
        ("taskhostw.exe", "Windows Task Host"),
        ("sihost.exe", "Windows Shell"),
        ("startmenuexperiencehost.exe", "Start Menu"),
        ("searchapp.exe", "Windows Search"),
        ("searchhost.exe", "Windows Search"),
        ("searchui.exe", "Windows Search"),
        ("runtimebroker.exe", "Windows Runtime"),
        ("applicationframehost.exe", "Windows App Host"),
        ("systemsettings.exe", "Windows Settings"),
        ("lockapp.exe", "Windows Lock Screen"),
        ("svchost.exe", "Windows Service Host"),
        ("dwm.exe", "Desktop Window Manager"),
        ("conhost.exe", "Console Host"),
        ("shellexperiencehost.exe", "Windows Shell"),
        ("ntvdm.exe", "Windows NTVDM"),
        ("rundll32.exe", "Windows Run DLL"),
        ("smartscreen.exe", "SmartScreen"),
        ("securityhealthservice.exe", "Windows Security"),
        // Common utilities
        ("7zfm.exe", "7-Zip"),
        ("winrar.exe", "WinRAR"),
        ("bandizip.exe", "Bandizip"),
        ("potplayer.exe", "PotPlayer"),
        ("everything.exe", "Everything"),
        ("listary.exe", "Listary"),
        ("wox.exe", "Wox"),
        ("utools.exe", "uTools"),
        ("snipaste.exe", "Snipaste"),
        ("obsidian.exe", "Obsidian"),
        ("marktext.exe", "MarkText"),
        ("typora.exe", "Typora"),
        ("foxitreader.exe", "Foxit Reader"),
        ("sumatraPDF.exe", "SumatraPDF"),
        ("wmplayer.exe", "Windows Media Player"),
        // Development tools
        ("idea64.exe", "IntelliJ IDEA"),
        ("idea.exe", "IntelliJ IDEA"),
        ("pycharm64.exe", "PyCharm"),
        ("webstorm64.exe", "WebStorm"),
        ("goland64.exe", "GoLand"),
        ("clion64.exe", "CLion"),
        ("androidstudio.exe", "Android Studio"),
        ("tableplus.exe", "TablePlus"),
        ("postman.exe", "Postman"),
        ("insomnia.exe", "Insomnia"),
        ("docker desktop.exe", "Docker Desktop"),
        ("wsl.exe", "WSL"),
        ("mintty.exe", "Git Bash"),
        ("windowsterminal.exe", "Windows Terminal"),
        ("fluentterminal.exe", "Fluent Terminal"),
        // Browsers (additional)
        ("centbrowser.exe", "Cent Browser"),
        ("maxthon.exe", "Maxthon"),
        ("sogouexplorer.exe", "Sogou Browser"),
        ("2345explorer.exe", "2345 Browser"),
        ("qqbrowser.exe", "QQ Browser"),
        ("liebao.exe", "Cheetah Browser"),
        ("liebaofree.exe", "Cheetah Browser"),
        ("waterfox.exe", "Waterfox"),
        ("pale moon.exe", "Pale Moon"),
        ("seamonkey.exe", "SeaMonkey"),
        ("tor.exe", "Tor Browser"),
        ("microsoftedge.exe", "Microsoft Edge"),
        // Note-taking & office
        ("notion.exe", "Notion"),
        ("notion enhanced.exe", "Notion"),
        ("onenote.exe", "OneNote"),
        ("onenotem.exe", "OneNote"),
        ("evernote.exe", "Evernote"),
        ("joplin.exe", "Joplin"),
        ("libreoffice.exe", "LibreOffice"),
        ("soffice.exe", "LibreOffice"),
        ("wps.exe", "WPS Office"),
        ("wpsoffice.exe", "WPS Office"),
        ("et.exe", "WPS Spreadsheets"),
        ("wpp.exe", "WPS Presentation"),
        // Communication
        ("telegram.exe", "Telegram"),
        ("signal.exe", "Signal"),
        ("whatsapp.exe", "WhatsApp"),
        ("line.exe", "LINE"),
        ("kakaotalk.exe", "KakaoTalk"),
        ("viber.exe", "Viber"),
        ("session.exe", "Session"),
        // Design & media
        ("photoshop.exe", "Adobe Photoshop"),
        ("illustrator.exe", "Adobe Illustrator"),
        ("afterfx.exe", "After Effects"),
        ("premiere.exe", "Adobe Premiere"),
        ("premiere pro.exe", "Adobe Premiere Pro"),
        ("lightroom.exe", "Adobe Lightroom"),
        ("indesign.exe", "Adobe InDesign"),
        ("acrobat.exe", "Adobe Acrobat"),
        ("acrord32.exe", "Adobe Acrobat Reader"),
        ("figma.exe", "Figma"),
        ("blender.exe", "Blender"),
        ("unity.exe", "Unity"),
        ("unrealeditor.exe", "Unreal Editor"),
    ];

    for (proc, name) in friendly_names {
        if lower_process.ends_with(proc) || lower_process == *proc {
            return name.to_string();
        }
    }

    // Process names we want to filter out / show as generic
    let filtered_names: &[&str] = &[
        "unknown",
        "syntax",
        "application",
        "default",
        "system",
    ];

    let name = process_name.trim_end_matches(".exe");
    if !name.is_empty() && !filtered_names.contains(&name) {
        // Capitalize first letter
        let mut chars = name.chars();
        match chars.next() {
            None => "Unknown".to_string(),
            Some(c) => c.to_uppercase().to_string() + chars.as_str(),
        }
    } else {
        "Unknown".to_string()
    }
}

// ============== Cloud Sync ==============

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub url: String,
    pub is_official: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LoginSession {
    pub server_id: String,
    pub server_url: String,
    pub token: String,
    pub user_id: String,
    pub display_name: String,
    pub device_id: String,
}

fn get_cloud_config_dir() -> std::path::PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    path.push("SernVia");
    std::fs::create_dir_all(&path).ok();
    path
}

fn get_cloud_config_path() -> std::path::PathBuf {
    get_cloud_config_dir().join("cloud_config.json")
}

fn get_login_session_path() -> std::path::PathBuf {
    get_cloud_config_dir().join("login_session.json")
}

fn load_server_list() -> Vec<ServerConfig> {
    let path = get_cloud_config_path();
    if let Ok(content) = std::fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    }
}

fn save_server_list(servers: &[ServerConfig]) -> Result<(), String> {
    let path = get_cloud_config_path();
    let json = serde_json::to_string_pretty(servers).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_login_session() -> Option<LoginSession> {
    let path = get_login_session_path();
    if let Ok(content) = std::fs::read_to_string(&path) {
        serde_json::from_str(&content).ok()
    } else {
        None
    }
}

fn save_login_session(session: &LoginSession) -> Result<(), String> {
    let path = get_login_session_path();
    let json = serde_json::to_string_pretty(session).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

fn delete_login_session() {
    let path = get_login_session_path();
    let _ = std::fs::remove_file(path);
}

#[tauri::command]
fn get_cloud_server_list() -> Vec<ServerConfig> {
    load_server_list()
}

#[tauri::command]
fn add_cloud_server(name: String, url: String) -> Result<ServerConfig, String> {
    let mut servers = load_server_list();
    
    // Check if URL already exists
    if servers.iter().any(|s| s.url == url) {
        return Err("该服务器地址已存在".to_string());
    }
    
    let server = ServerConfig {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        url: url.trim_end_matches('/').to_string(),
        is_official: false,
    };
    
    servers.push(server.clone());
    save_server_list(&servers)?;
    
    Ok(server)
}

#[tauri::command]
fn remove_cloud_server(server_id: String) -> Result<(), String> {
    let mut servers = load_server_list();
    servers.retain(|s| s.id != server_id);
    save_server_list(&servers)?;
    
    // If this was the current logged in server, clear session
    if let Some(session) = load_login_session() {
        if session.server_id == server_id {
            delete_login_session();
        }
    }
    
    Ok(())
}

#[tauri::command]
fn get_login_session() -> Option<LoginSession> {
    load_login_session()
}

#[tauri::command]
fn save_session(server_id: String, server_url: String, token: String, user_id: String, display_name: String, device_id: String) -> Result<(), String> {
    let session = LoginSession {
        server_id,
        server_url,
        token,
        user_id,
        display_name,
        device_id,
    };
    save_login_session(&session)
}

#[tauri::command]
fn clear_session() {
    delete_login_session();
}

// ============ Cloud Sync HTTP Commands ============

fn make_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

/// Login to a cloud server
#[tauri::command]
async fn cloud_http_login(server_url: String, username: String, password: String) -> Result<serde_json::Value, String> {
    let base = server_url.trim_end_matches('/');
    let url = format!("{}/api/v1/auth/login", base);
    let client = make_http_client();
    let body = serde_json::json!({ "username": username, "password": password });

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                format!("无法连接到 {}\n请确认服务器已启动、地址正确、防火墙未阻止", url)
            } else if e.is_timeout() {
                format!("请求 {}\n超时，请检查服务器状态", url)
            } else {
                format!("请求 {} 失败: {}", url, e)
            }
        })?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str().map(|s| s.to_string())))
            .unwrap_or_else(|| format!("请求 {} 返回 HTTP {}", url, status.as_u16()));
        return Err(msg);
    }

    serde_json::from_str::<serde_json::Value>(&text).map_err(|e| e.to_string())
}

/// Register on a cloud server
#[tauri::command]
async fn cloud_http_register(server_url: String, username: String, password: String, confirm_password: String) -> Result<serde_json::Value, String> {
    let base = server_url.trim_end_matches('/');
    let url = format!("{}/api/v1/auth/register", base);
    let client = make_http_client();
    let body = serde_json::json!({
        "username": username,
        "password": password,
        "confirm_password": confirm_password,
    });

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                format!("无法连接到 {}\n请确认服务器已启动、地址正确、防火墙未阻止", url)
            } else {
                format!("请求 {} 失败: {}", url, e)
            }
        })?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str().map(|s| s.to_string())))
            .unwrap_or_else(|| format!("请求 {} 返回 HTTP {}", url, status.as_u16()));
        return Err(msg);
    }

    serde_json::from_str::<serde_json::Value>(&text).map_err(|e| e.to_string())
}

/// Register device on a cloud server
#[tauri::command]
async fn cloud_http_register_device(server_url: String, token: String, device_name: String, platform: String) -> Result<serde_json::Value, String> {
    let base = server_url.trim_end_matches('/');
    let url = format!("{}/api/v1/devices/register", base);
    let client = make_http_client();
    let body = serde_json::json!({
        "device_name": device_name,
        "platform": platform,
    });

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求 {} 失败: {}", url, e))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str().map(|s| s.to_string())))
            .unwrap_or_else(|| format!("请求 {} 返回 HTTP {}", url, status.as_u16()));
        return Err(msg);
    }

    serde_json::from_str::<serde_json::Value>(&text).map_err(|e| e.to_string())
}

/// Test connection to a cloud server
#[tauri::command]
async fn cloud_http_test(server_url: String) -> Result<bool, String> {
    let base = server_url.trim_end_matches('/');
    let url = format!("{}/health", base);
    let client = make_http_client();

    match client.get(&url).timeout(std::time::Duration::from_secs(5)).send().await {
        Ok(response) => Ok(response.status().is_success()),
        Err(e) => Err(format!("连接 {} 失败: {}", url, e)),
    }
}

/// Push activity entries to cloud server
#[tauri::command]
async fn cloud_http_push_activity(server_url: String, token: String, device_id: String, entries: Vec<serde_json::Value>) -> Result<serde_json::Value, String> {
    let base = server_url.trim_end_matches('/');
    let url = format!("{}/api/v1/activity/push", base);
    let client = make_http_client();

    let body = serde_json::json!({
        "device_id": device_id,
        "entries": entries,
    });

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("上传活动记录失败: {}", e))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str().map(|s| s.to_string())))
            .unwrap_or_else(|| format!("请求 {} 返回 HTTP {}", url, status.as_u16()));
        return Err(msg);
    }

    serde_json::from_str::<serde_json::Value>(&text).map_err(|e| format!("解析响应失败: {}", e))
}

/// Pull activity entries from other devices
#[tauri::command]
async fn cloud_http_pull_activity(server_url: String, token: String, device_id: String, from_time: i64) -> Result<serde_json::Value, String> {
    let base = server_url.trim_end_matches('/');
    let url = format!("{}/api/v1/activity/pull?device_id={}&from_time={}&limit=500", base, device_id, from_time);
    let client = make_http_client();

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("拉取活动记录失败: {}", e))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str().map(|s| s.to_string())))
            .unwrap_or_else(|| format!("请求 {} 返回 HTTP {}", url, status.as_u16()));
        return Err(msg);
    }

    serde_json::from_str::<serde_json::Value>(&text).map_err(|e| format!("解析响应失败: {}", e))
}

/// Get list of user's registered devices
#[tauri::command]
async fn cloud_http_get_devices(server_url: String, token: String) -> Result<serde_json::Value, String> {
    let base = server_url.trim_end_matches('/');
    let url = format!("{}/api/v1/devices", base);
    let client = make_http_client();

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|e| format!("获取设备列表失败: {}", e))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str().map(|s| s.to_string())))
            .unwrap_or_else(|| format!("请求 {} 返回 HTTP {}", url, status.as_u16()));
        return Err(msg);
    }

    serde_json::from_str::<serde_json::Value>(&text).map_err(|e| format!("解析响应失败: {}", e))
}

/// Push categories and assignments to cloud server
#[tauri::command]
async fn cloud_http_push_categories(
    server_url: String,
    token: String,
    device_id: String,
    categories: Vec<serde_json::Value>,
    assignments: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let base = server_url.trim_end_matches('/');
    let url = format!("{}/api/v1/categories/push", base);
    let client = make_http_client();

    let body = serde_json::json!({
        "device_id": device_id,
        "categories": categories,
        "assignments": assignments,
    });

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("推送分类失败: {}", e))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str().map(|s| s.to_string())))
            .unwrap_or_else(|| format!("请求 {} 返回 HTTP {}", url, status.as_u16()));
        return Err(msg);
    }

    serde_json::from_str::<serde_json::Value>(&text).map_err(|e| format!("解析响应失败: {}", e))
}

/// Pull categories and assignments from cloud server
#[tauri::command]
async fn cloud_http_pull_categories(
    server_url: String,
    token: String,
    device_id: String,
    last_sync_time: i64,
) -> Result<serde_json::Value, String> {
    let base = server_url.trim_end_matches('/');
    let url = format!("{}/api/v1/categories/pull", base);
    let client = make_http_client();

    let body = serde_json::json!({
        "device_id": device_id,
        "last_sync_time": last_sync_time,
    });

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("拉取分类失败: {}", e))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str().map(|s| s.to_string())))
            .unwrap_or_else(|| format!("请求 {} 返回 HTTP {}", url, status.as_u16()));
        return Err(msg);
    }

    serde_json::from_str::<serde_json::Value>(&text).map_err(|e| format!("解析响应失败: {}", e))
}

/// Get activity history entries for cloud sync, with scope and count
#[tauri::command]
fn get_activity_entries_for_sync(state: tauri::State<AppState>, scope: String, count: u32) -> (Vec<serde_json::Value>, usize) {
    let (entries, total) = state.tracker.get_history_entries_for_sync(&scope, count);
    let json_entries: Vec<serde_json::Value> = entries
        .into_iter()
        .map(|e| {
            serde_json::json!({
                "app_name": e.app_name,
                "process_name": e.process_name,
                "window_title": e.window_title,
                "is_browser": e.is_browser,
                "browser_domain": e.browser_domain,
                "start_time": e.start_time,
                "end_time": e.end_time,
                "duration_secs": e.duration_secs,
            })
        })
        .collect();
    (json_entries, total)
}

/// Get screenshot paths for cloud sync, with scope and count
#[tauri::command]
fn get_screenshots_for_sync(scope: String, count: u32) -> Vec<screenshot::SyncScreenshotInfo> {
    screenshot::get_screenshots_for_sync(&scope, count)
}

/// Get category-aware bar data. Each bar is split into per-category segments
/// so the frontend can render a stacked bar chart.
#[tauri::command]
fn get_category_bar_data(
    state: tauri::State<AppState>,
    range: String,
    offset_days: u32,
) -> Vec<categories::CategoryBarEntry> {
    categories::build_category_bar_data(&state.tracker, &range, offset_days)
}

/// App list with user-configured alias and category decoration.
/// Used by the details page so rows display the user's preferred name & color.
#[derive(Debug, Clone, serde::Serialize)]
struct AppWithMeta {
    name: String,
    process_name: String,
    total_secs: u64,
    session_count: u32,
    alias: Option<String>,
    category_id: Option<String>,
    category_name: Option<String>,
    category_color: Option<String>,
}

#[tauri::command]
fn get_apps_with_meta(
    state: tauri::State<AppState>,
    range: String,
    offset_days: u32,
) -> Vec<AppWithMeta> {
    // Collect apps across the requested range.
    let tracker = &state.tracker;
    let today = chrono::Local::now().date_naive()
        - chrono::Duration::days(offset_days as i64);
    let mut aggregated: HashMap<String, AppWithMeta> = HashMap::new();
    let mut order: Vec<String> = Vec::new();

    match range.as_str() {
        "day" => {
            if let Some(day_data) = tracker.get_activity_for_naive_date(&today) {
                for app in &day_data.apps {
                    let key = if app.process_name.is_empty() {
                        app.name.to_lowercase()
                    } else {
                        app.process_name.to_lowercase()
                    };
                    aggregated.entry(key.clone()).and_modify(|existing| {
                        existing.total_secs += app.total_secs;
                        existing.session_count += app.session_count;
                    }).or_insert_with(|| {
                        order.push(key);
                        AppWithMeta {
                            name: app.name.clone(),
                            process_name: app.process_name.clone(),
                            total_secs: app.total_secs,
                            session_count: app.session_count,
                            alias: None,
                            category_id: None,
                            category_name: None,
                            category_color: None,
                        }
                    });
                }
            }
        }
        "week" => {
            let weekday = today.weekday().num_days_from_monday();
            let monday = today - chrono::Duration::days(weekday as i64);
            for i in 0..7 {
                let date = monday + chrono::Duration::days(i);
                if let Some(day_data) = tracker.get_activity_for_naive_date(&date) {
                    for app in &day_data.apps {
                        let key = if app.process_name.is_empty() {
                            app.name.to_lowercase()
                        } else {
                            app.process_name.to_lowercase()
                        };
                        aggregated.entry(key.clone()).and_modify(|existing| {
                            existing.total_secs += app.total_secs;
                            existing.session_count += app.session_count;
                        }).or_insert_with(|| {
                            order.push(key);
                            AppWithMeta {
                                name: app.name.clone(),
                                process_name: app.process_name.clone(),
                                total_secs: app.total_secs,
                                session_count: app.session_count,
                                alias: None,
                                category_id: None,
                                category_name: None,
                                category_color: None,
                            }
                        });
                    }
                }
            }
        }
        "month" => {
            let (year, month) = (today.year(), today.month());
            let days = monitor::get_days_in_month(year, month);
            for d in 1..=days {
                if let Some(date) = chrono::NaiveDate::from_ymd_opt(year, month, d) {
                    if let Some(day_data) = tracker.get_activity_for_naive_date(&date) {
                        for app in &day_data.apps {
                            let key = if app.process_name.is_empty() {
                                app.name.to_lowercase()
                            } else {
                                app.process_name.to_lowercase()
                            };
                            aggregated.entry(key.clone()).and_modify(|existing| {
                                existing.total_secs += app.total_secs;
                                existing.session_count += app.session_count;
                            }).or_insert_with(|| {
                                order.push(key);
                                AppWithMeta {
                                    name: app.name.clone(),
                                    process_name: app.process_name.clone(),
                                    total_secs: app.total_secs,
                                    session_count: app.session_count,
                                    alias: None,
                                    category_id: None,
                                    category_name: None,
                                    category_color: None,
                                }
                            });
                        }
                    }
                }
            }
        }
        "year" => {
            let year = today.year();
            for m in 1..=12 {
                let days = monitor::get_days_in_month(year, m);
                for d in 1..=days {
                    if let Some(date) = chrono::NaiveDate::from_ymd_opt(year, m, d) {
                        if let Some(day_data) = tracker.get_activity_for_naive_date(&date) {
                            for app in &day_data.apps {
                                let key = if app.process_name.is_empty() {
                                    app.name.to_lowercase()
                                } else {
                                    app.process_name.to_lowercase()
                                };
                                aggregated.entry(key.clone()).and_modify(|existing| {
                                    existing.total_secs += app.total_secs;
                                    existing.session_count += app.session_count;
                                }).or_insert_with(|| {
                                    order.push(key);
                                    AppWithMeta {
                                        name: app.name.clone(),
                                        process_name: app.process_name.clone(),
                                        total_secs: app.total_secs,
                                        session_count: app.session_count,
                                        alias: None,
                                        category_id: None,
                                        category_name: None,
                                        category_color: None,
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }
        _ => {
            // Default: same as today.
            if let Some(day_data) = tracker.get_activity_for_naive_date(&today) {
                for app in &day_data.apps {
                    let key = if app.process_name.is_empty() {
                        app.name.to_lowercase()
                    } else {
                        app.process_name.to_lowercase()
                    };
                    aggregated.insert(key.clone(), AppWithMeta {
                        name: app.name.clone(),
                        process_name: app.process_name.clone(),
                        total_secs: app.total_secs,
                        session_count: app.session_count,
                        alias: None,
                        category_id: None,
                        category_name: None,
                        category_color: None,
                    });
                    order.push(key);
                }
            }
        }
    }

    // Enrich with user's category / alias assignments.
    let assignment_map = categories::get_assignment_map();
    let categories_list = categories::get_categories();
    let cat_lookup: HashMap<String, categories::Category> = categories_list
        .into_iter()
        .map(|c| (c.id.clone(), c))
        .collect();

    let mut result: Vec<AppWithMeta> = order.into_iter().filter_map(|k| aggregated.remove(&k)).collect();
    for app in &mut result {
        let key = if app.process_name.is_empty() {
            app.name.to_lowercase()
        } else {
            app.process_name.to_lowercase()
        };
        if let Some((cat_id, alias)) = assignment_map.get(&key) {
            app.alias = alias.clone();
            app.category_id = cat_id.clone();
            if let Some(cat) = cat_id.as_ref().and_then(|id| cat_lookup.get(id)) {
                app.category_name = Some(cat.name.clone());
                app.category_color = Some(cat.color.clone());
            }
        }
    }
    result.sort_by(|a, b| b.total_secs.cmp(&a.total_secs));
    result
}

/// Upload a single screenshot file to cloud server
/// Reads the local encrypted screenshot file, decrypts it, and uploads via multipart/form-data
#[tauri::command]
async fn cloud_http_upload_screenshot(
    server_url: String,
    token: String,
    device_id: String,
    screenshot_path: String,
    capture_time: i64,
    app_name: Option<String>,
    window_title: Option<String>,
) -> Result<serde_json::Value, String> {
    let base = server_url.trim_end_matches('/');
    let url = format!("{}/api/v1/screenshots/upload", base);
    let client = make_http_client();

    // Read and decrypt the screenshot file
    let data = std::fs::read(&screenshot_path).map_err(|e| format!("读取截图文件失败: {}", e))?;

    // Decrypt if encrypted (files starting with nonce header)
    let decrypted = if data.len() > 12 {
        match screenshot_crypto::get_or_create_encryption_key()
            .and_then(|key| screenshot_crypto::decrypt_data_with_key(&data, &key))
        {
            Ok(plain) => plain,
            Err(_) => data.clone(), // fallback: use raw data if decryption fails
        }
    } else {
        data.clone()
    };

    // Calculate SHA-256 hash of file content
    let file_hash = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(&decrypted);
        let result = hasher.finalize();
        result.iter().map(|b| format!("{:02x}", b)).collect::<Vec<String>>().join("")
    };

    let file_size = decrypted.len() as i64;

    // Build multipart form body
    let filename = std::path::Path::new(&screenshot_path)
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("screenshot_{}.png", capture_time));

    let part = reqwest::multipart::Part::bytes(decrypted)
        .file_name(filename.clone())
        .mime_str("image/png")
        .map_err(|e| format!("构建上传内容失败: {}", e))?;

    let mut form = reqwest::multipart::Form::new()
        .text("device_id", device_id.clone())
        .text("file_hash", file_hash.clone())
        .text("capture_time", capture_time.to_string())
        .text("file_size", file_size.to_string())
        .part("file", part);

    if let Some(app) = app_name {
        form = form.text("app_name", app);
    }
    if let Some(title) = window_title {
        form = form.text("window_title", title);
    }

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("上传截图失败: {}", e))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str().map(|s| s.to_string())))
            .unwrap_or_else(|| format!("请求 {} 返回 HTTP {}", url, status.as_u16()));
        return Err(msg);
    }

    serde_json::from_str::<serde_json::Value>(&text).map_err(|e| format!("解析响应失败: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let tracker = Arc::new(ActivityTracker::new());

    // Check if the app was started via auto-start
    let is_autostart = std::env::args().any(|arg| arg == "--autostart");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--autostart"])
                .build(),
        )
        .manage(AppState {
            tracker: tracker.clone(),
            icon_cache: Arc::new(Mutex::new(HashMap::new())),
        })
        .setup(move |app| {
            // Start monitoring thread
            let handle = app.handle().clone();
            start_monitoring(tracker.clone(), handle.clone());

            // Build system tray
            let show_i = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "隐藏到托盘", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap_or_else(|| {
                    // Fallback: create a simple colored icon
                    tauri::image::Image::new(&[0u8; 4], 1, 1)
                }))
                .menu(&menu)
                .tooltip("SernVia - 使用统计")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Handle window close event - minimize to tray
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });

                // If started via auto-start, hide the window immediately
                if is_autostart {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_current_activity, get_stats, get_stats_for_date, get_stats_for_hour, get_weekly_stats, get_stats_by_range, get_stats_by_range_offset, get_bar_data, get_bar_data_offset, get_app_time_stats, get_app_hourly_stats, get_app_daily_stats, get_app_path, get_app_name, export_data, clear_data, get_data_path, get_default_data_path, set_data_path, get_app_icon, import_from_tai, get_tai_db_tables, is_admin, get_screenshot_enabled, get_screenshot_interval, get_screenshots_folder, get_screenshots, set_screenshot_enabled, set_screenshot_interval, set_screenshots_folder, reset_screenshots_folder, get_screenshot_base64, screenshot_has_password, screenshot_set_password, screenshot_verify_password, change_screenshot_password, export_screenshot, delete_screenshot, delete_screenshots, copy_screenshot_to_clipboard, clear_all_screenshots, get_monitor_list, set_selected_monitors, get_selected_monitors, set_layout_mode, get_layout_mode, get_max_storage_mb, set_max_storage_mb, get_storage_usage_mb, get_activity_at_timestamp, get_collections, create_collection, delete_collection, rename_collection, add_screenshot_to_collection, remove_screenshot_from_collection, get_screenshots_in_collection, auto_categorize_screenshot, get_cloud_server_list, add_cloud_server, remove_cloud_server, get_login_session, save_session, clear_session, cloud_http_login, cloud_http_register, cloud_http_register_device, cloud_http_test, cloud_http_push_activity, cloud_http_pull_activity, cloud_http_get_devices, cloud_http_upload_screenshot, cloud_http_push_categories, cloud_http_pull_categories, get_activity_entries_for_sync, get_screenshots_for_sync, get_category_bar_data, get_apps_with_meta, categories::cmd_get_categories, categories::cmd_add_category, categories::cmd_update_category, categories::cmd_delete_category, categories::cmd_get_assignments, categories::cmd_set_app_category, categories::cmd_set_app_alias, categories::cmd_remove_app_assignment, categories::cmd_replace_categories_store])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
