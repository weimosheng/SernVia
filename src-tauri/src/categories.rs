use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use chrono::Datelike;

/// A user-defined category.
/// Example: "Work", "Entertainment", "Development", etc.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    /// CSS hex color, e.g. "#3b82f6"
    pub color: String,
}

/// An assignment that links an app (identified by its process name) to a
/// category and an optional user-defined alias/display name.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppAssignment {
    pub process_name: String,
    pub category_id: Option<String>,
    pub alias: Option<String>,
}

/// The on-disk representation of all user-defined categorisation data.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct CategoryStore {
    pub categories: Vec<Category>,
    pub assignments: Vec<AppAssignment>,
}

/// Singleton shared state.
struct SharedStore {
    inner: Arc<Mutex<CategoryStore>>,
}

fn shared_store() -> &'static SharedStore {
    static INSTANCE: OnceLock<SharedStore> = OnceLock::new();
    INSTANCE.get_or_init(|| {
        let store = load_store().unwrap_or_default();
        SharedStore {
            inner: Arc::new(Mutex::new(store)),
        }
    })
}

fn store_path() -> std::path::PathBuf {
    // Use the same config dir as the activity tracker
    let mut path = crate::monitor::get_config_dir();
    path.push("categories.json");
    path
}

fn load_store() -> Option<CategoryStore> {
    let path = store_path();
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str::<CategoryStore>(&content).ok()
}

fn persist_store(store: &CategoryStore) {
    let path = store_path();
    if let Ok(json) = serde_json::to_string_pretty(store) {
        let _ = std::fs::write(&path, json);
    }
}

// ------------------------------------------------------------------
// Public category API
// ------------------------------------------------------------------

pub fn get_categories() -> Vec<Category> {
    shared_store()
        .inner
        .lock()
        .map(|s| s.categories.clone())
        .unwrap_or_default()
}

pub fn add_category(name: String, color: String) -> Category {
    let store = shared_store();
    let mut guard = store.inner.lock().expect("category store poisoned");
    let id = format!("cat_{}_{}",
        chrono::Local::now().timestamp_millis(),
        rand_hex(4));
    let cat = Category {
        id: id.clone(),
        name: name.trim().to_string(),
        color,
    };
    guard.categories.push(cat.clone());
    persist_store(&guard);
    cat
}

pub fn update_category(id: String, name: Option<String>, color: Option<String>) -> bool {
    let store = shared_store();
    let mut guard = store.inner.lock().expect("category store poisoned");
    if let Some(cat) = guard.categories.iter_mut().find(|c| c.id == id) {
        if let Some(n) = name {
            cat.name = n.trim().to_string();
        }
        if let Some(c) = color {
            cat.color = c;
        }
        persist_store(&guard);
        true
    } else {
        false
    }
}

pub fn delete_category(id: String) -> bool {
    let store = shared_store();
    let mut guard = store.inner.lock().expect("category store poisoned");
    let before = guard.categories.len();
    guard.categories.retain(|c| c.id != id);
    // Also clear this category from assignments
    for a in guard.assignments.iter_mut() {
        if a.category_id.as_deref() == Some(id.as_str()) {
            a.category_id = None;
        }
    }
    let changed = guard.categories.len() != before;
    if changed {
        persist_store(&guard);
    }
    changed
}

// ------------------------------------------------------------------
// Public assignment API
// ------------------------------------------------------------------

pub fn get_assignments() -> Vec<AppAssignment> {
    shared_store()
        .inner
        .lock()
        .map(|s| s.assignments.clone())
        .unwrap_or_default()
}

/// Build a quick lookup map from process_name -> (category_id, alias)
pub fn get_assignment_map() -> HashMap<String, (Option<String>, Option<String>)> {
    let store = shared_store();
    let guard = match store.inner.lock() {
        Ok(g) => g,
        Err(_) => return HashMap::new(),
    };
    let mut map = HashMap::new();
    for a in &guard.assignments {
        map.insert(a.process_name.to_lowercase(),
                   (a.category_id.clone(), a.alias.clone()));
    }
    map
}

pub fn set_app_category(process_name: String, category_id: Option<String>) {
    let store = shared_store();
    let mut guard = store.inner.lock().expect("category store poisoned");
    let key = process_name.trim().to_string();
    if let Some(existing) = guard.assignments.iter_mut()
        .find(|a| a.process_name == key)
    {
        existing.category_id = category_id;
    } else {
        guard.assignments.push(AppAssignment {
            process_name: key,
            category_id,
            alias: None,
        });
    }
    persist_store(&guard);
}

