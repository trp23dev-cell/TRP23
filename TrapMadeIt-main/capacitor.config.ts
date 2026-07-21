import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.trapmadeit.app",
  appName: "TrapMadeIt",
  webDir: "dist",
  bundledWebRuntime: false,
  server: {
    iosScheme: "https",
  },
};

export default config;
