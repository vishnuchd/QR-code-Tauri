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
    page_width_mm: f64,
    page_height_mm: f64,
    print_rotation_mode: Option<String>,
) -> Result<String, String> {
    let mut temp_file = NamedTempFile::new().map_err(|e| e.to_string())?;
    temp_file.write_all(&pdf_data).map_err(|e| e.to_string())?;
    let clamped_width = page_width_mm.clamp(10.0, 500.0);
    let clamped_height = page_height_mm.clamp(10.0, 500.0);
    let media = format!("Custom.{clamped_width:.2}x{clamped_height:.2}mm");

    // Linux/CUPS label-print fix:
    // 1) force exact media size for cutter length
    // 2) disable pdftopdf auto-rotation which often flips label PDFs
    // 3) keep scaling off
    // 4) optionally allow explicit orientation override from UI
    let mut lp_cmd = Command::new("lp");
    lp_cmd
        .arg("-o")
        .arg(format!("media={media}"))
        .arg("-o")
        .arg("nopdfAutoRotate")
        .arg("-o")
        .arg("print-scaling=none");

    if let Some(mode) = print_rotation_mode.as_deref() {
        if matches!(mode, "3" | "4" | "5" | "6") {
            lp_cmd
                .arg("-o")
                .arg(format!("orientation-requested={mode}"));
        }
    }

    let output = lp_cmd
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
