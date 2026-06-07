export interface CurrentActivity {
  app_name: string;
  window_title: string;
  is_browser: boolean;
  browser_domain: string | null;
  active_seconds: number;
}

export interface AppStats {
  name: string;
  process_name: string;
  total_secs: number;
  session_count: number;
}

export interface BrowserStats {
  domain: string;
  title: string;
  total_secs: number;
}

export interface ActivityEntry {
  app_name: string;
  process_name: string;
  window_title: string;
  is_browser: boolean;
  browser_domain: string | null;
  start_time: number;
  end_time: number;
  duration_secs: number;
}

export interface ActivityData {
  date: string;
  total_active_secs: number;
  apps: AppStats[];
  browsers: BrowserStats[];
  history: ActivityEntry[];
}

export interface WeekData {
  total_active_secs: number;
  days: { date: string; total_secs: number }[];
  apps: AppStats[];
  browsers: BrowserStats[];
}

export interface BarEntry {
  label: string;
  total_secs: number;
}

export interface AppTimeStats {
  app_name: string;
  process_name: string;
  day_secs: number;
  week_secs: number;
  month_secs: number;
  year_secs: number;
  day_total_secs: number;
  week_total_secs: number;
  month_total_secs: number;
  year_total_secs: number;
}
