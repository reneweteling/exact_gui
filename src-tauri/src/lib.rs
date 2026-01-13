use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TokenData {
    access_token: String,
    refresh_token: String,
    refresh_at: i64,
    current_division: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(non_snake_case)]
struct Division {
    Code: i32,
    CustomerName: String,
    Description: String,
    Customer: Option<String>,
    CustomerCode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ApiResponse<T> {
    d: ApiData<T>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ApiData<T> {
    results: Vec<T>,
    #[serde(rename = "__next")]
    __next: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub data: HashMap<String, serde_json::Value>,
}

struct AppState {
    api: String,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    access_token: Option<String>,
    refresh_token: Option<String>,
    refresh_at: i64,
    current_division: Option<i32>,
    data_dir: PathBuf,
}

impl AppState {
    fn new() -> Result<Self, String> {
        // Use a local data directory in the user's home directory
        let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE"))
            .map_err(|_| "Failed to get home directory")?;
        let data_dir = PathBuf::from(home).join(".exact_gui");
        fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data directory: {}", e))?;

        let mut state = AppState {
            api: env!("API").to_string(),
            client_id: env!("CLIENT_ID").to_string(),
            client_secret: env!("CLIENT_SECRET").to_string(),
            redirect_uri: env!("REDIRECT_URI").to_string(),
            access_token: None,
            refresh_token: None,
            refresh_at: 0,
            current_division: None,
            data_dir,
        };

        state.load_tokens();
        Ok(state)
    }

    fn load_tokens(&mut self) {
        let tokens_file = self.data_dir.join("tokens.json");
        if let Ok(content) = fs::read_to_string(&tokens_file) {
            if let Ok(token_data) = serde_json::from_str::<TokenData>(&content) {
                self.access_token = Some(token_data.access_token);
                self.refresh_token = Some(token_data.refresh_token);
                self.refresh_at = token_data.refresh_at;
                self.current_division = token_data.current_division;
            }
        }
    }

    fn save_tokens(&self) -> Result<(), String> {
        let tokens_file = self.data_dir.join("tokens.json");
        let token_data = TokenData {
            access_token: self.access_token.clone().ok_or("No access token")?,
            refresh_token: self.refresh_token.clone().ok_or("No refresh token")?,
            refresh_at: self.refresh_at,
            current_division: self.current_division,
        };
        fs::write(&tokens_file, serde_json::to_string_pretty(&token_data).unwrap())
            .map_err(|e| format!("Failed to save tokens: {}", e))?;
        Ok(())
    }

    async fn fetch_current_division(&mut self) -> Result<(), String> {
        let path = "/v1/current/Me?$select=CurrentDivision";
        let response = self.get(path).await?;
        
        eprintln!("[CURRENT/ME] Response: {}", serde_json::to_string_pretty(&response).unwrap_or_else(|_| "Failed to serialize".to_string()));

        // Try to parse as ApiResponse first (wrapped in d.results)
        if let Ok(api_response) = serde_json::from_value::<ApiResponse<serde_json::Value>>(response.clone()) {
            if let Some(first_result) = api_response.d.results.first() {
                if let Some(division) = first_result.get("CurrentDivision") {
                    if let Some(division_value) = division.as_i64() {
                        self.current_division = Some(division_value as i32);
                        eprintln!("[CURRENT/ME] Found current division: {}", self.current_division.unwrap());
                        return Ok(());
                    }
                }
            }
        }

        // Try to parse as direct object (not wrapped)
        if let Some(division) = response.get("CurrentDivision") {
            if let Some(division_value) = division.as_i64() {
                self.current_division = Some(division_value as i32);
                eprintln!("[CURRENT/ME] Found current division: {}", self.current_division.unwrap());
                return Ok(());
            }
        }

        // Try nested d.CurrentDivision
        if let Some(d) = response.get("d") {
            if let Some(division) = d.get("CurrentDivision") {
                if let Some(division_value) = division.as_i64() {
                    self.current_division = Some(division_value as i32);
                    eprintln!("[CURRENT/ME] Found current division: {}", self.current_division.unwrap());
                    return Ok(());
                }
            }
        }

        Err("Could not find CurrentDivision in response".to_string())
    }

    async fn refresh_token(&mut self) -> Result<(), String> {
        if self.refresh_at > chrono::Utc::now().timestamp() {
            return Ok(());
        }

        let refresh_token = self.refresh_token.clone().ok_or("No refresh token")?;

        let client = reqwest::Client::new();
        let mut params = HashMap::new();
        params.insert("grant_type", "refresh_token");
        params.insert("refresh_token", &refresh_token);
        params.insert("client_id", &self.client_id);
        params.insert("client_secret", &self.client_secret);

        let response = client
            .post(format!("{}/oauth2/token", self.api))
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Failed to refresh token: {}", e))?;

        let status = response.status();
        let response_text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read token response: {}", e))?;

        eprintln!("[OAUTH2/TOKEN REFRESH] Status: {}", status);
        eprintln!("[OAUTH2/TOKEN REFRESH] Response body: {}", response_text);

        let token_response: serde_json::Value = serde_json::from_str(&response_text)
            .map_err(|e| format!("Failed to parse token response: {}", e))?;

        eprintln!("[OAUTH2/TOKEN REFRESH] Parsed JSON: {}", serde_json::to_string_pretty(&token_response).unwrap_or_else(|_| "Failed to serialize".to_string()));

        if let Some(error) = token_response.get("error") {
            return Err(format!("Token refresh error: {}", error));
        }

        self.access_token = token_response
            .get("access_token")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        self.refresh_token = token_response
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        self.refresh_at = chrono::Utc::now().timestamp() + 570;

        self.save_tokens()?;

        Ok(())
    }

    async fn get(&self, path: &str) -> Result<serde_json::Value, String> {
        let access_token = self.access_token.clone().ok_or("Not authenticated")?;

        let client = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get(format!("{}{}", self.api, path))
            .header("Accept", "application/json")
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        if !status.is_success() {
            return Err(format!("API error ({}): {}", status, body));
        }

        let json: serde_json::Value = serde_json::from_str(&body)
            .map_err(|e| format!("Failed to parse JSON: {}", e))?;

        if let Some(error) = json.get("error") {
            return Err(format!("API error: {}", error));
        }

        Ok(json)
    }
}

static APP_STATE: Mutex<Option<AppState>> = Mutex::const_new(None);
static CANCELLATION_FLAG: Mutex<Option<Arc<AtomicBool>>> = Mutex::const_new(None);

async fn get_app_state() -> Result<tokio::sync::MutexGuard<'static, Option<AppState>>, String> {
    let mut state = APP_STATE.lock().await;
    if state.is_none() {
        *state = Some(AppState::new()?);
    }
    Ok(state)
}

#[tauri::command]
async fn get_auth_url() -> Result<String, String> {
    let state = get_app_state().await?;
    let state = state.as_ref().ok_or("State not initialized")?;
    Ok(format!(
        "{}/oauth2/auth?client_id={}&redirect_uri={}&response_type=code",
        state.api, state.client_id, state.redirect_uri
    ))
}

#[tauri::command]
async fn authenticate_with_code(code: String) -> Result<(), String> {
    let mut state_guard = get_app_state().await?;
    let state = state_guard.as_mut().ok_or("State not initialized")?;

    let client = reqwest::Client::new();
    let mut params = HashMap::new();
    params.insert("grant_type", "authorization_code");
    params.insert("client_id", &state.client_id);
    params.insert("client_secret", &state.client_secret);
    params.insert("redirect_uri", &state.redirect_uri);
    params.insert("code", &code);

    let response = client
        .post(format!("{}/oauth2/token", state.api))
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Failed to authenticate: {}", e))?;

    let status = response.status();
    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read token response: {}", e))?;

    eprintln!("[OAUTH2/TOKEN] Status: {}", status);
    eprintln!("[OAUTH2/TOKEN] Response body: {}", response_text);

    let token_response: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    eprintln!("[OAUTH2/TOKEN] Parsed JSON: {}", serde_json::to_string_pretty(&token_response).unwrap_or_else(|_| "Failed to serialize".to_string()));

    if let Some(error) = token_response.get("error") {
        return Err(format!("Authentication error: {}", error));
    }

    state.access_token = token_response
        .get("access_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    state.refresh_token = token_response
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    state.refresh_at = chrono::Utc::now().timestamp() + 570;

    // Fetch and store the current division
    if let Err(e) = state.fetch_current_division().await {
        eprintln!("[AUTH] Warning: Failed to fetch current division: {}", e);
        // Don't fail authentication if division fetch fails, but log it
    }

    state.save_tokens()?;

    Ok(())
}

#[tauri::command]
async fn get_divisions() -> Result<Vec<Division>, String> {
    let mut state_guard = get_app_state().await?;
    let state = state_guard.as_mut().ok_or("State not initialized")?;

    state.refresh_token().await?;

    let division = state.current_division.ok_or("No current division found. Please authenticate first.")?;
    let attributes = "Code,Customer,CustomerCode,CustomerName,Description";
    let path = format!(
        "/v1/{}/system/Divisions?$select={}",
        division, attributes
    );

    // Create and set cancellation flag
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut flag_guard = CANCELLATION_FLAG.lock().await;
        *flag_guard = Some(cancel_flag.clone());
    }

    let mut all_results = Vec::new();
    let mut next_path = Some(path);

    while let Some(path) = next_path {
        // Check for cancellation
        if cancel_flag.load(Ordering::Relaxed) {
            // Clear cancellation flag
            {
                let mut flag_guard = CANCELLATION_FLAG.lock().await;
                *flag_guard = None;
            }
            return Err("Operation cancelled by user".to_string());
        }

        let response = state.get(&path).await?;
        let api_response: ApiResponse<Division> =
            serde_json::from_value(response).map_err(|e| format!("Failed to parse divisions: {}", e))?;

        all_results.extend(api_response.d.results);

        next_path = api_response.d.__next.map(|next| {
            next.strip_prefix(&state.api)
                .unwrap_or(&next)
                .to_string()
        });
    }

    // Clear cancellation flag on success
    {
        let mut flag_guard = CANCELLATION_FLAG.lock().await;
        *flag_guard = None;
    }

    all_results.sort_by(|a, b| {
        format!("{}{}", a.CustomerName, a.Description)
            .cmp(&format!("{}{}", b.CustomerName, b.Description))
    });

    Ok(all_results)
}

#[tauri::command]
async fn get_transactions(
    app: tauri::AppHandle,
    division: i32,
    filter: Option<String>,
) -> Result<Vec<Transaction>, String> {
    let mut state_guard = get_app_state().await?;
    let state = state_guard.as_mut().ok_or("State not initialized")?;

    state.refresh_token().await?;

    let attributes = "AccountCode,AccountName,AmountDC,AmountFC,AmountVATBaseFC,AmountVATFC,AssetCode,AssetDescription,CostCenter,CostCenterDescription,CostUnit,CostUnitDescription,CreatorFullName,Currency,CustomField,Description,Division,Document,DocumentNumber,DocumentSubject,DueDate,EntryNumber,ExchangeRate,ExternalLinkDescription,ExternalLinkReference,ExtraDutyAmountFC,ExtraDutyPercentage,FinancialPeriod,FinancialYear,GLAccountCode,GLAccountDescription,InvoiceNumber,Item,ItemCode,ItemDescription,JournalCode,JournalDescription,LineType,Modified,ModifierFullName,Notes,OrderNumber,PaymentDiscountAmount,PaymentReference,Project,ProjectCode,ProjectDescription,Quantity,SerialNumber,ShopOrder,Status,Subscription,SubscriptionDescription,TrackingNumber,TrackingNumberDescription,Type,VATCode,VATCodeDescription,VATPercentage,VATType,YourRef";

    let mut filter_str = String::new();
    if let Some(f) = filter {
        if !f.trim().is_empty() {
            filter_str = format!("&$filter={}", urlencoding::encode(&f));
        }
    }

    let path = format!(
        "/v1/{}/bulk/Financial/TransactionLines?$select={}{}",
        division, attributes, filter_str
    );

    // Create and set cancellation flag
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut flag_guard = CANCELLATION_FLAG.lock().await;
        *flag_guard = Some(cancel_flag.clone());
    }

