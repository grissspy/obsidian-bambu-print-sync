/* End-to-end test of the sync and deduction logic against a fake Obsidian
 * vault and a fake Bambu cloud. Run with `npm test`. No dependencies. */
"use strict";

const assert = require("assert");
const Module = require("module");
const path = require("path");

/* ---------- fake obsidian ---------- */

const notices = [];
let fixture = {};

class TFile {
  constructor(p) {
    this.path = p;
    this.basename = p.split("/").pop().replace(/\.md$/, "");
  }
  get extension() {
    return this.path.split(".").pop();
  }
}

const modals = [];
let lastNoticeObj = null;
// Minimal DOM for notices with buttons.
function el(text = "") {
  const e = { text, kids: [] };
  e.createDiv = (o = {}) => { const c = el(o.text); e.kids.push(c); return c; };
  e.createEl = (tag, o = {}) => { const c = el(o.text); c.tag = tag; e.kids.push(c); return c; };
  e.addEventListener = (ev, fn) => { e.click = fn; };
  e.all = () => [e.text, ...e.kids.map((k) => k.all())].filter(Boolean).join(" ");
  e.buttons = () => [...(e.tag === "button" ? [e] : []), ...e.kids.flatMap((k) => k.buttons())];
  return e;
}
global.document = { createDocumentFragment: () => el() };

const fakeObsidian = {
  TFile,
  Notice: class {
    constructor(m) {
      notices.push(typeof m === "string" ? m : m.all());
      this.frag = m;
      lastNoticeObj = this;
    }
    hide() {}
  },
  Plugin: class {
    constructor(app) {
      this.app = app;
    }
    addStatusBarItem() {
      return { setText() {} };
    }
    addRibbonIcon() {}
    registerMarkdownCodeBlockProcessor() {}
    addCommand() {}
    addSettingTab() {}
    registerInterval() {}
    registerEvent() {}
    async loadData() {
      return {};
    }
    async saveData() {}
  },
  PluginSettingTab: class {},
  Setting: class {},
  Modal: class {
    constructor(app) {
      this.app = app;
      this.contentEl = { empty() {} };
    }
    open() {
      modals.push(this);
    }
    close() {
      this.onClose();
    }
  },
  moment: { locale: () => "en" },
  Platform: { isMobile: false },
  normalizePath: (p) => p.replace(/\/+$/, ""),
  requestUrl: async (o) => {
    const r = fixture[o.url.split("?")[0]];
    if (r && r.__raw) return r.__raw;
    return { status: r ? 200 : 404, json: r, headers: {} };
  },
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "obsidian") return "obsidian";
  return origResolve.call(this, request, ...rest);
};
require.cache.obsidian = { id: "obsidian", filename: "obsidian", loaded: true, exports: fakeObsidian };
global.window = { setInterval: () => 1, clearInterval() {} };

const Plugin = require(path.join(__dirname, "..", "main.js"));
const { mainDevice, shouldYield, pageImage, imageExt, LOCALE_DEFAULTS, normalizeName, parseUsage, buildBase, parseModelUrl, computeCost } = Plugin._test;

/* ---------- fake vault ---------- */

