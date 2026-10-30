// Настольное приложение HinoVerse: окно с собранным веб-интерфейсом (папка dist).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("не удалось запустить HinoVerse");
}
