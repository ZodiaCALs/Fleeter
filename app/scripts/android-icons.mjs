// Copies Fleeter's launcher icons into the Android project created by `tauri android init`.
import { cpSync, existsSync } from "node:fs";
const from = new URL("../android-icons/res/", import.meta.url);
const to = new URL("../src-tauri/gen/android/app/src/main/res/", import.meta.url);
if (!existsSync(to)) { console.log("Android project not found yet. Run `npm run android:init` first."); process.exit(0); }
cpSync(from, to, { recursive: true });
console.log("Fleeter icons copied into the Android project.");
