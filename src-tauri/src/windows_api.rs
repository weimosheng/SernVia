use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;

#[link(name = "user32")]
extern "system" {
    fn GetForegroundWindow() -> *mut std::ffi::c_void;
    fn GetWindowTextW(hwnd: *mut std::ffi::c_void, lpString: *mut u16, nMaxCount: i32) -> i32;
    fn GetClassNameW(hwnd: *mut std::ffi::c_void, lpClassName: *mut u16, nMaxCount: i32) -> i32;
    fn GetWindowThreadProcessId(hwnd: *mut std::ffi::c_void, lpdwProcessId: *mut u32) -> u32;
    fn ExtractIconExW(lpExeFileName: *const u16, nIconIndex: i32, phiconLarge: *mut *mut std::ffi::c_void, phiconSmall: *mut *mut std::ffi::c_void, nIcons: u32) -> u32;
    fn DestroyIcon(hIcon: *mut std::ffi::c_void) -> i32;
    fn DrawIconEx(hdc: *mut std::ffi::c_void, xLeft: i32, yTop: i32, hIcon: *mut std::ffi::c_void, cxWidth: i32, cyHeight: i32, istepIfAniCur: u32, hbrFlickerFreeDraw: *mut std::ffi::c_void, diFlags: u32) -> i32;
    fn GetDC(hwnd: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn ReleaseDC(hwnd: *mut std::ffi::c_void, hdc: *mut std::ffi::c_void) -> i32;
}

#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(desired_access: u32, inherit_handle: i32, process_id: u32) -> *mut std::ffi::c_void;
    fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
    fn GetCurrentProcess() -> *mut std::ffi::c_void;
}

#[link(name = "gdi32")]
extern "system" {
    fn CreateCompatibleDC(hdc: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn CreateCompatibleBitmap(hdc: *mut std::ffi::c_void, nWidth: i32, nHeight: i32) -> *mut std::ffi::c_void;
    fn SelectObject(hdc: *mut std::ffi::c_void, hgdiobj: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn DeleteDC(hdc: *mut std::ffi::c_void) -> i32;
    fn DeleteObject(hObject: *mut std::ffi::c_void) -> i32;
    fn GetDIBits(hdc: *mut std::ffi::c_void, hbmp: *mut std::ffi::c_void, uStartScan: u32, cScanLines: u32, lpvBits: *mut std::ffi::c_void, lpbi: *mut BITMAPINFO, usage: u32) -> i32;
}

#[link(name = "psapi")]
extern "system" {
    fn GetModuleFileNameExW(hProcess: *mut std::ffi::c_void, hModule: *mut std::ffi::c_void, lpFilename: *mut u16, nSize: u32) -> u32;
    fn EnumProcesses(pProcessIds: *mut u32, cb: u32, pBytesReturned: *mut u32) -> i32;
}

#[link(name = "advapi32")]
extern "system" {
    fn OpenProcessToken(ProcessHandle: *mut std::ffi::c_void, DesiredAccess: u32, TokenHandle: *mut *mut std::ffi::c_void) -> i32;
    fn GetTokenInformation(TokenHandle: *mut std::ffi::c_void, TokenInformationClass: i32, TokenInformation: *mut std::ffi::c_void, ReturnLength: u32, ReturnLengthPtr: *mut u32) -> i32;
}

// Windows API constants
const PROCESS_QUERY_INFORMATION: u32 = 0x0400;
const PROCESS_VM_READ: u32 = 0x0010;
const DI_NORMAL: u32 = 0x0003;
const DIB_RGB_COLORS: u32 = 0;
const BI_RGB: u32 = 0;
const TOKEN_QUERY: u32 = 0x0008;
const TOKEN_ELEVATION_TYPE: i32 = 20;

// Windows API types - using original Windows naming conventions
#[repr(C)]
#[allow(non_snake_case)]
struct BITMAPINFOHEADER {
    biSize: u32,
    biWidth: i32,
    biHeight: i32,
    biPlanes: u16,
    biBitCount: u16,
    biCompression: u32,
    biSizeImage: u32,
    biXPelsPerMeter: i32,
    biYPelsPerMeter: i32,
    biClrUsed: u32,
    biClrImportant: u32,
}

#[repr(C)]
#[allow(non_snake_case)]
struct BITMAPINFO {
    bmiHeader: BITMAPINFOHEADER,
    bmiColors: [u32; 1],
}

#[repr(C)]
#[allow(non_snake_case)]
struct TOKEN_ELEVATION {
    TokenIsElevated: u32,
}

/// Get the currently focused window information
pub fn get_foreground_window_info() -> Option<(String, String, String)> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }

        // Get window title
        let title = get_window_text(hwnd)?;
        
        // Get window class name
        let class_name = get_window_class(hwnd)?;
        
        // Get process name
        let process_name = get_process_name(hwnd).unwrap_or_else(|| {
            let lower = class_name.to_lowercase();
            if lower.starts_with("hwndwrapper") || lower.starts_with("windows") || lower.starts_with("application") {
                "unknown.exe".to_string()
            } else {
                class_name.clone()
            }
        });

        Some((title, class_name, process_name))
    }
}

