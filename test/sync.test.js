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
    addCommand() {}
    addSettingTab() {}
    registerInterval() {}
    async loadData() {
      return {};
    }
    async saveData() {}
  },
  PluginSettingTab: class {},
  Setting: class {},
  Modal: class {},
  moment: { locale: () => "en" },
  normalizePath: (p) => p.replace(/\/+$/, ""),
  requestUrl: async (o) => {
    const r = fixture[o.url.split("?")[0]];
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
const { LOCALE_DEFAULTS, normalizeName, parseUsage, buildBase } = Plugin._test;

/* ---------- fake vault ---------- */

const files = new Map(); // path -> { file, fm }
function add(p, fm) {
  const file = new TFile(p);
  files.set(p, { file, fm });
  return file;
}
const isFolder = (p) => !p.endsWith(".md") && [...files.keys()].some((k) => k.startsWith(p + "/"));
const app = {
  vault: {
    getMarkdownFiles: () => [...files.values()].map((x) => x.file),
    getAbstractFileByPath: (p) => (files.get(p) ? files.get(p).file : isFolder(p) ? {} : null),
    createFolder: async () => {},
    create: async (p) => add(p, { type: "print" }),
  },
  metadataCache: {
    getFileCache: (f) => ({ frontmatter: files.get(f.path).fm }),
    getFirstLinkpathDest: (name) => {
      const hit = [...files.values()].find((x) => x.file.basename === name);
      return hit ? hit.file : null;
    },
  },
  fileManager: { processFrontMatter: async (f, fn) => fn(files.get(f.path).fm) },
  workspace: { onLayoutReady() {}, getLeaf: () => ({ openFile: async () => {} }) },
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
      { id: 3, title: "Untitled", designTitle: "Shelf_bracket.3mf", status: 2, startTime: "2026-11-26T10:00:00Z", endTime: "2026-11-26T12:40:00Z", costTime: 9300, weight: 42.4, plateIndex: 1,
        amsDetailMapping: [{ filamentType: "PLA", sourceColor: "000000FF", weight: 42.4 }] },
    ],
  },
};

/* ---------- run ---------- */

(async () => {
  assert.equal(normalizeName("Shelf_bracket plate 2.3mf"), "shelf bracket");
  assert.deepEqual(parseUsage(["[[A|x]]: 1,5", "junk"]), [{ link: "A", grams: 1.5 }]);
  assert.ok(buildBase("3D", ru, "ru").includes('- "Провал"'));

  const plugin = new Plugin(app);
  await plugin.onload();
  Object.assign(plugin.settings, ru, { token: "x", printsFolder: "3D/Prints", spoolsFolder: "3D/Spools" });

  await plugin.sync();
  const get = (n) => [...files.values()].find((x) => x.file.basename.startsWith(n)).fm;

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

  await plugin.sync();
  assert.equal(get("PLA Black").remaining_g, 870 - 42.4 - 30, "no double deduction");
  assert.equal([...files.keys()].filter((k) => k.startsWith(P)).length, 4, "no duplicate notes");

  console.log("notices:", notices.join(" | "));
  console.log("All tests passed.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
