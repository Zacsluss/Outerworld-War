// Brood War Remake, the desktop wrapper (REVIEW-M17 task 28).
//
// The window loads the page from the bundle (tauri.conf.json: frontendDist = desktop/dist, a copy of
// index.html, js/ and assets/). Everything the game does, it does in the page; the one thing a page
// cannot do is run the multiplayer relay, which is a Node program (test/serve.js) -- so the relay ships
// beside the executable as a Tauri sidecar, built into one self-contained file by desktop/relay/build.js
// from test/serve.js unchanged, and this file starts and stops it:
//
//   host_relay(delay)  pick a free port, spawn the sidecar with [port, delay], wait for the line
//                      serve.js prints from server.listen ("Brood War Remake: http://localhost:PORT
//                      LAN: http://IP:PORT ...  delay N frames"), and answer the page with the port
//                      and the LAN addresses parsed from that line. One relay at a time: a second
//                      call kills the first.
//   stop_relay()       kill it. Also done when the window is destroyed and when the app exits, so a
//                      relay never outlives the game that started it.
//   relay_status()     the port if a relay is running, for a page that reloads while hosting.
//
// The page side is js/desktop.js. The page never talks to the shell plugin itself, so the capability
// file grants it core APIs only; the sidecar is spawned here, with arguments the page cannot shape.
//
// UNTESTED IN A RUNNING WINDOW when this was written -- see NOTES.md for what was compiled and run.

// Keeps a release build from opening a console window beside the game on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpListener;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent, State, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// The line serve.js prints once it is listening; the port and the LAN addresses are read from it.
const READY_MARK: &str = "http://localhost:";
/// How long the page waits for that line before giving up on the sidecar.
const START_TIMEOUT: Duration = Duration::from_secs(10);
/// serve.js's own default, and its clamp (1..=20).
const DEFAULT_DELAY: u32 = 3;

struct Running {
    child: CommandChild,
    port: u16,
    /// Windows: the Job Object holding the relay; dropping it (or this process dying) kills the relay.
    #[cfg(windows)]
    _job: Option<job::Job>,
}

/// The relay must not outlive the game even when the game does not get to say goodbye -- a crash, a
/// TerminateProcess from Task Manager. Measured before this existed (desktop/window-check.js): a hard kill of
/// the wrapper left bw-relay.exe running. A Job Object with KILL_ON_JOB_CLOSE ends every process in it when
/// its last handle closes, and the kernel closes this process's handles however it dies.
#[cfg(windows)]
mod job {
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

    pub struct Job(HANDLE);
    // A job handle is a kernel object; using it from another thread is fine.
    unsafe impl Send for Job {}

