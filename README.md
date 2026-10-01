# Fleeter

Your morning briefing: game industry, sport, anime, music, headlines, digital tech and the economy, from 99 sources in English and Chinese.

One codebase gives you three ways to use it:

- **Website** on Cloudflare's free plan, with a morning edition collected every day.
- **Installed app** from that website on Android or Mac. No building needed.
- **Native app** for Mac (.dmg) and Android (.apk). It fetches every source directly from your device, so it needs no server.

## What's in this version

- **HD photos.** Fleeter asks each image service for its large version (YouTube, BBC, Tencent, NetEase, Bilibili, WordPress sites and others) and keeps the original as a fallback. When a feed only offers a small thumbnail, Fleeter fetches the article's own share image instead, which is usually 1200 px wide.
- **Chinese sources.** 腾讯新闻 Tencent News, 网易新闻 NetEase News (headlines, sport, tech, finance) and 哔哩哔哩 Bilibili (game, anime, music, tech and sport rankings, plus the official Genshin, Star Rail, Zenless and Wuthering Waves accounts). Use the language menu to show English, 中文 or both.
- **Sport sections.** Football, Tennis, Swimming and Table tennis. Football splits into the Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, International and Chinese Super League. Stories are sorted by the feed they come from, or by club, league and player names in English and Chinese.
- **More digital tech.** TechCrunch, Wired, The Register, CNET, 9to5Mac, 9to5Google, Android Authority, XDA, Hacker News, IT之家, 少数派, 36氪 and 爱范儿, alongside The Verge, Ars Technica, Engadget, Tom's Hardware and MacRumors.
- **Economy.** News from CNBC, MarketWatch, Yahoo Finance, BBC Business, The Guardian, The Economist and NetEase Finance, plus a markets board: S&P 500, Nasdaq, Dow, FTSE 100, Euro Stoxx 50, Nikkei, Hang Seng, Shanghai, US 10-year yield, gold, oil, GBP/USD, USD/CNY and Bitcoin. Each card shows today's change and a five-day chart.
- **The whole story.** Open any story and Fleeter loads the full text and pictures from the publisher's page, with embedded videos playable in place. Paywalled sites only show the summary.

## 1. Run it on your computer

You need Node.js 20 or newer from https://nodejs.org.

```
npm install
npm run dev
```

Open http://localhost:8787. Keep the terminal open while you use it, and press Ctrl+C to stop.

If you see `wrangler: command not found`, run `npm install` again and wait until it finishes. If that doesn't fix it, run `npm install wrangler@4 --save-dev`.

To test the morning edition locally, open each of these once, then reload Fleeter:

```
http://localhost:8787/__scheduled?cron=30+5+*+*+*
http://localhost:8787/__scheduled?cron=33+5+*+*+*
http://localhost:8787/__scheduled?cron=36+5+*+*+*
http://localhost:8787/__scheduled?cron=39+5+*+*+*
```

## 2. Put it online

```
npx wrangler login
npx wrangler kv namespace create FLEETER_KV
```

Copy the `id` it prints into `wrangler.toml` in place of `PASTE_YOUR_KV_ID_HERE`, then run:

```
npx wrangler deploy
```

You'll get an address like `https://fleeter.YOUR-NAME.workers.dev`. The morning edition is collected in four parts from 05:30 UTC, which is 06:30 in London in summer and 05:30 in winter. To change the time, edit the four `crons` in `wrangler.toml` and the matching `CRONS` list near the top of `src/worker.js`.

## 3. Install it as an app (no building)

Once Fleeter is online at its https address:

- **Android:** open the address in Chrome, tap the ⋮ menu, then **Install app** or **Add to Home screen**.
- **Mac with Chrome or Edge:** open the address and click the install icon at the right of the address bar.
- **Mac with Safari (macOS Sonoma or later):** open the address, then choose **File > Add to Dock**.

It opens in its own window with the Fleeter icon, and the app shell keeps working offline.

## 4. Build the native app for Mac and Android

The native app lives in the `app` folder. It shows the same page and fetches every source directly from your device, so it needs no Cloudflare account. It refreshes whenever you open it, rather than collecting a morning edition.

### Set up once (on a Mac)

1. Install Apple's command-line tools:
   ```
   xcode-select --install
   ```
2. Install Rust:
   ```
   curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
   ```
   Then close and reopen Terminal.

### Mac app

```
cd app
npm install
npm run build:mac
```

The first build takes several minutes. When it's done, you'll find:

