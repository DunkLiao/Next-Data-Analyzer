use rusqlite::types::{Value, ValueRef};
use rusqlite::{Connection, ToSql};
use serde::{Deserialize, Serialize};
use sqlparser::ast::Statement;
use sqlparser::dialect::GenericDialect;
use sqlparser::parser::Parser;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const PROFILE_FILE: &str = "database-profiles.json";
const DEFAULT_MAX_ROWS: usize = 10_000;
const HARD_MAX_ROWS: usize = 100_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DatabaseKind {
    Oracle,
    Sqlite,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseProfile {
    pub id: String,
    pub name: String,
    pub kind: DatabaseKind,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub service_name: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub sqlite_path: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum QueryParamType {
    Text,
    Number,
    Boolean,
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QueryParam {
    pub name: String,
    pub value: String,
    pub value_type: QueryParamType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseQueryRequest {
    pub profile_id: String,
    pub sql: String,
    pub params: Vec<QueryParam>,
    pub max_rows: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseQueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub row_count: usize,
    pub truncated: bool,
    pub source_label: String,
}

pub fn validate_select_sql(sql: &str) -> Result<(), String> {
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return Err("請輸入 SELECT 查詢".into());
    }

    let dialect = GenericDialect {};
    let statements = Parser::parse_sql(&dialect, trimmed).map_err(|e| format!("SQL 語法無法解析：{e}"))?;
    if statements.len() != 1 {
        return Err("只允許單一 SELECT 查詢".into());
    }

    match &statements[0] {
        Statement::Query(_) => Ok(()),
        _ => Err("只允許 SELECT 查詢，不能執行新增、修改、刪除或 DDL".into()),
    }
}

pub fn run_sqlite_query(
    path: String,
    sql: String,
    params: Vec<QueryParam>,
    max_rows: usize,
    source_label: String,
) -> Result<DatabaseQueryResult, String> {
    validate_select_sql(&sql)?;
    let max_rows = normalize_max_rows(max_rows);
    let fetch_rows = max_rows.saturating_add(1);
    let wrapped_sql = format!("select * from ({sql}) as nda_query limit {fetch_rows}");
    let conn = Connection::open(path).map_err(|e| format!("SQLite 連線失敗：{e}"))?;
    let mut stmt = conn
        .prepare(&wrapped_sql)
        .map_err(|e| format!("SQLite 查詢準備失敗：{e}"))?;
    let columns = stmt
        .column_names()
        .into_iter()
        .map(|name| name.to_string())
        .collect::<Vec<_>>();
    let values = params_to_sqlite_values(&params)?;
    let mut rows = if values.is_empty() {
        stmt.query([]).map_err(|e| format!("SQLite 查詢失敗：{e}"))?
    } else {
        let named = values
            .iter()
            .map(|(name, value)| (name.as_str(), value as &dyn ToSql))
            .collect::<Vec<_>>();
        stmt.query(named.as_slice())
            .map_err(|e| format!("SQLite 查詢失敗：{e}"))?
    };

    let mut out_rows = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("SQLite 讀取結果失敗：{e}"))? {
        let mut out = Vec::with_capacity(columns.len());
        for i in 0..columns.len() {
            let cell = row
                .get_ref(i)
                .map(value_ref_to_string)
                .map_err(|e| format!("SQLite 欄位讀取失敗：{e}"))?;
            out.push(cell);
        }
        out_rows.push(out);
    }

    let truncated = out_rows.len() > max_rows;
    if truncated {
        out_rows.truncate(max_rows);
    }

    Ok(DatabaseQueryResult {
        columns,
        row_count: out_rows.len(),
        rows: out_rows,
        truncated,
        source_label,
    })
}

#[tauri::command]
pub fn list_database_profiles(app: AppHandle) -> Result<Vec<DatabaseProfile>, String> {
    read_profiles(&app)
}

#[tauri::command]
pub fn save_database_profile(app: AppHandle, profile: DatabaseProfile) -> Result<DatabaseProfile, String> {
    if profile.name.trim().is_empty() {
        return Err("連線名稱不可空白".into());
    }
    validate_profile(&profile)?;
    let mut profiles = read_profiles(&app)?;
    let saved = normalize_profile(profile);
    if let Some(existing) = profiles.iter_mut().find(|p| p.id == saved.id) {
        *existing = saved.clone();
    } else {
        profiles.push(saved.clone());
    }
    write_profiles(&app, &profiles)?;
    Ok(saved)
}

#[tauri::command]
pub fn delete_database_profile(app: AppHandle, profile_id: String) -> Result<(), String> {
    let mut profiles = read_profiles(&app)?;
    profiles.retain(|p| p.id != profile_id);
    write_profiles(&app, &profiles)
}

#[tauri::command]
pub async fn test_database_connection(app: AppHandle, profile_id: String) -> Result<(), String> {
    let profile = find_profile(&app, &profile_id)?;
    match profile.kind {
        DatabaseKind::Sqlite => {
            let path = profile.sqlite_path.ok_or_else(|| "SQLite 設定缺少資料庫檔案".to_string())?;
            tauri::async_runtime::spawn_blocking(move || {
                let conn = Connection::open(path).map_err(|e| format!("SQLite 連線失敗：{e}"))?;
                conn.query_row("select 1", [], |_| Ok(()))
                    .map(|_| ())
                    .map_err(|e| format!("SQLite 測試查詢失敗：{e}"))
            })
            .await
            .map_err(|e| format!("SQLite 測試工作失敗：{e}"))?
        }
        DatabaseKind::Oracle => run_oracle_test(profile).await,
    }
}

#[tauri::command]
pub async fn run_database_query(app: AppHandle, request: DatabaseQueryRequest) -> Result<DatabaseQueryResult, String> {
    validate_select_sql(&request.sql)?;
    let profile = find_profile(&app, &request.profile_id)?;
    let max_rows = normalize_max_rows(request.max_rows.unwrap_or(DEFAULT_MAX_ROWS));
    match profile.kind {
        DatabaseKind::Sqlite => {
            let path = profile.sqlite_path.ok_or_else(|| "SQLite 設定缺少資料庫檔案".to_string())?;
            let sql = request.sql;
            let params = request.params;
            let source_label = format!("資料庫：{}", profile.name);
            tauri::async_runtime::spawn_blocking(move || run_sqlite_query(path, sql, params, max_rows, source_label))
                .await
                .map_err(|e| format!("SQLite 查詢工作失敗：{e}"))?
        }
        DatabaseKind::Oracle => run_oracle_query(profile, request.sql, request.params, max_rows).await,
    }
}

fn validate_profile(profile: &DatabaseProfile) -> Result<(), String> {
    match profile.kind {
        DatabaseKind::Sqlite => {
            if profile.sqlite_path.as_deref().unwrap_or("").trim().is_empty() {
                return Err("SQLite 設定缺少資料庫檔案".into());
            }
        }
        DatabaseKind::Oracle => {
            if profile.host.as_deref().unwrap_or("").trim().is_empty()
                || profile.service_name.as_deref().unwrap_or("").trim().is_empty()
                || profile.username.as_deref().unwrap_or("").trim().is_empty()
            {
                return Err("Oracle 設定缺少主機、服務名稱或帳號".into());
            }
        }
    }
    Ok(())
}

fn normalize_profile(mut profile: DatabaseProfile) -> DatabaseProfile {
    let now = now_millis();
    if profile.id.trim().is_empty() {
        profile.id = format!("db-{now}");
    }
    if profile.created_at <= 0 {
        profile.created_at = now;
    }
    profile.updated_at = now;
    profile
}

fn find_profile(app: &AppHandle, profile_id: &str) -> Result<DatabaseProfile, String> {
    read_profiles(app)?
        .into_iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| "找不到資料庫連線設定".into())
}

fn read_profiles(app: &AppHandle) -> Result<Vec<DatabaseProfile>, String> {
    let path = profile_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("讀取資料庫設定失敗：{e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("資料庫設定格式錯誤：{e}"))
}

fn write_profiles(app: &AppHandle, profiles: &[DatabaseProfile]) -> Result<(), String> {
    let path = profile_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("建立設定資料夾失敗：{e}"))?;
    }
    let text = serde_json::to_string_pretty(profiles).map_err(|e| format!("序列化資料庫設定失敗：{e}"))?;
    fs::write(path, text).map_err(|e| format!("儲存資料庫設定失敗：{e}"))
}