unsafe fn get_window_text(hwnd: *mut std::ffi::c_void) -> Option<String> {
    let mut buffer = [0u16; 1024];
    let len = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
    if len > 0 {
        let text = String::from_utf16_lossy(&buffer[..len as usize]);
        if !text.is_empty() {
            return Some(text);
        }
    }
    None
}

unsafe fn get_window_class(hwnd: *mut std::ffi::c_void) -> Option<String> {
    let mut buffer = [0u16; 256];
    let len = GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
    if len > 0 {
        let class = String::from_utf16_lossy(&buffer[..len as usize]);
        return Some(class);
    }
    None
}

unsafe fn get_process_name(hwnd: *mut std::ffi::c_void) -> Option<String> {
    let mut pid: u32 = 0;
    let _ = GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == 0 {
        return None;
    }

    let handle = OpenProcess(PROCESS_QUERY_INFORMATION, 0, pid);
    if handle.is_null() {
        return None;
    }

    let mut buffer = [0u16; 512];
    let result = GetModuleFileNameExW(handle, std::ptr::null_mut(), buffer.as_mut_ptr(), buffer.len() as u32);
    
    let _ = CloseHandle(handle);
    
    if result > 0 {
        let path = OsString::from_wide(&buffer[..result as usize]);
        if let Ok(path_str) = path.into_string() {
            if let Some(filename) = std::path::Path::new(&path_str).file_name() {
                return Some(filename.to_string_lossy().to_lowercase());
            }
            return Some(path_str.to_lowercase());
        }
    }
    
    None
}

/// Extract app icon as base64 PNG for a given process name
pub fn extract_app_icon(process_name: &str) -> Option<String> {
    // First try to find a running process
    if let Some(path) = get_process_path_by_name(process_name) {
        if let Some(icon) = extract_icon_from_path(&path) {
            return Some(icon);
        }
    }
    
    // If process not found, try to find executable in system paths
    if let Some(path) = find_executable_in_paths(process_name) {
        if let Some(icon) = extract_icon_from_path(&path) {
            return Some(icon);
        }
    }
    
    // If all else fails, try to extract icon from registry
    if let Some(path) = get_program_path_from_registry(process_name) {
        if let Some(icon) = extract_icon_from_path(&path) {
            return Some(icon);
        }
    }
    
    None
}

/// Try to find executable in common system paths
fn find_executable_in_paths(process_name: &str) -> Option<std::path::PathBuf> {
    let name = process_name.trim_end_matches(".exe");
    
    let paths_to_check = vec![
        std::path::PathBuf::from(format!("C:\\Program Files\\{}", name)),
        std::path::PathBuf::from(format!("C:\\Program Files (x86)\\{}", name)),
        std::path::PathBuf::from(format!("C:\\Windows\\System32\\{}", process_name)),
        std::path::PathBuf::from(format!("C:\\Windows\\{}", process_name)),
    ];
    
    for path in paths_to_check {
        if path.exists() {
            return Some(path);
        }
        
        // Try with .exe extension
        let exe_path = path.with_extension("exe");
        if exe_path.exists() {
            return Some(exe_path);
        }
    }
    
    None
}

