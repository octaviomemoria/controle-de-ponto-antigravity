import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.omway.controleponto",
  appName: "Controle de Ponto OM Way",
  webDir: "../web/dist",
  server: {
    androidScheme: "https"
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: "#2563eb",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP"
    }
  },
  cordova: {
    preferences: {
      ScrollEnabled: "false",
      Orientation: "portrait",
      "android-minSdkVersion": "22",
      "android-targetSdkVersion": "33"
    }
  }
};

export default config;
