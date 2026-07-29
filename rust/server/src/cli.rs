/// CLI argument parser for razzoozle-server.
///
/// Handles subcommands (serve, healthcheck, migrate) and flags (--version, --help).
/// Designed to be testable without touching the database or starting the server.

#[derive(Debug, Clone, PartialEq)]
pub enum Command {
    /// Start the server (default when no arguments are given)
    Serve,
    /// Check server health (stub implementation, real logic in DCK-04)
    Healthcheck,
    /// Run database migrations (stub implementation, real logic in DCK-05)
    Migrate,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CliAction {
    /// Execute the command
    Execute(Command),
    /// Print version and exit
    PrintVersion,
    /// Print help and exit
    PrintHelp,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ParseError {
    /// Unknown subcommand or flag
    UnknownArgument(String),
}

/// Parse command-line arguments.
///
/// Returns `CliAction::Execute(Command)` for valid commands.
/// Returns `CliAction::PrintVersion` or `CliAction::PrintHelp` for --version/--help.
/// Returns `Err(ParseError)` for unknown arguments (should exit with code 2).
///
/// **Backward compatibility (DCK-07):** No arguments returns `Execute(Command::Serve)`,
/// preserving Dockerfile CMD ["razzoozle-server"] behavior.
pub fn parse_args(args: Vec<String>) -> Result<CliAction, ParseError> {
    // Skip the binary name (args[0])
    let mut args_iter = args.iter().skip(1);

    match args_iter.next() {
        None => {
            // No arguments: serve (Prod backward-compat for Dockerfile CMD ["razzoozle-server"])
            Ok(CliAction::Execute(Command::Serve))
        }
        Some(arg) => match arg.as_str() {
            "serve" => Ok(CliAction::Execute(Command::Serve)),
            "healthcheck" => Ok(CliAction::Execute(Command::Healthcheck)),
            "migrate" => Ok(CliAction::Execute(Command::Migrate)),
            "--version" => Ok(CliAction::PrintVersion),
            "-v" => Ok(CliAction::PrintVersion),
            "--help" => Ok(CliAction::PrintHelp),
            "-h" => Ok(CliAction::PrintHelp),
            unknown => Err(ParseError::UnknownArgument(unknown.to_string())),
        },
    }
}

/// Get version string: package version + git revision (if available).
pub fn version_string() -> String {
    let pkg_version = env!("CARGO_PKG_VERSION");
    let git_hash = option_env!("GIT_HASH").unwrap_or("unknown");
    format!("{} ({})", pkg_version, git_hash)
}

/// Print help message to stdout.
pub fn print_help() {
    println!(
        r#"razzoozle-server {}

USAGE:
    razzoozle-server [COMMAND]

COMMANDS:
    serve           Start the server (default)
    healthcheck     Check server health status
    migrate         Run database migrations
    --version       Print version and exit
    --help          Print this help message and exit

NOTES:
    - Running without arguments starts the server (default).
    - Unknown arguments result in an error (exit code 2).
"#,
        version_string()
    );
}

/// Execute healthcheck: probe the server's readiness endpoint and return exit code.
/// Checks http://127.0.0.1:${PORT}/readyz (loopback only, no external network).
/// Returns 0 if server is ready (HTTP 200), 1 otherwise.
pub async fn execute_healthcheck() -> i32 {
    let port = std::env::var("PORT").unwrap_or_else(|_| "3020".into());
    let url = format!("http://127.0.0.1:{}/readyz", port);

    // Use a short timeout to fail fast if server is unreachable.
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("healthcheck: failed to build HTTP client: {}", e);
            return 1;
        }
    };

    match client.get(&url).send().await {
        Ok(resp) => {
            if resp.status() == 200 {
                eprintln!("healthcheck: server is ready");
                0
            } else {
                eprintln!("healthcheck: server returned status {}", resp.status());
                1
            }
        }
        Err(e) => {
            eprintln!("healthcheck: failed to connect to server at {}: {}", url, e);
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_no_args_serves_by_default() {
        let args = vec!["razzoozle-server".to_string()];
        assert_eq!(parse_args(args), Ok(CliAction::Execute(Command::Serve)));
    }

    #[test]
    fn test_serve_command() {
        let args = vec!["razzoozle-server".to_string(), "serve".to_string()];
        assert_eq!(parse_args(args), Ok(CliAction::Execute(Command::Serve)));
    }

    #[test]
    fn test_healthcheck_command() {
        let args = vec!["razzoozle-server".to_string(), "healthcheck".to_string()];
        assert_eq!(
            parse_args(args),
            Ok(CliAction::Execute(Command::Healthcheck))
        );
    }

    #[test]
    fn test_migrate_command() {
        let args = vec!["razzoozle-server".to_string(), "migrate".to_string()];
        assert_eq!(parse_args(args), Ok(CliAction::Execute(Command::Migrate)));
    }

    #[test]
    fn test_version_flag() {
        let args = vec!["razzoozle-server".to_string(), "--version".to_string()];
        assert_eq!(parse_args(args), Ok(CliAction::PrintVersion));
    }

    #[test]
    fn test_version_short_flag() {
        let args = vec!["razzoozle-server".to_string(), "-v".to_string()];
        assert_eq!(parse_args(args), Ok(CliAction::PrintVersion));
    }

    #[test]
    fn test_help_flag() {
        let args = vec!["razzoozle-server".to_string(), "--help".to_string()];
        assert_eq!(parse_args(args), Ok(CliAction::PrintHelp));
    }

    #[test]
    fn test_help_short_flag() {
        let args = vec!["razzoozle-server".to_string(), "-h".to_string()];
        assert_eq!(parse_args(args), Ok(CliAction::PrintHelp));
    }

    #[test]
    fn test_unknown_argument_fails() {
        let args = vec!["razzoozle-server".to_string(), "invalid".to_string()];
        match parse_args(args) {
            Err(ParseError::UnknownArgument(s)) => assert_eq!(s, "invalid"),
            _ => panic!("Expected UnknownArgument error"),
        }
    }

    #[test]
    fn test_unknown_argument_with_dashes_fails() {
        let args = vec!["razzoozle-server".to_string(), "--unknown-flag".to_string()];
        match parse_args(args) {
            Err(ParseError::UnknownArgument(s)) => assert_eq!(s, "--unknown-flag"),
            _ => panic!("Expected UnknownArgument error"),
        }
    }
}
