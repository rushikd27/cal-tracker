# Thali Tracker

A simple calorie and macro tracker with nearly 400 built-in foods. Most are Indian (rotis, dals, sabzis, biryanis, dosas, chaat, mithai, chai), plus everyday items like pizza, burgers, pasta, café drinks, bakery, packaged snacks, and a full drinks menu (beer, wine, spirits with mixers, soju, sake and 29 cocktails). Each food uses a familiar serving size such as "1 katori", "1 roti" or "1 plate".

It's a static web app (plain HTML/CSS/JS) with no build step and no server. Data is saved in your browser, and you can optionally sync it to a **private** GitHub repo so your phone and laptop share the same log.

## Features

- Log foods separately for Breakfast, Lunch, Dinner and Misc, for any date
- Search and filter by category, plus a list of recently used foods
- Fractional servings (¼, ½, 1½…) with live calorie and macro preview
- Daily calorie ring and protein/carbs/fat progress bars
- **Restaurant / takeout items**: enter the item, the place and the calories the menu or app lists (macros optional). It's logged straight away and can be saved so you can pick it again or search for it by restaurant name.
- Custom foods for home recipes or packaged items
- Exercise log: pick an activity and duration to get an estimate based on your weight, or enter calories from your watch. Burned calories are added to that day's allowance.
- Saved profile (age, sex, height, weight, target weight, activity, goal) showing BMI (Asian cut-offs), BMR and maintenance calories, with one-tap suggested goals
- Weight log with change since last entry, BMI and distance to target
- 14-day history chart and long-term averages
- JSON export/import for backups and moving between devices
- Mobile-friendly, with dark mode support

## Running it

**Live site (GitHub Pages):** https://rushikd27.github.io/cal-tracker/

To run it locally, open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

Pages serves straight from the `main` branch root (Settings → Pages → Deploy from a branch → `main` / `/ (root)`). Pushing to `main` updates the site in about a minute. The empty `.nojekyll` file tells Pages to serve the files as-is.

## Syncing between devices (optional)

Settings → **Sync with GitHub** saves everything as `thali-tracker.json` in a private repo of your choice, using the GitHub API straight from the browser:

1. Create an empty **private** repo, e.g. `cal-tracker-data`.
2. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with access to **only that repo** and **Contents: Read and write**.
3. Enter your username, the repo name and the token in the app on each device.

How it works:
- The app syncs a couple of seconds after each change, whenever it's reopened, and when you come back online. Each sync is a commit, so the repo also keeps a full history of your data.
- Changes merge **day by day**. If two devices change *different* days while offline, both changes are kept. If both change the *same* day, the most recent edit to that day wins. Profile, goals and saved foods each merge as a whole in the same way.
- The token is stored only in that browser's `localStorage`. It can't reach anything except the data repo, and you can revoke it at any time on GitHub. The app refuses to sync to a public repo.

## COROS workouts via Strava (optional)

COROS has no public API for personal use, so workouts come in through Strava:

1. **COROS → Strava**: link Strava under Third-party apps in the COROS app.
2. **Hourly importer**: [`importer/strava-import.yml`](importer/strava-import.yml) is a GitHub Action you add to your **private data repo**. Each run it refreshes the Strava token, fetches new activities and their calories, and commits `strava-activities.json`. Your Strava app ID, secret and refresh token are kept as encrypted Actions secrets. The workflow downloads [`importer/strava-import.mjs`](importer/strava-import.mjs) from this repo at run time, so improvements apply automatically.
3. **In the app**: synced Strava workouts appear under Exercise, tagged *Strava*, and their calories are added to that day's allowance. Tap × to stop counting one (for example, if you also logged it by hand).

Settings → *COROS workouts (via Strava)* walks through the setup and gets the refresh token for you.

Notes:
- Strava only receives **workouts**, not all-day step calories. Workout calories are active calories, which is right for this app, because your daily goal already covers resting burn. Adding total calories would count that twice.
- Rides without a calorie estimate use their work in kJ, which is roughly equal to kcal burned.
- Hourly runs use about 720 of the 2,000 free Actions minutes a month that private repos get. Change the `cron` line to run less often.
- *Import now* in the app needs the sync token to also have **Actions: Read and write**. Otherwise use Actions → Strava import → Run workflow on GitHub.

## Editing the food list

All built-in foods are in [`js/foods.js`](js/foods.js). Each entry is per serving:

```js
{ name: "Idli", serving: "1 piece (40 g)", cal: 60, p: 2, c: 12, f: 0.3, cat: "Breakfast" }
```

Exercise activities and their MET values are in [`js/exercises.js`](js/exercises.js).

## Accuracy note

Nutrition values are approximate averages for home-style cooking, based on common Indian food composition references. Actual values vary a lot with oil/ghee, portion size and recipe. Restaurant dishes are often 20–50% higher. Use them as estimates, not medical advice.