- `app/src-tauri/target/release/bundle/dmg/Fleeter_1.0.0_*.dmg`, an installer you can share
- `app/src-tauri/target/release/bundle/macos/Fleeter.app`, the app itself

The app isn't signed by Apple, so the first time you open it, right-click it and choose **Open**, then **Open** again. If macOS still refuses, go to **System Settings > Privacy & Security** and click **Open Anyway**.

### Android app

1. Install **Android Studio** from https://developer.android.com/studio. Open it, go to **Settings > Languages & Frameworks > Android SDK**, and on the **SDK Tools** tab tick **NDK (Side by side)**, **Android SDK Command-line Tools** and **Android SDK Platform-Tools**. Click **Apply**.
2. Tell your terminal where these are. Add these lines to `~/.zshrc`, then open a new Terminal window:
   ```
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 $ANDROID_HOME/ndk | tail -1)"
   ```
3. Add Rust's Android targets:
   ```
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```
4. Create the Android project and build the APK:
   ```
   cd app
   npm install
   npm run android:init
   npm run android:build
   ```
5. The APK is at `app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`. Copy it to your phone and open it. Android will ask you to allow installs from that app (Files, Drive or similar) the first time.

To run it straight on a phone plugged in by USB instead, turn on **Developer options > USB debugging** on the phone and run `npm run android:dev`.

The APK is a debug build, which is fine for your own phone. Publishing on Google Play would need a signed release build.

## Sources

Everything is in `public/sources.json`, shared by the website and the app. Edit it, then redeploy the website (`npx wrangler deploy`) or rebuild the app.

Each source has:

| Field | Meaning |
| --- | --- |
| `id` | A short unique name |
| `name` | What Fleeter shows |
| `lang` | `en` or `zh`, used by the language menu |
| `cat` | `games`, `sport`, `anime`, `music`, `headlines`, `tech` or `economy` |
| `kind` | How to read it (below) |
| `url` | The feed address, for `rss` and `netease-jsonp` |
| `sites` | Websites whose pages Fleeter may open for photos and whole stories |
| `sport` | Optional: `football`, `tennis`, `swimming` or `tabletennis`. Without it, Fleeter sorts by keywords |
| `league` | Optional, for football: `epl`, `laliga`, `seriea`, `bundesliga`, `ligue1`, `ucl`, `intl` or `csl` |
| `games` | Optional: tracked games this source is always about |

The kinds are:

| Kind | Extra fields | What it reads |
| --- | --- | --- |
| `rss` | `url` | Any RSS or Atom feed |
| `youtube` | `handle`, optional `channelId` | A YouTube channel's newest uploads |
| `bilibili-user` | `uid` | A Bilibili account's newest uploads |
| `bilibili-rank` | `rid` | A Bilibili zone's ranking (4 games, 1 anime, 3 music, 188 tech, 234 sport, 0 everything) |
| `bilibili-popular` | none | Bilibili's popular videos |
| `tencent` | `channel` | Tencent News lists (`24hours` is the main one) |
| `netease-list` | `channel`, optional `headline` | NetEase News channels |
| `netease-jsonp` | `url` | NetEase's front-page lists |

The `games` list sets the tracked games, their banners and countdowns, and the `markets` list sets the markets board, using Yahoo Finance symbols.

## Good to know

- **Check your sources after setting up.** Click the chip icon at the top right to see each source and whether it answered. "Retry failed sources" tries them again. A few failures on any given day are normal.
- **Chinese sources use unofficial endpoints.** Tencent, NetEase and Bilibili don't publish news feeds, so Fleeter reads the same lists their own websites use. These can change or stop without notice.
- **Bilibili often refuses requests from cloud servers.** If Bilibili sources fail on the website, they usually work in the native app, which connects from your own internet connection.
- **Whole stories depend on the site.** Most news sites work. Paywalled ones (The Economist, some MarketWatch and FT pages) only share a summary, and Fleeter says so.
- **The reader tools load from a CDN.** Whole-story extraction uses Mozilla's Readability and DOMPurify from jsdelivr. Without them, Fleeter falls back to a simpler built-in extractor.
- **Videos.** If a video won't play inside the app, use the **Open on YouTube** or **Open on Bilibili** link under it.
- **Market prices** come from Yahoo Finance and may be delayed by up to 20 minutes.
- **Keep it private.** Fleeter shows other publishers' text and pictures for your own reading. Don't publish a public copy.
- **Free-plan limits.** The morning edition is split into four runs to stay within Cloudflare's per-run request limit. If you add many more sources, add another cron time to `wrangler.toml` and `CRONS`.
