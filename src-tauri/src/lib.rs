mod monitor;
mod windows_api;

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
    // Extract icon
    if let Some(base64) = windows_api::extract_app_icon(&process_name) {
        let mut cache = state.icon_cache.lock().unwrap();
        cache.insert(process_name, base64.clone());
        Some(base64)
    } else {
        None
    }
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
fn set_data_path(new_path: String) -> Result<(), String> {
    monitor::set_data_path(&new_path)
}

fn start_monitoring(tracker: Arc<ActivityTracker>, _app_handle: tauri::AppHandle) {
    // Get this app's own executable name so we can skip tracking ourselves
    let self_exe_name = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase()))
        .unwrap_or_default();

    thread::spawn(move || {
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
        .invoke_handler(tauri::generate_handler![get_current_activity, get_stats, get_stats_for_date, get_stats_for_hour, get_weekly_stats, get_stats_by_range, get_stats_by_range_offset, get_bar_data, get_bar_data_offset, get_app_time_stats, get_app_hourly_stats, get_app_daily_stats, get_app_path, get_app_name, export_data, clear_data, get_data_path, get_default_data_path, set_data_path, get_app_icon])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
