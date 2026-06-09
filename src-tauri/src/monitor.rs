use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::sync::{Arc, Mutex};
use chrono::{DateTime, Datelike, Local, NaiveDate, NaiveDateTime, TimeZone, Timelike};
use rusqlite::Connection;

// Known browser process names (used to determine if an app is a browser)
const BROWSER_PROCESSES: &[&str] = &[
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
    "brave.exe",
    "opera.exe",
    "vivaldi.exe",
    "iexplore.exe",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEntry {
    pub app_name: String,
    pub process_name: String,
    pub window_title: String,
    pub is_browser: bool,
    pub browser_domain: Option<String>,
    pub start_time: i64,
    pub end_time: i64,
    pub duration_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppStats {
    pub name: String,
    #[serde(default)]
    pub process_name: String,
    pub total_secs: u64,
    pub session_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserStats {
    pub domain: String,
    pub title: String,
    pub total_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityData {
    pub date: String,
    pub total_active_secs: u64,
    pub apps: Vec<AppStats>,
    pub browsers: Vec<BrowserStats>,
    pub history: Vec<ActivityEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentActivity {
    pub app_name: String,
    pub window_title: String,
    pub is_browser: bool,
    pub browser_domain: Option<String>,
    pub active_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeekData {
    pub total_active_secs: u64,
    pub days: Vec<DaySummary>,
    pub apps: Vec<AppStats>,
    pub browsers: Vec<BrowserStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaySummary {
    pub date: String,
    pub total_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BarEntry {
    pub label: String,
    pub total_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppTimeStats {
    pub app_name: String,
    pub process_name: String,
    pub day_secs: u64,
    pub week_secs: u64,
    pub month_secs: u64,
    pub year_secs: u64,
    pub day_total_secs: u64,
    pub week_total_secs: u64,
    pub month_total_secs: u64,
    pub year_total_secs: u64,
}

pub struct ActivityTracker {
    pub current: Arc<Mutex<CurrentSession>>,
    pub data: Arc<Mutex<ActivityData>>,
    pub today: Arc<Mutex<String>>,
}

#[derive(Debug, Clone)]
pub struct CurrentSession {
    pub app_name: String,
    pub process_name: String,
    pub window_title: String,
    pub is_browser: bool,
    pub browser_domain: Option<String>,
    pub start_time: i64,
    pub accumulated: u64,
}

impl ActivityTracker {
    pub fn new() -> Self {
        let today = Local::now().format("%Y-%m-%d").to_string();
        let tracker = ActivityTracker {
            current: Arc::new(Mutex::new(CurrentSession {
                app_name: String::new(),
                process_name: String::new(),
                window_title: String::new(),
                is_browser: false,
                browser_domain: None,
                start_time: 0,
                accumulated: 0,
            })),
            data: Arc::new(Mutex::new(ActivityData {
                date: today.clone(),
                total_active_secs: 0,
                apps: Vec::new(),
                browsers: Vec::new(),
                history: Vec::new(),
            })),
            today: Arc::new(Mutex::new(today)),
        };

        // Load existing data
        if let Ok(loaded) = load_activity_data() {
            if let Ok(mut data) = tracker.data.lock() {
                *data = loaded;
            }
        }

        tracker
    }

    pub fn update(&self, app_name: &str, process_name: &str, _class_name: &str, window_title: &str) {
        // Use process name to determine if it's a browser (not class name),
        // because apps like QQ use Chromium CEF with browser-like window classes.
        let is_browser = BROWSER_PROCESSES.contains(&process_name.to_lowercase().as_str());
        let browser_domain = if is_browser {
            extract_domain(window_title)
        } else {
            None
        };

        let now = Local::now().timestamp();
        let today_str = Local::now().format("%Y-%m-%d").to_string();

        // Check if day changed
        {
            let mut today = self.today.lock().unwrap();
            if *today != today_str {
                // Archive previous day's data before resetting
                let old_data = self.data.lock().unwrap().clone();
                if old_data.total_active_secs > 0 {
                    archive_daily_data(&old_data);
                }
                // New day, reset
                let new_data = ActivityData {
                    date: today_str.clone(),
                    total_active_secs: 0,
                    apps: Vec::new(),
                    browsers: Vec::new(),
                    history: Vec::new(),
                };
                *self.data.lock().unwrap() = new_data;
                *today = today_str;
            }
        }

        let mut current = self.current.lock().unwrap();

        // If same app/window, just update
        if current.app_name == app_name && current.window_title == window_title {
            current.accumulated = now.saturating_sub(current.start_time) as u64;
            return;
        }

        // Record the previous session
        if !current.app_name.is_empty() && current.start_time > 0 {
            let duration = now.saturating_sub(current.start_time) as u64;
            if duration > 0 {
                let entry = ActivityEntry {
                    app_name: current.app_name.clone(),
                    process_name: current.process_name.clone(),
                    window_title: current.window_title.clone(),
                    is_browser: current.is_browser,
                    browser_domain: current.browser_domain.clone(),
                    start_time: current.start_time,
                    end_time: now,
                    duration_secs: duration,
                };

                let mut data = self.data.lock().unwrap();
                data.total_active_secs += duration;
                data.history.push(entry.clone());

                // Update app stats
                if let Some(app) = data.apps.iter_mut().find(|a| a.name == current.app_name) {
                    app.total_secs += duration;
                    app.session_count += 1;
                    // Update process_name (handles old data where process_name was empty)
                    app.process_name = current.process_name.clone();
                } else {
                    data.apps.push(AppStats {
                        name: current.app_name.clone(),
                        process_name: current.process_name.clone(),
                        total_secs: duration,
                        session_count: 1,
                    });
                }

                // Update browser stats if applicable
                if let Some(ref domain) = current.browser_domain {
                    if let Some(b) = data.browsers.iter_mut().find(|b| b.domain == *domain) {
                        b.total_secs += duration;
                        b.title = current.window_title.clone();
                    } else {
                        data.browsers.push(BrowserStats {
                            domain: domain.clone(),
                            title: current.window_title.clone(),
                            total_secs: duration,
                        });
                    }
                }
            }
        }

        // Start new session
        *current = CurrentSession {
            app_name: app_name.to_string(),
            process_name: process_name.to_string(),
            window_title: window_title.to_string(),
            is_browser,
            browser_domain,
            start_time: now,
            accumulated: 0,
        };
    }

    pub fn get_current_activity(&self) -> CurrentActivity {
        let current = self.current.lock().unwrap();
        CurrentActivity {
            app_name: current.app_name.clone(),
            window_title: current.window_title.clone(),
            is_browser: current.is_browser,
            browser_domain: current.browser_domain.clone(),
            active_seconds: current.accumulated,
        }
    }

    pub fn get_stats(&self) -> ActivityData {
        let data = self.data.lock().unwrap();
        // Sort by time
        let mut apps = data.apps.clone();
        apps.sort_by(|a, b| b.total_secs.cmp(&a.total_secs));

        let mut browsers = data.browsers.clone();
        browsers.sort_by(|a, b| b.total_secs.cmp(&a.total_secs));

        let mut history = data.history.clone();
        history.reverse();
        history.truncate(100);

        ActivityData {
            date: data.date.clone(),
            total_active_secs: data.total_active_secs,
            apps,
            browsers,
            history,
        }
    }

    pub fn save(&self) {
        let data = self.data.lock().unwrap();
        save_activity_data(&data);
    }

    pub fn clear(&self) {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let mut data = self.data.lock().unwrap();
        *data = ActivityData {
            date: today,
            total_active_secs: 0,
            apps: Vec::new(),
            browsers: Vec::new(),
            history: Vec::new(),
        };
        // Delete the saved file
        let path = get_data_path();
        let _ = std::fs::remove_file(&path);

        let mut current = self.current.lock().unwrap();
        *current = CurrentSession {
            app_name: String::new(),
            process_name: String::new(),
            window_title: String::new(),
            is_browser: false,
            browser_domain: None,
            start_time: 0,
            accumulated: 0,
        };
    }

    pub fn get_weekly_stats(&self) -> WeekData {
        self.get_stats_by_range(7)
    }

    /// Load daily data for a specific date from memory (today) or archive
    fn load_daily_data(&self, date: &chrono::NaiveDate) -> Option<ActivityData> {
        let today = chrono::Local::now().date_naive();
        let date_str = date.format("%Y-%m-%d").to_string();

        if *date == today {
            // Always return in-memory data for today, even if total_active_secs is 0.
            // The current session may have accumulated time not yet reflected in
            // total_active_secs (only incremented on app switch).
            let data = self.data.lock().unwrap().clone();
            if data.date == date_str {
                return Some(data);
            }
            return None;
        }

        // Load from archived file (prefers gzip)
        load_archived_data(&date_str)
    }

    /// Aggregate stats for the last N days (including today)
    /// Special handling: if days=7, use calendar week (Monday-Sunday)
    pub fn get_stats_by_range(&self, days: u32) -> WeekData {
        let today = chrono::Local::now().date_naive();
        
        let (start_date, end_date) = if days == 7 {
            // For week view, use calendar week (Monday-Sunday)
            let weekday = today.weekday().num_days_from_monday();
            let monday = today - chrono::Duration::days(weekday as i64);
            let sunday = monday + chrono::Duration::days(6);
            (monday, sunday)
        } else {
            // For other ranges, just use last N days
            let start_date = today - chrono::Duration::days((days - 1) as i64);
            (start_date, today)
        };

        let mut all_apps: HashMap<String, AppStats> = HashMap::new();
        let mut all_browsers: HashMap<String, BrowserStats> = HashMap::new();
        let mut day_list: Vec<DaySummary> = Vec::new();
        let mut total_secs: u64 = 0;

        let mut current = start_date;
        while current <= end_date {
            if let Some(day_data) = self.load_daily_data(&current) {
                let date_str = current.format("%Y-%m-%d").to_string();
                day_list.push(DaySummary {
                    date: date_str.clone(),
                    total_secs: day_data.total_active_secs,
                });
                total_secs += day_data.total_active_secs;

                for app in &day_data.apps {
                    let entry = all_apps.entry(app.name.clone()).or_insert(AppStats {
                        name: app.name.clone(),
                        process_name: app.process_name.clone(),
                        total_secs: 0,
                        session_count: 0,
                    });
                    entry.total_secs += app.total_secs;
                    entry.session_count += app.session_count;
                }
                for br in &day_data.browsers {
                    let entry = all_browsers.entry(br.domain.clone()).or_insert(BrowserStats {
                        domain: br.domain.clone(),
                        title: br.title.clone(),
                        total_secs: 0,
                    });
                    entry.total_secs += br.total_secs;
                }
            }
            current += chrono::Duration::days(1);
        }

        // Sort days chronologically
        day_list.sort_by(|a, b| a.date.cmp(&b.date));

        let mut apps: Vec<AppStats> = all_apps.into_values().collect();
        apps.sort_by(|a, b| b.total_secs.cmp(&a.total_secs));

        let mut browsers: Vec<BrowserStats> = all_browsers.into_values().collect();
        browsers.sort_by(|a, b| b.total_secs.cmp(&a.total_secs));

        WeekData {
            total_active_secs: total_secs,
            days: day_list,
            apps,
            browsers,
        }
    }

    /// Aggregate stats for N days with an offset from today.
    /// offset_days=0 → current period (today), offset_days=1 → yesterday, etc.
    /// Special handling: if days=7, use calendar week (Monday-Sunday)
    pub fn get_stats_by_range_offset(&self, days: u32, offset_days: u32) -> WeekData {
        let today = chrono::Local::now().date_naive();
        let end_date = today - chrono::Duration::days(offset_days as i64);
        
        let (start_date, end_date) = if days == 7 {
            // For week view, use calendar week (Monday-Sunday)
            let weekday = end_date.weekday().num_days_from_monday();
            let monday = end_date - chrono::Duration::days(weekday as i64);
            let sunday = monday + chrono::Duration::days(6);
            (monday, sunday)
        } else {
            // For other ranges, just use fixed days
            let start_date = end_date - chrono::Duration::days((days - 1) as i64);
            (start_date, end_date)
        };

        let mut all_apps: HashMap<String, AppStats> = HashMap::new();
        let mut all_browsers: HashMap<String, BrowserStats> = HashMap::new();
        let mut day_list: Vec<DaySummary> = Vec::new();
        let mut total_secs: u64 = 0;

        let mut current = start_date;
        while current <= end_date {
            if let Some(day_data) = self.load_daily_data(&current) {
                let date_str = current.format("%Y-%m-%d").to_string();
                day_list.push(DaySummary {
                    date: date_str.clone(),
                    total_secs: day_data.total_active_secs,
                });
                total_secs += day_data.total_active_secs;

                for app in &day_data.apps {
                    let entry = all_apps.entry(app.name.clone()).or_insert(AppStats {
                        name: app.name.clone(),
                        process_name: app.process_name.clone(),
                        total_secs: 0,
                        session_count: 0,
                    });
                    entry.total_secs += app.total_secs;
                    entry.session_count += app.session_count;
                }
                for br in &day_data.browsers {
                    let entry = all_browsers.entry(br.domain.clone()).or_insert(BrowserStats {
                        domain: br.domain.clone(),
                        title: br.title.clone(),
                        total_secs: 0,
                    });
                    entry.total_secs += br.total_secs;
                }
            }
            current += chrono::Duration::days(1);
        }

        day_list.sort_by(|a, b| a.date.cmp(&b.date));
        let mut apps: Vec<AppStats> = all_apps.into_values().collect();
        apps.sort_by(|a, b| b.total_secs.cmp(&a.total_secs));
        let mut browsers: Vec<BrowserStats> = all_browsers.into_values().collect();
        browsers.sort_by(|a, b| b.total_secs.cmp(&a.total_secs));

        WeekData {
            total_active_secs: total_secs,
            days: day_list,
            apps,
            browsers,
        }
    }

    /// Get bar chart data based on time range
    /// - "day": 24 hourly entries from today's history
    /// - "week": 7 daily entries (Mon-Sun) from past 7 days
    /// - "month": daily entries for past 30 days
    /// - "year": 12 monthly entries for past 365 days
    pub fn get_bar_data(&self, range: &str) -> Vec<BarEntry> {
        match range {
            "day" => self.get_hourly_bar_data(),
            "month" => self.get_daily_bar_data(31),
            "year" => self.get_monthly_bar_data(),
            _ => self.get_daily_bar_data(7), // week or fallback
        }
    }

    /// Get bar data with offset (offset_days=0 = current, 1 = previous period, etc.)
    pub fn get_bar_data_offset(&self, range: &str, offset_days: u32) -> Vec<BarEntry> {
        // For offset > 0, we use offset versions; otherwise fall through to normal
        if offset_days == 0 {
            return self.get_bar_data(range);
        }
        match range {
            "day" => self.get_hourly_bar_data_offset(offset_days),
            "month" => self.get_daily_bar_data_offset(31, offset_days),
            "year" => self.get_monthly_bar_data_offset(offset_days),
            _ => self.get_daily_bar_data_offset(7, offset_days),
        }
    }

    fn get_hourly_bar_data_offset(&self, offset_days: u32) -> Vec<BarEntry> {
        let reference = chrono::Local::now().date_naive() - chrono::Duration::days(offset_days as i64);
        let mut hours = vec![0u64; 24];

        let data = self.load_daily_data(&reference);
        if let Some(day_data) = data {
            for entry in &day_data.history {
                let start_hour = ((entry.start_time as u64) % 86400) / 3600;
                if start_hour < 24 {
                    hours[start_hour as usize] += entry.duration_secs;
                }
            }
        }

        hours.iter().enumerate().map(|(h, &secs)| BarEntry {
            label: format!("{:02}", h),
            total_secs: secs,
        }).collect()
    }

    fn get_daily_bar_data_offset(&self, days: u32, offset_days: u32) -> Vec<BarEntry> {
        let data = self.get_stats_by_range_offset(days, offset_days);
        let mut data_map: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
        for d in &data.days {
            data_map.insert(d.date.clone(), d.total_secs);
        }
        // Reuse logic similar to get_daily_bar_data but with offset reference
        let today = chrono::Local::now();
        let ref_date = today - chrono::Duration::days(offset_days as i64);

        if days <= 7 {
            let weekday = ref_date.weekday().num_days_from_monday();
            let monday = ref_date - chrono::Duration::days(weekday as i64);
            let weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
            (0..7).map(|i| {
                let date = (monday + chrono::Duration::days(i)).format("%Y-%m-%d").to_string();
                let secs = data_map.get(&date).copied().unwrap_or(0);
                BarEntry {
                    label: weekday_names[i as usize].to_string(),
                    total_secs: secs,
                }
            }).collect()
        } else {
            let year = ref_date.year();
            let month = ref_date.month();
            let mut result = Vec::with_capacity(31);
            for day in 1..=31 {
                if let Some(_date) = chrono::NaiveDate::from_ymd_opt(year, month, day) {
                    let date_str = format!("{:04}-{:02}-{:02}", year, month, day);
                    let secs = data_map.get(&date_str).copied().unwrap_or(0);
                    result.push(BarEntry {
                        label: format!("{}", day),
                        total_secs: secs,
                    });
                }
            }
            result
        }
    }

    fn get_monthly_bar_data_offset(&self, offset_days: u32) -> Vec<BarEntry> {
        let year_data = self.get_stats_by_range_offset(365, offset_days);
        let mut months = vec![0u64; 12];
        for d in &year_data.days {
            if let Ok(date) = chrono::NaiveDate::parse_from_str(&d.date, "%Y-%m-%d") {
                let month_idx = (date.month() - 1) as usize;
                if month_idx < 12 {
                    months[month_idx] += d.total_secs;
                }
            }
        }
        let month_names = ["1月", "2月", "3月", "4月", "5月", "6月",
                          "7月", "8月", "9月", "10月", "11月", "12月"];
        months.iter().enumerate().map(|(i, &secs)| BarEntry {
            label: month_names[i].to_string(),
            total_secs: secs,
        }).collect()
    }

    fn get_hourly_bar_data(&self) -> Vec<BarEntry> {
        let data = self.data.lock().unwrap();
        let mut hours = vec![0u64; 24];

        // Aggregate from today's history entries
        for entry in &data.history {
            let start_hour = ((entry.start_time as u64) % 86400) / 3600;
            if start_hour < 24 {
                hours[start_hour as usize] += entry.duration_secs;
            }
        }

        // Add the current active session
        let current = self.current.lock().unwrap();
        if !current.app_name.is_empty() && current.start_time > 0 {
            let now = chrono::Local::now().timestamp();
            let current_hour = ((now as u64) % 86400) / 3600;
            if current_hour < 24 {
                hours[current_hour as usize] += current.accumulated;
            }
        }

        hours.iter().enumerate().map(|(h, &secs)| BarEntry {
            label: format!("{:02}", h),
            total_secs: secs,
        }).collect()
    }

    fn get_daily_bar_data(&self, days: u32) -> Vec<BarEntry> {
        let week_data = self.get_stats_by_range(days);
        // Build a lookup map: date -> total_secs
        let mut data_map: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
        for d in &week_data.days {
            data_map.insert(d.date.clone(), d.total_secs);
        }

        let today = chrono::Local::now();

        if days <= 7 {
            // Week view: always show Mon-Sun of the current week (7 entries)
            let weekday = today.weekday().num_days_from_monday(); // 0=Mon, 6=Sun
            let monday = today - chrono::Duration::days(weekday as i64);
            let weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
            (0..7).map(|i| {
                let date = (monday + chrono::Duration::days(i)).format("%Y-%m-%d").to_string();
                let secs = data_map.get(&date).copied().unwrap_or(0);
                BarEntry {
                    label: weekday_names[i as usize].to_string(),
                    total_secs: secs,
                }
            }).collect()
        } else {
            // Month view: show all days of the current month
            let year = today.year();
            let month = today.month();
            let mut result = Vec::with_capacity(31);
            for day in 1..=31 {
                if let Some(_date) = chrono::NaiveDate::from_ymd_opt(year, month, day) {
                    let date_str = format!("{:04}-{:02}-{:02}", year, month, day);
                    let secs = data_map.get(&date_str).copied().unwrap_or(0);
                    result.push(BarEntry {
                        label: format!("{}", day),
                        total_secs: secs,
                    });
                }
            }
            result
        }
    }

    /// Get aggregated time stats for a specific app across day/week/month/year
    /// Get full ActivityData for a specific date (with offset from today)
    /// offset_days=0 → today, offset_days=1 → yesterday, etc.
    pub fn get_stats_for_date(&self, offset_days: u32) -> ActivityData {
        let date = chrono::Local::now().date_naive() - chrono::Duration::days(offset_days as i64);
        self.load_daily_data(&date).unwrap_or(ActivityData {
            date: date.format("%Y-%m-%d").to_string(),
            total_active_secs: 0,
            apps: Vec::new(),
            browsers: Vec::new(),
            history: Vec::new(),
        })
    }

    /// Get stats for a specific hour (0-23) of a specific day (offset_days from today).
    pub fn get_stats_for_hour(&self, offset_days: u32, hour: u32) -> ActivityData {
        let date = chrono::Local::now().date_naive() - chrono::Duration::days(offset_days as i64);
        let day_data = self.load_daily_data(&date);

        if let Some(data) = day_data {
            // Calculate hour boundaries (matching get_hourly_bar_data's UTC approach)
            let day_start_ts = date.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp();
            let hour_start_ts = day_start_ts + (hour as i64) * 3600;
            let hour_end_ts = day_start_ts + ((hour + 1) as i64) * 3600;

            // Filter history entries that overlap with this hour
            let mut filtered_history: Vec<ActivityEntry> = Vec::new();
            let mut app_map: HashMap<String, (u64, u32, String)> = HashMap::new(); // name → (secs, count, process_name)
            let mut browser_map: HashMap<String, (u64, String)> = HashMap::new();
            let mut total_secs: u64 = 0;
            let mut seen_entries: std::collections::HashSet<(i64, String)> = std::collections::HashSet::new();

            for entry in &data.history {
                if entry.start_time < hour_end_ts && entry.end_time > hour_start_ts {
                    // Calculate overlap duration
                    let overlap_start = std::cmp::max(entry.start_time, hour_start_ts);
                    let overlap_end = std::cmp::min(entry.end_time, hour_end_ts);
                    let duration = (overlap_end - overlap_start) as u64;
                    if duration == 0 { continue; }

                    // Avoid counting the same entry multiple times
                    let entry_key = (entry.start_time, entry.app_name.clone());
                    if !seen_entries.insert(entry_key) { continue; }

                    let mut filtered = entry.clone();
                    filtered.duration_secs = duration;
                    filtered.start_time = overlap_start;
                    filtered.end_time = overlap_end;
                    filtered_history.push(filtered);

                    total_secs += duration;

                    let app_entry = app_map.entry(entry.app_name.clone()).or_insert((0, 0, entry.process_name.clone()));
                    app_entry.0 += duration;
                    app_entry.1 += 1;

                    if let Some(ref domain) = entry.browser_domain {
                        let br_entry = browser_map.entry(domain.clone()).or_insert((0, entry.window_title.clone()));
                        br_entry.0 += duration;
                    }
                }
            }

            // Also check current session if viewing today and it overlaps
            let today = chrono::Local::now().date_naive();
            if date == today {
                let current = self.current.lock().unwrap();
                if !current.app_name.is_empty() && current.start_time > 0 {
                    let now = chrono::Local::now().timestamp();
                    let session_end = now;
                    if current.start_time < hour_end_ts && session_end > hour_start_ts {
                        let overlap_start = std::cmp::max(current.start_time, hour_start_ts);
                        let overlap_end = std::cmp::min(session_end, hour_end_ts);
                        let duration = (overlap_end - overlap_start) as u64;
                        if duration > 0 {
                            total_secs += duration;
                            let app_entry = app_map.entry(current.app_name.clone()).or_insert((0, 0, current.process_name.clone()));
                            app_entry.0 += duration;
                            if let Some(ref domain) = current.browser_domain {
                                let br_entry = browser_map.entry(domain.clone()).or_insert((0, current.window_title.clone()));
                                br_entry.0 += duration;
                            }
                        }
                    }
                }
            }

            let apps: Vec<AppStats> = app_map.into_iter()
                .map(|(name, (secs, count, proc))| AppStats {
                    name,
                    process_name: proc,
                    total_secs: secs,
                    session_count: count,
                })
                .collect();

            let browsers: Vec<BrowserStats> = browser_map.into_iter()
                .map(|(domain, (secs, title))| BrowserStats {
                    domain,
                    title,
                    total_secs: secs,
                })
                .collect();

            // Sort by time descending
            filtered_history.sort_by(|a, b| b.start_time.cmp(&a.start_time));
            filtered_history.truncate(100);

            ActivityData {
                date: data.date,
                total_active_secs: total_secs,
                apps,
                browsers,
                history: filtered_history,
            }
        } else {
            ActivityData {
                date: date.format("%Y-%m-%d").to_string(),
                total_active_secs: 0,
                apps: Vec::new(),
                browsers: Vec::new(),
                history: Vec::new(),
            }
        }
    }

    pub fn get_app_time_stats(&self, app_name: &str, offset_days: u32) -> AppTimeStats {
        let day_data = self.get_stats_by_range_offset(1, offset_days);
        let week_data = self.get_stats_by_range_offset(7, offset_days);
        let month_data = self.get_stats_by_range_offset(30, offset_days);
        let year_data = self.get_stats_by_range_offset(365, offset_days);

        let find_app = |data: &WeekData| -> AppStats {
            data.apps.iter()
                .find(|a| a.name == app_name)
                .cloned()
                .unwrap_or(AppStats {
                    name: app_name.to_string(),
                    process_name: String::new(),
                    total_secs: 0,
                    session_count: 0,
                })
        };

        let day_app = find_app(&day_data);
        let week_app = find_app(&week_data);
        let month_app = find_app(&month_data);
        let year_app = find_app(&year_data);

        AppTimeStats {
            app_name: app_name.to_string(),
            process_name: day_app.process_name.clone(),
            day_secs: day_app.total_secs,
            week_secs: week_app.total_secs,
            month_secs: month_app.total_secs,
            year_secs: year_app.total_secs,
            day_total_secs: day_data.total_active_secs,
            week_total_secs: week_data.total_active_secs,
            month_total_secs: month_data.total_active_secs,
            year_total_secs: year_data.total_active_secs,
        }
    }

    /// Get hourly usage for a specific app on a specific day (offset_days from today)
    pub fn get_app_hourly_stats(&self, app_name: &str, offset_days: u32) -> Vec<BarEntry> {
        let date = chrono::Local::now().date_naive() - chrono::Duration::days(offset_days as i64);
        let day_data = self.load_daily_data(&date);
        let mut hours = vec![0u64; 24];

        if let Some(data) = day_data {
            for entry in &data.history {
                if entry.app_name != app_name { continue; }
                let start_hour = ((entry.start_time as u64) % 86400) / 3600;
                if start_hour < 24 {
                    hours[start_hour as usize] += entry.duration_secs;
                }
            }
            // Also check current session if today
            if date == chrono::Local::now().date_naive() {
                let current = self.current.lock().unwrap();
                if current.app_name == app_name && current.start_time > 0 {
                    let now = chrono::Local::now().timestamp();
                    let current_hour = ((now as u64) % 86400) / 3600;
                    if current_hour < 24 {
                        hours[current_hour as usize] += current.accumulated;
                    }
                }
            }
        }

        hours.iter().enumerate().map(|(h, &secs)| BarEntry {
            label: format!("{:02}", h),
            total_secs: secs,
        }).collect()
    }

    /// Get daily usage for a specific app over N days (with offset)
    pub fn get_app_daily_stats(&self, app_name: &str, days: u32, offset_days: u32) -> Vec<BarEntry> {
        let today = chrono::Local::now();
        let ref_date = today - chrono::Duration::days(offset_days as i64);

        if days <= 7 {
            let weekday = ref_date.weekday().num_days_from_monday();
            let monday = ref_date - chrono::Duration::days(weekday as i64);
            let weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
            // Aggregate per day from daily archives
            let mut day_secs = vec![0u64; 7];
            for i in 0..7 {
                let date = (monday + chrono::Duration::days(i)).format("%Y-%m-%d").to_string();
                // We need per-app daily data from the archives or day data
                if let Some(day_data) = load_archived_data(&date) {
                    for app in &day_data.apps {
                        if app.name == app_name {
                            day_secs[i as usize] += app.total_secs;
                        }
                    }
                }
            }
            // Today's data from memory
            if offset_days == 0 {
                let today_data = self.data.lock().unwrap().clone();
                let today_idx = weekday as usize;
                for app in &today_data.apps {
                    if app.name == app_name {
                        day_secs[today_idx] = std::cmp::max(day_secs[today_idx], app.total_secs);
                    }
                }
            }
            (0..7).map(|i| BarEntry {
                label: weekday_names[i as usize].to_string(),
                total_secs: day_secs[i as usize],
            }).collect()
        } else if days <= 31 {
            // Month view
            let year = ref_date.year();
            let month = ref_date.month();
            let mut result = Vec::with_capacity(31);
            for day in 1..=31 {
                if let Some(_date) = chrono::NaiveDate::from_ymd_opt(year, month, day) {
                    let date_str = format!("{:04}-{:02}-{:02}", year, month, day);
                    let mut secs = 0u64;
                    if let Some(day_data) = load_archived_data(&date_str) {
                        for app in &day_data.apps {
                            if app.name == app_name {
                                secs += app.total_secs;
                            }
                        }
                    }
                    // Check today's in-memory data
                    if offset_days == 0 {
                        let today_data = self.data.lock().unwrap().clone();
                        if today_data.date == date_str {
                            for app in &today_data.apps {
                                if app.name == app_name {
                                    secs = std::cmp::max(secs, app.total_secs);
                                }
                            }
                        }
                    }
                    result.push(BarEntry {
                        label: format!("{}日", day),
                        total_secs: secs,
                    });
                }
            }
            result
        } else {
            // Year view
            let mut months = vec![0u64; 12];
            // We need per-app data per month from archives
            // Re-compute from daily files for accuracy
            let start_date = ref_date - chrono::Duration::days(364);
            let mut current = start_date;
            while current <= ref_date {
                let date_str = current.format("%Y-%m-%d").to_string();
                if let Some(day_data) = load_archived_data(&date_str) {
                    for app in &day_data.apps {
                        if app.name == app_name {
                            let month_idx = (current.month() - 1) as usize;
                            if month_idx < 12 {
                                months[month_idx] += app.total_secs;
                            }
                        }
                    }
                }
                current += chrono::Duration::days(1);
            }
            // Today's data
            if offset_days == 0 {
                let today_data = self.data.lock().unwrap().clone();
                let month_idx = (ref_date.month() - 1) as usize;
                for app in &today_data.apps {
                    if app.name == app_name {
                        months[month_idx] += app.total_secs;
                    }
                }
            }
            let month_names = ["1月", "2月", "3月", "4月", "5月", "6月",
                              "7月", "8月", "9月", "10月", "11月", "12月"];
            months.iter().enumerate().map(|(i, &secs)| BarEntry {
                label: month_names[i].to_string(),
                total_secs: secs,
            }).collect()
        }
    }

    fn get_monthly_bar_data(&self) -> Vec<BarEntry> {
        let year_data = self.get_stats_by_range(365);
        let mut months = vec![0u64; 12];

        for d in &year_data.days {
            if let Ok(date) = chrono::NaiveDate::parse_from_str(&d.date, "%Y-%m-%d") {
                let month_idx = (date.month() - 1) as usize;
                if month_idx < 12 {
                    months[month_idx] += d.total_secs;
                }
            }
        }

        let month_names = ["1月", "2月", "3月", "4月", "5月", "6月",
                          "7月", "8月", "9月", "10月", "11月", "12月"];
        months.iter().enumerate().map(|(i, &secs)| BarEntry {
            label: month_names[i].to_string(),
            total_secs: secs,
        }).collect()
    }
}

fn archive_daily_data(data: &ActivityData) {
    let mut path = get_config_dir();
    path.push(format!("activity_{}.json", data.date));
    // Compact JSON + gzip compression
    if let Ok(json) = serde_json::to_string(data) {
        let _ = std::fs::write(&path, &json);
        // Also write gzip version which will be preferred on load
        let gz_path = path.with_extension("json.gz");
        if let Ok(f) = std::fs::File::create(&gz_path) {
            use flate2::write::GzEncoder;
            use flate2::Compression;
            let mut encoder = GzEncoder::new(f, Compression::best());
            let _ = encoder.write_all(json.as_bytes());
            let _ = encoder.finish();
        }
    }
}

/// Get the full file path of a running process by its process name (e.g. "chrome.exe")
pub fn get_app_path(process_name: &str) -> Option<String> {
    crate::windows_api::get_process_path_by_name(process_name)
        .map(|p| p.to_string_lossy().to_string())
}

pub fn extract_domain(title: &str) -> Option<String> {
    // Browser tabs usually show the page title followed by " - " or " | " with the browser name
    // Common formats:
    // "Page Title - Google Chrome"
    // "Page Title — Mozilla Firefox"
    // "Site Name | Microsoft Edge"
    
    // Try to extract meaningful info from the title
    let title = title.trim();
    if title.is_empty() {
        return None;
    }

    // Remove common browser suffixes
    let known_suffixes = [
        " - Google Chrome",
        " — Mozilla Firefox",
        " - Chromium",
        " | Microsoft Edge",
        " - Microsoft​ Edge",
        " - Internet Explorer",
        " - Opera",
        " - Brave",
        " - Vivaldi",
    ];

    let mut clean_title = title.to_string();
    for suffix in &known_suffixes {
        if clean_title.ends_with(suffix) {
            clean_title = clean_title[..clean_title.len() - suffix.len()].to_string();
            break;
        }
    }

    if clean_title.is_empty() || clean_title == title {
        // If it's just the browser name or a new tab
        let lowercase = title.to_lowercase();
        if lowercase.contains("new tab") 
            || lowercase.contains("chrome")
            || lowercase.contains("firefox")
            || lowercase.contains("edge")
            || lowercase.contains("brave")
            || lowercase.contains("opera") 
        {
            return Some("(new tab / browser UI)".to_string());
        }
    }

    Some(clean_title)
}

fn get_config_dir() -> std::path::PathBuf {
    let base = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    let mut path = std::path::PathBuf::from(base);
    path.push("sernvia");
    let _ = std::fs::create_dir_all(&path);
    path
}

fn get_config_path() -> std::path::PathBuf {
    let mut path = get_config_dir();
    path.push("config.json");
    path
}

pub fn get_data_path() -> std::path::PathBuf {
    // First check if a custom path is saved in config
    let config_path = get_config_path();
    if config_path.exists() {
        if let Ok(json) = std::fs::read_to_string(&config_path) {
            if let Ok(config) = serde_json::from_str::<std::collections::HashMap<String, String>>(&json) {
                if let Some(custom_path) = config.get("data_path") {
                    let p = std::path::PathBuf::from(custom_path);
                    if let Some(parent) = p.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    return p;
                }
            }
        }
    }
    // Default: %APPDATA%/sernvia/activity_data.json
    let mut path = get_config_dir();
    path.push("activity_data.json");
    path
}

pub fn set_data_path(new_path: &str) -> Result<(), String> {
    let config_path = get_config_path();

    // Migrate existing data to new location
    let old_path = get_data_path();
    let new_p = std::path::PathBuf::from(new_path);
    if let Some(parent) = new_p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Copy old data if exists and paths differ
    if old_path != new_p && old_path.exists() {
        let _ = std::fs::copy(&old_path, &new_p);
    }

    // Save config
    let mut config = std::collections::HashMap::new();
    config.insert("data_path".to_string(), new_path.to_string());
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, json).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn get_default_data_path() -> std::path::PathBuf {
    let mut path = get_config_dir();
    path.push("activity_data.json");
    path
}

fn save_activity_data(data: &ActivityData) {
    // Compact JSON (not pretty) to reduce file size
    if let Ok(json) = serde_json::to_string(data) {
        let path = get_data_path();
        let _ = std::fs::write(&path, json);
    }
}

fn load_activity_data() -> Result<ActivityData, Box<dyn std::error::Error>> {
    let path = get_data_path();
    if path.exists() {
        let json = std::fs::read_to_string(&path)?;
        return Ok(serde_json::from_str(&json)?);
    }
    // Try gzip version
    let gz_path = path.with_extension("json.gz");
    if gz_path.exists() {
        use std::io::Read;
        let f = std::fs::File::open(&gz_path)?;
        let mut decoder = flate2::read::GzDecoder::new(f);
        let mut json = String::new();
        decoder.read_to_string(&mut json)?;
        return Ok(serde_json::from_str(&json)?);
    }
    Err("No data file found".into())
}

/// Load daily data from archive, preferring gzip over json
fn load_archived_data(date_str: &str) -> Option<ActivityData> {
    let config_dir = get_config_dir();
    // Try gzip first (smaller)
    let gz_path = {
        let mut p = config_dir.clone();
        p.push(format!("activity_{}.json.gz", date_str));
        p
    };
    if gz_path.exists() {
        use std::io::Read;
        if let Ok(f) = std::fs::File::open(&gz_path) {
            let mut decoder = flate2::read::GzDecoder::new(f);
            let mut json = String::new();
            if decoder.read_to_string(&mut json).is_ok() {
                if let Ok(data) = serde_json::from_str::<ActivityData>(&json) {
                    return Some(data);
                }
            }
        }
    }
    // Fallback to uncompressed json
    let mut path = config_dir;
    path.push(format!("activity_{}.json", date_str));
    if path.exists() {
        if let Ok(json) = std::fs::read_to_string(&path) {
            if let Ok(day_data) = serde_json::from_str::<ActivityData>(&json) {
                return Some(day_data);
            }
        }
    }
    None
}

// Tai Data Import
#[derive(Debug, Clone)]
#[allow(dead_code)]
struct TaiApp {
    id: i32,
    name: String,
    description: Option<String>,
    process: Option<String>,
    file: Option<String>,
    category_id: Option<i32>,
}

#[derive(Debug, Clone)]
struct TaiHoursLog {
    id: i32,
    app_id: i32,
    data_time: NaiveDateTime,
    time_seconds: i32,
}

#[derive(Debug, Clone)]
struct TaiCategory {
    id: i32,
    name: String,
}

pub enum TaiImportMode {
    ByDuration,
    ByName,
    InMiddle,
}

pub fn import_tai_data(
    db_path: &str,
    mode: TaiImportMode,
    tracker: Option<&ActivityTracker>,
) -> Result<u32, String> {
    let today_date = Local::now().date_naive();
    
    // Open Tai database
    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open Tai database: {}", e))?;

    // Load apps
    let mut apps_stmt = conn
        .prepare("SELECT ID, Name, Alias, Description, File, CategoryID FROM AppModels")
        .map_err(|e| format!("Failed to prepare app query: {}", e))?;
    let apps_iter = apps_stmt
        .query_map([], |row| {
            Ok(TaiApp {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(3)?,
                process: row.get(2)?,
                file: row.get(4)?,
                category_id: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to load apps: {}", e))?;
    let mut apps_map: HashMap<i32, TaiApp> = HashMap::new();
    for app in apps_iter {
        let app = app.map_err(|e| format!("Failed to parse app: {}", e))?;
        apps_map.insert(app.id, app);
    }

    // Load categories
    let mut cats_stmt = conn
        .prepare("SELECT ID, Name FROM CategoryModels")
        .map_err(|e| format!("Failed to prepare category query: {}", e))?;
    let cats_iter = cats_stmt
        .query_map([], |row| {
            Ok(TaiCategory {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .map_err(|e| format!("Failed to load categories: {}", e))?;
    let mut cats_map: HashMap<i32, String> = HashMap::new();
    for cat in cats_iter {
        let cat = cat.map_err(|e| format!("Failed to parse category: {}", e))?;
        cats_map.insert(cat.id, cat.name);
    }

    // Load HoursLogModel
    let mut logs_stmt = conn
        .prepare("SELECT ID, AppModelID, DataTime, Time FROM HoursLogModels ORDER BY DataTime ASC")
        .map_err(|e| format!("Failed to prepare log query: {}", e))?;
    let logs_iter = logs_stmt
        .query_map([], |row| {
            Ok(TaiHoursLog {
                id: row.get(0)?,
                app_id: row.get(1)?,
                data_time: row.get(2)?,
                time_seconds: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to load logs: {}", e))?;
    let mut all_logs = Vec::new();
    for log in logs_iter {
        let log = log.map_err(|e| format!("Failed to parse log: {}", e))?;
        all_logs.push(log);
    }

    let mut import_count = 0u32;
    let mut imported_today = false;

    // Group logs by date
    let mut date_groups: HashMap<NaiveDate, Vec<TaiHoursLog>> = HashMap::new();
    for log in &all_logs {
        let date = log.data_time.date();
        date_groups.entry(date).or_default().push(log.clone());
    }

    // Process each date
    let config_dir = get_config_dir();
    for (date, logs) in date_groups.clone() {
        let date_str = date.format("%Y-%m-%d").to_string();

        // Load existing date data if exists
        let mut existing_data = if date == today_date {
            // For today, load the current activity data first
            load_activity_data().ok().unwrap_or(ActivityData {
                date: date_str.clone(),
                total_active_secs: 0,
                apps: Vec::new(),
                browsers: Vec::new(),
                history: Vec::new(),
            })
        } else {
            // For other days, load from archive
            load_archived_data(&date_str).unwrap_or(ActivityData {
                date: date_str.clone(),
                total_active_secs: 0,
                apps: Vec::new(),
                browsers: Vec::new(),
                history: Vec::new(),
            })
        };

        // Track seen Tai entries to avoid duplicates
        // Use original Tai data info as unique key: (date_str, hour, app_id, duration_seconds
        let mut seen_tai_entries: std::collections::HashSet<(String, u32, i32, i32)> = std::collections::HashSet::new();
        
        // Save original history entries before clearing
        let mut original_history = Vec::new();
        for entry in &existing_data.history {
            original_history.push(entry.clone());
        }
        
        // Track existing Tai imported entries using (app_name, duration_secs, hour)
        let mut seen_existing_tai: std::collections::HashSet<(String, u64, u32)> = std::collections::HashSet::new();
        for entry in &original_history {
            if entry.window_title.contains("[Tai 导入]") {
                // Extract hour from timestamp for duplicate checking
                let dt = chrono::Local.timestamp_opt(entry.start_time, 0).single();
                let hour = dt.map(|d| d.hour()).unwrap_or(0);
                seen_existing_tai.insert((entry.app_name.clone(), entry.duration_secs, hour));
            }
        }
        
        // Clear and rebuild
        let mut new_history: Vec<ActivityEntry> = Vec::new();
        existing_data.history.clear();
        existing_data.apps.clear();
        existing_data.browsers.clear();

        // Process each hour log
        for hour_log in logs {
            let app = match apps_map.get(&hour_log.app_id) {
                Some(a) => a,
                None => continue,
            };
            if hour_log.time_seconds <= 0 {
                continue;
            }

            // Generate activity entries
            let hour_start = hour_log.data_time;
            let hour_end = hour_start + chrono::Duration::hours(1);
            let app_name = app.name.clone();
            let process_name = app
                .process
                .clone()
                .unwrap_or_else(|| app_name.to_string())
                .to_lowercase();
            let process_name = if process_name.ends_with(".exe") {
                process_name.to_string()
            } else {
                format!("{}.exe", process_name)
            };

            let mut is_browser = false;
            let lower_proc = process_name.to_lowercase();
            for browser in BROWSER_PROCESSES {
                if lower_proc.contains(browser) {
                    is_browser = true;
                    break;
                }
            }

            // Determine where to place the activity in the hour based on mode
            let (mut start_time, end_time) = match mode {
                TaiImportMode::ByDuration => {
                    // Find position in hour sorted by duration
                    let hour_logs = date_groups[&date]
                        .iter()
                        .filter(|l| l.data_time == hour_start)
                        .cloned()
                        .collect::<Vec<_>>();
                    let mut sorted_hour_logs = hour_logs.clone();
                    sorted_hour_logs.sort_by(|a, b| b.time_seconds.cmp(&a.time_seconds));

                    let mut offset = 0;
                    let mut found = false;
                    for l in sorted_hour_logs {
                        if l.id == hour_log.id {
                            found = true;
                            break;
                        }
                        offset += l.time_seconds;
                    }
                    if !found {
                        offset = 0;
                    }
                    let start = hour_start + chrono::Duration::seconds(offset as i64);
                    let end = start + chrono::Duration::seconds(hour_log.time_seconds as i64);
                    (start, end)
                }
                TaiImportMode::ByName => {
                    let hour_logs = date_groups[&date]
                        .iter()
                        .filter(|l| l.data_time == hour_start)
                        .cloned()
                        .collect::<Vec<_>>();
                    let mut sorted_hour_logs = hour_logs.clone();
                    sorted_hour_logs.sort_by(|a, b| {
                        let a_name = apps_map.get(&a.app_id).map(|a| a.name.as_str()).unwrap_or("");
                        let b_name = apps_map.get(&b.app_id).map(|a| a.name.as_str()).unwrap_or("");
                        a_name.cmp(b_name)
                    });

                    let mut offset = 0;
                    let mut found = false;
                    for l in sorted_hour_logs {
                        if l.id == hour_log.id {
                            found = true;
                            break;
                        }
                        offset += l.time_seconds;
                    }
                    if !found {
                        offset = 0;
                    }
                    let start = hour_start + chrono::Duration::seconds(offset as i64);
                    let end = start + chrono::Duration::seconds(hour_log.time_seconds as i64);
                    (start, end)
                }
                TaiImportMode::InMiddle => {
                    let total_hour_secs = 3600;
                    let center_secs = (total_hour_secs - hour_log.time_seconds) / 2;
                    let start = hour_start + chrono::Duration::seconds(center_secs as i64);
                    let end = start + chrono::Duration::seconds(hour_log.time_seconds as i64);
                    (start, end)
                }
            };

            // Make sure end doesn't exceed hour boundary
            if end_time > hour_end {
                let overflow = end_time - hour_end;
                start_time = start_time - overflow;
            }

            // Convert to Unix timestamp
            let start_ts = chrono::Local
                .from_local_datetime(&start_time)
                .single()
                .unwrap_or_else(|| Local::now())
                .timestamp();
            let end_ts = chrono::Local
                .from_local_datetime(&end_time)
                .single()
                .unwrap_or_else(|| Local::now())
                .timestamp();
            let duration_secs = (end_ts - start_ts) as u64;

            // Create entry
            let entry = ActivityEntry {
                app_name: app_name.clone(),
                process_name: process_name.clone(),
                window_title: format!("[Tai 导入] {}", app_name),
                is_browser,
                browser_domain: None,
                start_time: start_ts,
                end_time: end_ts,
                duration_secs,
            };

            // Check for duplicates using original Tai data info, NOT arranged time
            // First check against current import batch
            let hour = hour_start.hour();
            let tai_key = (date_str.clone(), hour, hour_log.app_id, hour_log.time_seconds);
            if seen_tai_entries.contains(&tai_key) {
                continue;
            }
            
            // Then check against existing Tai imports in history
            if seen_existing_tai.contains(&(app_name.clone(), duration_secs, hour)) {
                continue;
            }

            seen_tai_entries.insert(tai_key);
            new_history.push(entry);

            import_count += 1;
        }

        // Merge original history entries with new entries
        for entry in original_history {
            existing_data.history.push(entry);
        }
        
        // Add new imported entries
        for entry in new_history {
            existing_data.history.push(entry);
        }

        // Recalculate total_active_secs and app stats from combined history
        existing_data.total_active_secs = existing_data.history.iter()
            .map(|e| e.duration_secs)
            .sum();
        
        // Recalculate app stats from history
        let mut app_map: std::collections::HashMap<String, (u64, u32, String)> = std::collections::HashMap::new();
        let mut browser_map: std::collections::HashMap<String, (u64, String)> = std::collections::HashMap::new();
        
        for entry in &existing_data.history {
            let stat = app_map.entry(entry.app_name.clone()).or_insert((0, 0, entry.process_name.clone()));
            stat.0 += entry.duration_secs;
            stat.1 += 1;
            
            if entry.is_browser {
                if let Some(ref domain) = entry.browser_domain {
                    let br_stat = browser_map.entry(domain.clone()).or_insert((0, entry.window_title.clone()));
                    br_stat.0 += entry.duration_secs;
                }
            }
        }
        
        existing_data.apps = app_map.into_iter()
            .map(|(name, (secs, count, proc))| AppStats {
                name,
                process_name: proc,
                total_secs: secs,
                session_count: count,
            })
            .collect();
        
        existing_data.browsers = browser_map.into_iter()
            .map(|(domain, (secs, title))| BrowserStats {
                domain,
                title,
                total_secs: secs,
            })
            .collect();

        // Sort by time descending for history
        existing_data.history.sort_by(|a, b| b.start_time.cmp(&a.start_time));
        existing_data.apps.sort_by(|a, b| b.total_secs.cmp(&a.total_secs));

        // Save as archived file
        let mut save_path = config_dir.clone();
        save_path.push(format!("activity_{}.json", date_str));

        let json = serde_json::to_string_pretty(&existing_data)
            .map_err(|e| format!("Failed to serialize data: {}", e))?;

        std::fs::write(&save_path, &json)
            .map_err(|e| format!("Failed to save data: {}", e))?;

        // Also save gzip
        let gz_path = save_path.with_extension("json.gz");
        if let Ok(f) = std::fs::File::create(&gz_path) {
            use flate2::write::GzEncoder;
            use flate2::Compression;
            let mut encoder = GzEncoder::new(f, Compression::best());
            let _ = encoder.write_all(json.as_bytes());
            let _ = encoder.finish();
        }

        // If this is today's data, also save to activity_data.json
        if date == today_date {
            imported_today = true;
            save_activity_data(&existing_data);
        }
    }

    // If we imported today's data and have a tracker, reload it
    if imported_today {
        if let Some(t) = tracker {
            reload_today_data(t);
        }
    }

    Ok(import_count)
}

pub fn reload_today_data(tracker: &ActivityTracker) {
    if let Ok(loaded) = load_activity_data() {
        if let Ok(mut data) = tracker.data.lock() {
            *data = loaded;
        }
    }
}


pub fn get_tai_db_tables(db_path: &str) -> Result<Vec<String>, String> {
    let conn = Connection::open(db_path)
        .map_err(|e| format!("Failed to open Tai database: {}", e))?;
    
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .map_err(|e| format!("Failed to prepare table query: {}", e))?;
    
    let tables = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("Failed to query tables: {}", e))?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| format!("Failed to collect table names: {}", e))?;
    
    Ok(tables)
}

/// 根据时间戳（秒级 unix 时间）查找当时活跃的 app 信息
/// 会先查当天数据，再回查历史归档日数据
/// 注意：对于浏览器，只返回应用名称（如 "Microsoft Edge"），不包含域名，
///       这样所有浏览器截图都会归类到同一个合集中
pub fn get_activity_at_timestamp(timestamp_secs: i64) -> Option<String> {
    // 1) 先构造对应日期字符串
    let naive = DateTime::from_timestamp(timestamp_secs, 0)?.naive_utc();
    let date_str = naive.format("%Y-%m-%d").to_string();
    let today = Local::now().format("%Y-%m-%d").to_string();

    // 2) 加载对应日期的 ActivityData（含 history）
    let data = if date_str == today {
        load_activity_data().ok()
    } else {
        load_archived_data(&date_str)
    };

    let Some(data) = data else { return None; };

    // 3) 在 history 中查找包含 timestamp 的 entry
    // ActivityEntry 的 start_time / end_time 是 unix 秒（i64）
    for entry in &data.history {
        if entry.start_time <= timestamp_secs && entry.end_time >= timestamp_secs {
            // 只返回应用名称，不包含浏览器域名
            // 这样所有同一浏览器的截图都会归类到同一个合集中
            return Some(entry.app_name.clone());
        }
    }

    // 4) 如果在 history 中没找到，但 entry 精度不够，回退到：
    //    找到与 timestamp 时间最接近的 entry
    if let Some(entry) = data.history.iter().min_by_key(|e| {
        let mid = (e.start_time + e.end_time) / 2;
        (mid - timestamp_secs).unsigned_abs()
    }) {
        // 只在距离小于 10 分钟内认为匹配
        let mid = (entry.start_time + entry.end_time) / 2;
        if (mid - timestamp_secs).unsigned_abs() < 600 {
            // 只返回应用名称，不包含浏览器域名
            return Some(entry.app_name.clone());
        }
    }

    None
}


