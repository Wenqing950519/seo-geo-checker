const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The palette used to live in eight places under five different names, all
// holding the same blue: --teal, --teal-dark, --gc-mint, --gc-blue-primary and
// --color-blue. Names that describe a hue the value no longer has stop being
// read, and pricing.html quietly sat on a real teal (#10B29A) for months.
//
// These checks hold the line on two things:
//   1. one file owns the values, and every page aliases into it
//   2. the contrast roles are real, measured numbers - not a comment

const root = path.resolve(__dirname, "..", "..");
const publicDir = path.join(root, "apps", "web", "public");
const appDir = path.join(root, "apps", "web", "app");
const read = (p) => fs.readFileSync(p, "utf8");

const tokens = read(path.join(publicDir, "assets", "tokens.css"));

// --- contrast helpers (WCAG 2.1 relative luminance) --------------------------

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const channel = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const x = luminance(toRgb(a));
  const y = luminance(toRgb(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const value = (name, source = tokens, label = "tokens.css") => {
  const at = source.indexOf(name + ":");
  assert.notEqual(at, -1, `${label} must define ${name}`);
  const hex = source.slice(at, at + 90).match(/#[0-9A-Fa-f]{6}/);
  assert.ok(hex, `${name} must hold a six-digit hex value in ${label}`);
  return hex[0];
};

// --- 1. the roles have to hold up ------------------------------------------

for (const name of ["--ls-accent-on-light", "--ls-accent-on-light-strong"]) {
  const ratio = contrast("#FFFFFF", value(name));
  assert.ok(ratio >= 4.5, `white text on ${name} is ${ratio.toFixed(2)}:1, below AA`);
}

// The surface accent is documented as NOT usable under white text. Guard the
// documentation, so a well-meaning edit cannot make the comment a lie.
assert.ok(
  contrast("#FFFFFF", value("--ls-accent-surface")) < 4.5,
  "--ls-accent-surface is documented as failing under white text; update the comment in tokens.css if that changed"
);

// Muted text, both grounds. These are the two that keep getting swapped.
assert.ok(
  contrast(value("--ls-on-dark-muted"), value("--ls-void")) >= 4.5,
  "--ls-on-dark-muted must clear AA on --ls-void"
);
assert.ok(
  contrast(value("--ls-ink-muted"), "#FFFFFF") >= 4.5,
  "--ls-ink-muted must clear AA on white"
);
assert.ok(
  contrast(value("--ls-on-dark-muted"), "#FFFFFF") < 4.5,
  "--ls-on-dark-muted is the dark-ground muted; it is documented as failing on white"
);

// Status badge ink on its own tint.
for (const status of ["success", "warning", "danger", "unknown"]) {
  const ratio = contrast(value(`--ls-${status}-on-light`), value(`--ls-${status}-tint`));
  assert.ok(ratio >= 4.5, `--ls-${status}-on-light on its tint is ${ratio.toFixed(2)}:1, below AA`);
}

// Engine chips carry dark ink, because white on every engine hue fails.
for (const engine of ["openai", "gemini", "anthropic", "perplexity"]) {
  const fill = value(`--ls-engine-${engine}`);
  assert.ok(
    contrast(value("--ls-navy"), fill) >= 4.5,
    `--ls-navy on --ls-engine-${engine} is below AA; the chips rely on it`
  );
}

// --- 2. one owner for the values -------------------------------------------

const pages = [
  "home.html", "demo.html", "whitepaper.html", "developers.html",
  "developers-console.html", "pricing.html", "brand.html"
];

for (const page of pages) {
  const html = read(path.join(publicDir, page));
  assert.match(html, /<link rel="stylesheet" href="\/assets\/tokens.css">/,
    `${page} must load the shared palette`);
  // No page may name a colour after a hue it does not have.
  assert.doesNotMatch(html, /--teal|--gc-mint|--gc-blue-primary/,
    `${page} still declares or uses a hue-named colour token; use the role names`);
  // The old teal literals that survived the last migration.
  assert.doesNotMatch(html, /rgba\(0,\s*184,\s*169|#10B29A|#00B8A9|#2CE0CF/i,
    `${page} still carries a raw teal literal`);
}

// The Track shell ships from its own build output and cannot link the shared
// file, so its copy of the brand values is checked against it instead.
const appCss = read(path.join(appDir, "app.css"));
assert.doesNotMatch(appCss, /--gc-mint/, "app.css must use the role names, not --gc-mint");
for (const [local, shared] of [
  ["--gc-accent", "--ls-accent-surface"],
  ["--gc-accent-on-light", "--ls-accent-on-light"],
  ["--gc-accent-on-dark", "--ls-accent-on-dark"],
  ["--gc-accent-tint", "--ls-accent-tint"],
  ["--gc-navy", "--ls-navy"],
  ["--gc-engine-openai", "--ls-engine-openai"],
  ["--gc-engine-gemini", "--ls-engine-gemini"],
  ["--gc-engine-anthropic", "--ls-engine-anthropic"],
  ["--gc-engine-perplexity", "--ls-engine-perplexity"],
  ["--gc-success", "--ls-success"],
  ["--gc-warning", "--ls-warning"],
  ["--gc-danger", "--ls-danger"],
  ["--gc-unknown", "--ls-unknown"]
]) {
  assert.equal(
    value(local, appCss, "app.css").toUpperCase(),
    value(shared).toUpperCase(),
    `app.css ${local} has drifted from ${shared} in assets/tokens.css`
  );
}

// No module may reintroduce the hue names or the teal literals either.
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
for (const file of walk(appDir).filter((f) => /\.(css|js)$/.test(f))) {
  const text = read(file);
  const rel = path.relative(root, file);
  assert.doesNotMatch(text, /--gc-mint/, `${rel} must use the role names, not --gc-mint`);
  assert.doesNotMatch(text, /rgba\(0,\s*184,\s*169/, `${rel} still carries a raw teal literal`);
}

console.log("design token ownership and contrast tests passed");