pub fn set_app_alias(process_name: String, alias: Option<String>) {
    let store = shared_store();
    let mut guard = store.inner.lock().expect("category store poisoned");
    let key = process_name.trim().to_string();
    if let Some(existing) = guard.assignments.iter_mut()
        .find(|a| a.process_name == key)
    {
        existing.alias = alias.clone().filter(|s| !s.trim().is_empty());
    } else {
        guard.assignments.push(AppAssignment {
            process_name: key,
            category_id: None,
            alias: alias.filter(|s| !s.trim().is_empty()),
        });
    }
    persist_store(&guard);
}

pub fn remove_app_assignment(process_name: String) {
    let store = shared_store();
    let mut guard = store.inner.lock().expect("category store poisoned");
    let key = process_name.trim().to_string();
    guard.assignments.retain(|a| a.process_name != key);
    persist_store(&guard);
}

/// Atomically replace the entire store with an upstream snapshot.
/// Used when pulling categories from the cloud server.
pub fn replace_store(
    categories: Vec<Category>,
    assignments: Vec<AppAssignment>,
) {
    let store = shared_store();
    let mut guard = store.inner.lock().expect("category store poisoned");
    guard.categories = categories;
    guard.assignments = assignments;
    persist_store(&guard);
}

// ------------------------------------------------------------------
// Helpers for building category-aware bar data
// ------------------------------------------------------------------

/// One segment of a stacked bar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BarSegment {
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub category_color: Option<String>,
    pub secs: u64,
}

/// A single bar entry with per-category breakdown.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryBarEntry {
    pub label: String,
    pub total_secs: u64,
    /// Segments are ordered from biggest to smallest.
    pub segments: Vec<BarSegment>,
}

