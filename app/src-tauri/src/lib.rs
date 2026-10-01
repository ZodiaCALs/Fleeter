// Fleeter app: shows the same page as the website, and fetches every news source
// directly from the device (no server needed), through the `fetch_url` command below.
use base64::Engine;
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

#[derive(serde::Serialize)]
struct FetchResult {
    status: u16,
    url: String,
    headers: HashMap<String, String>,
    body: String, // base64, so any text encoding (UTF-8, GBK) or image survives the trip
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .connect_timeout(Duration::from_secs(10))
            .cookie_store(true)
            .redirect(reqwest::redirect::Policy::limited(8))
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
            .build()
            .expect("could not create the HTTP client")
    })
}

#[tauri::command]
async fn fetch_url(url: String, headers: Option<HashMap<String, String>>) -> Result<FetchResult, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only web addresses can be fetched".into());
    }
    let mut req = client().get(&url);
    if let Some(h) = headers {
        for (k, v) in h {
            req = req.header(k, v);
        }
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let final_url = res.url().to_string();
    let mut out = HashMap::new();
    for (k, v) in res.headers().iter() {
        if let Ok(s) = v.to_str() {
            out.insert(k.as_str().to_string(), s.to_string());
        }
    }
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > 12 * 1024 * 1024 {
        return Err("The page is too large".into());
    }
    Ok(FetchResult {
        status,
        url: final_url,
        headers: out,
        body: base64::engine::general_purpose::STANDARD.encode(&bytes),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_url])
        .run(tauri::generate_context!())
        .expect("error while running Fleeter");
}
