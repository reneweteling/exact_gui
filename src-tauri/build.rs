fn main() {
    // Check for required AWS environment variables during build
    let required_env_vars = [
        "CLIENT_ID",
        "CLIENT_SECRET",
        "DIVISION",
        "REDIRECT_URI",
        "API"
    ];

    for var in &required_env_vars {
        if std::env::var(var).is_err() {
            panic!("Required environment variable {} is not set. Please set it before building.", var);
        }
        println!("cargo:rustc-env={}={}", var, std::env::var(var).unwrap());
    }

    tauri_build::build()
}
