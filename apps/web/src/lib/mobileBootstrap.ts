import { Capacitor } from "@capacitor/core";

function isNativeShell(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

async function hideSplashScreen(): Promise<void> {
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch (error) {
    console.warn("Mobile bootstrap: splash screen init failed", error);
  }
}

async function configureStatusBar(): Promise<void> {
  try {
    const [{ StatusBar }, statusBarModule] = await Promise.all([
      import("@capacitor/status-bar"),
      import("@capacitor/status-bar")
    ]);

    const style = "Style" in statusBarModule ? statusBarModule.Style.Light : undefined;
    if (style) {
      await StatusBar.setStyle({ style });
    }
  } catch (error) {
    console.warn("Mobile bootstrap: status bar init failed", error);
  }
}

async function configureKeyboard(): Promise<void> {
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch (error) {
    console.warn("Mobile bootstrap: keyboard init failed", error);
  }
}

export async function initMobileBootstrap(): Promise<void> {
  if (!isNativeShell()) {
    return;
  }

  document.documentElement.dataset.platform = Capacitor.getPlatform();

  await Promise.all([
    hideSplashScreen(),
    configureStatusBar(),
    configureKeyboard()
  ]);
}
