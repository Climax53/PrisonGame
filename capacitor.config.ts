import type { CapacitorConfig } from "@capacitor/cli";

// Native packaging config for the App Store (Apple) and Play Store (Samsung/Android).
// `npm run build` emits ./dist, then `npx cap sync` copies it into the native shells.
const config: CapacitorConfig = {
  appId: "com.wardenskeep.game",
  appName: "Warden's Keep",
  webDir: "dist",
  backgroundColor: "#1a1410",
  android: { backgroundColor: "#1a1410" },
  ios: { contentInset: "always", backgroundColor: "#1a1410" },
};

export default config;
