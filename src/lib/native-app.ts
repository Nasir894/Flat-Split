// When Flat Split runs inside the Android app, the app puts this on the page before it loads.
export type NativeApp = {
  /** The phone has a screen lock (fingerprint, face, PIN or pattern) the app can use. */
  lockAvailable: boolean;
  /** "Unlock with fingerprint/face" is on for this phone. */
  lockEnabled: boolean;
};

export const nativeApp = (): NativeApp | null =>
  typeof window === "undefined" ? null : ((window as { FlatSplitApp?: NativeApp }).FlatSplitApp ?? null);

/** Sends a message to the Android app (no-op in a normal browser). */
export function postToApp(msg: Record<string, unknown>) {
  (window as { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView?.postMessage(JSON.stringify(msg));
}
