use windows::Win32::Foundation::{HWND, CloseHandle};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextW, GetClassNameW, GetWindowThreadProcessId,
    DrawIconEx, DI_NORMAL, DestroyIcon, HICON,
};
use windows::Win32::UI::Shell::ExtractIconExW;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateCompatibleBitmap, SelectObject, DeleteDC, DeleteObject,
    GetDIBits, GetDC, ReleaseDC, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS,
};
use windows::Win32::System::Threading::OpenProcess;
use windows::Win32::System::Threading::PROCESS_QUERY_INFORMATION;
use windows::Win32::System::Threading::PROCESS_VM_READ;
use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;

use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;

/// Get the currently focused window information
pub fn get_foreground_window_info() -> Option<(String, String, String)> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0 == std::ptr::null_mut() {
            return None;
        }

        // Get window title
        let title = get_window_text(hwnd)?;
        
        // Get window class name
        let class_name = get_window_class(hwnd)?;
        
        // Get process name
        let process_name = get_process_name(hwnd).unwrap_or_else(|| {
            // Fallback: try to extract something meaningful from the class name
            // Class names like "HwndWrapper[SomeApp.exe;...]" are useless as app names
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

unsafe fn get_window_text(hwnd: HWND) -> Option<String> {
    let mut buffer = [0u16; 1024];
    let len = GetWindowTextW(hwnd, &mut buffer);
    if len > 0 {
        let text = String::from_utf16_lossy(&buffer[..len as usize]);
        if !text.is_empty() {
            return Some(text);
        }
    }
    None
}

unsafe fn get_window_class(hwnd: HWND) -> Option<String> {
    let mut buffer = [0u16; 256];
    let len = GetClassNameW(hwnd, &mut buffer);
    if len > 0 {
        let class = String::from_utf16_lossy(&buffer[..len as usize]);
        return Some(class);
    }
    None
}

unsafe fn get_process_name(hwnd: HWND) -> Option<String> {
    let mut pid: u32 = 0;
    let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == 0 {
        return None;
    }

    let handle = OpenProcess(PROCESS_QUERY_INFORMATION, false, pid);
    if let Ok(handle) = handle {
        if handle.is_invalid() {
            return None;
        }

        let mut buffer = [0u16; 512];
        let result = GetModuleFileNameExW(handle, None, &mut buffer);
        
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
    }
    
    None
}

/// Extract app icon as base64 PNG for a given process name
/// Uses Windows Toolhelp API to find the process by name and get its full exe path,
/// then extracts the icon directly from the executable file.
pub fn extract_app_icon(process_name: &str) -> Option<String> {
    let path = get_process_path_by_name(process_name)?;
    extract_icon_from_path(&path)
}

/// Find a running process by name and get its full executable path
/// using Windows EnumProcesses API.
pub fn get_process_path_by_name(process_name: &str) -> Option<std::path::PathBuf> {
    use windows::Win32::System::ProcessStatus::EnumProcesses;

    let target_name = process_name.trim_end_matches(".exe");

    unsafe {
        // Start with a reasonable buffer size and retry if needed
        let mut size: u32 = 1024;
        loop {
            let elem_size = std::mem::size_of::<u32>() as u32;
            let byte_size = size * elem_size;
            let mut pids: Vec<u32> = vec![0u32; size as usize];
            let mut bytes_returned: u32 = 0;

            if EnumProcesses(pids.as_mut_ptr(), byte_size, &mut bytes_returned).is_err() {
                return None;
            }

            let count = (bytes_returned / elem_size) as usize;

            if count < pids.len() {
                // Buffer was large enough, search through PIDs
                for &pid in &pids[..count] {
                    if pid == 0 {
                        continue;
                    }

                    let handle = OpenProcess(
                        PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                        false,
                        pid,
                    );

                    if let Ok(handle) = handle {
                        if !handle.is_invalid() {
                            let mut buffer = [0u16; 1024];
                            let len = GetModuleFileNameExW(handle, None, &mut buffer);
                            let _ = CloseHandle(handle);

                            if len > 0 {
                                let path = OsString::from_wide(&buffer[..len as usize]);
                                let path_buf = std::path::PathBuf::from(&path);

                                // Compare filename (case-insensitive)
                                if let Some(file_name) = path_buf.file_stem() {
                                    if file_name.to_string_lossy().to_ascii_lowercase() == target_name {
                                        return Some(path_buf);
                                    }
                                }
                            }
                        }
                    }
                }
                return None;
            }

            // Buffer too small, double and retry
            size = size.saturating_mul(2);
            if size > 65536 {
                return None; // Safety limit
            }
        }
    }
}

fn extract_icon_from_path(path: &std::path::Path) -> Option<String> {
    let path_str = path.to_string_lossy();
    let wide: Vec<u16> = path_str.encode_utf16().chain(std::iter::once(0)).collect();
    
    unsafe {
        let mut hicon_small = HICON::default();
        let mut hicon_large = HICON::default();
        
        let _extracted = ExtractIconExW(
            windows::core::PCWSTR(wide.as_ptr()),
            0,
            Some(&mut hicon_large as *mut HICON),
            Some(&mut hicon_small as *mut HICON),
            1,
        );
        
        // Prefer large icon for better quality, fall back to small
        let hicon = if !hicon_large.is_invalid() {
            hicon_large
        } else if !hicon_small.is_invalid() {
            hicon_small
        } else {
            return None;
        };
        
        // Use higher resolution for crisp display (48x48 is a standard icon size)
        let width: i32 = 48;
        let height: i32 = 48;
        
        // Get screen DC (null HWND = screen)
        let null_hwnd = HWND::default();
        let hdc_screen = GetDC(null_hwnd);
        if hdc_screen.is_invalid() {
            return None;
        }
        
        let hdc = CreateCompatibleDC(hdc_screen);
        if hdc.is_invalid() {
            let _ = ReleaseDC(null_hwnd, hdc_screen);
            return None;
        }
        
        let hbmp = CreateCompatibleBitmap(hdc_screen, width, height);
        if hbmp.is_invalid() {
            let _ = DeleteDC(hdc);
            let _ = ReleaseDC(null_hwnd, hdc_screen);
            return None;
        }
        
        let _ = SelectObject(hdc, hbmp);
        
        // Draw the icon
        let _ = DrawIconEx(
            hdc,
            0, 0,
            hicon,
            width, height,
            0,
            None,
            DI_NORMAL,
        );
        
        // Get pixel data
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
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [Default::default()],
        };
        
        let result = GetDIBits(
            hdc,
            hbmp,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmi as *mut BITMAPINFO,
            DIB_RGB_COLORS,
        );
        
        // Cleanup
        let _ = DeleteObject(hbmp);
        let _ = DeleteDC(hdc);
        let _ = ReleaseDC(null_hwnd, hdc_screen);
        let _ = DestroyIcon(hicon);
        
        if result == 0 {
            return None;
        }
        
        // Convert BGRA to RGBA and encode as PNG
        // First, convert BGRA -> RGBA
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
        
        // Encode as PNG using image crate
        use image::{ImageBuffer, Rgba};
        let img = ImageBuffer::<Rgba<u8>, _>::from_raw(width as u32, height as u32, rgba_pixels)?;
        let mut png_bytes = std::io::Cursor::new(Vec::new());
        img.write_to(&mut png_bytes, image::ImageFormat::Png).ok()?;
        
        // Base64 encode
        use base64::Engine;
        let base64_str = base64::engine::general_purpose::STANDARD.encode(png_bytes.into_inner());
        
        Some(base64_str)
    }
}
