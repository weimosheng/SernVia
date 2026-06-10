
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha256;
use std::fs;

const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
const PBKDF2_ITERATIONS: u32 = 100_000;

/// Get or create the persistent encryption key stored in settings
pub fn get_or_create_encryption_key() -> Result<[u8; KEY_LEN], String> {
    let mut settings = crate::screenshot::load_settings();
    if let Some(ref key) = settings.screenshot_key {
        let mut result = [0u8; KEY_LEN];
        result.copy_from_slice(&key[..KEY_LEN]);
        Ok(result)
    } else {
        let mut key = [0u8; KEY_LEN];
        OsRng.fill_bytes(&mut key);
        settings.screenshot_key = Some(key.to_vec());
        crate::screenshot::save_settings(&settings);
        Ok(key)
    }
}

/// Set a password: stores verifier hash and re-encrypts all existing screenshots
pub fn set_screenshot_password(password: &str) -> Result<(), String> {
    let mut settings = crate::screenshot::load_settings();
    
    // Generate salt for password verification
    let mut verifier_salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut verifier_salt);
    
    // Hash password for verification
    let mut verifier_hash = [0u8; KEY_LEN];
    pbkdf2_hmac::<Sha256>(
        password.as_bytes(),
        &verifier_salt,
        PBKDF2_ITERATIONS,
        &mut verifier_hash,
    );
    
    settings.password_set = true;
    settings.password_verifier_salt = Some(verifier_salt.to_vec());
    settings.password_verifier_hash = Some(verifier_hash.to_vec());
    
    // Make sure encryption key exists
    let enc_key = get_or_create_encryption_key()?;
    
    crate::screenshot::save_settings(&settings);
    
    // Re-encrypt existing .jpg files to .ssv
    let folder = settings.save_folder.clone();
    if let Ok(entries) = fs::read_dir(&folder) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let ext = path.extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if ext == "jpg" || ext == "jpeg" || ext == "png" || ext == "ssv" {
                    // Read data
                    if let Ok(data) = fs::read(&path) {
                        // Check if already ssv - check if it's encrypted or plain
                        if ext == "ssv" && data.len() > SALT_LEN + NONCE_LEN {
                            // Already ssv format, check if decodable with current key
                            let _salt = &data[..SALT_LEN];
                            let nonce_bytes = &data[SALT_LEN..SALT_LEN + NONCE_LEN];
                            let ciphertext = &data[SALT_LEN + NONCE_LEN..];
                            
                            if let Ok(cipher) = Aes256Gcm::new_from_slice(&enc_key) {
                                let nonce = Nonce::from_slice(nonce_bytes);
                                if cipher.decrypt(nonce, ciphertext).is_ok() {
                                    continue; // Already encrypted with current key
                                }
                            }
                        }
                        
                        // Encrypt and save as .ssv
                        let ssv_path = path.with_extension("ssv");
                        let encrypted = encrypt_data_with_key(&data, &enc_key)?;
                        let _ = fs::write(&ssv_path, encrypted);
                        let _ = fs::remove_file(&path); // Remove old file
                    }
                }
            }
        }
    }
    
    Ok(())
}

/// Verify the password against stored verifier
pub fn verify_password(password: &str) -> Result<bool, String> {
    let settings = crate::screenshot::load_settings();
    
    if !settings.password_set {
        return Ok(false);
    }
    
    let verifier_salt = settings.password_verifier_salt.as_ref()
        .ok_or_else(|| "Password not configured".to_string())?;
    let verifier_hash = settings.password_verifier_hash.as_ref()
        .ok_or_else(|| "Password not configured".to_string())?;
    
    let mut hash = [0u8; KEY_LEN];
    pbkdf2_hmac::<Sha256>(
        password.as_bytes(),
        verifier_salt,
        PBKDF2_ITERATIONS,
        &mut hash,
    );
    
    Ok(verifier_hash.as_slice() == hash)
}