fn profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(PROFILE_FILE))
        .map_err(|e| format!("取得設定資料夾失敗：{e}"))
}

fn normalize_max_rows(max_rows: usize) -> usize {
    max_rows.clamp(1, HARD_MAX_ROWS)
}

fn params_to_sqlite_values(params: &[QueryParam]) -> Result<Vec<(String, Value)>, String> {
    params
        .iter()
        .filter(|param| !param.name.trim().is_empty())
        .map(|param| {
            let name = if param.name.starts_with(':') {
                param.name.clone()
            } else {
                format!(":{}", param.name)
            };
            let value = match param.value_type {
                QueryParamType::Text => Value::Text(param.value.clone()),
                QueryParamType::Number => {
                    if let Ok(i) = param.value.parse::<i64>() {
                        Value::Integer(i)
                    } else {
                        Value::Real(
                            param
                                .value
                                .parse::<f64>()
                                .map_err(|_| format!("參數 {} 不是有效數字", param.name))?,
                        )
                    }
                }
                QueryParamType::Boolean => match param.value.trim().to_ascii_lowercase().as_str() {
                    "true" | "1" | "yes" | "y" => Value::Integer(1),
                    "false" | "0" | "no" | "n" => Value::Integer(0),
                    _ => return Err(format!("參數 {} 不是有效布林值", param.name)),
                },
                QueryParamType::Null => Value::Null,
            };
            Ok((name, value))
        })
        .collect()
}

