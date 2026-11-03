use tauri::{AppHandle, Manager, WebviewWindow};

#[tauri::command]
pub async fn open_new_window(app: AppHandle, window: WebviewWindow) -> Result<String, String> {
    let anchor = window
        .outer_position()
        .map(|pos: tauri::PhysicalPosition<i32>| (pos.x, pos.y))
        .ok();
    let created = crate::windows::open_library_window(&app, anchor)?;
    Ok(created.label().to_string())
}