/// Build category-aware bar data for the given range and offset.
///
/// This mirrors the logic in `ActivityTracker::get_bar_data_offset` but
/// additionally splits each bar into per-category segments based on each
/// activity entry's process_name.
pub fn build_category_bar_data(
    tracker: &crate::monitor::ActivityTracker,
    range: &str,
    offset_days: u32,
) -> Vec<CategoryBarEntry> {
    let assignment_map = get_assignment_map();
    let categories = get_categories();
    let cat_lookup: HashMap<String, Category> = categories
        .iter()
        .map(|c| (c.id.clone(), c.clone()))
        .collect();

    // Collect per-process durations for each time bucket.
    let mut buckets: Vec<(String, HashMap<String, u64>)> = Vec::new();
    let today = chrono::Local::now().date_naive()
        - chrono::Duration::days(offset_days as i64);

    match range {
        "day" => {
            // 24 hourly buckets for the reference day
            for hour in 0..24 {
                let key = format!("{:02}:00", hour);
                let per_app = tracker.get_hourly_app_stats_for_date(today, hour);
                let mut proc_secs = HashMap::new();
                for (proc, secs) in per_app {
                    *proc_secs.entry(proc).or_insert(0) += secs;
                }
                buckets.push((key, proc_secs));
            }
        }
        "week" => {
            // Monday through Sunday for the reference week
            let weekday = today.weekday().num_days_from_monday();
            let monday = today - chrono::Duration::days(weekday as i64);
            let labels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
            for i in 0..7 {
                let date = monday + chrono::Duration::days(i);
                let per_app = tracker.get_daily_app_stats_for_date(date);
                let mut proc_secs = HashMap::new();
                for (proc, secs) in per_app {
                    *proc_secs.entry(proc).or_insert(0) += secs;
                }
                buckets.push((labels[i as usize].to_string(), proc_secs));
            }
        }
        "month" => {
            // Daily entries for the reference month
            let year = today.year();
            let month = today.month();
            let days_in_month = crate::monitor::get_days_in_month(year, month);
            for day in 1..=days_in_month {
                if let Some(date) = chrono::NaiveDate::from_ymd_opt(year, month, day) {
                    let per_app = tracker.get_daily_app_stats_for_date(date);
                    let mut proc_secs = HashMap::new();
                    for (proc, secs) in per_app {
                        *proc_secs.entry(proc).or_insert(0) += secs;
                    }
                    buckets.push((day.to_string(), proc_secs));
                }
            }
        }
        "year" => {
            // Monthly buckets for the reference year
            let year = today.year();
            let month_names = ["1月", "2月", "3月", "4月", "5月", "6月",
                               "7月", "8月", "9月", "10月", "11月", "12月"];
            for m in 1..=12 {
                let days_in_month = crate::monitor::get_days_in_month(year, m);
                let mut proc_secs = HashMap::new();
                for d in 1..=days_in_month {
                    if let Some(date) = chrono::NaiveDate::from_ymd_opt(year, m, d) {
                        let per_app = tracker.get_daily_app_stats_for_date(date);
                        for (proc, secs) in per_app {
                            *proc_secs.entry(proc).or_insert(0) += secs;
                        }
                    }
                }
                buckets.push((month_names[(m - 1) as usize].to_string(), proc_secs));
            }
        }
        _ => {
            // Default: 7 daily bars centred on today
            for i in 0..7 {
                let date = today + chrono::Duration::days(i as i64 - 6);
                let per_app = tracker.get_daily_app_stats_for_date(date);
                let mut proc_secs = HashMap::new();
                for (proc, secs) in per_app {
                    *proc_secs.entry(proc).or_insert(0) += secs;
                }
                buckets.push((date.format("%m-%d").to_string(), proc_secs));
            }
        }
    }

    // Now reduce each bucket into category segments.
    buckets
        .into_iter()
        .map(|(label, proc_map)| {
            let mut cat_secs: HashMap<Option<String>, u64> = HashMap::new();
            for (proc, secs) in proc_map {
                let key = assignment_map
                    .get(&proc.to_lowercase())
                    .and_then(|(cat, _)| cat.clone());
                *cat_secs.entry(key).or_insert(0) += secs;
            }
            let total_secs: u64 = cat_secs.values().sum();

            // Build segments: first categories (ordered by size), then uncategorized.
            let mut cat_entries: Vec<(String, u64)> = cat_secs
                .iter()
                .filter_map(|(k, v)| k.as_ref().map(|id| (id.clone(), *v)))
                .collect();
            cat_entries.sort_by(|a, b| b.1.cmp(&a.1));

            let mut segments: Vec<BarSegment> = cat_entries
                .into_iter()
                .map(|(cat_id, secs)| {
                    let cat = cat_lookup.get(&cat_id);
                    BarSegment {
                        category_id: Some(cat_id),
                        category_name: cat.map(|c| c.name.clone()),
                        category_color: cat.map(|c| c.color.clone()),
                        secs,
                    }
                })
                .collect();

            let uncategorized = cat_secs.get(&None).copied().unwrap_or(0);
            if uncategorized > 0 {
                segments.push(BarSegment {
                    category_id: None,
                    category_name: Some("未分类".to_string()),
                    category_color: Some("#94a3b8".to_string()),
                    secs: uncategorized,
                });
            }

            CategoryBarEntry {
                label,
                total_secs,
                segments,
            }
        })
        .collect()
}

fn rand_hex(n: usize) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("{:0w$x}", nanos, w = n)
}

// ------------------------------------------------------------------
// Tauri commands — thin wrappers around the shared store
// ------------------------------------------------------------------

#[tauri::command]
pub fn cmd_get_categories() -> Vec<Category> {
    get_categories()
}

#[tauri::command]
pub fn cmd_add_category(name: String, color: String) -> Category {
    add_category(name, color)
}

#[tauri::command]
pub fn cmd_update_category(id: String, name: Option<String>, color: Option<String>) -> bool {
    update_category(id, name, color)
}

#[tauri::command]
pub fn cmd_delete_category(id: String) -> bool {
    delete_category(id)
}

#[tauri::command]
pub fn cmd_get_assignments() -> Vec<AppAssignment> {
    get_assignments()
}

#[tauri::command]
pub fn cmd_set_app_category(process_name: String, category_id: Option<String>) {
    set_app_category(process_name, category_id)
}

#[tauri::command]
pub fn cmd_set_app_alias(process_name: String, alias: Option<String>) {
    set_app_alias(process_name, alias)
}

#[tauri::command]
pub fn cmd_remove_app_assignment(process_name: String) {
    remove_app_assignment(process_name)
}

#[tauri::command]
pub fn cmd_replace_categories_store(
    categories: Vec<Category>,
    assignments: Vec<AppAssignment>,
) {
    replace_store(categories, assignments);
}
