import { Window } from "@tauri-apps/api/window";

// ウィンドウ操作関数
export async function minimizeWindow() {
  const appWindow = Window.getCurrent();
  await appWindow.minimize();
}

export async function maximizeWindow() {
  const appWindow = Window.getCurrent();
  const isMaximized = await appWindow.isMaximized();
  if (isMaximized) {
    await appWindow.unmaximize();
  } else {
    await appWindow.maximize();
  }
}

export async function hideWindow() {
  const appWindow = Window.getCurrent();
  await appWindow.hide();
} 