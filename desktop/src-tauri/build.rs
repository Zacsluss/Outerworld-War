// tauri-build reads tauri.conf.json, embeds icons/icon.ico on Windows, and copies the sidecar named in
// bundle.externalBin (src-tauri/binaries/bw-relay-<host triple>[.exe], built by `npm run build:relay`)
// next to the executable it produces. A missing sidecar fails this step with its path in the message.
fn main() {
    tauri_build::build()
}
