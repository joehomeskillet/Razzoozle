use std::fs;

/// Maximum file size for a secret file (64 KiB).
const MAX_SECRET_FILE_SIZE: u64 = 64 * 1024;

/// Error type for secret resolution.
#[derive(Debug)]
pub enum SecretError {
    /// Both direct variable and *_FILE variable are set (configuration error).
    Conflict(String),
    /// File specified by *_FILE does not exist or is not readable.
    FileNotFound(String, String), // (var_name, path)
    /// File exceeds maximum allowed size.
    FileTooLarge(String, String), // (var_name, size_info)
    /// Error reading file.
    FileReadError(String, String, String), // (var_name, path, error_message)
}

impl std::fmt::Display for SecretError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SecretError::Conflict(var) => {
                write!(
                    f,
                    "Configuration error: both {} and {}_FILE are set",
                    var, var
                )
            }
            SecretError::FileNotFound(var, _path) => {
                write!(f, "Secret file not found for variable {}", var)
            }
            SecretError::FileTooLarge(var, _size_info) => {
                write!(
                    f,
                    "Secret file for {} exceeds maximum size of {} bytes",
                    var, MAX_SECRET_FILE_SIZE
                )
            }
            SecretError::FileReadError(var, _path, _err) => {
                write!(f, "Failed to read secret file for variable {}", var)
            }
        }
    }
}

impl std::error::Error for SecretError {}

/// Resolve a secret from environment variable or file.
///
/// # Resolution order
/// 1. If `<VAR>_FILE` is set, read from that file (remove one trailing newline if present).
/// 2. Else if `<VAR>` is set, use its value directly.
/// 3. Else return `Ok(None)`.
///
/// # Errors
/// - Returns `Err(Conflict)` if both `<VAR>` and `<VAR>_FILE` are set.
/// - Returns `Err(FileNotFound)` if `<VAR>_FILE` points to a non-existent file.
/// - Returns `Err(FileTooLarge)` if file exceeds 64 KiB.
/// - Returns `Err(FileReadError)` if file cannot be read.
///
/// # Examples
/// ```ignore
/// let db_url = resolve_secret("DATABASE_URL")?;
/// let password = resolve_secret("BOOTSTRAP_ADMIN_PASSWORD")?;
/// ```
pub fn resolve_secret(var_name: &str) -> Result<Option<String>, SecretError> {
    let var_file_name = format!("{}_FILE", var_name);
    let var_value = std::env::var(var_name).ok();
    let file_path = std::env::var(&var_file_name).ok();

    match (var_value, file_path) {
        (Some(_), Some(_)) => {
            // Both are set: configuration error
            Err(SecretError::Conflict(var_name.to_string()))
        }
        (Some(value), None) => {
            // Direct variable set: use it
            Ok(Some(value))
        }
        (None, Some(path)) => {
            // File path set: read from file
            read_secret_file(&path, var_name)
        }
        (None, None) => {
            // Neither set: nothing to return
            Ok(None)
        }
    }
}

