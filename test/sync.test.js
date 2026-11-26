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
}

const fakeObsidian = {
  TFile,
  Notice: class {
    constructor(m) {
      notices.push(m);
    }
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
  Modal: class {},
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
const { pageImage, imageExt, LOCALE_DEFAULTS, normalizeName, parseUsage, buildBase, parseModelUrl, computeCost } = Plugin._test;

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
    getMarkdownFiles: () => [...files.values()].map((x) => x.file),
    getAbstractFileByPath: (p) => (files.get(p) ? files.get(p).file : isFolder(p) ? {} : null),
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

  console.log("notices:", notices.join(" | "));
  console.log("All tests passed.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
