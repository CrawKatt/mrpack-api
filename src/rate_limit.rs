use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
struct AttemptBucket {
    failures: u32,
    locked_until: Option<Instant>,
    window_start: Instant,
    window_count: u32,
}

impl Default for AttemptBucket {
    fn default() -> Self {
        Self {
            failures: 0,
            locked_until: None,
            window_start: Instant::now(),
            window_count: 0,
        }
    }
}

pub struct RateLimiter {
    buckets: Mutex<HashMap<String, AttemptBucket>>,
    max_failures: u32,
    lockout: Duration,
    max_per_window: u32,
    window: Duration,
}

impl RateLimiter {
    pub fn new(
        max_failures: u32,
        lockout: Duration,
        max_per_window: u32,
        window: Duration,
    ) -> Self {
        Self {
            buckets: Mutex::new(HashMap::new()),
            max_failures,
            lockout,
            max_per_window,
            window,
        }
    }

    pub fn check(&self, key: &str) -> Result<(), u64> {
        let mut map = self
            .buckets
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let bucket = map.entry(key.to_string()).or_default();
        let now = Instant::now();

        if let Some(until) = bucket.locked_until {
            if now < until {
                let retry_after = (until - now).as_secs().max(1);
                drop(map);
                return Err(retry_after);
            }
            bucket.locked_until = None;
            bucket.failures = 0;
        }

        if now.duration_since(bucket.window_start) > self.window {
            bucket.window_start = now;
            bucket.window_count = 0;
        }

        if bucket.window_count >= self.max_per_window {
            let remaining = self
                .window
                .saturating_sub(now.duration_since(bucket.window_start));
            let retry_after = remaining.as_secs().max(1);
            drop(map);
            return Err(retry_after);
        }

        drop(map);
        Ok(())
    }

    pub fn record_success(&self, key: &str) {
        let mut map = self
            .buckets
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(bucket) = map.get_mut(key) {
            bucket.failures = 0;
            bucket.locked_until = None;
            bucket.window_count = bucket.window_count.saturating_add(1);
        }
    }

    pub fn record_failure(&self, key: &str) {
        let mut map = self
            .buckets
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let bucket = map.entry(key.to_string()).or_default();
        let now = Instant::now();

        if now.duration_since(bucket.window_start) > self.window {
            bucket.window_start = now;
            bucket.window_count = 0;
        }
        bucket.window_count = bucket.window_count.saturating_add(1);
        bucket.failures = bucket.failures.saturating_add(1);

        if bucket.failures >= self.max_failures {
            bucket.locked_until = Some(now + self.lockout);
        }
        drop(map);
    }

    pub fn record_hit(&self, key: &str) {
        let mut map = self
            .buckets
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let bucket = map.entry(key.to_string()).or_default();
        let now = Instant::now();
        if now.duration_since(bucket.window_start) > self.window {
            bucket.window_start = now;
            bucket.window_count = 0;
        }
        bucket.window_count = bucket.window_count.saturating_add(1);
        drop(map);
    }
}

pub fn login_limiter() -> &'static RateLimiter {
    static LIMITER: OnceLock<RateLimiter> = OnceLock::new();
    LIMITER.get_or_init(|| {
        RateLimiter::new(
            5,
            Duration::from_secs(15 * 60),
            20,
            Duration::from_secs(15 * 60),
        )
    })
}

pub fn crash_report_limiter() -> &'static RateLimiter {
    static LIMITER: OnceLock<RateLimiter> = OnceLock::new();
    LIMITER.get_or_init(|| {
        RateLimiter::new(
            20,
            Duration::from_secs(10 * 60),
            5,
            Duration::from_secs(10 * 60),
        )
    })
}

pub fn client_ip_from_headers(
    headers: &axum::http::HeaderMap,
    fallback: Option<std::net::SocketAddr>,
) -> String {
    if let Some(forwarded) = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        return forwarded.to_string();
    }

    if let Some(real_ip) = headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        return real_ip.to_string();
    }

    fallback.map_or_else(|| "unknown".to_string(), |addr| addr.ip().to_string())
}
