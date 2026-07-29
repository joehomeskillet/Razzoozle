import re

with open('tests.rs', 'r') as f:
    content = f.read()

# Replace the ConfigPathGuard with a version that uses Mutex for env operations
old_code = r'''/// Guard that isolates snapshot tests by redirecting CONFIG_PATH to a unique temporary directory\.
/// Each test invocation gets its own snapshot file, preventing parallel test interference\.
/// Restores CONFIG_PATH to its original value on drop \(RAII pattern\)\.
struct ConfigPathGuard \{
    prev_config_path: Option<String>,
\}

impl ConfigPathGuard \{
    /// Create a new guard that redirects CONFIG_PATH to a unique test directory\.
    /// The directory is created inside the system temp directory with a UUID-based name\.
    fn acquire\(\) -> std::io::Result<Self> \{
        use std::path::PathBuf;
        
        // Preserve original CONFIG_PATH \(may be unset\)
        let prev_config_path = std::env::var\("CONFIG_PATH"\)\.ok\(\);
        
        // Create unique test directory: /tmp/razzoozle-test-\{uuid\}/
        let test_dir = std::env::temp_dir\(\)
            \.join\(format!\("razzoozle-test-\{}", uuid::Uuid::new_v4\(\)\)\);
        std::fs::create_dir_all\(&test_dir\)\?;
        
        // Set CONFIG_PATH to our isolated directory
        // SAFETY: std::env::set_var is not thread-safe, but it's used in other tests
        // \(socket/manager/plugins_zip\.rs\)\. Since only this one snapshot test uses
        // snapshots, the risk is minimal\. The guard ensures we restore on drop\.
        std::env::set_var\("CONFIG_PATH", test_dir\.to_string_lossy\(\)\.as_ref\(\)\);
        
        Ok\(ConfigPathGuard \{ prev_config_path \}\)
    \}
\}

impl Drop for ConfigPathGuard \{
    fn drop\(&mut self\) \{
        // Restore CONFIG_PATH to its original state
        match &self\.prev_config_path \{
            Some\(path\) => std::env::set_var\("CONFIG_PATH", path\),
            None => std::env::remove_var\("CONFIG_PATH"\),
        \}
    \}
\}'''

new_code = '''// Test isolation: use Mutex to serialize CONFIG_PATH mutations.
// std::env is not thread-safe (used by tests in parallel async tasks).
// This mutex ensures only one test modifies CONFIG_PATH at a time.
lazy_static::lazy_static! {
    static ref TEST_CONFIG_PATH_LOCK: Mutex<()> = Mutex::new(());
}

/// Guard that isolates snapshot tests by redirecting CONFIG_PATH to a unique temporary directory.
/// Each test invocation gets its own snapshot file, preventing parallel test interference.
/// Acquires a mutex to serialize CONFIG_PATH mutations across all tests.
struct ConfigPathGuard {
    _lock: std::sync::MutexGuard<'static, ()>,
    prev_config_path: Option<String>,
}

impl ConfigPathGuard {
    /// Create a new guard that redirects CONFIG_PATH to a unique test directory.
    /// Serializes with other tests via mutex to prevent CONFIG_PATH races.
    fn acquire() -> std::io::Result<Self> {
        use std::path::PathBuf;
        
        // Acquire lock FIRST, before any env operations
        let _lock = TEST_CONFIG_PATH_LOCK.lock().unwrap();
        
        // Preserve original CONFIG_PATH (may be unset)
        let prev_config_path = std::env::var("CONFIG_PATH").ok();
        
        // Create unique test directory: /tmp/razzoozle-test-{uuid}/
        let test_dir = std::env::temp_dir()
            .join(format!("razzoozle-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&test_dir)?;
        
        // Set CONFIG_PATH to our isolated directory
        std::env::set_var("CONFIG_PATH", test_dir.to_string_lossy().as_ref());
        
        Ok(ConfigPathGuard { _lock, prev_config_path })
    }
}

impl Drop for ConfigPathGuard {
    fn drop(&mut self) {
        // CONFIG_PATH is still protected by _lock until we return
        match &self.prev_config_path {
            Some(path) => std::env::set_var("CONFIG_PATH", path),
            None => std::env::remove_var("CONFIG_PATH"),
        }
        // Lock is automatically released when _lock is dropped here
    }
}'''

content = re.sub(old_code, new_code, content, flags=re.MULTILINE | re.DOTALL)

with open('tests.rs', 'w') as f:
    f.write(content)

print("✓ Updated ConfigPathGuard to use Mutex serialization")