/// Check if a password has been set
pub fn has_password() -> bool {
    let settings = crate::screenshot::load_settings();
    settings.password_set
}

/// Change the screenshot password: verify old password (if set), then update verifier
pub fn change_password(old_password: &str, new_password: &str) -> Result<(), String> {
    // If password not set yet, skip verification (first-time setup)
    if has_password() && !verify_password(old_password)? {
        return Err("旧密码错误".to_string());
    }
    
    let mut settings = crate::screenshot::load_settings();
    
    // Generate new salt and hash for the new password
    let mut verifier_salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut verifier_salt);
    
    let mut verifier_hash = [0u8; KEY_LEN];
    pbkdf2_hmac::<Sha256>(
        new_password.as_bytes(),
        &verifier_salt,
        PBKDF2_ITERATIONS,
        &mut verifier_hash,
    );
    
    settings.password_set = true;
    settings.password_verifier_salt = Some(verifier_salt.to_vec());
    settings.password_verifier_hash = Some(verifier_hash.to_vec());
    
    crate::screenshot::save_settings(&settings);
    
    Ok(())
}

/// Remove password protection
#[allow(dead_code)]
pub fn remove_password(password: &str) -> Result<(), String> {
    if !verify_password(password)? {
        return Err("密码错误".to_string());
    }
    
    let mut settings = crate::screenshot::load_settings();
    settings.password_set = false;
    settings.password_verifier_salt = None;
    settings.password_verifier_hash = None;
    // Keep the encryption key so existing .ssv files remain decodable
    crate::screenshot::save_settings(&settings);
    
    Ok(())
}

/// Encrypt data with the stored encryption key
pub fn encrypt_data_with_key(data: &[u8], key: &[u8; KEY_LEN]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Key init error: {}", e))?;
    
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let ciphertext = cipher.encrypt(nonce, data).map_err(|e| format!("Encrypt error: {}", e))?;
    
    // Format: nonce (12 bytes) || ciphertext
    let mut result = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);
    
    Ok(result)
}

/// Decrypt data with the stored encryption key
pub fn decrypt_data_with_key(encrypted: &[u8], key: &[u8; KEY_LEN]) -> Result<Vec<u8>, String> {
    if encrypted.len() < NONCE_LEN {
        return Err("数据太短".to_string());
    }
    
    let nonce_bytes = &encrypted[..NONCE_LEN];
    let ciphertext = &encrypted[NONCE_LEN..];
    
    if ciphertext.is_empty() {
        // Plain data (no encryption), return as-is
        return Ok(encrypted.to_vec());
    }
    
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Key init error: {}", e))?;
    let nonce = Nonce::from_slice(nonce_bytes);
    
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|_| "解密失败，数据可能已损坏".to_string())?;
    
    Ok(plaintext)
}

/// Decrypt a .ssv file and return as base64 data URL
pub fn decrypt_to_base64(file_path: &str) -> Result<String, String> {
    let data = fs::read(file_path).map_err(|e| format!("读取文件失败: {}", e))?;
    let key = get_or_create_encryption_key()?;
    
    // Check if file is encrypted (has nonce prefix) or plain
    if data.len() > NONCE_LEN {
        let decrypted = decrypt_data_with_key(&data, &key)?;
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&decrypted);
        return Ok(format!("data:image/jpeg;base64,{}", b64));
    }
    
    // Plain data fallback
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

/// Decrypt a .ssv file and save as plain JPG to specified path
pub fn decrypt_and_save(file_path: &str, output_path: &str) -> Result<(), String> {
    let data = fs::read(file_path).map_err(|e| format!("读取文件失败: {}", e))?;
    let key = get_or_create_encryption_key()?;
    
    let decrypted = if data.len() > NONCE_LEN {
        decrypt_data_with_key(&data, &key)?
    } else {
        data // Plain data
    };
    
    fs::write(output_path, &decrypted).map_err(|e| format!("保存文件失败: {}", e))?;
    Ok(())
}
