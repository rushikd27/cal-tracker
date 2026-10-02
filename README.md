# Thali Tracker

A simple calorie and macro tracker with 300+ built-in foods. Most are Indian (rotis, dals, sabzis, biryanis, dosas, chaat, mithai, chai), plus everyday items like pizza, burgers, pasta, café drinks, bakery, packaged snacks and alcohol. Each food uses a familiar serving size such as "1 katori", "1 roti" or "1 plate".

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

## Editing the food list

All built-in foods are in [`js/foods.js`](js/foods.js). Each entry is per serving:

```js
{ name: "Idli", serving: "1 piece (40 g)", cal: 60, p: 2, c: 12, f: 0.3, cat: "Breakfast" }
```

Exercise activities and their MET values are in [`js/exercises.js`](js/exercises.js).

## Accuracy note

Nutrition values are approximate averages for home-style cooking, based on common Indian food composition references. Actual values vary a lot with oil/ghee, portion size and recipe. Restaurant dishes are often 20–50% higher. Use them as estimates, not medical advice.