/// Get program path from Windows registry
#[cfg(windows)]
fn get_program_path_from_registry(process_name: &str) -> Option<std::path::PathBuf> {
    #[link(name = "advapi32")]
    extern "system" {
        fn RegOpenKeyExW(hKey: *mut std::ffi::c_void, lpSubKey: *const u16, ulOptions: u32, samDesired: u32, phkResult: *mut *mut std::ffi::c_void) -> i32;
        fn RegQueryValueExW(hKey: *mut std::ffi::c_void, lpValueName: *const u16, lpReserved: *mut u32, lpType: *mut u32, lpData: *mut u8, lpcbData: *mut u32) -> i32;
        fn RegCloseKey(hKey: *mut std::ffi::c_void) -> i32;
    }
    
    const HKEY_LOCAL_MACHINE: u32 = 0x80000002;
    const KEY_READ: u32 = 0x00020019;
    const REG_SZ: u32 = 1;
    
    let name = process_name.trim_end_matches(".exe");
    
    // Check both 32-bit and 64-bit registry paths
    let paths = vec![
        format!("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}", name),
        format!("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\{}", process_name),
        format!("SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}", name),
    ];
    
    for path in paths {
        let wide_path: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        let mut hkey: *mut std::ffi::c_void = std::ptr::null_mut();
        
        unsafe {
            if RegOpenKeyExW(HKEY_LOCAL_MACHINE as *mut _, wide_path.as_ptr(), 0, KEY_READ, &mut hkey) == 0 {
                let display_name: Vec<u16> = "DisplayIcon".encode_utf16().chain(std::iter::once(0)).collect();
                let mut data_type: u32 = 0;
                let mut data_size: u32 = 512;
                let mut data: Vec<u8> = vec![0u8; 512];
                
                if RegQueryValueExW(hkey, display_name.as_ptr(), std::ptr::null_mut(), &mut data_type, data.as_mut_ptr(), &mut data_size) == 0 {
                    if data_type == REG_SZ && data_size > 0 {
                        let chars = data_size as usize / 2;
                        let path_chars: Vec<u16> = data[..data_size as usize].chunks(2)
                            .map(|chunk| u16::from_le_bytes([chunk[0], chunk.get(1).copied().unwrap_or(0)]))
                            .take(chars.saturating_sub(1))
                            .collect();
                        
                        let path_str = String::from_utf16_lossy(&path_chars);
                        
                        // Remove quotes and get executable path
                        let clean_path = path_str.trim_matches('"');
                        let path = std::path::PathBuf::from(clean_path);
                        
                        // If it's a path, return the executable
                        if path.exists() {
                            RegCloseKey(hkey);
                            return Some(if path.is_file() {
                                path
                            } else {
                                path.join(process_name)
                            });
                        } else if path.parent().map(|p| p.exists()).unwrap_or(false) {
                            RegCloseKey(hkey);
                            return Some(path.parent().unwrap().join(process_name));
                        }
                    }
                }
                
                let install_location: Vec<u16> = "InstallLocation".encode_utf16().chain(std::iter::once(0)).collect();
                let mut data_type: u32 = 0;
                let mut data_size: u32 = 512;
                let mut data: Vec<u8> = vec![0u8; 512];
                
                if RegQueryValueExW(hkey, install_location.as_ptr(), std::ptr::null_mut(), &mut data_type, data.as_mut_ptr(), &mut data_size) == 0 {
                    if data_type == REG_SZ && data_size > 0 {
                        let chars = data_size as usize / 2;
                        let path_chars: Vec<u16> = data[..data_size as usize].chunks(2)
                            .map(|chunk| u16::from_le_bytes([chunk[0], chunk.get(1).copied().unwrap_or(0)]))
                            .take(chars.saturating_sub(1))
                            .collect();
                        
                        let install_path = String::from_utf16_lossy(&path_chars);
                        let exe_path = std::path::PathBuf::from(install_path.trim_matches('"')).join(process_name);
                        
                        if exe_path.exists() {
                            RegCloseKey(hkey);
                            return Some(exe_path);
                        }
                    }
                }
                
                RegCloseKey(hkey);
            }
        }
    }
    
    None
}

