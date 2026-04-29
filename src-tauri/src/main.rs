#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::io::Write;
use tempfile::NamedTempFile;

#[tauri::command]
fn get_serial_ports() -> Vec<String> {
    serialport::available_ports()
        .map(|ports| ports.into_iter().map(|p| p.port_name).collect())
        .unwrap_or_else(|_| vec![])
}

#[tauri::command]
async fn run_flash_command() -> Result<String, String> {
    let output = Command::new("uptime")
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
async fn silent_print(
    pdf_data: Vec<u8>,
    page_height_mm: f64,
    print_rotation_mode: Option<String>,
) -> Result<String, String> {
    let mut temp_file = NamedTempFile::new().map_err(|e| e.to_string())?;
    temp_file.write_all(&pdf_data).map_err(|e| e.to_string())?;

    // Auto chooses the best default based on page geometry; manual mode lets users force
    // CUPS orientation values for printer-specific behavior.
    let orientation = match print_rotation_mode.as_deref() {
        Some("3") => "3",
        Some("4") => "4",
        Some("5") => "5",
        Some("6") => "6",
        _ => {
            if page_height_mm < 103.0 { "5" } else { "3" }
        }
    };
    let output = Command::new("lp")
        .arg("-o")
        .arg(format!("orientation-requested={orientation}"))
        .arg("-o")
        .arg("print-scaling=none")
        .arg(temp_file.path())
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok("Print job sent successfully".into())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_serial_ports, 
            silent_print, 
            run_flash_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
