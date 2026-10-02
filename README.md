# Thali Tracker

A simple calorie and macro tracker with 230+ built-in Indian foods, from rotis, dals, sabzis and biryanis to dosas, chaat, mithai and chai. Each food uses a familiar serving size such as "1 katori", "1 roti" or "1 plate".

It's a static web app (plain HTML/CSS/JS) with no build step, no server and no account. Your data stays in your browser's `localStorage`.

## Features

- Log foods by meal (Breakfast, Lunch, Snacks, Dinner) for any date
- Search and filter by category, plus a list of recently used foods
- Fractional servings (¼, ½, 1½…) with live calorie and macro preview
- Daily calorie ring and protein/carbs/fat progress bars
- Custom foods for home recipes or packaged items
- Goal calculator (Mifflin–St Jeor BMR × activity, with suggested macros)
- 14-day history chart and long-term averages
- JSON export/import for backups and moving between devices
- Mobile-friendly, with dark mode support

## Running it

Open `index.html` in a browser. To serve it locally instead:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

To use it on your phone, host the folder anywhere static (GitHub Pages, Netlify, Cloudflare Pages, Vercel). Note that GitHub Pages on a **private** repo requires a paid GitHub plan.

## Editing the food list

All built-in foods are in [`js/foods.js`](js/foods.js). Each entry is per serving:

```js
{ name: "Idli", serving: "1 piece (40 g)", cal: 60, p: 2, c: 12, f: 0.3, cat: "Breakfast" }
```

## Accuracy note

Nutrition values are approximate averages for home-style cooking, based on common Indian food composition references. Actual values vary a lot with oil/ghee, portion size and recipe. Restaurant dishes are often 20–50% higher. Use them as estimates, not medical advice.
