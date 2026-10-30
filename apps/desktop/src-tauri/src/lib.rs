//! Application de bureau Jupiter Compta : fenêtre native sur l'application web (même sécurité :
//! session httpOnly, double authentification, poste enrôlé), plus l'empreinte d'installation
//! utilisée par les licences hors ligne signées Ed25519 (docs/09).
use sha2::{Digest, Sha256};

/// Empreinte de l'installation : SHA-256 de « nom d'hôte|identifiant machine », en minuscules,
/// identique à `installationFingerprint` du paquet @jupiter/licensing.
#[tauri::command]
fn installation_fingerprint() -> String {
    let host = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .or_else(|_| std::fs::read_to_string("/etc/hostname"))
        .unwrap_or_default();
    let machine = std::fs::read_to_string("/etc/machine-id")
        .or_else(|_| std::fs::read_to_string("/var/lib/dbus/machine-id"))
        .unwrap_or_default();
    let joined = format!("{}|{}", host.trim().to_lowercase(), machine.trim().to_lowercase());
    hex::encode(Sha256::digest(joined.as_bytes()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![installation_fingerprint])
        .run(tauri::generate_context!())
        .expect("erreur au démarrage de Jupiter Compta");
}
