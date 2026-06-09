mod monitor;
mod windows_api;
mod screenshot;
mod screenshot_crypto;

use monitor::ActivityTracker;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
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
        let cache = state.icon_cache.lock().unwrap();
        if let Some(icon) = cache.get(&process_name) {
            return Some(icon.clone());
        }
    }
    // Extract icon (this checks running processes, common paths, and registry)
    if let Some(base64) = windows_api::extract_app_icon(&process_name) {
        let mut cache = state.icon_cache.lock().unwrap();
        cache.insert(process_name.clone(), base64.clone());
        return Some(base64);
    }
    // Fallback: check known app paths from Tai imports
    if let Some(exe_path) = monitor::get_app_path(&process_name) {
        let path = std::path::Path::new(&exe_path);
        if let Some(icon) = windows_api::extract_icon_from_path(path) {
            let mut cache = state.icon_cache.lock().unwrap();
            cache.insert(process_name, icon.clone());
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
fn get_stats_by_range_offset(state: tauri::State<AppState>, days: u32, offset_days: u32) -> monitor::WeekData {
    state.tracker.get_stats_by_range_offset(days, offset_days)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let tracker = Arc::new(ActivityTracker::new());

    // Check if the app was started via auto-start
    let is_autostart = std::env::args().any(|arg| arg == "--autostart");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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
                .icon(app.default_window_icon().unwrap().clone())
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
        .invoke_handler(tauri::generate_handler![get_current_activity, get_stats, get_stats_for_date, get_stats_for_hour, get_weekly_stats, get_stats_by_range, get_stats_by_range_offset, get_bar_data, get_bar_data_offset, get_app_time_stats, get_app_hourly_stats, get_app_daily_stats, get_app_path, get_app_name, export_data, clear_data, get_data_path, get_default_data_path, set_data_path, get_app_icon, import_from_tai, get_tai_db_tables, is_admin, get_screenshot_enabled, get_screenshot_interval, get_screenshots_folder, get_screenshots, set_screenshot_enabled, set_screenshot_interval, set_screenshots_folder, reset_screenshots_folder, get_screenshot_base64, screenshot_has_password, screenshot_set_password, screenshot_verify_password, export_screenshot, delete_screenshot, delete_screenshots, copy_screenshot_to_clipboard, clear_all_screenshots, get_monitor_list, set_selected_monitors, get_selected_monitors, set_layout_mode, get_layout_mode, get_max_storage_mb, set_max_storage_mb, get_storage_usage_mb, get_activity_at_timestamp, get_collections, create_collection, delete_collection, rename_collection, add_screenshot_to_collection, remove_screenshot_from_collection, get_screenshots_in_collection, auto_categorize_screenshot])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
