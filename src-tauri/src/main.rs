// В релизной сборке Windows не показываем консольное окно.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    hinoverse_lib::run()
}