    let mut all_results = Vec::new();
    let mut next_path = Some(path);

    // First, try to get an estimate of total count
    let count_path = format!(
        "/v1/{}/bulk/Financial/TransactionLines/$count{}",
        division, filter_str
    );
    let mut estimated_total: Option<i32> = None;
    if let Ok(count_response) = state.get(&count_path).await {
        // Check for cancellation before continuing
        if cancel_flag.load(Ordering::Relaxed) {
            let mut flag_guard = CANCELLATION_FLAG.lock().await;
            *flag_guard = None;
            return Err("Operation cancelled by user".to_string());
        }

        if let Some(count_value) = count_response.as_i64() {
            estimated_total = Some(count_value as i32);
            let _ = app.emit("transaction-progress", serde_json::json!({
                "current": 0,
                "total": count_value,
                "message": format!("Found {} transactions, starting fetch...", count_value)
            }));
        }
    }

    while let Some(path) = next_path {
        // Check for cancellation
        if cancel_flag.load(Ordering::Relaxed) {
            // Clear cancellation flag
            {
                let mut flag_guard = CANCELLATION_FLAG.lock().await;
                *flag_guard = None;
            }
            return Err("Operation cancelled by user".to_string());
        }

        let response = state.get(&path).await?;
        let api_response: ApiResponse<serde_json::Value> =
            serde_json::from_value(response).map_err(|e| format!("Failed to parse transactions: {}", e))?;
        for result in api_response.d.results {
            if let serde_json::Value::Object(map) = result {
                let mut transaction_data = HashMap::new();
                for (key, value) in map {
                    match value {
                        serde_json::Value::String(ref s) => {
                            if let Some(captures) = regex::Regex::new(r"/Date\((\d+)\)/")
                                .unwrap()
                                .captures(s)
                            {
                                if let Ok(timestamp_ms) = captures[1].parse::<i64>() {
                                    let timestamp = timestamp_ms / 1000;
                                    if let Some(dt) = chrono::DateTime::<chrono::Utc>::from_timestamp(timestamp, 0) {
                                        transaction_data.insert(key, serde_json::Value::String(dt.to_rfc3339()));
                                    } else {
                                        transaction_data.insert(key, value.clone());
                                    }
                                } else {
                                    transaction_data.insert(key, value.clone());
                                }
                            } else {
                                transaction_data.insert(key, value.clone());
                            }
                        }
                        _ => {
                            if !value.is_object() {
                                transaction_data.insert(key, value);
                            }
                        }
                    }
                }
                all_results.push(Transaction {
                    data: transaction_data,
                });
            }
        }

        // Emit progress update
        let current_count = all_results.len() as i64;
        let message = if let Some(total) = estimated_total {
            format!("Fetched {} of {} transactions...", current_count, total)
        } else {
            format!("Fetched {} transactions so far...", current_count)
        };
        let total = estimated_total.map(|t| t as i64).unwrap_or(-1); // Use -1 to indicate unknown
        let _ = app.emit("transaction-progress", serde_json::json!({
            "current": current_count,
            "total": total,
            "message": message
        }));

        // Check for cancellation after processing batch
        if cancel_flag.load(Ordering::Relaxed) {
            // Clear cancellation flag
            {
                let mut flag_guard = CANCELLATION_FLAG.lock().await;
                *flag_guard = None;
            }
            return Err("Operation cancelled by user".to_string());
        }

        next_path = api_response.d.__next.map(|next| {
            next.strip_prefix(&state.api)
                .unwrap_or(&next)
                .to_string()
        });
    }

