use std::fs;
use std::path::Path;

pub mod database;

const MAX_FILE_BYTES: u64 = 512 * 1024 * 1024;

fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let meta = fs::metadata(path).map_err(|e| format!("無法讀取檔案：{e}"))?;
    if meta.len() > MAX_FILE_BYTES {
        return Err("檔案超過 512MB，請改用較小的資料檔".into());
    }
    fs::read(path).map_err(|e| format!("讀取檔案失敗：{e}"))
}

fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    fs::write(path, bytes).map_err(|e| format!("儲存檔案失敗：{e}"))
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    read_bytes(Path::new(&path)).map(tauri::ipc::Response::new)
}

#[tauri::command]
fn save_file_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    write_bytes(Path::new(&path), &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_ID: AtomicU64 = AtomicU64::new(0);

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let root = std::env::temp_dir();
            loop {
                let path = root.join(format!(
                    "next-data-analyzer-test-{}-{}",
                    std::process::id(),
                    NEXT_ID.fetch_add(1, Ordering::Relaxed)
                ));
                match fs::create_dir(&path) {
                    Ok(()) => return Self(path),
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(e) => panic!("Cannot create test directory: {e}"),
                }
            }
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn reads_exact_file_bytes() {
        let dir = TestDir::new();
        let path = dir.0.join("input.csv");
        let bytes = b"name,value\r\nexample,42\r\n\x00\xff";
        fs::write(&path, bytes).unwrap();
        assert_eq!(read_bytes(&path).unwrap(), bytes);
    }

    #[test]
    fn writes_and_overwrites_exact_file_bytes() {
        let dir = TestDir::new();
        let path = dir.0.join("output.csv");
        write_bytes(&path, b"original content").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"original content");
        write_bytes(&path, b"new\x00\xff").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new\x00\xff");
    }

    #[test]
    fn reports_missing_input_file() {
        let dir = TestDir::new();
        let error = read_bytes(&dir.0.join("missing.csv")).unwrap_err();
        assert!(error.starts_with("無法讀取檔案："));
        assert!(error.len() > "無法讀取檔案：".len());
    }

    #[test]
    fn reports_missing_output_directory() {
        let dir = TestDir::new();
        let error = write_bytes(&dir.0.join("missing/output.csv"), b"data").unwrap_err();
        assert!(error.starts_with("儲存檔案失敗："));
        assert!(error.len() > "儲存檔案失敗：".len());
    }

    #[test]
    fn rejects_files_larger_than_512mb() {
        let dir = TestDir::new();
        let path = dir.0.join("oversized.csv");
        // Extend the file without allocating a 512 MB in-memory test buffer.
        fs::File::create(&path)
            .unwrap()
            .set_len(MAX_FILE_BYTES + 1)
            .unwrap();
        assert_eq!(
            read_bytes(&path).unwrap_err(),
            "檔案超過 512MB，請改用較小的資料檔"
        );
    }

    #[test]
    fn accepts_select_queries_and_rejects_mutating_sql() {
        assert!(crate::database::validate_select_sql("select id, name from users").is_ok());
        assert!(crate::database::validate_select_sql("with recent as (select * from sales) select * from recent").is_ok());
        assert!(crate::database::validate_select_sql("select * from users; select * from audit").is_err());
        assert!(crate::database::validate_select_sql("delete from users").is_err());
        assert!(crate::database::validate_select_sql("update users set name = 'x'").is_err());
    }

    #[test]
    fn runs_limited_sqlite_query_with_named_params_as_string_rows() {
        let dir = TestDir::new();
        let path = dir.0.join("sample.sqlite");
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(
            "
            create table sales (customer text, amount real, closed integer);
            insert into sales values ('A', 1200.5, 1), ('B', null, 0), ('C', 900, 1);
            ",
        )
        .unwrap();
        drop(conn);

        let result = crate::database::run_sqlite_query(
            path.to_string_lossy().into_owned(),
            "select customer, amount, closed from sales where closed = :closed order by customer".into(),
            vec![crate::database::QueryParam {
                name: "closed".into(),
                value: "1".into(),
                value_type: crate::database::QueryParamType::Number,
            }],
            1,
            "SQLite 測試".into(),
        )
        .unwrap();

        assert_eq!(result.columns, vec!["customer", "amount", "closed"]);
        assert_eq!(result.rows, vec![vec!["A", "1200.5", "1"]]);
        assert_eq!(result.row_count, 1);
        assert!(result.truncated);
        assert_eq!(result.source_label, "SQLite 測試");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            read_file_bytes,
            save_file_bytes,
            database::list_database_profiles,
            database::save_database_profile,
            database::delete_database_profile,
            database::test_database_connection,
            database::run_database_query
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