/// Read a secret from a file, removing exactly one trailing newline if present.
fn read_secret_file(path: &str, var_name: &str) -> Result<Option<String>, SecretError> {
    // Check file exists and get metadata
    let metadata = fs::metadata(path)
        .map_err(|_| SecretError::FileNotFound(var_name.to_string(), path.to_string()))?;

    // Check file is regular file
    if !metadata.is_file() {
        return Err(SecretError::FileNotFound(
            var_name.to_string(),
            path.to_string(),
        ));
    }

    // Check size limit
    let file_size = metadata.len();
    if file_size > MAX_SECRET_FILE_SIZE {
        return Err(SecretError::FileTooLarge(
            var_name.to_string(),
            format!("{}B > {}B", file_size, MAX_SECRET_FILE_SIZE),
        ));
    }

    // Read file content
    let content = fs::read_to_string(path).map_err(|e| {
        SecretError::FileReadError(var_name.to_string(), path.to_string(), e.to_string())
    })?;

    // Remove exactly one trailing newline if present
    let result = if content.ends_with('\n') {
        content[..content.len() - 1].to_string()
    } else {
        content
    };

    Ok(Some(result))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Helper to create a unique test variable name to avoid env conflicts in parallel tests
    fn test_var(test_name: &str) -> String {
        format!("TEST_DCK06_{}", test_name)
    }

    #[test]
    fn test_direct_variable() {
        let var_name = test_var("direct_var");
        std::env::set_var(&var_name, "secret123");

        let result = resolve_secret(&var_name);
        assert_eq!(result.unwrap(), Some("secret123".to_string()));

        std::env::remove_var(&var_name);
    }

    #[test]
    fn test_direct_variable_not_set() {
        let var_name = test_var("not_set");
        // Make sure neither is set
        std::env::remove_var(&var_name);
        std::env::remove_var(&format!("{}_FILE", var_name));

        let result = resolve_secret(&var_name);
        assert_eq!(result.unwrap(), None);
    }

    #[test]
    fn test_file_with_newline() {
        let var_name = test_var("file_newline");
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("secret.txt");

        // Write file with trailing newline
        fs::write(&file_path, "fileseeret\n").unwrap();
        std::env::set_var(&format!("{}_FILE", var_name), file_path.to_str().unwrap());
        std::env::remove_var(&var_name);

        let result = resolve_secret(&var_name);
        // Should remove exactly one trailing newline
        assert_eq!(result.unwrap(), Some("fileseeret".to_string()));

        std::env::remove_var(&format!("{}_FILE", var_name));
    }

    #[test]
    fn test_file_preserves_trailing_space() {
        let var_name = test_var("file_space");
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("secret_space.txt");

        // Write file with trailing space but no newline
        fs::write(&file_path, "secret ").unwrap();
        std::env::set_var(&format!("{}_FILE", var_name), file_path.to_str().unwrap());
        std::env::remove_var(&var_name);

        let result = resolve_secret(&var_name);
        assert_eq!(result.unwrap(), Some("secret ".to_string()));

        std::env::remove_var(&format!("{}_FILE", var_name));
    }

    #[test]
    fn test_file_with_multiple_newlines() {
        let var_name = test_var("file_multi_newline");
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("secret_multi.txt");

        // Write file with content ending in multiple newlines
        fs::write(&file_path, "line1\nline2\n\n").unwrap();
        std::env::set_var(&format!("{}_FILE", var_name), file_path.to_str().unwrap());
        std::env::remove_var(&var_name);

        let result = resolve_secret(&var_name);
        // Should remove only the last newline
        assert_eq!(result.unwrap(), Some("line1\nline2\n".to_string()));

        std::env::remove_var(&format!("{}_FILE", var_name));
    }

    #[test]
    fn test_empty_file() {
        let var_name = test_var("file_empty");
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("secret_empty.txt");

        // Write empty file
        fs::write(&file_path, "").unwrap();
        std::env::set_var(&format!("{}_FILE", var_name), file_path.to_str().unwrap());
        std::env::remove_var(&var_name);

        let result = resolve_secret(&var_name);
        // Empty file after stripping newline = Ok(Some(""))
        assert_eq!(result.unwrap(), Some("".to_string()));

        std::env::remove_var(&format!("{}_FILE", var_name));
    }

    #[test]
    fn test_conflict_both_set() {
        let var_name = test_var("conflict");
        std::env::set_var(&var_name, "direct_value");
        std::env::set_var(&format!("{}_FILE", var_name), "/tmp/secret.txt");

        let result = resolve_secret(&var_name);
        match result {
            Err(SecretError::Conflict(v)) => assert_eq!(v, var_name),
            _ => panic!("Expected Conflict error"),
        }

        std::env::remove_var(&var_name);
        std::env::remove_var(&format!("{}_FILE", var_name));
    }

    #[test]
    fn test_file_not_found() {
        let var_name = test_var("file_not_found");
        std::env::set_var(
            &format!("{}_FILE", var_name),
            "/nonexistent/path/secret.txt",
        );
        std::env::remove_var(&var_name);

        let result = resolve_secret(&var_name);
        match result {
            Err(SecretError::FileNotFound(v, _)) => assert_eq!(v, var_name),
            _ => panic!("Expected FileNotFound error"),
        }

        std::env::remove_var(&format!("{}_FILE", var_name));
    }

    #[test]
    fn test_file_too_large() {
        let var_name = test_var("file_too_large");
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("secret_large.txt");

        // Write file larger than MAX_SECRET_FILE_SIZE
        let large_content = vec![b'A'; (MAX_SECRET_FILE_SIZE as usize) + 1];
        fs::write(&file_path, large_content).unwrap();
        std::env::set_var(&format!("{}_FILE", var_name), file_path.to_str().unwrap());
        std::env::remove_var(&var_name);

        let result = resolve_secret(&var_name);
        match result {
            Err(SecretError::FileTooLarge(v, _)) => assert_eq!(v, var_name),
            _ => panic!("Expected FileTooLarge error"),
        }

        std::env::remove_var(&format!("{}_FILE", var_name));
    }

    #[test]
    fn test_file_precedence() {
        // According to spec: *_FILE has precedence, but this test documents
        // the error case (both set) is rejected. Here we just test *_FILE works alone.
        let var_name = test_var("file_alone");
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("secret_alone.txt");

        fs::write(&file_path, "from_file\n").unwrap();
        std::env::set_var(&format!("{}_FILE", var_name), file_path.to_str().unwrap());
        std::env::remove_var(&var_name);

        let result = resolve_secret(&var_name);
        assert_eq!(result.unwrap(), Some("from_file".to_string()));

        std::env::remove_var(&format!("{}_FILE", var_name));
    }
}
