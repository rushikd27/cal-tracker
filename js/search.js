// Forgiving food search: handles plurals, common misspellings (via edit
// distance) and Hindi/English synonyms, then ranks the best matches first.
const FoodSearch = (() => {
  "use strict";

  // Query word -> extra words to look for.
  const ALIASES = {
    anda: ["egg"], ande: ["egg"], andaa: ["egg"], eggs: ["egg"],
    omlet: ["omelette"], omelet: ["omelette"], omlette: ["omelette"], amlet: ["omelette"], omelete: ["omelette"],
    chawal: ["rice"], bhaat: ["rice"], bhat: ["rice"],
    murgh: ["chicken"], murg: ["chicken"],
    gosht: ["mutton"], meat: ["mutton", "chicken", "keema"], lamb: ["mutton"], goat: ["mutton"],
    machli: ["fish"], machhi: ["fish"], macchi: ["fish"], meen: ["fish"],
    jhinga: ["prawn"], shrimp: ["prawn"],
    doodh: ["milk"], dudh: ["milk"],
    dahi: ["curd"], yogurt: ["curd", "yogurt"], yoghurt: ["curd", "yogurt"],
    chapathi: ["chapati"], fulka: ["phulka"], rotli: ["roti"],
    potato: ["aloo"], alu: ["aloo"], cauliflower: ["gobi"], spinach: ["palak"],
    okra: ["bhindi"], ladyfinger: ["bhindi"], brinjal: ["baingan"], eggplant: ["baingan"], aubergine: ["baingan"],
    chickpea: ["chole", "chana"], chickpeas: ["chole", "chana"], kidney: ["rajma"],
    lentil: ["dal"], lentils: ["dal"], daal: ["dal"], dhal: ["dal"],
    peas: ["matar"], mutter: ["matar"], cottage: ["paneer"],
    tea: ["chai", "tea"], coke: ["cold drink", "soda"], pepsi: ["cold drink", "soda"],
    curd: ["curd", "dahi", "raita"], sweets: ["sweets"], mithai: ["sweets"],
    biriyani: ["biryani"], briyani: ["biryani"],
  };

  function normalize(s) {
    return String(s).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9 ]/g, " ");
  }
  const words = (s) => normalize(s).split(/\s+/).filter(Boolean);

  // Plural/singular variants: eggs -> egg, tomatoes -> tomato, berries -> berry.
  function variants(w) {
    const out = new Set([w]);
    if (w.length > 3 && w.endsWith("ies")) out.add(w.slice(0, -3) + "y");
    if (w.length > 3 && w.endsWith("es")) out.add(w.slice(0, -2));
    if (w.length > 2 && w.endsWith("s")) out.add(w.slice(0, -1));
    // Typo matching applies only to what was typed, not to synonyms.
    const alts = [...out].map((w) => ({ w, fuzzy: true }));
    for (const v of out) for (const a of ALIASES[v] || []) for (const aw of words(a)) if (!out.has(aw)) alts.push({ w: aw, fuzzy: false });
    return alts;
  }

  // Optimal string alignment distance (Levenshtein + adjacent swaps), capped.
  function distance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      let rowMin = Infinity;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        rowMin = Math.min(rowMin, d[i][j]);
      }
      if (rowMin > max) return max + 1;
    }
    return d[a.length][b.length];
  }

  // 0 exact word, 1 word starts with it, 2 contains it, 3 close misspelling.
  function wordScore(alts, tokens) {
    let best = Infinity;
    for (const { w: a, fuzzy } of alts) {
      const tol = !fuzzy ? 0 : a.length >= 7 ? 2 : a.length >= 4 ? 1 : 0;
      for (const t of tokens) {
        if (t === a) return 0;
        if (t.startsWith(a)) best = Math.min(best, 1);
        else if (a.length >= 4 && t.includes(a)) best = Math.min(best, 2);
        else if (tol && best > 3) {
          // Compare against the whole word and against a same-length prefix (for half-typed words).
          if (distance(a, t, tol) <= tol || (t.length > a.length && distance(a, t.slice(0, a.length), tol) <= tol)) best = 3;
        }
      }
    }
    return best;
  }

  // Returns the foods that match `query`, best first. `haystack(food)` gives the searchable text.
  function rank(foods, query, haystack) {
    const qWords = words(query);
    if (!qWords.length) return foods;
    const qAlts = qWords.map(variants);
    const qNorm = qWords.join(" ");
    const results = [];
    foods.forEach((f, i) => {
      const tokens = words(haystack(f));
      let score = 0;
      for (const alts of qAlts) {
        const s = wordScore(alts, tokens);
        if (s === Infinity) return;
        score += s;
      }
      const name = words(f.name);
      const cat = words(f.cat);
      if (name.join(" ") === qNorm) score -= 10;
      // Prefer the food's own category, e.g. "egg" lists the Eggs category (in its
      // natural order, Boiled Egg first) before Egg Biryani.
      else if (qAlts.some((alts) => alts.some(({ w }) => cat.some((c) => c === w || c === w + "s")))) score -= 2;
      else if (qAlts[0].some(({ w }) => name[0]?.startsWith(w))) score -= 1;
      results.push({ f, score, i });
    });
    return results.sort((a, b) => a.score - b.score || a.i - b.i).map((r) => r.f);
  }

  return { rank, normalize };
})();