/// Find a running process by name and get its full executable path
pub fn get_process_path_by_name(process_name: &str) -> Option<std::path::PathBuf> {
    let target_name = process_name.trim_end_matches(".exe");

    unsafe {
        let mut size: u32 = 1024;
        loop {
            let elem_size = std::mem::size_of::<u32>() as u32;
            let byte_size = size * elem_size;
            let mut pids: Vec<u32> = vec![0u32; size as usize];
            let mut bytes_returned: u32 = 0;

            if EnumProcesses(pids.as_mut_ptr(), byte_size, &mut bytes_returned) == 0 {
                return None;
            }

            let count = (bytes_returned / elem_size) as usize;

            if count < pids.len() {
                for &pid in &pids[..count] {
                    if pid == 0 {
                        continue;
                    }

                    let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);

                    if !handle.is_null() {
                        let mut buffer = [0u16; 1024];
                        let len = GetModuleFileNameExW(handle, std::ptr::null_mut(), buffer.as_mut_ptr(), buffer.len() as u32);
                        let _ = CloseHandle(handle);

                        if len > 0 {
                            let path = OsString::from_wide(&buffer[..len as usize]);
                            let path_buf = std::path::PathBuf::from(&path);

                            if let Some(file_name) = path_buf.file_stem() {
                                if file_name.to_string_lossy().to_ascii_lowercase() == target_name {
                                    return Some(path_buf);
                                }
                            }
                        }
                    }
                }
                return None;
            }

            size = size.saturating_mul(2);
            if size > 65536 {
                return None;
            }
        }
    }
}

fn extract_icon_from_path(path: &std::path::Path) -> Option<String> {
    let path_str = path.to_string_lossy();
    
    // Check if file exists
    if !path.exists() {
        return None;
    }
    
    let wide: Vec<u16> = path_str.encode_utf16().chain(std::iter::once(0)).collect();
    
    unsafe {
        let mut hicon_small: *mut std::ffi::c_void = std::ptr::null_mut();
        let mut hicon_large: *mut std::ffi::c_void = std::ptr::null_mut();
        
        let extracted = ExtractIconExW(wide.as_ptr(), 0, &mut hicon_large, &mut hicon_small, 1);
        
        // If no icon found, try with icon index -1 (might work for some files)
        if extracted == 0 {
            let extracted = ExtractIconExW(wide.as_ptr(), -1, &mut hicon_large, &mut hicon_small, 1);
            if extracted == 0 {
                return create_default_icon();
            }
        }
        
        let hicon = if !hicon_large.is_null() {
            hicon_large
        } else if !hicon_small.is_null() {
            hicon_small
        } else {
            return create_default_icon();
        };
        
        let width: i32 = 48;
        let height: i32 = 48;
        
        let null_hwnd: *mut std::ffi::c_void = std::ptr::null_mut();
        let hdc_screen = GetDC(null_hwnd);
        if hdc_screen.is_null() {
            return None;
        }
        
        let hdc = CreateCompatibleDC(hdc_screen);
        if hdc.is_null() {
            let _ = ReleaseDC(null_hwnd, hdc_screen);
            return None;
        }
        
        let hbmp = CreateCompatibleBitmap(hdc_screen, width, height);
        if hbmp.is_null() {
            let _ = DeleteDC(hdc);
            let _ = ReleaseDC(null_hwnd, hdc_screen);
            return None;
        }
        
        let _ = SelectObject(hdc, hbmp);
        
        let _ = DrawIconEx(hdc, 0, 0, hicon, width, height, 0, std::ptr::null_mut(), DI_NORMAL);
        
        let row_size = ((width * 32 + 31) / 32) * 4;
        let data_size = (row_size * height) as usize;
        let mut pixels: Vec<u8> = vec![0u8; data_size];
        
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [0],
        };
        
        let result = GetDIBits(hdc, hbmp, 0, height as u32, pixels.as_mut_ptr() as *mut std::ffi::c_void, &mut bmi, DIB_RGB_COLORS);
        
        let _ = DeleteObject(hbmp as *mut _);
        let _ = DeleteDC(hdc);
        let _ = ReleaseDC(null_hwnd, hdc_screen);
        let _ = DestroyIcon(hicon);
        
        if result == 0 {
            return None;
        }
        
        let mut rgba_pixels = Vec::with_capacity((width * height * 4) as usize);
        for y in 0..height {
            for x in 0..width {
                let idx = (y * row_size + x * 4) as usize;
                if idx + 3 < pixels.len() {
                    let b = pixels[idx];
                    let g = pixels[idx + 1];
                    let r = pixels[idx + 2];
                    let a = pixels[idx + 3];
                    rgba_pixels.push(r);
                    rgba_pixels.push(g);
                    rgba_pixels.push(b);
                    rgba_pixels.push(a);
                }
            }
        }
        
        use image::{ImageBuffer, Rgba};
        let img = ImageBuffer::<Rgba<u8>, _>::from_raw(width as u32, height as u32, rgba_pixels)?;
        let mut png_bytes = std::io::Cursor::new(Vec::new());
        img.write_to(&mut png_bytes, image::ImageFormat::Png).ok()?;
        
        use base64::Engine;
        let base64_str = base64::engine::general_purpose::STANDARD.encode(png_bytes.into_inner());
        
        Some(base64_str)
    }
}