const files = new Map(); // path -> { file, fm }
function add(p, fm) {
  const file = new TFile(p);
  files.set(p, { file, fm });
  return file;
}
const isFolder = (p) => !p.endsWith(".md") && [...files.keys()].some((k) => k.startsWith(p + "/"));
const local = {};
const app = {
  loadLocalStorage: (k) => (k in local ? local[k] : null),
  saveLocalStorage: (k, v) => { local[k] = v; },
  vault: {
    getMarkdownFiles: () => { throw new Error("plugin must not list the whole vault"); },
    getFiles: () => { throw new Error("plugin must not list the whole vault"); },
    getAbstractFileByPath: (p) =>
      files.get(p) ? files.get(p).file : isFolder(p) ? { children: [...files.keys()].filter((k) => k.startsWith(p + "/")).map((k) => files.get(k).file) } : null,
    createFolder: async () => {},
    createBinary: async (p, data) => {
      const file = add(p, {});
      files.get(p).binary = data;
      return file;
    },
    create: async (p, content) => {
      const fm = {};
      const m = String(content).match(/^---\n([\s\S]*?)\n---/);
      if (m) for (const line of m[1].split("\n")) {
        const kv = line.match(/^([a-z_]+):\s*(.*)$/);
        if (kv && kv[2] !== "") fm[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
      }
      const file = add(p, fm);
      files.get(p).text = String(content);
      return file;
    },
  },
  metadataCache: {
    on: () => ({}),
    getFileCache: (f) => ({ frontmatter: files.get(f.path).fm }),
    getFirstLinkpathDest: (name) => {
      const hit = [...files.values()].find((x) => x.file.basename === name);
      return hit ? hit.file : null;
    },
  },
  fileManager: {
    processFrontMatter: async (f, fn) => fn(files.get(f.path).fm),
    generateMarkdownLink: (f) => `[[${f.basename}]]`,
    trashFile: async (f) => { files.delete(f.path); },
    renameFile: async (f, to) => {
      const entry = files.get(f.path);
      files.delete(f.path);
      f.path = to;
      f.basename = to.split("/").pop().replace(/\.md$/, "");
      files.set(to, entry);
    },
  },
  workspace: { on: () => ({}), onLayoutReady() {}, getLeaf: () => ({ openFile: async () => {} }) },
};

/* ---------- data ---------- */

const ru = LOCALE_DEFAULTS.ru;
const S = "3D/Spools/";
const P = "3D/Prints/";
add(S + "PLA Black.md", { type: "spool", material: "PLA Basic", color_hex: "000000", weight_g: 1000, remaining_g: 870, spool_status: ru.spoolOpen });
add(S + "PETG White.md", { type: "spool", material: "PETG", color_hex: "FFFFFF", weight_g: 1000, remaining_g: 500, spool_status: ru.spoolOpen });
add(S + "PLA Old.md", { type: "spool", material: "PLA", color_hex: "000000", weight_g: 1000, remaining_g: 0, spool_status: ru.spoolEmpty });
add(P + "Shelf bracket.md", { type: "print", status: ru.statusPlanned, grams: 42 });
add(P + "Manual.md", { type: "print", status: ru.statusDone, grams: 10, spool: "[[PETG White]]" });
// The same cloud job delivered twice by a vault sync from two devices.
add(P + "Old box copy A.md", { type: "print", status: ru.statusDone, bambu_task_id: "99", grams: 5, spool_deducted: true });
add(P + "Old box copy B.md", { type: "print", status: ru.statusDone, bambu_task_id: "99", grams: 5 });

const now = Date.now();
fixture = {
  "https://api.bambulab.com/v1/user-service/my/tasks": {
    total: 3,
    hits: [
      { id: 1, title: "Live", status: 4, startTime: new Date(now - 30000).toISOString(), endTime: new Date(now - 30000).toISOString(), costTime: 3600, weight: 5, amsDetailMapping: [] },
      { id: 2, title: "Box", status: 3, startTime: "2026-11-25T10:00:00Z", endTime: "2026-11-25T11:00:00Z", costTime: 7200, weight: 100,
        amsDetailMapping: [
          { filamentType: "PLA", sourceColor: "000000FF", weight: 60 },
          { filamentType: "PETG", sourceColor: "FFFFFFFF", weight: 40 },
        ] },
      { id: 4, cover: "https://cdn.example/plate4.png", title: "Untitled", designId: 777001, designTitle: "Cable clip (remix)", status: 2, startTime: "2026-11-26T14:00:00Z", endTime: "2026-11-26T14:30:00Z", costTime: 1800, weight: 6, amsDetailMapping: [] },
      { id: 3, cover: "https://cdn.example/plate3.png", title: "Untitled", designTitle: "Shelf_bracket.3mf", status: 2, startTime: "2026-11-26T10:00:00Z", endTime: "2026-11-26T12:40:00Z", costTime: 9300, weight: 42.4, plateIndex: 1,
        amsDetailMapping: [{ filamentType: "PLA", sourceColor: "000000FF", weight: 42.4 }] },
    ],
  },
  "https://cdn.example/plate3.png": { __raw: { status: 200, arrayBuffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer, headers: { "content-type": "binary/octet-stream" } } },
  "https://cdn.example/plate4.png": { __raw: { status: 200, arrayBuffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer, headers: { "content-type": "image/png" } } },
  "https://cdn.example/notimage": { __raw: { status: 200, arrayBuffer: new TextEncoder().encode("<html>").buffer, headers: { "content-type": "binary/octet-stream" } } },
  "https://makerworld.com/en/models/777001-cable-clip-for-desk": {
    __raw: { status: 200, text: '<html><head><meta content="/img/clip.jpg?x=1&amp;y=2" property="og:image"></head></html>', headers: { "content-type": "text/html" } },
  },
  "https://makerworld.com/models/555": {
    __raw: { status: 200, text: '<meta property="og:title" content="Desk Hook - Free 3D Print Model - MakerWorld">', headers: {} },
  },
  "https://makerworld.com/img/clip.jpg": { __raw: { status: 200, arrayBuffer: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).buffer, headers: { "content-type": "image/jpeg" } } },
};

