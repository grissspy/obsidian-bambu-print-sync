/*
 * Bambu Print Sync — an Obsidian plugin.
 *
 * Pulls print history from the Bambu Lab cloud into notes, links it to the
 * prints you planned, and deducts used filament from your spool notes.
 *
 * Plain JavaScript, no build step: this file is what Obsidian loads.
 * Not affiliated with or endorsed by Bambu Lab.
 */
"use strict";

const obsidian = require("obsidian");
const { Plugin, PluginSettingTab, Setting, Modal, Notice, requestUrl, TFile, normalizePath, moment, Platform } = obsidian;

const SUPPORT_URL = "https://boosty.to/grispy/donate";
const PRIMARY_KEY = "bambu-print-sync-primary";

/* ------------------------------------------------------------------ */
/* i18n                                                                */
/* ------------------------------------------------------------------ */

function detectLang() {
  try {
    const l = (moment && moment.locale && moment.locale()) || "en";
    return String(l).toLowerCase().startsWith("ru") ? "ru" : "en";
  } catch (e) {
    return "en";
  }
}

const STRINGS = {
  en: {
    ribbon: "Sync prints from Bambu cloud",
    cmdSync: "Sync prints from Bambu cloud",
    cmdDeduct: "Deduct filament from spools",
    cmdLogin: "Log in to Bambu account",
    cmdNewPrint: "New print note",
    cmdNewSpool: "New spool note",
    cmdBase: "Create tracker base",
    sbNoLogin: "Bambu: not logged in",
    sbNever: "Bambu: not synced yet",
    sbSyncing: "Bambu: syncing…",
    sbAt: "Bambu: {time}",
    needLogin: "Bambu: log in first (plugin settings).",
    authErr: "The Bambu cloud rejected the token. Log in again in the plugin settings.",
    httpErr: "The Bambu cloud answered {status}: {msg}",
    created: "new: {n}",
    linked: "linked to plan: {n}",
    updated: "updated: {n}",
    deducted: "deducted from spools: {n}",
    nothingNew: "nothing new",
    deductDone: "Bambu: filament deducted for {n} print(s)",
    deductNone: "Bambu: nothing to deduct",
    spoolMissing: "{note}: spool “{spool}” not found",
    imported: "Imported from the Bambu cloud.",
    notes: "Notes",
    untitled: "Print",
    tfaNoToken: "Could not get a token after two-factor check. Paste the token manually in the settings.",
    loginOk: "Bambu: logged in",
    loginTitle: "Log in to Bambu Lab",
    loginHint: "Your password is used once to get a token and is never stored. Only the token (valid ~3 months) is saved.",
    email: "Email",
    password: "Password",
    loginByCode: "Log in with email code",
    login: "Log in",
    enterEmail: "Enter your email.",
    enterBoth: "Enter email and password.",
    loggingIn: "Logging in…",
    codeSent: "Bambu sent a code to {email}. Enter it here.",
    code: "Code from the email",
    confirm: "Confirm",
    tfaHint: "Two-factor authentication is on. Enter the code from your authenticator app.",
    tfaCode: "2FA code",
    loginFail: "Login failed: {msg}. You can paste a token manually in the settings.",
    unknownAnswer: "unknown answer",
    hAccount: "Account",
    loggedIn: "Logged in",
    notLoggedIn: "Not logged in",
    tokenUntil: "The token is valid until about {date}. It is stored in the plugin's data.json inside your vault and syncs with it.",
    needLoginDesc: "Log in so the plugin can read your print history.",
    relogin: "Log in again",
    logout: "Log out",
    manualToken: "Token, manual",
    manualTokenDesc: "If the login window does not work: paste an accessToken (for example the “token” cookie on bambulab.com after you log in).",
    region: "Account region",
    regionGlobal: "Global (bambulab.com)",
    regionChina: "China (bambulab.cn), experimental",
    printer: "Printer",
    printerDesc: "Empty means every printer on the account.",
    printerId: "Printer ID",
    findPrinters: "Find printers",
    noPrinters: "Bambu: no printers found",
    hSync: "Sync",
    printsFolder: "Prints folder",
    spoolsFolder: "Spools folder",
    since: "Import prints since",
    sinceDesc: "Date as YYYY-MM-DD. Empty means everything the cloud returns (the last N jobs).",
    limit: "Jobs to request",
    onStart: "Sync when Obsidian starts",
    interval: "Auto sync, minutes",
    intervalDesc: "0 turns it off.",
    autoDeduct: "Deduct filament automatically",
    autoDeductDesc: "After a sync, subtracts grams of finished and failed prints from the spool's remaining_g. Each print is deducted once (spool_deducted).",
    hStatuses: "Status names",
    statusesDesc: "The words written to the status property. Change them to match your notes.",
    stPlanned: "Planned",
    stPrinting: "Printing",
    stDone: "Done",
    stFailed: "Failed",
    stSpoolOpen: "Spool in use",
    stSpoolEmpty: "Spool empty",
    syncNow: "Sync now",
    baseCreated: "Bambu: created {path}",
    baseExists: "Bambu: {path} already exists, left as is",
    newPrintName: "New print",
    cmdAddLink: "Add model to queue by link",
    addLinkTitle: "Add a model to the queue",
    addLinkHint: "Paste a link to a model on MakerWorld, Printables, Thingiverse or Cults3D.",
    add: "Add",
    queued: "Bambu: “{title}” added to the queue",
    alreadyQueued: "Bambu: “{title}” is already in the queue",
    notModelLink: "This does not look like a model link.",
    hModels: "Model links",
    pasteToQueue: "Queue models from pasted links",
    pasteToQueueDesc: "When you paste a MakerWorld, Printables, Thingiverse or Cults3D model link into any note, a planned print is created.",
    pasteReplace: "Replace the pasted link with a link to the print note",
    pasteReplaceDesc: "Off: the URL stays as pasted and the card is created in the background.",
    openModel: "Open the model",
    plateWord: "plate",
    notPrimary: "Bambu: cloud sync is off on this device. Turn on “Main device” at the top of the plugin settings.",
    hDevice: "Main device",
    primary: "Main device: this one",
    primaryOn: "✅ This device is the main one: it imports prints from the cloud, deducts filament and writes costs.",
    primaryOff: "⏸ This device is secondary: it only shows notes that arrive from the main device.",
    cmdPrimary: "Make this device the main one (on/off)",
    nowPrimary: "Bambu: this device is now the main one.",
    nowSecondary: "Bambu: this device is now secondary.",
    primaryDesc: "Only one device should import from the Bambu cloud, deduct filament and write costs. If you sync your vault (Obsidian Sync, Seafile, iCloud, Syncthing…), turn this on on one computer and off everywhere else, or both will create the same prints and fight over edits. Stored on this device only.",
    startDelay: "Wait after start, seconds",
    startDelayDesc: "Gives your vault sync time to download notes from other devices before the first Bambu sync, so no duplicates are created.",
    dupRemoved: "duplicates moved to trash: {n}",
    support: "Support the plugin",
    supportDesc: "If the plugin saves you time, you can support its development.",
    supportBtn: "Boosty",
    hCost: "Print cost",
    costDesc: "The plugin writes cost_filament, cost_power, cost_wear and cost into each print. Finished prints keep the cost they had; use the recalculate command after changing rates.",
    printerModel: "Printer model",
    printerModelDesc: "Sets a typical average power draw. Adjust the watts if you measured yours.",
    printerOther: "Other",
    powerW: "Average power, W",
    kwhPrice: "Electricity price per kWh",
    printerPrice: "Printer price",
    lifetimeH: "Printer lifetime, hours",
    lifetimeHDesc: "Depreciation per printing hour = printer price ÷ lifetime hours.",
    maintPerHour: "Maintenance per hour",
    maintPerHourDesc: "Nozzles, build plates, belts and lubricant, spread over printing hours.",
    currency: "Currency symbol",
    machineRate: "Machine cost per printing hour: {v}",
    cmdRecalc: "Recalculate cost of all prints",
    recalc: "Recalculate all prints",
    recalcDone: "Bambu: cost recalculated for {n} print(s)",
    welcomeTitle: "Set up print tracking",
    welcomeText: "Create the folders for prints and spools and a table with the queue, totals by month, cost and spools? Nothing else in your vault is touched.",
    welcomeCreate: "Create",
    welcomeSkip: "Not now",
    welcomeLater: "You can do it later with the command “Create tracker base”.",
    newSpoolName: "New spool",
  },
  ru: {
    ribbon: "Синхронизировать печати из облака Bambu",
    cmdSync: "Синхронизировать печати из облака",
    cmdDeduct: "Списать пластик с катушек",
    cmdLogin: "Войти в аккаунт Bambu",
    cmdNewPrint: "Новая печать",
    cmdNewSpool: "Новая катушка",
    cmdBase: "Создать базу учёта",
    sbNoLogin: "Bambu: не выполнен вход",
    sbNever: "Bambu: ещё не синхронизировано",
    sbSyncing: "Bambu: синхронизация…",
    sbAt: "Bambu: {time}",
    needLogin: "Bambu: сначала войди в аккаунт (настройки плагина).",
    authErr: "Облако Bambu не приняло токен. Войди заново в настройках плагина.",
    httpErr: "Облако Bambu ответило {status}: {msg}",
    created: "новых: {n}",
    linked: "связано с планом: {n}",
    updated: "обновлено: {n}",
    deducted: "списано с катушек: {n}",
    nothingNew: "нового нет",
    deductDone: "Bambu: списано по печатям: {n}",
    deductNone: "Bambu: списывать нечего",
    spoolMissing: "{note}: не найдена катушка «{spool}»",
    imported: "Импортировано из облака Bambu.",
    notes: "Заметки",
    untitled: "Печать",
    tfaNoToken: "Не удалось получить токен после двухфакторной проверки. Вставь токен вручную в настройках.",
    loginOk: "Bambu: вход выполнен",
    loginTitle: "Вход в аккаунт Bambu Lab",
    loginHint: "Пароль используется один раз для получения токена и нигде не сохраняется. Сохраняется только токен (около 3 месяцев).",
    email: "Email",
    password: "Пароль",
    loginByCode: "Войти по коду из почты",
    login: "Войти",
    enterEmail: "Впиши email.",
    enterBoth: "Впиши email и пароль.",
    loggingIn: "Вхожу…",
    codeSent: "Bambu отправила код на {email}. Впиши его сюда.",
    code: "Код из письма",
    confirm: "Подтвердить",
    tfaHint: "Включена двухфакторная защита. Впиши код из приложения-аутентификатора.",
    tfaCode: "Код 2FA",
    loginFail: "Не удалось войти: {msg}. Можно вставить токен вручную в настройках.",
    unknownAnswer: "неизвестный ответ",
    hAccount: "Аккаунт",
    loggedIn: "Вход выполнен",
    notLoggedIn: "Вход не выполнен",
    tokenUntil: "Токен действует примерно до {date}. Он хранится в data.json плагина внутри хранилища и синхронизируется вместе с ним.",
    needLoginDesc: "Войди, чтобы плагин мог читать историю печати.",
    relogin: "Войти заново",
    logout: "Выйти",
    manualToken: "Токен вручную",
    manualTokenDesc: "Если вход через окно не работает: вставь accessToken (например, cookie «token» на bambulab.com после входа).",
    region: "Регион аккаунта",
    regionGlobal: "Глобальный (bambulab.com)",
    regionChina: "Китай (bambulab.cn), экспериментально",
    printer: "Принтер",
    printerDesc: "Пусто — все принтеры аккаунта.",
    printerId: "ID принтера",
    findPrinters: "Найти принтеры",
    noPrinters: "Bambu: принтеры не найдены",
    hSync: "Синхронизация",
    printsFolder: "Папка печатей",
    spoolsFolder: "Папка катушек",
    since: "Импортировать печати начиная с",
    sinceDesc: "Дата ГГГГ-ММ-ДД. Пусто — всё, что отдаёт облако (последние N заданий).",
    limit: "Сколько последних заданий запрашивать",
    onStart: "Синхронизировать при запуске Obsidian",
    interval: "Автосинхронизация, минут",
    intervalDesc: "0 — выключено.",
    autoDeduct: "Списывать пластик автоматически",
    autoDeductDesc: "После синхронизации вычитает граммы готовых и проваленных печатей из remaining_g катушки. Каждая печать списывается один раз (spool_deducted).",
    hStatuses: "Названия статусов",
    statusesDesc: "Слова, которые плагин пишет в свойство status. Поменяй под свои заметки.",
    stPlanned: "Запланирована",
    stPrinting: "Печатается",
    stDone: "Готово",
    stFailed: "Провал",
    stSpoolOpen: "Катушка открыта",
    stSpoolEmpty: "Катушка пустая",
    syncNow: "Синхронизировать сейчас",
    baseCreated: "Bambu: создан файл {path}",
    baseExists: "Bambu: {path} уже есть, оставил как есть",
    newPrintName: "Новая печать",
    cmdAddLink: "Добавить модель в очередь по ссылке",
    addLinkTitle: "Добавить модель в очередь",
    addLinkHint: "Вставь ссылку на модель с MakerWorld, Printables, Thingiverse или Cults3D.",
    add: "Добавить",
    queued: "Bambu: «{title}» добавлена в очередь",
    alreadyQueued: "Bambu: «{title}» уже в очереди",
    notModelLink: "Это не похоже на ссылку на модель.",
    hModels: "Ссылки на модели",
    pasteToQueue: "Ставить в очередь по вставленной ссылке",
    pasteToQueueDesc: "Когда вставляешь в любую заметку ссылку на модель с MakerWorld, Printables, Thingiverse или Cults3D, создаётся запланированная печать.",
    pasteReplace: "Заменять вставленную ссылку ссылкой на заметку печати",
    pasteReplaceDesc: "Выключено: ссылка остаётся как есть, карточка создаётся в фоне.",
    openModel: "Открыть модель",
    plateWord: "пластина",
    notPrimary: "Bambu: на этом устройстве синхронизация с облаком выключена. Включи «Основное устройство» вверху настроек плагина.",
    hDevice: "Основное устройство",
    primary: "Основное устройство — это",
    primaryOn: "✅ Это устройство основное: импортирует печати из облака, списывает пластик и считает стоимость.",
    primaryOff: "⏸ Это устройство не основное: только показывает заметки, которые приходят с основного.",
    cmdPrimary: "Сделать это устройство основным (вкл/выкл)",
    nowPrimary: "Bambu: это устройство теперь основное.",
    nowSecondary: "Bambu: это устройство теперь не основное.",
    primaryDesc: "Импорт из облака Bambu, списание пластика и расчёт стоимости должно делать одно устройство. Если хранилище синхронизируется (Obsidian Sync, Seafile, iCloud, Syncthing…), включи это на одном компьютере и выключи на остальных, иначе они создадут одни и те же печати и будут перезаписывать правки друг друга. Хранится только на этом устройстве.",
    startDelay: "Ждать после запуска, секунд",
    startDelayDesc: "Даёт синхронизации хранилища время скачать заметки с других устройств до первой синхронизации с Bambu, чтобы не появились дубли.",
    dupRemoved: "дублей убрано в корзину: {n}",
    support: "Поддержать плагин",
    supportDesc: "Если плагин экономит тебе время, можно поддержать его развитие.",
    supportBtn: "Boosty",
    hCost: "Стоимость печати",
    costDesc: "Плагин записывает в каждую печать cost_filament, cost_power, cost_wear и cost. Завершённые печати сохраняют свою стоимость; после смены тарифов запусти пересчёт.",
    printerModel: "Модель принтера",
    printerModelDesc: "Задаёт типичную среднюю мощность. Поправь ватты, если измерял свой.",
    printerOther: "Другой",
    powerW: "Средняя мощность, Вт",
    kwhPrice: "Цена электричества за кВт·ч",
    printerPrice: "Цена принтера",
    lifetimeH: "Ресурс принтера, часов",
    lifetimeHDesc: "Амортизация за час печати = цена принтера ÷ ресурс в часах.",
    maintPerHour: "Обслуживание за час",
    maintPerHourDesc: "Сопла, столы, ремни, смазка — в пересчёте на час печати.",
    currency: "Символ валюты",
    machineRate: "Стоимость часа работы принтера: {v}",
    cmdRecalc: "Пересчитать стоимость всех печатей",
    recalc: "Пересчитать все печати",
    recalcDone: "Bambu: стоимость пересчитана для печатей: {n}",
    welcomeTitle: "Настроить учёт печати",
    welcomeText: "Создать папки для печатей и катушек и таблицу с очередью, итогами по месяцам, стоимостью и катушками? Больше ничего в хранилище не изменится.",
    welcomeCreate: "Создать",
    welcomeSkip: "Не сейчас",
    welcomeLater: "Это можно сделать позже командой «Создать базу учёта».",
    newSpoolName: "Новая катушка",
  },
};