/// Check if the current process is running as administrator
pub fn is_running_as_admin() -> bool {
    unsafe {
        let mut token_handle: *mut std::ffi::c_void = std::ptr::null_mut();
        let current_process = GetCurrentProcess();
        
        if OpenProcessToken(current_process, TOKEN_QUERY, &mut token_handle) == 0 {
            return false;
        }

        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut return_length: u32 = 0;
        
        let success = GetTokenInformation(
            token_handle,
            TOKEN_ELEVATION_TYPE,
            &mut elevation as *mut _ as *mut std::ffi::c_void,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut return_length,
        ) != 0;

        let _ = CloseHandle(token_handle);

        success && elevation.TokenIsElevated != 0
    }
}

/// Create a simple default icon (gray square with application symbol)
fn create_default_icon() -> Option<String> {
    let size = 48;
    let mut pixels = Vec::with_capacity(size * size * 4);
    
    // Create a simple gray square with a white border
    for y in 0..size {
        for x in 0..size {
            let border = x == 0 || x == size - 1 || y == 0 || y == size - 1;
            let inner = x >= 8 && x < size - 8 && y >= 8 && y < size - 8;
            
            let (r, g, b, a) = if border {
                (200, 200, 200, 255) // Light gray border
            } else if inner {
                // Create a simple app icon pattern
                let center_x = size / 2;
                let center_y = size / 2;
                let dx = (x as i32 - center_x as i32).abs();
                let dy = (y as i32 - center_y as i32).abs();
                
                if dx < 10 && dy < 12 {
                    (100, 100, 100, 255) // Dark gray application icon
                } else {
                    (240, 240, 240, 255) // Light gray background
                }
            } else {
                (220, 220, 220, 255) // Medium gray
            };
            
            pixels.push(r);
            pixels.push(g);
            pixels.push(b);
            pixels.push(a);
        }
    }
    
    use image::{ImageBuffer, Rgba, ImageFormat};
    use std::io::Cursor;
    
    let img = ImageBuffer::<Rgba<u8>, _>::from_raw(size as u32, size as u32, pixels)?;
    let mut png_bytes = Cursor::new(Vec::new());
    img.write_to(&mut png_bytes, ImageFormat::Png).ok()?;
    
    use base64::Engine;
    let base64_str = base64::engine::general_purpose::STANDARD.encode(png_bytes.into_inner());
    
    Some(base64_str)
}