    // Clear cancellation flag on success
    {
        let mut flag_guard = CANCELLATION_FLAG.lock().await;
        *flag_guard = None;
    }

    Ok(all_results)
}

#[tauri::command]
async fn is_authenticated() -> bool {
    if let Ok(state) = get_app_state().await {
        if let Some(s) = state.as_ref() {
            return s.access_token.is_some();
        }
    }
    false
}

#[tauri::command]
async fn cancel_operation() -> Result<(), String> {
    let flag_guard = CANCELLATION_FLAG.lock().await;
    if let Some(flag) = flag_guard.as_ref() {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
async fn logout() -> Result<(), String> {
    use std::fs;
    
    let mut state_guard = get_app_state().await?;
    let state = state_guard.as_mut().ok_or("State not initialized")?;
    
    // Clear tokens from memory
    state.access_token = None;
    state.refresh_token = None;
    state.refresh_at = 0;
    state.current_division = None;
    
    // Delete tokens file
    let tokens_file = state.data_dir.join("tokens.json");
    if tokens_file.exists() {
        fs::remove_file(&tokens_file)
            .map_err(|e| format!("Failed to delete tokens file: {}", e))?;
    }
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_auth_url,
            authenticate_with_code,
            get_divisions,
            get_transactions,
            is_authenticated,
            logout,
            cancel_operation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