const LANG = detectLang();

function t(key, vars) {
  let s = (STRINGS[LANG] && STRINGS[LANG][key]) || STRINGS.en[key] || key;
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

const API_BASES = {
  global: "https://api.bambulab.com",
  china: "https://api.bambulab.cn",
};

const LOCALE_DEFAULTS = {
  en: {
    printsFolder: "3D printing/Prints",
    spoolsFolder: "3D printing/Spools",
    statusPlanned: "Planned",
    statusPrinting: "Printing",
    statusDone: "Done",
    statusFailed: "Failed",
    spoolOpen: "In use",
    spoolEmpty: "Empty",
    currency: "$",
  },
  ru: {
    printsFolder: "3D печать/Печати",
    spoolsFolder: "3D печать/Катушки",
    statusPlanned: "План",
    statusPrinting: "Печатается",
    statusDone: "Готово",
    statusFailed: "Провал",
    spoolOpen: "Открыта",
    spoolEmpty: "Пустая",
    currency: "₽",
  },
};

const DEFAULT_SETTINGS = Object.assign(
  {
    region: "global",
    token: "",
    tokenExpires: 0,
    limit: 50,
    deviceId: "",
    importSince: "",
    syncOnStart: true,
    intervalMin: 30,
    autoDeduct: true,
    pasteToQueue: true,
    pasteReplace: false,
    printerModel: "P1S",
    powerW: 120,
    kwhPrice: 0,
    printerPrice: 0,
    lifetimeH: 4000,
    maintPerHour: 0,
    onboarded: false,
    startDelaySec: 30,
    lastSync: 0,
  },
  LOCALE_DEFAULTS[LANG]
);

/** Typical average power while printing, in watts. Approximate; users can override. */
const PRINTER_POWER = {
  "A1 mini": 80,
  A1: 95,
  P1P: 110,
  P1S: 120,
  P2S: 130,
  "X1 Carbon": 135,
  X1E: 160,
  H2S: 170,
  H2D: 200,
};

/* ------------------------------------------------------------------ */
/* pure helpers (exported for tests)                                   */
/* ------------------------------------------------------------------ */

function num(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(",", "."));
  return isFinite(n) ? n : 0;
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

/**
 * Cost of one print.
 * `spoolPrice(link)` returns the price per kg of a spool, or 0 if unknown.
 * Returns null when the note has neither grams nor time.
 */
function computeCost(fm, spoolPrice, st) {
  const hours = num(fm.time_h) + num(fm.time_m) / 60;
  const grams = num(fm.grams);
  if (!hours && !grams) return null;

  let filament = 0;
  const override = num(fm.price_kg);
  const parts = parseUsage(fm.usage);
  if (override) filament = (grams * override) / 1000;
  else if (parts.length) filament = parts.reduce((sum, p) => sum + (p.grams * spoolPrice(p.link)) / 1000, 0);
  else if (fm.spool) filament = (grams * spoolPrice(linkTarget(fm.spool))) / 1000;

  const power = (hours * num(st.powerW) * num(st.kwhPrice)) / 1000;
  const life = num(st.lifetimeH);
  const wear = hours * ((life > 0 ? num(st.printerPrice) / life : 0) + num(st.maintPerHour));
  // Nothing priced yet (no spool price, no rates): write nothing rather than a misleading 0.
  if (round2(filament + power + wear) === 0) return null;
  return {
    cost_filament: round2(filament),
    cost_power: round2(power),
    cost_wear: round2(wear),
    cost: round2(filament + power + wear),
  };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function localDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function stripExt(s) {
  return String(s || "").replace(/\.(gcode\.)?3mf$/i, "").replace(/\.gcode$/i, "").trim();
}

function cleanTitle(task, fallback) {
  let title = stripExt(task.designTitle) || stripExt(task.title);
  if (!title || /^untitled$/i.test(title)) title = stripExt(task.plateName) || fallback || "Print";
  return title;
}

function normalizeName(s) {
  return stripExt(s)
    .toLowerCase()
    .replace(/(^|\s)(plate|пластина)\s*\d+(?=\s|$)/g, " ")
    .replace(/[_\-–—.,()[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeFileName(s) {
  return (
    String(s)
      .replace(/[\\/:*?"<>|#^[\]]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "Print"
  );
}

function hex6(c) {
  return String(c || "").replace(/^#/, "").slice(0, 6).toUpperCase();
}

/**
 * Turn one cloud task into the fields we store.
 * `st` maps the four states to the status words the user writes.
 */
function taskToRecord(task, st, fallbackTitle) {
  st = st || LOCALE_DEFAULTS.en;
  const start = Date.parse(task.startTime);
  const end = Date.parse(task.endTime);
  const ran = !isNaN(start) && !isNaN(end) ? Math.max(0, Math.round((end - start) / 1000)) : 0;
  const est = Number(task.costTime) || 0;

  let state;
  if (task.status === 2) state = "done";
  else if (task.status === 3) state = "failed";
  else state = "printing";

  // Printer time: real runtime once a job has ended, the slicer estimate while it runs.
  const seconds = state === "printing" ? est : ran || est;

  // For a failed job the cloud reports the full sliced weight: scale it by how far the job got.
  let share = 1;
  let estimated = false;
  if (state === "failed" && est > 0 && ran > 0) {
    share = Math.min(1, ran / est);
    estimated = true;
  }

  const round1 = (x) => Math.round(x * 10) / 10;
  const filaments = (Array.isArray(task.amsDetailMapping) ? task.amsDetailMapping : [])
    .map((m) => ({
      type: String(m.filamentType || m.targetFilamentType || "").trim(),
      color: hex6(m.sourceColor || m.targetColor),
      grams: round1((Number(m.weight) || 0) * share),
    }))
    .filter((f) => f.grams > 0 || f.type);

  const status = { done: st.statusDone, failed: st.statusFailed, printing: st.statusPrinting }[state];

  return {
    id: String(task.id),
    designId: task.designId && String(task.designId) !== "0" ? String(task.designId) : "",
    title: cleanTitle(task, fallbackTitle),
    state,
    status,
    grams: round1((Number(task.weight) || 0) * share),
    gramsEstimated: estimated,
    time_h: Math.floor(seconds / 3600),
    time_m: Math.round((seconds % 3600) / 60),
    time_est_min: est ? Math.round(est / 60) : null,
    printed: task.startTime ? localDate(task.startTime) : "",
    plate: Number(task.plateIndex) || 1,
    device: task.deviceName || task.deviceId || "",
    filaments,
  };
}

/** Pick the spool for one filament: same material, same colour where spools have one; must be unambiguous. */
function matchSpool(filament, spools, st) {
  st = st || LOCALE_DEFAULTS.en;
  const first = (s) => s.toLowerCase().split(/\s+/)[0];
  const type = filament.type.toLowerCase();
  const usable = spools.filter((s) => s.status !== st.spoolEmpty);
  const byType = usable.filter((s) => s.material && type && first(s.material) === first(type));
  const byColor = byType.filter((s) => s.colorHex && s.colorHex === filament.color);
  const pick = (list) => {
    if (list.length === 1) return list[0];
    const open = list.filter((s) => s.status === st.spoolOpen);
    return open.length === 1 ? open[0] : null;
  };
  if (byColor.length) return pick(byColor);
  // Fall back to material only, among spools that have no colour set.
  return pick(byType.filter((s) => !s.colorHex));
}

/** Parse `usage` entries like "[[Spool]]: 12.3". */
function parseUsage(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const m = String(item).match(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]\s*:\s*([\d.,]+)/);
    if (m) out.push({ link: m[1].trim(), grams: parseFloat(m[2].replace(",", ".")) });
  }
  return out;
}

function linkTarget(value) {
  const m = String(value || "").match(/\[\[([^\]|#]+)/);
  return m ? m[1].trim() : String(value || "").trim();
}

function q(s) {
  return JSON.stringify(String(s));
}

function slugToTitle(slug) {
  let s = String(slug || "");
  try {
    s = decodeURIComponent(s);
  } catch (e) {
    /* keep as is */
  }
  s = s.replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

const MODEL_SITES = [
  { site: "MakerWorld", re: /^https?:\/\/(?:www\.)?makerworld\.com(?:\.cn)?\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?models\/(\d+)(?:-([^/?#]+))?/i },
  { site: "Printables", re: /^https?:\/\/(?:www\.)?printables\.com\/(?:[a-z]{2}\/)?model\/(\d+)(?:-([^/?#]+))?/i },
  { site: "Thingiverse", re: /^https?:\/\/(?:www\.)?thingiverse\.com\/thing:(\d+)()/i },
  { site: "Cults3D", re: /^https?:\/\/(?:www\.)?cults3d\.com\/[a-z]{2}\/(?:3d-model|modele-3d|modelo-3d)\/[^/]+\/([^/?#]+)()/i },
];

/** Recognise a model page link. Returns null for anything else. */
function parseModelUrl(text) {
  const url = String(text || "").trim();
  if (!url || /\s/.test(url)) return null;
  for (const { site, re } of MODEL_SITES) {
    const m = url.match(re);
    if (!m) continue;
    const isCults = site === "Cults3D";
    const id = m[1];
    const title = slugToTitle(isCults ? m[1] : m[2]) || `${site} ${id}`;
    const profile = url.match(/#profileId-(\d+)/i);
    return { site, id, title, url, profileId: profile ? profile[1] : "" };
  }
  return null;
}

/** The Bases file for the tracker. */
function buildBase(root, st, lang) {
  const L = lang === "ru"
    ? { queue: "Очередь", all: "Все печати", month: "По месяцам", failed: "Провалы", spools: "Катушки",
        status: "Статус", spool: "Катушка", grams: "Граммы", printed: "Дата печати", hours: "Часы", time: "Время",
        cost: "Стоимость", priceKg: "Цена за кг", monthCol: "Месяц", usage: "Расход", material: "Материал",
        color: "Цвет", brand: "Бренд", remaining: "Остаток, г", spoolStatus: "Состояние", left: "Остаток",
        warn: "Внимание", low: "⚠️ заканчивается", noDate: "без даты", h: "ч ", m: "м", g: " г", model: "Модель", digits: 0,
        costView: "Стоимость", fil: "Пластик", power: "Электричество", wear: "Износ" }
    : { queue: "Queue", all: "All prints", month: "By month", failed: "Failed", spools: "Spools",
        status: "Status", spool: "Spool", grams: "Grams", printed: "Printed", hours: "Hours", time: "Time",
        cost: "Cost", priceKg: "Price per kg", monthCol: "Month", usage: "Usage", material: "Material",
        color: "Colour", brand: "Brand", remaining: "Remaining, g", spoolStatus: "State", left: "Left",
        warn: "Attention", low: "⚠️ running low", noDate: "no date", h: "h ", m: "m", g: " g", model: "Model", digits: 2,
        costView: "Cost breakdown", fil: "Filament", power: "Electricity", wear: "Wear" };
  const cur = st.currency ? " " + st.currency : "";
  return `filters:
  and:
    - file.inFolder(${q(root)})
formulas:
  hours: (if(time_h, time_h, 0) + if(time_m, time_m, 0) / 60).round(1)
  time: if(time_h || time_m, if(time_h, time_h, 0) + ${q(L.h)} + if(time_m, time_m, 0) + ${q(L.m)}, "")
  price_kg: if(price_kg, price_kg, if(spool, (spool.asFile().properties.price / spool.asFile().properties.weight_g * 1000).round(0), ""))
  cost: if(cost, cost, if(grams && formula.price_kg, (grams * formula.price_kg / 1000).round(${L.digits}), ""))
  month: if(printed, date(printed).format("YYYY-MM"), ${q(L.noDate)})
  card: if(grams, grams + ${q(L.g)}, "") + if(formula.time, "  ·  ⏱ " + formula.time, "") + if(formula.cost, "  ·  " + formula.cost + ${q(cur)}, "")
  spool_price_kg: if(price && weight_g, (price / weight_g * 1000).round(0), "")
  remaining_pct: if(remaining_g && weight_g, (remaining_g / weight_g * 100).round(0) + "%", "")
  low: if(remaining_g && remaining_g < 150 && spool_status != ${q(st.spoolEmpty)}, ${q(L.low)}, "")
properties:
  note.status:
    displayName: ${q(L.status)}
  note.spool:
    displayName: ${q(L.spool)}
  note.grams:
    displayName: ${q(L.grams)}
  note.printed:
    displayName: ${q(L.printed)}
  formula.hours:
    displayName: ${q(L.hours)}
  formula.time:
    displayName: ${q(L.time)}
  formula.cost:
    displayName: ${q(L.cost)}
  formula.price_kg:
    displayName: ${q(L.priceKg)}
  formula.month:
    displayName: ${q(L.monthCol)}
  formula.card:
    displayName: ${q(L.usage)}
  note.material:
    displayName: ${q(L.material)}
  note.color:
    displayName: ${q(L.color)}
  note.brand:
    displayName: ${q(L.brand)}
  note.remaining_g:
    displayName: ${q(L.remaining)}
  note.spool_status:
    displayName: ${q(L.spoolStatus)}
  formula.spool_price_kg:
    displayName: ${q(L.priceKg)}
  formula.remaining_pct:
    displayName: ${q(L.left)}
  formula.low:
    displayName: ${q(L.warn)}
  note.model_url:
    displayName: ${q(L.model)}
  note.cost_filament:
    displayName: ${q(L.fil)}
  note.cost_power:
    displayName: ${q(L.power)}
  note.cost_wear:
    displayName: ${q(L.wear)}
views:
  - type: kanban
    name: ${q(L.queue)}
    filters:
      and:
        - type == "print"
    groupBy:
      property: status
      direction: ASC
    groupOrder:
      - ${q(st.statusPlanned)}
      - ${q(st.statusPrinting)}
      - ${q(st.statusDone)}
      - ${q(st.statusFailed)}
    order:
      - file.name
      - formula.card
      - model_url
      - spool
  - type: table
    name: ${q(L.all)}
    filters:
      and:
        - type == "print"
    order:
      - file.name
      - status
      - printed
      - spool
      - grams
      - formula.time
      - formula.hours
      - formula.cost
    sort:
      - property: printed
        direction: DESC
    summaries:
      grams: Sum
      formula.hours: Sum
      formula.cost: Sum
  - type: table
    name: ${q(L.month)}
    filters:
      and:
        - type == "print"
        - status != ${q(st.statusPlanned)}
    groupBy:
      property: formula.month
      direction: DESC
    order:
      - file.name
      - status
      - grams
      - formula.hours
      - formula.cost
    summaries:
      grams: Sum
      formula.hours: Sum
      formula.cost: Sum
  - type: table
    name: ${q(L.failed)}
    filters:
      and:
        - type == "print"
        - status == ${q(st.statusFailed)}
    order:
      - file.name
      - printed
      - spool
      - grams
      - formula.cost
    summaries:
      grams: Sum
      formula.cost: Sum
  - type: table
    name: ${q(L.costView)}
    filters:
      and:
        - type == "print"
        - status != ${q(st.statusPlanned)}
    order:
      - file.name
      - printed
      - grams
      - formula.hours
      - cost_filament
      - cost_power
      - cost_wear
      - formula.cost
    sort:
      - property: printed
        direction: DESC
    summaries:
      grams: Sum
      formula.hours: Sum
      cost_filament: Sum
      cost_power: Sum
      cost_wear: Sum
      formula.cost: Sum
  - type: table
    name: ${q(L.spools)}
    filters:
      and:
        - type == "spool"
    order:
      - file.name
      - material
      - color
      - brand
      - spool_status
      - remaining_g
      - formula.remaining_pct
      - formula.spool_price_kg
      - formula.low
    sort:
      - property: remaining_g
        direction: ASC
    summaries:
      remaining_g: Sum
`;
}

/** The embedded base that lists the prints made from one spool. */
function spoolPrintsBlock(lang) {
  const L = lang === "ru"
    ? { title: "Печати с этой катушки", view: "Печати", status: "Статус", grams: "Граммы", hours: "Часы", date: "Дата" }
    : { title: "Prints from this spool", view: "Prints", status: "Status", grams: "Grams", hours: "Hours", date: "Date" };
  return `## ${L.title}

\`\`\`base
filters:
  and:
    - type == "print"
    - file.hasLink(this.file)
formulas:
  hours: (if(time_h, time_h, 0) + if(time_m, time_m, 0) / 60).round(1)
properties:
  note.status:
    displayName: ${q(L.status)}
  note.grams:
    displayName: ${q(L.grams)}
  formula.hours:
    displayName: ${q(L.hours)}
  note.printed:
    displayName: ${q(L.date)}
views:
  - type: table
    name: ${q(L.view)}
    order:
      - file.name
      - status
      - printed
      - grams
      - formula.hours
    sort:
      - property: printed
        direction: DESC
    summaries:
      grams: Sum
      formula.hours: Sum
\`\`\`
`;
}

/* ------------------------------------------------------------------ */
/* plugin                                                              */
/* ------------------------------------------------------------------ */

class BambuPrintSync extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.syncing = false;

    this.statusEl = this.addStatusBarItem();
    this.updateStatusBar();

    this.addRibbonIcon("printer", t("ribbon"), () => this.sync());
    this.addCommand({ id: "sync", name: t("cmdSync"), callback: () => this.sync() });
    this.addCommand({ id: "deduct", name: t("cmdDeduct"), callback: () => this.deductAll(true) });
    this.addCommand({ id: "login", name: t("cmdLogin"), callback: () => new LoginModal(this.app, this).open() });
    this.addCommand({ id: "new-print", name: t("cmdNewPrint"), callback: () => this.newNote("print") });
    this.addCommand({ id: "new-spool", name: t("cmdNewSpool"), callback: () => this.newNote("spool") });
    this.addCommand({ id: "create-base", name: t("cmdBase"), callback: () => this.createBase() });
    this.addCommand({ id: "add-link", name: t("cmdAddLink"), callback: () => new AddLinkModal(this.app, this).open() });
    this.addCommand({
      id: "toggle-primary",
      name: t("cmdPrimary"),
      callback: () => {
        const on = !this.isPrimary();
        this.setPrimary(on);
        new Notice(on ? t("nowPrimary") : t("nowSecondary"));
        if (on && this.settings.token) this.sync(true);
      },
    });
    this.addCommand({ id: "recalc-cost", name: t("cmdRecalc"), callback: () => this.recalcAll(true) });

    this.costTimers = new Map();
    this.registerEvent(this.app.metadataCache.on("changed", (file) => this.onNoteChanged(file)));

    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt, editor) => this.onPaste(evt, editor))
    );

    this.addSettingTab(new BambuSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.maybeOnboard();
      // Let a vault sync plugin pull notes from other devices first.
      this.startTimer = window.setTimeout(() => {
        if (this.settings.syncOnStart && this.settings.token && this.isPrimary()) this.sync(true);
      }, Math.max(0, num(this.settings.startDelaySec)) * 1000);
    });
    this.restartTimer();
  }

  onunload() {
    if (this.timer) window.clearInterval(this.timer);
    if (this.startTimer) window.clearTimeout(this.startTimer);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateStatusBar();
  }

  restartTimer() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    const min = Number(this.settings.intervalMin);
    if (min > 0) {
      this.timer = window.setInterval(() => {
        if (this.settings.token && this.isPrimary()) this.sync(true);
      }, min * 60 * 1000);
      this.registerInterval(this.timer);
    }
  }

  updateStatusBar() {
    if (!this.statusEl) return;
    if (!this.settings.token) return this.statusEl.setText(t("sbNoLogin"));
    if (!this.settings.lastSync) return this.statusEl.setText(t("sbNever"));
    const d = new Date(this.settings.lastSync);
    this.statusEl.setText(t("sbAt", { time: `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}` }));
  }

  /* ---------- API ---------- */

  base() {
    return API_BASES[this.settings.region] || API_BASES.global;
  }

  async api(method, path, body, auth = true) {
    const headers = { "Content-Type": "application/json" };
    if (auth) headers.Authorization = `Bearer ${this.settings.token}`;
    const res = await requestUrl({
      url: this.base() + path,
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      throw: false,
    });
    let json = null;
    try {
      json = res.json;
    } catch (e) {
      json = null;
    }
    if (auth && (res.status === 401 || res.status === 403)) {
      const err = new Error(t("authErr"));
      err.auth = true;
      throw err;
    }
    if (res.status >= 400) {
      throw new Error(t("httpErr", { status: res.status, msg: (json && (json.message || json.error)) || "" }).trim());
    }
    return { json, headers: res.headers || {} };
  }

  async fetchDevices() {
    const { json } = await this.api("GET", "/v1/iot-service/api/user/bind");
    return (json && json.devices) || [];
  }

  async fetchTasks() {
    const params = new URLSearchParams();
    params.set("limit", String(Math.max(1, Math.min(500, Number(this.settings.limit) || 50))));
    if (this.settings.deviceId) params.set("deviceId", this.settings.deviceId);
    const { json } = await this.api("GET", `/v1/user-service/my/tasks?${params.toString()}`);
    return (json && json.hits) || [];
  }

  /* ---------- vault helpers ---------- */

  filesIn(folder) {
    const prefix = normalizePath(folder) + "/";
    return this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));
  }

  fm(file) {
    const c = this.app.metadataCache.getFileCache(file);
    return (c && c.frontmatter) || {};
  }

  async ensureFolder(folder) {
    const path = normalizePath(folder);
    if (this.app.vault.getAbstractFileByPath(path)) return;
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join("/");
      if (!this.app.vault.getAbstractFileByPath(p)) await this.app.vault.createFolder(p);
    }
  }

  uniquePath(folder, name) {
    const dir = normalizePath(folder);
    const base = safeFileName(name);
    let path = `${dir}/${base}.md`;
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = `${dir}/${base} (${i}).md`;
    return path;
  }

  rootFolder() {
    const parts = normalizePath(this.settings.printsFolder).split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : parts[0];
  }

  spoolList() {
    return this.filesIn(this.settings.spoolsFolder)
      .map((file) => ({ file, fm: this.fm(file) }))
      .filter(({ fm }) => fm.type === "spool")
      .map(({ file, fm }) => ({
        file,
        name: file.basename,
        material: String(fm.material || ""),
        colorHex: hex6(fm.color_hex),
        status: String(fm.spool_status || ""),
      }));
  }

  /* ---------- sync ---------- */

  /** Only one device per synced vault writes cloud data. Kept in this device's local storage. */
  isPrimary() {
    let v = null;
    try {
      v = this.app.loadLocalStorage ? this.app.loadLocalStorage(PRIMARY_KEY) : null;
    } catch (e) {
      v = null;
    }
    if (v === "1" || v === true) return true;
    if (v === "0" || v === false) return false;
    return !(Platform && Platform.isMobile);
  }

  setPrimary(on) {
    try {
      if (this.app.saveLocalStorage) this.app.saveLocalStorage(PRIMARY_KEY, on ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
  }

  async sync(quiet = false) {
    if (this.syncing) return;
    if (!this.isPrimary()) {
      if (!quiet) new Notice(t("notPrimary"), 8000);
      return;
    }
    if (!this.settings.token) {
      new Notice(t("needLogin"));
      return;
    }
    this.syncing = true;
    if (this.statusEl) this.statusEl.setText(t("sbSyncing"));
    const st = this.settings;
    try {
      const tasks = await this.fetchTasks();
      const since = st.importSince ? Date.parse(st.importSince) : NaN;
      const records = tasks
        .filter((task) => isNaN(since) || Date.parse(task.startTime) >= since)
        .map((task) => taskToRecord(task, st, t("untitled")))
        .reverse(); // oldest first, so planned notes are matched in print order

      await this.ensureFolder(st.printsFolder);
      const prints = this.filesIn(st.printsFolder).map((file) => ({ file, fm: this.fm(file) }));
      const byId = new Map();
      // One note per cloud job. A vault sync can deliver a second copy made on another device:
      // keep the deducted one, else the oldest, and move the rest to the trash.
      const groups = new Map();
      for (const p of prints) {
        if (!p.fm.bambu_task_id) continue;
        const id = String(p.fm.bambu_task_id);
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(p);
      }
      let removed = 0;
      for (const [id, list] of groups) {
        const ctime = (p) => (p.file.stat && p.file.stat.ctime) || 0;
        list.sort((a, b) => (b.fm.spool_deducted ? 1 : 0) - (a.fm.spool_deducted ? 1 : 0) || ctime(a) - ctime(b));
        byId.set(id, list[0].file);
        for (const extra of list.slice(1)) {
          await this.app.fileManager.trashFile(extra.file);
          removed++;
        }
      }
      const used = new Set();
      const spools = this.spoolList();
      const finals = [st.statusDone, st.statusFailed];
      const open = [st.statusPlanned, st.statusPrinting];

      let created = 0;
      let updated = 0;
      let linked = 0;
      for (const rec of records) {
        let file = byId.get(rec.id);
        if (file) {
          const fm = this.fm(file);
          // A finished job is final: leave whatever the user edited alone.
          if (finals.includes(fm.status) && fm.status === rec.status) continue;
          await this.writeRecord(file, rec, spools, false);
          updated++;
          continue;
        }
        const want = normalizeName(rec.title);
        const candidates = prints.filter(
          (p) => !used.has(p.file.path) && !p.fm.bambu_task_id && p.fm.type === "print" && open.includes(p.fm.status)
        );
        // A MakerWorld model ID is exact; the name is the fallback.
        const plan =
          (rec.designId && candidates.find((p) => String(p.fm.makerworld_id || "") === rec.designId)) ||
          candidates.find((p) => normalizeName(p.fm.bambu_title || p.file.basename) === want);
        if (plan) {
          used.add(plan.file.path);
          await this.writeRecord(plan.file, rec, spools, false);
          byId.set(rec.id, plan.file);
          linked++;
          continue;
        }
        file = await this.createPrintNote(rec);
        await this.writeRecord(file, rec, spools, true);
        byId.set(rec.id, file);
        created++;
      }

      st.lastSync = Date.now();
      await this.saveSettings();

      const deducted = st.autoDeduct ? await this.deductAll(false) : 0;

      const parts = [];
      if (created) parts.push(t("created", { n: created }));
      if (linked) parts.push(t("linked", { n: linked }));
      if (updated) parts.push(t("updated", { n: updated }));
      if (deducted) parts.push(t("deducted", { n: deducted }));
      if (removed) parts.push(t("dupRemoved", { n: removed }));
      if (!quiet || parts.length) new Notice(`Bambu: ${parts.length ? parts.join(", ") : t("nothingNew")}`);
    } catch (e) {
      console.error("[bambu-print-sync]", e);
      new Notice(`Bambu: ${e.message}`, 8000);
    } finally {
      this.syncing = false;
      this.updateStatusBar();
    }
  }

  async createPrintNote(rec) {
    const plate = rec.plate > 1 ? ` · ${t("plateWord")} ${rec.plate}` : "";
    const path = this.uniquePath(this.settings.printsFolder, `${rec.title}${plate} ${rec.printed}`.trim());
    const body = ["---", "type: print", "---", t("imported"), "", `## ${t("notes")}`, ""].join("\n");
    return this.app.vault.create(path, body);
  }

  async writeRecord(file, rec, spools, isNew) {
    const usage = [];
    for (const f of rec.filaments) {
      const s = matchSpool(f, spools, this.settings);
      if (s && f.grams > 0) {
        const existing = usage.find((u) => u.spool === s);
        if (existing) existing.grams += f.grams;
        else usage.push({ spool: s, grams: f.grams });
      }
    }
    usage.sort((a, b) => b.grams - a.grams);

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.type = "print";
      fm.status = rec.status;
      fm.bambu_task_id = rec.id;
      if (isNew || !fm.bambu_title) fm.bambu_title = rec.title;
      if (!fm.spool_deducted) {
        fm.grams = rec.grams;
        if (rec.gramsEstimated) fm.grams_estimated = true;
      }
      fm.time_h = rec.time_h;
      fm.time_m = rec.time_m;
      if (rec.time_est_min != null) fm.time_est_min = rec.time_est_min;
      if (rec.printed) fm.printed = rec.printed;
      fm.plate = rec.plate;
      if (rec.device) fm.printer = rec.device;
      fm.filaments = rec.filaments.map((f) => `${f.type || "?"} #${f.color || "??????"} — ${f.grams} g`);
      fm.source = "bambu-cloud";
      if (!fm.created) fm.created = rec.printed || localDate(new Date().toISOString());
      const manualSpool = fm.spool && String(fm.spool).trim();
      if (!manualSpool && usage.length) fm.spool = `[[${usage[0].spool.name}]]`;
      if (!manualSpool && !fm.spool_deducted && usage.length > 1) {
        fm.usage = usage.map((u) => `[[${u.spool.name}]]: ${Math.round(u.grams * 10) / 10}`);
      }
      if (!Array.isArray(fm.tags)) fm.tags = fm.tags ? [fm.tags] : [];
      if (!fm.tags.includes("3d-print")) fm.tags.push("3d-print");
    });
  }

  /* ---------- filament deduction ---------- */

  async deductAll(manual) {
    if (!this.isPrimary()) {
      if (manual) new Notice(t("notPrimary"), 8000);
      return 0;
    }
    const st = this.settings;
    const finals = [st.statusDone, st.statusFailed];
    let count = 0;
    const problems = [];
    for (const file of this.filesIn(st.printsFolder)) {
      const fm = this.fm(file);
      if (fm.type !== "print" || !finals.includes(fm.status) || fm.spool_deducted) continue;

      let parts = parseUsage(fm.usage);
      if (!parts.length) {
        const grams = Number(fm.grams);
        const link = linkTarget(fm.spool);
        if (!link || !(grams > 0)) continue;
        parts = [{ link, grams }];
      }
      const resolved = parts.map((p) => ({ ...p, file: this.app.metadataCache.getFirstLinkpathDest(p.link, file.path) }));
      const missing = resolved.find((p) => !(p.file instanceof TFile));
      if (missing) {
        problems.push(t("spoolMissing", { note: file.basename, spool: missing.link }));
        continue;
      }
      for (const p of resolved) {
        await this.app.fileManager.processFrontMatter(p.file, (sfm) => {
          const left = Number(sfm.remaining_g);
          const base = isNaN(left) || sfm.remaining_g === "" || sfm.remaining_g == null ? Number(sfm.weight_g) || 0 : left;
          sfm.remaining_g = Math.max(0, Math.round((base - p.grams) * 10) / 10);
        });
      }
      await this.app.fileManager.processFrontMatter(file, (pfm) => {
        pfm.spool_deducted = true;
      });
      count++;
    }
    if (manual) new Notice(count ? t("deductDone", { n: count }) : t("deductNone"));
    if (problems.length) new Notice("Bambu: " + problems.slice(0, 3).join("; "), 8000);
    return count;
  }

  /* ---------- notes and base ---------- */

  async newNote(kind) {
    const st = this.settings;
    const folder = kind === "print" ? st.printsFolder : st.spoolsFolder;
    await this.ensureFolder(folder);
    const today = localDate(new Date().toISOString());
    const path = this.uniquePath(folder, kind === "print" ? t("newPrintName") : t("newSpoolName"));
    const fmLines = kind === "print"
      ? ["type: print", `status: ${q(st.statusPlanned)}`, 'spool: ""', "grams:", "time_h:", "time_m:", "plate: 1", "printed:", `created: ${today}`, "tags:", "  - 3d-print"]
      : ["type: spool", "material: PLA", "color:", "color_hex:", "brand:", "weight_g: 1000", "price:", "remaining_g: 1000", `spool_status: ${q(st.spoolOpen)}`, `bought: ${today}`, "tags:", "  - 3d-spool"];
    const body = kind === "print" ? `## ${t("notes")}\n` : spoolPrintsBlock(LANG);
    const file = await this.app.vault.create(path, ["---", ...fmLines, "---", "", body].join("\n"));
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  /* ---------- model links ---------- */

  onPaste(evt, editor) {
    if (!this.settings.pasteToQueue || evt.defaultPrevented || !evt.clipboardData) return;
    const text = evt.clipboardData.getData("text/plain");
    const model = parseModelUrl(text);
    if (!model) return;
    if (this.settings.pasteReplace) {
      evt.preventDefault();
      this.addModel(model).then((file) => {
        if (file) editor.replaceSelection(this.app.fileManager.generateMarkdownLink(file, "")); else editor.replaceSelection(text);
      });
    } else {
      this.addModel(model);
    }
  }

  findQueued(model) {
    const st = this.settings;
    const open = [st.statusPlanned, st.statusPrinting];
    return this.filesIn(st.printsFolder).find((f) => {
      const fm = this.fm(f);
      if (fm.type !== "print" || !open.includes(fm.status)) return false;
      const same = parseModelUrl(fm.model_url);
      return same && same.site === model.site && same.id === model.id;
    });
  }

  /** Create a planned print for a model link, or return the one already queued. */
  async addModel(model) {
    try {
      const existing = this.findQueued(model);
      if (existing) {
        new Notice(t("alreadyQueued", { title: existing.basename }));
        return existing;
      }
      const st = this.settings;
      await this.ensureFolder(st.printsFolder);
      const path = this.uniquePath(st.printsFolder, model.title);
      const today = localDate(new Date().toISOString());
      const lines = [
        "---",
        "type: print",
        `status: ${q(st.statusPlanned)}`,
        `model_url: ${q(model.url)}`,
        `model_site: ${model.site}`,
      ];
      if (model.site === "MakerWorld") lines.push(`makerworld_id: ${q(model.id)}`);
      if (model.profileId) lines.push(`makerworld_profile: ${q(model.profileId)}`);
      lines.push(
        `bambu_title: ${q(model.title)}`,
        'spool: ""',
        "grams:",
        "time_h:",
        "time_m:",
        "plate: 1",
        "printed:",
        `created: ${today}`,
        "tags:",
        "  - 3d-print",
        "---",
        `[${t("openModel")} · ${model.site}](${model.url})`,
        "",
        `## ${t("notes")}`,
        ""
      );
      const file = await this.app.vault.create(path, lines.join("\n"));
      new Notice(t("queued", { title: file.basename }));
      return file;
    } catch (e) {
      console.error("[bambu-print-sync]", e);
      new Notice(`Bambu: ${e.message}`, 8000);
      return null;
    }
  }

  /* ---------- cost ---------- */

  spoolPricePerKg(link, sourcePath) {
    const file = link && this.app.metadataCache.getFirstLinkpathDest(link, sourcePath || "");
    if (!(file instanceof TFile)) return 0;
    const fm = this.fm(file);
    const price = num(fm.price);
    const weight = num(fm.weight_g) || 1000;
    return price > 0 ? (price / weight) * 1000 : 0;
  }

  isPrint(file) {
    return file instanceof TFile && file.path.startsWith(normalizePath(this.settings.printsFolder) + "/") && this.fm(file).type === "print";
  }

  isSpool(file) {
    return file instanceof TFile && file.path.startsWith(normalizePath(this.settings.spoolsFolder) + "/") && this.fm(file).type === "spool";
  }

  onNoteChanged(file) {
    if (!this.isPrimary()) return;
    const targets = this.isPrint(file)
      ? [file]
      : this.isSpool(file)
        ? this.filesIn(this.settings.printsFolder).filter((f) => linkTarget(this.fm(f).spool) === file.basename || parseUsage(this.fm(f).usage).some((u) => u.link === file.basename))
        : [];
    for (const f of targets) {
      clearTimeout(this.costTimers.get(f.path));
      this.costTimers.set(f.path, setTimeout(() => {
        this.costTimers.delete(f.path);
        this.updateCost(f, false);
      }, 400));
    }
  }

  /** Write the cost into a print note. Finished prints with a cost keep it unless forced. */
  async updateCost(file, force) {
    const fm = this.fm(file);
    if (fm.type !== "print") return false;
    const st = this.settings;
    const final = [st.statusDone, st.statusFailed].includes(fm.status);
    if (!force && final && num(fm.cost) > 0) return false;
    const c = computeCost(fm, (link) => this.spoolPricePerKg(link, file.path), st);
    if (!c) return false;
    if (Object.keys(c).every((k) => num(fm[k]) === c[k] && fm[k] !== undefined)) return false;
    await this.app.fileManager.processFrontMatter(file, (f) => Object.assign(f, c));
    return true;
  }

  async recalcAll(manual) {
    if (!this.isPrimary()) {
      if (manual) new Notice(t("notPrimary"), 8000);
      return 0;
    }
    let n = 0;
    for (const f of this.filesIn(this.settings.printsFolder)) if (await this.updateCost(f, true)) n++;
    if (manual) new Notice(t("recalcDone", { n }));
    return n;
  }

  /* ---------- onboarding ---------- */

  async maybeOnboard() {
    if (this.settings.onboarded) return;
    const root = this.rootFolder();
    const exists = this.app.vault.getAbstractFileByPath(normalizePath(this.settings.printsFolder)) ||
      this.app.vault.getFiles().some((f) => f.extension === "base" && f.path.startsWith(root + "/"));
    this.settings.onboarded = true;
    await this.saveSettings();
    if (!exists) new WelcomeModal(this.app, this).open();
  }

  async setupTracker() {
    await this.ensureFolder(this.settings.printsFolder);
    await this.ensureFolder(this.settings.spoolsFolder);
    const path = await this.createBase();
    const file = path && this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
  }

  async createBase() {
    const root = this.rootFolder();
    await this.ensureFolder(root);
    const name = LANG === "ru" ? "3D печать.base" : "3D printing.base";
    const path = normalizePath(`${root}/${name}`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(t("baseExists", { path }));
      return path;
    }
    await this.app.vault.create(path, buildBase(root, this.settings, LANG));
    new Notice(t("baseCreated", { path }));
    return path;
  }

  /* ---------- login ---------- */

  async loginWithPassword(account, password) {
    const { json } = await this.api("POST", "/v1/user-service/user/login", { account, password }, false);
    return json || {};
  }

  async sendEmailCode(email) {
    await this.api("POST", "/v1/user-service/user/sendemail/code", { email, type: "codeLogin" }, false);
  }

  async loginWithCode(account, code) {
    const { json } = await this.api("POST", "/v1/user-service/user/login", { account, code }, false);
    return json || {};
  }

  async loginWithTfa(tfaKey, tfaCode) {
    const res = await requestUrl({
      url: this.settings.region === "china" ? "https://bambulab.cn/api/sign-in/tfa" : "https://bambulab.com/api/sign-in/tfa",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tfaKey, tfaCode }),
      throw: false,
    });
    let json = {};
    try {
      json = res.json || {};
    } catch (e) {
      json = {};
    }
    if (json.accessToken || json.token) return { accessToken: json.accessToken || json.token, expiresIn: json.expiresIn };
    const cookie = [].concat((res.headers && (res.headers["set-cookie"] || res.headers["Set-Cookie"])) || []).join(";");
    const m = cookie.match(/(?:^|[;,\s])token=([^;]+)/);
    if (m) return { accessToken: m[1] };
    throw new Error(t("tfaNoToken"));
  }

  async storeToken(json) {
    this.settings.token = json.accessToken;
    this.settings.tokenExpires = Date.now() + (Number(json.expiresIn) || 7776000) * 1000;
    await this.saveSettings();
  }
}

/* ------------------------------------------------------------------ */
/* login modal                                                         */
/* ------------------------------------------------------------------ */

class LoginModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.step = "password";
    this.account = "";
    this.tfaKey = "";
  }

  onOpen() {
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle ? this.setTitle(t("loginTitle")) : contentEl.createEl("h3", { text: t("loginTitle") });
    const msg = contentEl.createEl("p");
    const say = (text, isErr) => {
      msg.setText(text);
      msg.toggleClass("mod-warning", !!isErr);
    };

    if (this.step === "password") {
      contentEl.createEl("p", { text: t("loginHint"), cls: "setting-item-description" });
      let email = this.account;
      let password = "";
      new Setting(contentEl).setName(t("email")).addText((c) => {
        c.setValue(email).onChange((v) => (email = v.trim()));
        c.inputEl.type = "email";
      });
      new Setting(contentEl).setName(t("password")).addText((c) => {
        c.onChange((v) => (password = v));
        c.inputEl.type = "password";
      });
      new Setting(contentEl)
        .addButton((b) =>
          b.setButtonText(t("loginByCode")).onClick(async () => {
            if (!email) return say(t("enterEmail"), true);
            try {
              this.account = email;
              await this.plugin.sendEmailCode(email);
              this.step = "code";
              this.render();
            } catch (e) {
              say(e.message, true);
            }
          })
        )
        .addButton((b) =>
          b.setCta().setButtonText(t("login")).onClick(async () => {
            if (!email || !password) return say(t("enterBoth"), true);
            try {
              say(t("loggingIn"));
              this.account = email;
              await this.handle(await this.plugin.loginWithPassword(email, password), say);
            } catch (e) {
              say(e.message, true);
            }
          })
        );
    } else if (this.step === "code") {
      contentEl.createEl("p", { text: t("codeSent", { email: this.account }) });
      let code = "";
      new Setting(contentEl).setName(t("code")).addText((c) => c.onChange((v) => (code = v.trim())));
      new Setting(contentEl).addButton((b) =>
        b.setCta().setButtonText(t("confirm")).onClick(async () => {
          try {
            await this.handle(await this.plugin.loginWithCode(this.account, code), say);
          } catch (e) {
            say(e.message, true);
          }
        })
      );
    } else if (this.step === "tfa") {
      contentEl.createEl("p", { text: t("tfaHint") });
      let code = "";
      new Setting(contentEl).setName(t("tfaCode")).addText((c) => c.onChange((v) => (code = v.trim())));
      new Setting(contentEl).addButton((b) =>
        b.setCta().setButtonText(t("confirm")).onClick(async () => {
          try {
            await this.handle(await this.plugin.loginWithTfa(this.tfaKey, code), say);
          } catch (e) {
            say(e.message, true);
          }
        })
      );
    }
  }

  async handle(json, say) {
    if (json.accessToken) {
      await this.plugin.storeToken(json);
      new Notice(t("loginOk"));
      this.close();
      this.plugin.sync();
      return;
    }
    if (json.loginType === "verifyCode") {
      await this.plugin.sendEmailCode(this.account);
      this.step = "code";
      this.render();
      return;
    }
    if (json.loginType === "tfa" && json.tfaKey) {
      this.tfaKey = json.tfaKey;
      this.step = "tfa";
      this.render();
      return;
    }
    say(t("loginFail", { msg: json.message || json.error || t("unknownAnswer") }), true);
  }
}

/* ------------------------------------------------------------------ */
/* add-by-link modal                                                   */
/* ------------------------------------------------------------------ */

class WelcomeModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    this.setTitle ? this.setTitle(t("welcomeTitle")) : contentEl.createEl("h3", { text: t("welcomeTitle") });
    contentEl.createEl("p", { text: t("welcomeText") });
    const s = this.plugin.settings;
    const list = contentEl.createEl("ul");
    list.createEl("li", { text: s.printsFolder });
    list.createEl("li", { text: s.spoolsFolder });
    list.createEl("li", { text: `${this.plugin.rootFolder()}/${LANG === "ru" ? "3D печать" : "3D printing"}.base` });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText(t("welcomeSkip")).onClick(() => {
        new Notice(t("welcomeLater"));
        this.close();
      }))
      .addButton((b) => b.setCta().setButtonText(t("welcomeCreate")).onClick(async () => {
        this.close();
        await this.plugin.setupTracker();
      }));
  }

  onClose() {
    this.contentEl.empty();
  }
}

class AddLinkModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    this.setTitle ? this.setTitle(t("addLinkTitle")) : contentEl.createEl("h3", { text: t("addLinkTitle") });
    contentEl.createEl("p", { text: t("addLinkHint"), cls: "setting-item-description" });
    const msg = contentEl.createEl("p");
    let url = "";
    const submit = async () => {
      const model = parseModelUrl(url);
      if (!model) {
        msg.setText(t("notModelLink"));
        msg.addClass("mod-warning");
        return;
      }
      const file = await this.plugin.addModel(model);
      if (file) this.close();
    };
    new Setting(contentEl).addText((c) => {
      c.setPlaceholder("https://makerworld.com/…").onChange((v) => (url = v.trim()));
      c.inputEl.style.width = "100%";
      c.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      window.setTimeout(() => c.inputEl.focus(), 0);
    });
    new Setting(contentEl).addButton((b) => b.setCta().setButtonText(t("add")).onClick(submit));
  }

  onClose() {
    this.contentEl.empty();
  }
}

/* ------------------------------------------------------------------ */
/* settings tab                                                        */
/* ------------------------------------------------------------------ */

class BambuSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();
    containerEl.empty();

    new Setting(containerEl).setName(t("hDevice")).setHeading();
    const isMain = this.plugin.isPrimary();
    const dev = new Setting(containerEl)
      .setName(t("primary"))
      .setDesc(isMain ? t("primaryOn") : t("primaryOff"))
      .addToggle((c) =>
        c.setValue(isMain).onChange((v) => {
          this.plugin.setPrimary(v);
          new Notice(v ? t("nowPrimary") : t("nowSecondary"));
          this.display();
        })
      );
    dev.descEl.createDiv({ text: t("primaryDesc"), cls: "setting-item-description" });

    new Setting(containerEl).setName(t("hAccount")).setHeading();
    const exp = s.tokenExpires ? new Date(s.tokenExpires) : null;
    new Setting(containerEl)
      .setName(s.token ? t("loggedIn") : t("notLoggedIn"))
      .setDesc(s.token ? t("tokenUntil", { date: exp ? `${pad(exp.getDate())}.${pad(exp.getMonth() + 1)}.${exp.getFullYear()}` : "?" }) : t("needLoginDesc"))
      .addButton((b) => b.setButtonText(s.token ? t("relogin") : t("login")).setCta().onClick(() => new LoginModal(this.app, this.plugin).open()))
      .addButton((b) =>
        b.setButtonText(t("logout")).setDisabled(!s.token).onClick(async () => {
          s.token = "";
          s.tokenExpires = 0;
          await save();
          this.display();
        })
      );

    new Setting(containerEl)
      .setName(t("manualToken"))
      .setDesc(t("manualTokenDesc"))
      .addText((c) => {
        c.setPlaceholder("eyJ…").onChange(async (v) => {
          v = v.trim();
          if (!v) return;
          s.token = v;
          s.tokenExpires = Date.now() + 7776000 * 1000;
          await save();
        });
        c.inputEl.type = "password";
      });

    new Setting(containerEl).setName(t("region")).addDropdown((d) =>
      d
        .addOption("global", t("regionGlobal"))
        .addOption("china", t("regionChina"))
        .setValue(s.region)
        .onChange(async (v) => {
          s.region = v;
          await save();
        })
    );

    new Setting(containerEl)
      .setName(t("printer"))
      .setDesc(t("printerDesc"))
      .addText((c) =>
        c.setPlaceholder(t("printerId")).setValue(s.deviceId).onChange(async (v) => {
          s.deviceId = v.trim();
          await save();
        })
      )
      .addButton((b) =>
        b.setButtonText(t("findPrinters")).onClick(async () => {
          try {
            const list = await this.plugin.fetchDevices();
            if (!list.length) return new Notice(t("noPrinters"));
            new Notice("Bambu: " + list.map((d) => `${d.name} (${d.dev_product_name || d.dev_model_name}) — ${d.dev_id}`).join("\n"), 10000);
            if (list.length === 1) {
              s.deviceId = list[0].dev_id;
              await save();
              this.display();
            }
          } catch (e) {
            new Notice(`Bambu: ${e.message}`, 8000);
          }
        })
      );

    new Setting(containerEl).setName(t("hSync")).setHeading();
    const text = (name, key, desc, parse) => {
      const row = new Setting(containerEl).setName(name);
      if (desc) row.setDesc(desc);
      row.addText((c) =>
        c.setValue(String(s[key])).onChange(async (v) => {
          s[key] = parse ? parse(v) : v.trim();
          await save();
          if (key === "intervalMin") this.plugin.restartTimer();
        })
      );
    };
    const toggle = (name, key, desc) => {
      const row = new Setting(containerEl).setName(name);
      if (desc) row.setDesc(desc);
      row.addToggle((c) =>
        c.setValue(!!s[key]).onChange(async (v) => {
          s[key] = v;
          await save();
        })
      );
    };
    text(t("printsFolder"), "printsFolder");
    text(t("spoolsFolder"), "spoolsFolder");
    text(t("since"), "importSince", t("sinceDesc"));
    text(t("limit"), "limit", null, (v) => parseInt(v, 10) || 50);
    toggle(t("onStart"), "syncOnStart");
    text(t("interval"), "intervalMin", t("intervalDesc"), (v) => Math.max(0, parseInt(v, 10) || 0));
    text(t("startDelay"), "startDelaySec", t("startDelayDesc"), (v) => Math.max(0, parseInt(v, 10) || 0));
    toggle(t("autoDeduct"), "autoDeduct", t("autoDeductDesc"));

    new Setting(containerEl).setName(t("hModels")).setHeading();
    toggle(t("pasteToQueue"), "pasteToQueue", t("pasteToQueueDesc"));
    toggle(t("pasteReplace"), "pasteReplace", t("pasteReplaceDesc"));

    new Setting(containerEl).setName(t("hCost")).setDesc(t("costDesc")).setHeading();
    const numeric = (v) => Math.max(0, num(v));
    new Setting(containerEl)
      .setName(t("printerModel"))
      .setDesc(t("printerModelDesc"))
      .addDropdown((d) => {
        for (const m of Object.keys(PRINTER_POWER)) d.addOption(m, `Bambu Lab ${m} · ~${PRINTER_POWER[m]} W`);
        d.addOption("other", t("printerOther"));
        d.setValue(PRINTER_POWER[s.printerModel] ? s.printerModel : "other").onChange(async (v) => {
          s.printerModel = v;
          if (PRINTER_POWER[v]) s.powerW = PRINTER_POWER[v];
          await save();
          this.display();
        });
      });
    text(t("powerW"), "powerW", null, numeric);
    text(t("kwhPrice"), "kwhPrice", null, numeric);
    text(t("printerPrice"), "printerPrice", null, numeric);
    text(t("lifetimeH"), "lifetimeH", t("lifetimeHDesc"), numeric);
    text(t("maintPerHour"), "maintPerHour", t("maintPerHourDesc"), numeric);
    text(t("currency"), "currency");
    const rate = (num(s.powerW) * num(s.kwhPrice)) / 1000 + (num(s.lifetimeH) > 0 ? num(s.printerPrice) / num(s.lifetimeH) : 0) + num(s.maintPerHour);
    new Setting(containerEl)
      .setName(t("machineRate", { v: `${round2(rate)} ${s.currency || ""}`.trim() }))
      .addButton((b) => b.setButtonText(t("recalc")).onClick(() => this.plugin.recalcAll(true)));

    new Setting(containerEl).setName(t("hStatuses")).setDesc(t("statusesDesc")).setHeading();
    text(t("stPlanned"), "statusPlanned");
    text(t("stPrinting"), "statusPrinting");
    text(t("stDone"), "statusDone");
    text(t("stFailed"), "statusFailed");
    text(t("stSpoolOpen"), "spoolOpen");
    text(t("stSpoolEmpty"), "spoolEmpty");

    new Setting(containerEl).addButton((b) => b.setCta().setButtonText(t("syncNow")).onClick(() => this.plugin.sync()));

    new Setting(containerEl)
      .setName(t("support"))
      .setDesc(t("supportDesc"))
      .addButton((b) => b.setButtonText(t("supportBtn")).onClick(() => window.open(SUPPORT_URL)));
  }
}

module.exports = BambuPrintSync;
module.exports._test = { taskToRecord, matchSpool, parseUsage, normalizeName, cleanTitle, linkTarget, safeFileName, buildBase, parseModelUrl, computeCost, PRINTER_POWER, LOCALE_DEFAULTS };