/* ---------- run ---------- */

(async () => {
  assert.equal(normalizeName("Shelf_bracket plate 2.3mf"), "shelf bracket");
  assert.deepEqual(parseUsage(["[[A|x]]: 1,5", "junk"]), [{ link: "A", grams: 1.5 }]);
  assert.ok(buildBase("3D", ru, "ru").includes('- "Провал"'));

  // Cost: 50 g at 25/kg, 2 h at 130 W and 0.20/kWh, printer 800 over 4000 h plus 0.05/h maintenance.
  const rates = { powerW: 130, kwhPrice: 0.2, printerPrice: 800, lifetimeH: 4000, maintPerHour: 0.05 };
  const c = computeCost({ grams: 50, time_h: 2, time_m: 0, spool: "[[S]]" }, () => 25, rates);
  assert.deepEqual(c, { cost_filament: 1.25, cost_power: 0.05, cost_wear: 0.5, cost: 1.8 });
  const multi = computeCost({ grams: 10, time_h: 0, time_m: 30, usage: ["[[A]]: 6", "[[B]]: 4"] }, (l) => (l === "A" ? 20 : 30), rates);
  assert.equal(multi.cost_filament, 0.24);
  assert.equal(computeCost({ status: "Planned" }, () => 0, rates), null);
  assert.equal(computeCost({ grams: 20, time_h: 1 }, () => 0, {}), null, "no prices, no zero cost");

  const mw = parseModelUrl("https://makerworld.com/en/models/777001-cable-clip-for-desk#profileId-55");
  assert.deepEqual([mw.site, mw.id, mw.title, mw.profileId], ["MakerWorld", "777001", "Cable clip for desk", "55"]);
  assert.equal(parseModelUrl("https://www.printables.com/model/123456-shelf-bracket/files").title, "Shelf bracket");
  assert.equal(parseModelUrl("https://www.thingiverse.com/thing:42").title, "Thingiverse 42");
  assert.equal(parseModelUrl("https://cults3d.com/en/3d-model/home/desk-hook").title, "Desk hook");
  assert.equal(parseModelUrl("https://example.com/models/1"), null);
  assert.equal(parseModelUrl("see https://makerworld.com/en/models/1-a"), null);

  const plugin = new Plugin(app);
  await plugin.onload();
  Object.assign(plugin.settings, ru, { token: "x", printsFolder: "3D/Prints", spoolsFolder: "3D/Spools" });

  // A secondary device does not touch the cloud or the notes.
  plugin.setPrimary(false);
  await plugin.sync(true);
  assert.equal(files.get(P + "Shelf bracket.md").fm.bambu_task_id, undefined, "secondary device does not sync");
  assert.equal(await plugin.deductAll(false), 0);
  plugin.setPrimary(true);

  assert.equal(parseModelUrl("Https://makerworld.com/en/models/5-x").url, "https://makerworld.com/en/models/5-x", "scheme is lower-cased");

  // Link previews.
  assert.equal(pageImage('<meta property="og:image" content="https://a.b/c.png">', "https://a.b/x"), "https://a.b/c.png");
  assert.equal(pageImage("<meta content='/p.webp' name='twitter:image'>", "https://site.io/m/1"), "https://site.io/p.webp");
  assert.equal(pageImage("<meta property='og:title' content='x'>", "https://a.b"), "", "no image → empty");
  const { pageTitle } = Plugin._test;
  assert.equal(pageTitle('<meta property="og:title" content="Bambu Bed Scraper - Free 3D Print Model - MakerWorld">'), "Bambu Bed Scraper");
  assert.equal(pageTitle("<title>Cable Clip by joe | Download free STL model | Printables.com</title>"), "Cable Clip by joe");
  assert.equal(pageTitle("<title>Mini - Fan Duct - MakerWorld</title>"), "Mini - Fan Duct");
  assert.equal(pageTitle("<title>Tom &amp; Jerry 3D</title>"), "Tom & Jerry 3D", "a single part is kept");
  assert.equal(pageTitle("<p>no title</p>"), "");
  assert.equal(parseModelUrl("https://makerworld.com/models/12703").titleFromUrl, false);
  assert.equal(imageExt("image/webp", "x"), "webp");
  assert.equal(imageExt("", "https://a/b.JPEG?x"), "jpg");
  assert.equal(Plugin._test.taskToRecord({ id: 9, cover: "javascript:x" }).cover, "", "only http(s) covers");

  // An existing base under the old name is reused, not duplicated.
  add("3D/3D printing.base", {});

  // The queue note holds the button block and the embedded base; creating it twice is harmless.
  const dash = await plugin.createDashboard(false);
  assert.ok(files.get(dash).text.includes("```bambu-print-sync") && files.get(dash).text.includes(".base]]"), "queue note has buttons and the base");
  assert.equal(await plugin.createDashboard(false), dash);
  assert.ok(files.get(dash).text.includes("![[3D printing.base]]"), "dashboard embeds the existing base");
  assert.ok(files.get(dash).text.includes("![[3D printing.base#Spools]]"), "dashboard shows the spool list");
  assert.ok(!files.has("3D/Print tracker.base"), "no second base");
  assert.equal(plugin.settings.pasteToQueue, false, "paste-to-queue is off by default");

  // Pasting a model link into any note queues it (when enabled); pasting it again does not duplicate.
  plugin.settings.pasteToQueue = true;
  const paste = (text) => {
    let prevented = false;
    const evt = { defaultPrevented: false, clipboardData: { getData: () => text }, preventDefault() { prevented = true; } };
    plugin.onPaste(evt, { replaceSelection() {} });
    return prevented;
  };
  assert.equal(paste("https://makerworld.com/en/models/777001-cable-clip-for-desk"), false, "URL stays in the note");
  await new Promise((r) => setTimeout(r, 10));
  paste("https://makerworld.com/en/models/777001-cable-clip-for-desk#profileId-9");
  await new Promise((r) => setTimeout(r, 10));
  paste("just some text");
  const queued = [...files.keys()].filter((k) => k.startsWith(P + "Cable clip"));
  assert.equal(queued.length, 1, "one card per model");
  assert.equal(files.get(queued[0]).fm.status, ru.statusPlanned);
  assert.equal(files.get(queued[0]).fm.makerworld_id, "777001");

  await plugin.sync();
  const get = (n) => [...files.values()].find((x) => x.file.basename.startsWith(n)).fm;

  assert.ok(files.has(P + "Old box copy A.md") && !files.has(P + "Old box copy B.md"), "duplicate removed, deducted copy kept");

  const plan = get("Shelf bracket");
  assert.equal(plan.bambu_task_id, "3", "planned note is linked to the cloud job");
  assert.equal(plan.status, ru.statusDone);
  assert.equal(plan.spool, "[[PLA Black]]", "spool matched by material + colour, empty spool skipped");
  assert.equal(plan.time_h, 2);
  assert.equal(plan.time_m, 40);
  assert.equal(plan.spool_deducted, true);

  const box = get("Box");
  assert.equal(box.status, ru.statusFailed);
  assert.equal(box.grams, 50, "failed print scaled by runtime / estimate");
  assert.equal(box.grams_estimated, true);
  assert.deepEqual(box.usage, ["[[PLA Black]]: 30", "[[PETG White]]: 20"]);

  const live = get("Live");
  assert.equal(live.status, ru.statusPrinting);
  assert.ok(!live.spool_deducted);

  assert.equal(get("Manual").spool_deducted, true, "manual notes are deducted too");
  assert.equal(get("PLA Black").remaining_g, 870 - 42.4 - 30);
  assert.equal(get("PETG White").remaining_g, 500 - 10 - 20);
  assert.equal(get("PLA Old").remaining_g, 0);

  const clip = get("Cable clip");
  assert.equal(clip.bambu_task_id, "4", "linked by MakerWorld model ID although the names differ");
  assert.equal(clip.status, ru.statusDone);
  assert.equal(get("Shelf bracket").model_url, undefined, "no model link without a MakerWorld ID");

  // Cost is written into prints and frozen once final.
  Object.assign(plugin.settings, rates);
  files.get(S + "PLA Black.md").fm.price = 20;
  assert.equal(await plugin.updateCost(files.get(P + "Shelf bracket.md").file, false), true);
  assert.equal(get("Shelf bracket").cost_filament, 0.85);
  plugin.settings.kwhPrice = 1;
  assert.equal(await plugin.updateCost(files.get(P + "Shelf bracket.md").file, false), false, "final print keeps its cost");
  assert.ok((await plugin.recalcAll(false)) >= 1, "recalculate all updates final prints");

  await plugin.sync();
  assert.equal(get("PLA Black").remaining_g, 870 - 42.4 - 30, "no double deduction");
  assert.equal([...files.keys()].filter((k) => k.startsWith(P)).length, 6, "no duplicate notes");

  // Pictures: from the model page when queued, from the cloud plate preview otherwise.
  await new Promise((r) => setTimeout(r, 20));
  const clipCover = get("Cable clip").cover;
  assert.ok(/^\[\[(MakerWorld-777001\.jpg|bambu-4\.png)\]\]$/.test(clipCover), "queued model got a picture: " + clipCover);
  assert.equal(get("Shelf bracket").cover, "[[bambu-3.png]]", "imported print got the plate preview");
  assert.ok(files.get("3D/Images/bambu-3.png").binary, "image saved in the Images folder");
  const bare = add(P + "No picture.md", { type: "print" });
  assert.equal(await plugin.saveCover(bare, "https://cdn.example/notimage", "y"), false, "non-images are rejected");
  assert.equal(await plugin.saveCover(bare, "https://cdn.example/plate3.png", "x"), true, "octet-stream PNG is accepted");
  assert.equal(files.get(P + "No picture.md").fm.cover, "[[x.png]]");
  assert.equal(Plugin._test.sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).buffer), "jpg");
  plugin.settings.images = false;
  assert.equal(await plugin.saveCover(files.get(P + "Shelf bracket.md").file, "https://cdn.example/plate3.png", "z"), false, "images can be turned off");

  // A link with no name in it gets the page title.
  plugin.settings.images = true;
  const hook = await plugin.addModel(parseModelUrl("https://makerworld.com/models/555"));
  await new Promise((r) => setTimeout(r, 20));
  await plugin.fetchModelImage(hook, parseModelUrl("https://makerworld.com/models/555"));
  assert.ok(!files.has(P + "Desk Hook (2).md"), "running twice does not rename again");
  assert.ok(files.has(P + "Desk Hook.md"), "card renamed after the page title");
  assert.equal(files.get(P + "Desk Hook.md").fm.bambu_title, "Desk Hook");

  /* ---------- failed prints ---------- */
  const tr = Plugin._test.taskToRecord;
  const failed = (extra) => tr(Object.assign({ id: 1, status: 3, weight: 100, costTime: 3600, amsDetailMapping: [{ filamentType: "PLA", sourceColor: "000000FF", weight: 100 }] }, extra), ru);
  let r = failed({ startTime: "2026-11-01T10:00:00Z", endTime: "2026-11-01T10:15:00Z" });
  assert.equal(r.grams, 25, "a quarter of the way: a quarter of the weight");
  assert.equal(r.filaments[0].grams, 25);
  assert.equal(r.time_m, 15, "runtime, not the estimate");
  assert.equal(r.gramsEstimated, true);
  r = failed({ startTime: "2026-11-01T10:00:00Z" });
  assert.equal(r.grams, 0, "cancelled before it started: nothing spent");
  assert.equal(r.time_h + r.time_m, 0, "and no printer time");
  assert.equal(r.gramsEstimated, true);
  r = failed({ startTime: "2026-11-01T10:00:00Z", endTime: "2026-11-01T10:15:00Z", costTime: 0 });
  assert.equal(r.grams, 100, "no slicer estimate: full weight as an upper bound");
  assert.equal(r.gramsEstimated, true);
  r = failed({ startTime: "2026-11-01T10:00:00Z", endTime: "2026-11-01T13:00:00Z" });
  assert.equal(r.grams, 100, "never more than the full weight");
  r = tr({ id: 2, status: 2, weight: 50, costTime: 3600, startTime: "2026-11-01T10:00:00Z" }, ru);
  assert.equal(r.time_h, 1, "a finished job without an end time still uses the estimate");
  assert.equal(r.gramsEstimated, false);

  /* ---------- spool colours ---------- */
  const { cloudColors, colorName } = Plugin._test;
  const cc = cloudColors([
    { type: "print", filaments: ["PETG #000000 — 170.8 g", "PETG #FFFFFF — 2,2 g"] },
    { type: "print", filaments: ["PETG #000000 — 4.8 g"] },
    { type: "print", filaments: "PLA #68724d — 10 g" },
    { type: "spool", filaments: ["PLA #FF0000 — 999 g"] },
    { type: "print", filaments: ["garbage"] },
  ]);
  assert.deepEqual(cc.map((c) => `${c.material} ${c.hex} ${c.grams} ${c.prints}`), ["PETG 000000 176 2", "PLA 68724D 10 1", "PETG FFFFFF 2 1"], "most used first");
  assert.equal(colorName("000000", "ru"), "Чёрный");
  assert.equal(colorName("FFFFFF", "en"), "White");
  assert.equal(colorName("68724D", "ru"), "Оливковый");
  assert.equal(colorName("898989", "ru"), "Серый");
  assert.equal(colorName("9B9EA0", "en"), "Silver");
  assert.equal(colorName("nope", "en"), "");

  const sp = await plugin.createSpool({ material: "PETG", hex: "68724d", brand: "Bambu Lab", weight: "1000", price: "1590" });
  const spFm = files.get(sp.path).fm;
  assert.equal(sp.basename, "PETG Olive", "named after material and colour");
  assert.equal(spFm.material, "PETG");
  assert.equal(spFm.color_hex, "68724D");
  assert.equal(spFm.price, "1590");
  assert.equal(spFm.remaining_g, "1000");
  assert.ok(plugin.openSpools().some((x) => x.name === "PETG Olive"), "new spool can be picked");

  const vase = await plugin.addModel(parseModelUrl("https://makerworld.com/en/models/424242-olive-vase"), "PETG Olive");
  assert.equal(files.get(vase.path).fm.spool, "[[PETG Olive]]", "spool chosen while planning");
  await plugin.setSpool(vase, "");
  assert.equal(files.get(vase.path).fm.spool, "");
  await plugin.setSpool(vase, "PETG Olive");
  assert.equal(files.get(vase.path).fm.spool, "[[PETG Olive]]");

  /* ---------- spending ---------- */
  const { printStats } = Plugin._test;
  const nowD = new Date(2026, 10, 27);
  const st = printStats([
    { type: "print", status: ru.statusDone, cost: 100, grams: 50, time_h: 1, time_m: 30, printed: "2026-11-02" },
    { type: "print", status: ru.statusFailed, cost: 20.5, grams: 10, printed: "2026-11-20" },
    { type: "print", status: ru.statusDone, cost: "7,5", grams: 5, printed: "2026-10-31" },
    { type: "print", status: ru.statusPlanned, cost: 999, printed: "2026-11-27" },
    { type: "spool", cost: 1000 },
    { type: "print", status: ru.statusDone, printed: "2025-01-01", grams: 1 },
  ], ru, nowD);
  assert.equal(st.total.cost, 128, "planned prints and spools are not spending");
  assert.equal(st.total.count, 4);
  assert.equal(st.month.cost, 120.5);
  assert.equal(st.month.hours, 1.5);
  assert.equal(st.prev.cost, 7.5, "last month, with a comma decimal");
  assert.equal(st.failed.cost, 20.5);
  assert.equal(st.failed.count, 1);
  assert.equal(st.priced, 3);
  assert.equal(printStats([], ru, nowD).total.cost, 0);
  const tiles = el();
  tiles.empty = () => { tiles.kids = []; };
  plugin.fillStats(tiles);
  assert.equal(tiles.kids.length >= 4, true, "four spending tiles");
  assert.ok(tiles.all().includes("Spent on printing") && tiles.all().includes("This month"), tiles.all());
  plugin.fillStats(tiles);
  assert.ok(tiles.kids.length <= 5, "refresh replaces the tiles instead of adding more");

  /* ---------- two devices sharing one vault ---------- */
  assert.equal(mainDevice([{ id: "a", main: true, since: 1 }, { id: "b", main: true, since: 2 }]).id, "b", "latest claim wins");
  assert.equal(shouldYield([{ id: "a", main: true, since: 1 }, { id: "b", main: true, since: 2 }], "a"), true);
  assert.equal(shouldYield([{ id: "a", main: true, since: 1 }, { id: "b", main: true, since: 2 }], "b"), false);
  assert.equal(shouldYield([{ id: "a", main: true, since: 1 }], "a"), false);
  assert.equal(mainDevice([{ id: "a", main: false }]), null);

  const lastNotice = () => notices[notices.length - 1];
  const D = "3D/Devices/";
  const devNotes = () => [...files.keys()].filter((k) => k.startsWith(D));
  const devFm = (p) => files.get(p).fm;

  // Device A (the plugin above) synced as the main one, so it has its own device note.
  plugin.local("bambu-print-sync-device-name", "Mac");
  await plugin.sync(true);
  assert.equal(devNotes().length, 1, "one note per device");
  const aNote = devNotes()[0];
  assert.equal(devFm(aNote).type, "bambu-device");
  assert.equal(devFm(aNote).main, true);
  assert.ok(devFm(aNote).last_sync, "main device records its last sync");

  // Device B: same vault, its own local storage. A phone is secondary by default.
  const localB = { "bambu-print-sync-device-name": "Pixel", "bambu-print-sync-primary": "0" };
  const appB = Object.assign({}, app, {
    loadLocalStorage: (k) => (k in localB ? localB[k] : null),
    saveLocalStorage: (k, v) => { localB[k] = v; },
  });
  const phone = new Plugin(appB);
  await phone.onload();
  Object.assign(phone.settings, plugin.settings, { token: "y" });
  assert.notEqual(phone.deviceId(), plugin.deviceId(), "each device has its own id");

  // A healthy setup: B sees A syncing and says nothing.
  let before = notices.length;
  await phone.checkDevices();
  assert.equal(notices.length, before, "no warning while the main device syncs");
  assert.equal(devNotes().length, 2, "B wrote its own note");

  // Taking over while A is active asks first; cancelling changes nothing.
  let claim = phone.claimMain(true);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(modals.length, 1, "asks before taking over from an active main device");
  modals.pop().close();
  assert.equal(await claim, false);
  assert.equal(phone.isPrimary(), false);

  // Confirming makes B the main device …
  claim = phone.claimMain(true);
  await new Promise((r) => setTimeout(r, 0));
  const m = modals.pop();
  m.answer = true;
  m.close();
  assert.equal(await claim, true);
  assert.equal(phone.isPrimary(), true);

  // … and A, still switched on, steps down the next time it would import: both-main cannot persist.
  const aSync = devFm(aNote).last_sync;
  await new Promise((r) => setTimeout(r, 5));
  await plugin.sync(true);
  assert.equal(plugin.isPrimary(), false, "older main device steps down");
  assert.ok(lastNotice().includes("Pixel"), "and says who took over: " + lastNotice());
  assert.equal(devFm(aNote).main, false);
  assert.equal(devFm(aNote).last_sync, aSync, "the device that stepped down did not import");
  assert.equal(shouldYield(phone.readDevices(), phone.deviceId()), false, "B stays main");

  // Nobody main: the remaining device warns, with a button to fix it, once a day.
  await phone.releaseMain();
  before = notices.length;
  await plugin.checkDevices();
  assert.equal(notices.length, before + 1, "warns when no device imports");
  assert.ok(lastNotice().includes("основного устройства нет") || lastNotice().includes("no device is the main one"), lastNotice());
  await plugin.checkDevices();
  assert.equal(notices.length, before + 1, "the warning is not repeated within a day");

  // Main device gone quiet for days: warn with its name.
  plugin.local("bambu-print-sync-warned", "0");
  const bNote = devNotes().find((p) => p !== aNote);
  const old = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  Object.assign(devFm(bNote), { main: true, main_since: old, last_sync: old });
  await plugin.checkDevices();
  assert.ok(lastNotice().includes("Pixel"), "names the silent main device: " + lastNotice());

  // The warning's button makes this device the main one (no question: the other one is silent).
  const buttons = lastNoticeObj.frag.buttons();
  assert.deepEqual(buttons.map((b) => b.text), ["Make this the main device", "Open settings"]);
  buttons[0].click();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(modals.length, 0, "no question when the other main device is silent");
  assert.equal(plugin.isPrimary(), true, "button made this device the main one");
  assert.equal(shouldYield(plugin.readDevices(), plugin.deviceId()), false, "A is the main device again");

  // A main device without a login also warns.
  plugin.local("bambu-print-sync-warned", "0");
  plugin.settings.token = "";
  await plugin.checkDevices();
  assert.ok(lastNotice().includes("not logged in"), lastNotice());
  plugin.settings.token = "x";

  console.log("notices:", notices.join(" | "));
  console.log("All tests passed.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