    impl Job {
        pub fn new() -> Option<Job> {
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return None;
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let size = std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32;
                if SetInformationJobObject(handle, JobObjectExtendedLimitInformation, &info as *const _ as *const _, size) == 0 {
                    CloseHandle(handle);
                    return None;
                }
                Some(Job(handle))
            }
        }
        pub fn assign(&self, pid: u32) -> bool {
            unsafe {
                let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
                if process.is_null() {
                    return false;
                }
                let assigned = AssignProcessToJobObject(self.0, process) != 0;
                CloseHandle(process);
                assigned
            }
        }
    }
    impl Drop for Job {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

#[derive(Default)]
struct Relay(Mutex<Option<Running>>);

#[derive(serde::Serialize, Clone)]
struct RelayInfo {
    port: u16,
    delay: u32,
    lan: Vec<String>,
}

/// Ask the OS for a port nobody holds, then release it for the relay to take a moment later.
fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("no free port: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    Ok(port)
}

/// Kill the running relay, if any. Returns whether there was one.
fn stop(relay: &Relay) -> bool {
    let running = relay.0.lock().map(|mut r| r.take()).unwrap_or(None);
    match running {
        Some(r) => {
            let _ = r.child.kill();
            true
        }
        None => false,
    }
}

/// "Brood War Remake: http://localhost:51234   LAN: http://192.168.1.5:51234 http://10.0.0.2:51234   delay 3 frames"
/// -> ["192.168.1.5", "10.0.0.2"]. serve.js lists the machine's non-internal IPv4 addresses there.
fn lan_addresses(ready_line: &str, port: u16) -> Vec<String> {
    let suffix = format!(":{port}");
    ready_line
        .split_whitespace()
        .filter_map(|token| token.strip_prefix("http://"))
        .filter_map(|host_port| host_port.strip_suffix(suffix.as_str()))
        .filter(|host| *host != "localhost")
        .map(String::from)
        .collect()
}

#[tauri::command]
async fn host_relay(app: tauri::AppHandle, relay: State<'_, Relay>, delay: Option<u32>) -> Result<RelayInfo, String> {
    stop(&relay);
    let port = free_port()?;
    let delay = delay.unwrap_or(DEFAULT_DELAY).clamp(1, 20);
    let command = app
        .shell()
        .sidecar("bw-relay")
        .map_err(|e| format!("the relay is not beside the app: {e}"))?
        .args([port.to_string(), delay.to_string()]);
    let (mut rx, child) = command.spawn().map_err(|e| format!("could not start the relay: {e}"))?;
    // Into the job at once, before anything can go wrong on this side. Failing to make or join the job is
    // not fatal: the explicit kills below still cover every orderly exit, only the crash path is lost.
    #[cfg(windows)]
    let job = job::Job::new().filter(|j| j.assign(child.pid()));
    #[cfg(windows)]
    if job.is_none() {
        eprintln!("[bw-relay] not in a job object: a crash of the game would leave the relay running");
    }

    // Wait for serve.js to say it is listening, so the page's connect cannot race the bind.
    let wait = async {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes).to_string();
                    if line.contains(READY_MARK) {
                        return Ok(line);
                    }
                }
                CommandEvent::Stderr(bytes) => eprintln!("[bw-relay] {}", String::from_utf8_lossy(&bytes).trim_end()),
                CommandEvent::Error(e) => return Err(format!("the relay failed: {e}")),
                CommandEvent::Terminated(t) => return Err(format!("the relay exited before it was listening (exit code {:?})", t.code)),
                _ => {}
            }
        }
        Err(String::from("the relay closed its output before it was listening"))
    };
    let ready = match tokio::time::timeout(START_TIMEOUT, wait).await {
        Ok(result) => result,
        Err(_) => Err(format!("the relay did not report listening within {} s", START_TIMEOUT.as_secs())),
    };
    let ready = match ready {
        Ok(line) => line,
        Err(e) => {
            let _ = child.kill();
            return Err(e);
        }
    };
    let lan = lan_addresses(&ready, port);
    println!("[bw-relay] {}", ready.trim_end());

    // Keep draining the pipes for the life of the process: a full pipe would block the relay's console writes.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => println!("[bw-relay] {}", String::from_utf8_lossy(&bytes).trim_end()),
                CommandEvent::Stderr(bytes) => eprintln!("[bw-relay] {}", String::from_utf8_lossy(&bytes).trim_end()),
                CommandEvent::Terminated(t) => println!("[bw-relay] exited (code {:?})", t.code),
                _ => {}
            }
        }
    });

    if let Ok(mut slot) = relay.0.lock() {
        *slot = Some(Running {
            child,
            port,
            #[cfg(windows)]
            _job: job,
        });
    }
    Ok(RelayInfo { port, delay, lan })
}

#[tauri::command]
fn stop_relay(relay: State<'_, Relay>) -> bool {
    stop(&relay)
}

#[tauri::command]
fn relay_status(relay: State<'_, Relay>) -> Option<u16> {
    relay.0.lock().ok().and_then(|r| r.as_ref().map(|running| running.port))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Relay::default())
        .invoke_handler(tauri::generate_handler![host_relay, stop_relay, relay_status])
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                stop(&window.state::<Relay>());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building the Brood War Remake window")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                stop(&app.state::<Relay>());
            }
        });
}

#[cfg(test)]
mod tests {
    use super::lan_addresses;

    #[test]
    fn reads_the_lan_addresses_from_the_ready_line() {
        let line = "Brood War Remake: http://localhost:51234   LAN: http://192.168.1.5:51234 http://10.0.0.2:51234   delay 3 frames";
        assert_eq!(lan_addresses(line, 51234), vec!["192.168.1.5", "10.0.0.2"]);
    }

    #[test]
    fn a_relay_with_no_lan_address_lists_none() {
        assert_eq!(lan_addresses("Brood War Remake: http://localhost:8765   delay 3 frames", 8765), Vec::<String>::new());
    }

    #[test]
    fn another_port_in_the_line_is_not_an_address() {
        assert_eq!(lan_addresses("Brood War Remake: http://localhost:8765   LAN: http://192.168.1.5:8765", 9999), Vec::<String>::new());
    }
}
