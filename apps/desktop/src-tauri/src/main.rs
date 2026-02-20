// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let headless = std::env::args().any(|a| a == "--headless");

    // Create a multi-threaded tokio runtime for the in-process daemon.
    // Tauri 2 doesn't provide one by default, so we create it here
    // and run the Tauri app inside it.
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");

    if headless {
        rt.block_on(craftstudio_lib::run_headless());
    } else {
        rt.block_on(async {
            craftstudio_lib::run();
        });
    }
}
