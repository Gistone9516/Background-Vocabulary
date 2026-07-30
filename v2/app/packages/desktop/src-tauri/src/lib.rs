// 데스크톱 셸의 Rust 쪽(C4). 여기 있는 커맨드는 전부 **배관**이다 — D-8이 금지하는 것은
// Rust에서의 권한 판정(티어·한도·게이팅)이고, 그 판정은 언제나 서버가 한다. `.rs`는 게이트
// 사각지대이므로(relation-index가 TS/CSS만 본다) 이 구분은 리뷰로 지킨다. 커맨드를 더할 때
// "이 커맨드가 무언가를 판정하는가"를 먼저 물을 것.
//
// secret_*: OS 자격 증명 저장소(keyring 크레이트 — Windows Credential Manager / Linux Secret
// Service). stronghold가 v3에서 제거 예정이라 기반 크레이트를 직접 쓴다(C4-S2 §1-2, 웹 근거 §6).

fn entry(service: &str, account: &str) -> Result<keyring::Entry, String> {
  keyring::Entry::new(service, account).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_get(service: String, account: String) -> Result<Option<String>, String> {
  match entry(&service, &account)?.get_password() {
    Ok(v) => Ok(Some(v)),
    // 항목 없음은 오류가 아니라 "저장된 것이 없다"는 정상 답이다(첫 기동).
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn secret_set(service: String, account: String, value: String) -> Result<(), String> {
  entry(&service, &account)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_delete(service: String, account: String) -> Result<(), String> {
  match entry(&service, &account)?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()), // 멱등 — 없는 것을 지우는 것은 성공이다
    Err(e) => Err(e.to_string()),
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // oauth: 루프백 리스너(start/cancel/onUrl). opener: 시스템 브라우저 열기. 둘 다 C4 S2 로그인 경로.
    .plugin(tauri_plugin_oauth::init())
    .plugin(tauri_plugin_opener::init())
    // store: 오프라인 캐시 JSON(C4 S3, FR-902).
    .plugin(tauri_plugin_store::Builder::new().build())
    // global-shortcut: 퀵 캡처(C4 S4, FR-903). **핸들러가 Rust에 있는 이유(실측)**: 처음 JS에
    // 뒀더니 최소화된 웹뷰를 WebView2가 스로틀링해 이벤트가 지연·유실됐다 — 창이 최소화됐을 때
    // 깨우는 기능을 웹뷰에 두면 자기모순이다. 창 show·focus는 판정이 아니라 배관이다(D-8).
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .invoke_handler(tauri::generate_handler![secret_get, secret_set, secret_delete])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      {
        use tauri::Manager;
        use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
        // 등록 실패(다른 앱 선점, Wayland 미지원)는 경고로 강등하고 앱은 그대로 돈다(D-11).
        if let Err(err) = app.handle().global_shortcut().on_shortcut("CommandOrControl+Shift+K", |app, _shortcut, event| {
          if event.state() == ShortcutState::Pressed {
            if let Some(w) = app.get_webview_window("main") {
              // 순서가 동작이다: 최소화 해제 → 표시 → 포커스. 하나가 실패해도 나머지는 시도한다.
              let _ = w.unminimize();
              let _ = w.show();
              let _ = w.set_focus();
            }
          }
        }) {
          log::warn!("퀵 캡처 단축키 등록 실패 — 이 환경에서는 제공되지 않는다(D-11 강등): {err}");
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
