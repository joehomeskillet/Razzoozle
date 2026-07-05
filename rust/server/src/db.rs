use sqlx::PgPool;

pub async fn create_pool() -> Option<PgPool> {
    match std::env::var("DATABASE_URL") {
        Ok(url) => Some(sqlx::PgPool::connect(&url).await.expect("Failed to connect to DATABASE_URL")),
        Err(_) => None,
    }
}

pub async fn get_manager_password(pool: &Option<PgPool>) -> Option<String> {
    let pool = match pool {
        Some(p) => p,
        None => return None,
    };

    let row: Option<(Option<String>,)> = sqlx::query_as("SELECT manager_password FROM games_config WHERE id = 1")
        .fetch_optional(pool)
        .await
        .ok()?;

    row.and_then(|(pw,)| pw)
}