fn value_ref_to_string(value: ValueRef<'_>) -> String {
    match value {
        ValueRef::Null => String::new(),
        ValueRef::Integer(v) => v.to_string(),
        ValueRef::Real(v) => v.to_string(),
        ValueRef::Text(v) => String::from_utf8_lossy(v).into_owned(),
        ValueRef::Blob(v) => format!("<BLOB {} bytes>", v.len()),
    }
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

async fn run_oracle_test(profile: DatabaseProfile) -> Result<(), String> {
    let connect_string = oracle_connect_string(&profile)?;
    let username = profile.username.unwrap_or_default();
    let password = profile.password.unwrap_or_default();
    let conn = oracle_rs::Connection::connect(&connect_string, &username, &password)
        .await
        .map_err(|e| format!("Oracle 連線失敗：{e}"))?;
    conn.ping().await.map_err(|e| format!("Oracle 測試查詢失敗：{e}"))?;
    conn.close().await.map_err(|e| format!("Oracle 關閉連線失敗：{e}"))
}

async fn run_oracle_query(
    profile: DatabaseProfile,
    sql: String,
    params: Vec<QueryParam>,
    max_rows: usize,
) -> Result<DatabaseQueryResult, String> {
    validate_select_sql(&sql)?;
    let connect_string = oracle_connect_string(&profile)?;
    let username = profile.username.clone().unwrap_or_default();
    let password = profile.password.clone().unwrap_or_default();
    let wrapped_sql = format!("select * from ({sql}) where rownum <= :nda_max_rows");
    let mut oracle_params = params_to_oracle_values(&params)?;
    oracle_params.push(oracle_rs::Value::Integer(max_rows as i64));
    let conn = oracle_rs::Connection::connect(&connect_string, &username, &password)
        .await
        .map_err(|e| format!("Oracle 連線失敗：{e}"))?;
    let result = conn
        .query(&wrapped_sql, oracle_params.as_slice())
        .await
        .map_err(|e| format!("Oracle 查詢失敗：{e}"))?;

    let columns = result.columns.iter().map(|c| c.name.clone()).collect::<Vec<_>>();
    let rows = result
        .rows
        .iter()
        .map(|row| {
            (0..columns.len())
                .map(|idx| {
                    row.get(idx)
                        .map(oracle_value_to_string)
                        .unwrap_or_default()
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let row_count = rows.len();
    conn.close().await.map_err(|e| format!("Oracle 關閉連線失敗：{e}"))?;

    Ok(DatabaseQueryResult {
        columns,
        rows,
        row_count,
        truncated: result.has_more_rows || row_count >= max_rows,
        source_label: format!("資料庫：{}", profile.name),
    })
}

fn oracle_connect_string(profile: &DatabaseProfile) -> Result<String, String> {
    let host = profile.host.as_deref().unwrap_or("").trim();
    let port = profile.port.unwrap_or(1521);
    let service = profile.service_name.as_deref().unwrap_or("").trim();
    if host.is_empty() || service.is_empty() {
        return Err("Oracle 設定缺少主機或服務名稱".into());
    }
    Ok(format!("{host}:{port}/{service}"))
}

fn params_to_oracle_values(params: &[QueryParam]) -> Result<Vec<oracle_rs::Value>, String> {
    params
        .iter()
        .filter(|param| !param.name.trim().is_empty())
        .map(|param| match param.value_type {
            QueryParamType::Text => Ok(oracle_rs::Value::String(param.value.clone())),
            QueryParamType::Number => {
                if let Ok(i) = param.value.parse::<i64>() {
                    Ok(oracle_rs::Value::Integer(i))
                } else {
                    Ok(oracle_rs::Value::Float(
                        param
                            .value
                            .parse::<f64>()
                            .map_err(|_| format!("參數 {} 不是有效數字", param.name))?,
                    ))
                }
            }
            QueryParamType::Boolean => match param.value.trim().to_ascii_lowercase().as_str() {
                "true" | "1" | "yes" | "y" => Ok(oracle_rs::Value::Integer(1)),
                "false" | "0" | "no" | "n" => Ok(oracle_rs::Value::Integer(0)),
                _ => Err(format!("參數 {} 不是有效布林值", param.name)),
            },
            QueryParamType::Null => Ok(oracle_rs::Value::Null),
        })
        .collect()
}

fn oracle_value_to_string(value: &oracle_rs::Value) -> String {
    match value {
        oracle_rs::Value::Null => String::new(),
        oracle_rs::Value::String(v) => v.clone(),
        oracle_rs::Value::Bytes(v) => format!("<BLOB {} bytes>", v.len()),
        oracle_rs::Value::Integer(v) => v.to_string(),
        oracle_rs::Value::Float(v) => v.to_string(),
        oracle_rs::Value::Number(v) => v.as_str().to_string(),
        oracle_rs::Value::Date(v) => format!("{v:?}"),
        oracle_rs::Value::Timestamp(v) => format!("{v:?}"),
        oracle_rs::Value::RowId(v) => v.to_string().unwrap_or_else(|| format!("{v:?}")),
        oracle_rs::Value::Boolean(v) => v.to_string(),
        oracle_rs::Value::Json(v) => v.to_string(),
        other => format!("{other:?}"),
    }
}
