/*
 * Bambu Print Sync — an Obsidian plugin.
 *
 * Pulls print history from the Bambu Lab cloud into notes, links it to the
 * prints you planned, links spools and works out what each print cost.
 *
 * Plain JavaScript, no build step: this file is what Obsidian loads.
 * Not affiliated with or endorsed by Bambu Lab.
 */
"use strict";

const obsidian = require("obsidian");
const { Plugin, PluginSettingTab, Setting, Modal, Notice, requestUrl, TFile, normalizePath, moment, Platform, setIcon } = obsidian;

const SUPPORT_URL = "https://boosty.to/grispy/donate";
const PRIMARY_KEY = "bambu-print-sync-primary";
const DEVICE_ID_KEY = "bambu-print-sync-device-id";
const DEVICE_NAME_KEY = "bambu-print-sync-device-name";
const WARNED_KEY = "bambu-print-sync-warned";
const STALE_MS = 2 * 24 * 3600 * 1000; // main device silent this long → warn
const RECENT_MS = 24 * 3600 * 1000; // another main synced this recently → ask before taking over

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
    cmdLogin: "Log in to Bambu account",
    cmdNewPrint: "New print note",
    cmdNewSpool: "New spool note",
    cmdAttachSpools: "Link spools to prints without one",
    attached: "spools linked: {n}",
    whyNoFilament: "the Bambu cloud sent no filament for this print (external spool?): choose the spool by hand",
    whyNoMaterial: "no spool of {f}: add one with “New spool”",
    whyNoColor: "{f} — no spool of this colour; there are: {list}",
    whyLater: "will be linked on the next sync",
    attachDone: "spools linked to prints: {n}",
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
    nothingNew: "nothing new",
    spoolMissing: "{note}: spool “{spool}” not found",
    imported: "Imported from the Bambu cloud.",
    spoolTitle: "New spool",
    spoolFromPrints: "Colours from your prints",
    spoolFromPrintsHint: "Materials and colours the Bambu cloud reported for your prints. Pick one, or choose another colour below.",
    spoolNoColors: "No colours yet: they appear after the first prints are imported.",
    spoolOwned: "spool exists",
    spoolAttached: "and set on prints without a spool: {n}",
    spoolUsed: "{g} g in {n} prints",
    spoolOther: "Another colour",
    spoolMaterial: "Material",
    spoolColor: "Colour",
    spoolColorName: "Colour name",
    spoolBrand: "Brand",
    spoolWeight: "Spool weight, g",
    spoolPrice: "Price",
    spoolCreate: "Create spool",
    spoolCreated: "Bambu: spool “{name}” created",
    pickSpool: "Spool (optional)",
    pickSpoolNone: "No open spools yet. Add one with “New spool”.",
    cmdPickSpool: "Choose the spool for this print",
    pickSpoolTitle: "Spool for this print",
    spoolSet: "Bambu: spool “{name}” set",
    notAPrint: "Bambu: open a print note first.",
    btnNewSpool: "New spool",
    statsTotal: "Spent on printing",
    statsMonth: "This month",
    statsPrev: "Last month",
    statsFailed: "Lost to failures",
    statsPrints: "{n} prints · {kg} kg · {h} h",
    statsFailedSub: "{n} failed prints",
    statsNoPrices: "Cost is not counted yet: set the electricity price, printer price or spool prices in the plugin settings.",
    devicesFolder: "Devices",
    deviceNote: "Bambu Print Sync service note: which device imports prints. Each device updates only its own note; do not edit by hand.",
    deviceName: "Name of this device",
    deviceNameDesc: "Shown to your other devices, e.g. in “The main device is now …”.",
    mainIs: "The main device is now: {name} · last sync {when}",
    mainIsThis: "The main device is this one · last sync {when}",
    mainNone: "No device is the main one: prints are not imported.",
    never: "never",
    takeoverTitle: "Make this device the main one?",
    takeoverText: "“{name}” is the main device now (last sync {when}). Only one device should import prints. If you continue, “{name}” stops being the main device the next time it opens Obsidian.",
    takeoverYes: "Make this the main device",
    cancel: "Cancel",
    yielded: "Bambu: “{name}” became the main device, so this device is now secondary.",
    warnNoMain: "Bambu: prints are not being imported: no device is the main one.",
    warnStale: "Bambu: the main device “{name}” has not synced since {when}. Open Obsidian there, or make this device the main one.",
    warnNoLogin: "Bambu: this is the main device, but you are not logged in to Bambu Lab, so prints are not imported.",
    makeMainBtn: "Make this the main device",
    openSettingsBtn: "Open settings",
    imagesFolder: "Images",
    images: "Model images",
    imagesDesc: "Save a picture of each model next to the notes: from the model page when you add a link, and the plate preview from the Bambu cloud after printing. Shown on the queue cards.",
    covers: "images: {n}",
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
    filterWarn: "Bambu: only “{name}” is synced, but the account has {n} printers. Clear “Printer” in the settings to sync them all.",
    hPrinters: "Printers",
    printersDesc: "Model (sets the power), price and lifetime in hours for each printer. Empty fields use the values above.",
    printerRate: "Machine cost per hour: {v}",
    printerSame: "As above",
    printerPriceShort: "Price",
    lifetimeShort: "Hours",
    spoolPrinter: "Printer",
    spoolPrinterAny: "Any printer",
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
    btnAddModel: "Add model",
    btnSync: "Refresh",
    btnNewPrint: "Empty card",
    cmdDashboard: "Create print dashboard (buttons + tracker)",
    dashboardName: "Print dashboard",
    dashboardCreated: "Bambu: created {path}",
    unknownBlock: "Bambu: unknown button block",
    addLinkHint: "Paste a link to a model on MakerWorld, Printables, Thingiverse or Cults3D.",
    add: "Add",
    queued: "Bambu: “{title}” added to the queue",
    alreadyQueued: "Bambu: “{title}” is already in the queue",
    notModelLink: "This does not look like a model link.",
    hModels: "Model links",
    pasteToQueue: "Queue models from pasted links",
    pasteToQueueDesc: "When you paste a MakerWorld, Printables, Thingiverse or Cults3D model link into any note, a planned print is created. Off by default: use the “Add model” button above the queue instead.",
    pasteReplace: "Replace the pasted link with a link to the print note",
    pasteReplaceDesc: "Off: the URL stays as pasted and the card is created in the background.",
    openModel: "Open the model",
    plateWord: "plate",
    notPrimary: "Bambu: cloud sync is off on this device. Turn on “Main device” at the top of the plugin settings.",
    hDevice: "Main device",
    primary: "Main device: this one",
    primaryOn: "✅ This device is the main one: it imports prints from the cloud and writes costs.",
    primaryOff: "⏸ This device is secondary: it only shows notes that arrive from the main device.",
    cmdPrimary: "Make this device the main one (on/off)",
    nowPrimary: "Bambu: this device is now the main one.",
    nowSecondary: "Bambu: this device is now secondary.",
    primaryDesc: "One device imports from the Bambu cloud and writes costs. Turning this on while another device is the main one asks first, and the other device then steps down by itself. Stored on this device only.",
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
    defaultPriceKg: "Filament price per kg",
    defaultPriceKgDesc: "Used when a print has no spool or its spool has no price. 0: such filament costs nothing.",
    spoolPriceDesc: "For the whole spool, in {cur}. Empty: the filament price from the settings.",
    spoolNoPrice: "no price: the filament price from the settings is used",
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
    cmdLogin: "Войти в аккаунт Bambu",
    cmdNewPrint: "Новая печать",
    cmdNewSpool: "Новая катушка",
    cmdAttachSpools: "Привязать катушки к печатям без катушки",
    attached: "привязано катушек: {n}",
    whyNoFilament: "облако Bambu не прислало пластик для этой печати (внешняя катушка?): выбери катушку вручную",
    whyNoMaterial: "нет катушки {f}: добавь её через «Новая катушка»",
    whyNoColor: "{f} — нет катушки этого цвета; есть: {list}",
    whyLater: "привяжется при следующей синхронизации",
    attachDone: "катушки привязаны к печатям: {n}",
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
    nothingNew: "нового нет",
    spoolMissing: "{note}: не найдена катушка «{spool}»",
    imported: "Импортировано из облака Bambu.",
    spoolTitle: "Новая катушка",
    spoolFromPrints: "Цвета из твоих печатей",
    spoolFromPrintsHint: "Материалы и цвета, которые облако Bambu сообщило для твоих печатей. Выбери один или другой цвет ниже.",
    spoolNoColors: "Цветов пока нет: они появятся после импорта первых печатей.",
    spoolOwned: "катушка есть",
    spoolAttached: "и привязана к печатям без катушки: {n}",
    spoolUsed: "{g} г в {n} печ.",
    spoolOther: "Другой цвет",
    spoolMaterial: "Материал",
    spoolColor: "Цвет",
    spoolColorName: "Название цвета",
    spoolBrand: "Бренд",
    spoolWeight: "Вес катушки, г",
    spoolPrice: "Цена",
    spoolCreate: "Создать катушку",
    spoolCreated: "Bambu: катушка «{name}» создана",
    pickSpool: "Катушка (необязательно)",
    pickSpoolNone: "Открытых катушек пока нет. Добавь кнопкой «Новая катушка».",
    cmdPickSpool: "Выбрать катушку для этой печати",
    pickSpoolTitle: "Катушка для этой печати",
    spoolSet: "Bambu: катушка «{name}» выбрана",
    notAPrint: "Bambu: сначала открой заметку печати.",
    btnNewSpool: "Новая катушка",
    statsTotal: "Потрачено на печать",
    statsMonth: "В этом месяце",
    statsPrev: "В прошлом месяце",
    statsFailed: "Ушло на провалы",
    statsPrints: "{n} печатей · {kg} кг · {h} ч",
    statsFailedSub: "провалов: {n}",
    statsNoPrices: "Стоимость пока не считается: укажи цену электричества, принтера или катушек в настройках плагина.",
    devicesFolder: "Устройства",
    deviceNote: "Служебная заметка Bambu Print Sync: какое устройство импортирует печати. Каждое устройство обновляет только свою заметку, руками не правь.",
    deviceName: "Название этого устройства",
    deviceNameDesc: "Видно на других устройствах, например в «Основное сейчас: …».",
    mainIs: "Основное сейчас: {name} · синхронизация {when}",
    mainIsThis: "Основное — это устройство · синхронизация {when}",
    mainNone: "Основного устройства нет: печати не импортируются.",
    never: "ещё не было",
    takeoverTitle: "Сделать это устройство основным?",
    takeoverText: "Сейчас основное — «{name}» (синхронизация {when}). Импортировать печати должно одно устройство. Если продолжить, «{name}» перестанет быть основным, когда в следующий раз откроет Obsidian.",
    takeoverYes: "Сделать основным",
    cancel: "Отмена",
    yielded: "Bambu: основным стало «{name}», это устройство теперь не основное.",
    warnNoMain: "Bambu: печати не импортируются: основного устройства нет.",
    warnStale: "Bambu: основное устройство «{name}» не синхронизировалось с {when}. Открой Obsidian на нём или сделай основным это устройство.",
    warnNoLogin: "Bambu: это основное устройство, но вход в Bambu Lab не выполнен, поэтому печати не импортируются.",
    makeMainBtn: "Сделать основным",
    openSettingsBtn: "Открыть настройки",
    imagesFolder: "Картинки",
    images: "Картинки моделей",
    imagesDesc: "Сохранять картинку каждой модели рядом с заметками: со страницы модели при добавлении ссылки и превью пластины из облака Bambu после печати. Показываются на карточках очереди.",
    covers: "картинок: {n}",
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
    filterWarn: "Bambu: синхронизируется только «{name}», а в аккаунте принтеров: {n}. Очисти поле «Принтер» в настройках, чтобы получать все.",
    hPrinters: "Принтеры",
    printersDesc: "Модель (задаёт мощность), цена и ресурс в часах для каждого принтера. Пустые поля берутся из общих значений выше.",
    printerRate: "Стоимость часа: {v}",
    printerSame: "Как выше",
    printerPriceShort: "Цена",
    lifetimeShort: "Часы",
    spoolPrinter: "Принтер",
    spoolPrinterAny: "Любой принтер",
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
    btnAddModel: "Добавить модель",
    btnSync: "Обновить",
    btnNewPrint: "Пустая карточка",
    cmdDashboard: "Создать панель печати (кнопки + таблица)",
    dashboardName: "Панель печати",
    dashboardCreated: "Bambu: создана {path}",
    unknownBlock: "Bambu: неизвестный блок кнопок",
    addLinkHint: "Вставь ссылку на модель с MakerWorld, Printables, Thingiverse или Cults3D.",
    add: "Добавить",
    queued: "Bambu: «{title}» добавлена в очередь",
    alreadyQueued: "Bambu: «{title}» уже в очереди",
    notModelLink: "Это не похоже на ссылку на модель.",
    hModels: "Ссылки на модели",
    pasteToQueue: "Ставить в очередь по вставленной ссылке",
    pasteToQueueDesc: "Когда вставляешь в любую заметку ссылку на модель с MakerWorld, Printables, Thingiverse или Cults3D, создаётся запланированная печать. По умолчанию выключено: удобнее кнопка «Добавить модель» над очередью.",
    pasteReplace: "Заменять вставленную ссылку ссылкой на заметку печати",
    pasteReplaceDesc: "Выключено: ссылка остаётся как есть, карточка создаётся в фоне.",
    openModel: "Открыть модель",
    plateWord: "пластина",
    notPrimary: "Bambu: на этом устройстве синхронизация с облаком выключена. Включи «Основное устройство» вверху настроек плагина.",
    hDevice: "Основное устройство",
    primary: "Основное устройство — это",
    primaryOn: "✅ Это устройство основное: импортирует печати из облака и считает стоимость.",
    primaryOff: "⏸ Это устройство не основное: только показывает заметки, которые приходят с основного.",
    cmdPrimary: "Сделать это устройство основным (вкл/выкл)",
    nowPrimary: "Bambu: это устройство теперь основное.",
    nowSecondary: "Bambu: это устройство теперь не основное.",
    primaryDesc: "Импорт из облака Bambu и расчёт стоимости делает одно устройство. Если включить это здесь, пока основным работает другое, плагин сначала спросит, а другое устройство само станет неосновным. Хранится только на этом устройстве.",
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
    defaultPriceKg: "Цена пластика за кг",
    defaultPriceKgDesc: "Берётся, если у печати нет катушки или у катушки нет цены. 0 — такой пластик ничего не стоит.",
    spoolPriceDesc: "За всю катушку, {cur}. Пусто — цена пластика из настроек.",
    spoolNoPrice: "без цены: берётся цена пластика из настроек",
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
    pasteToQueue: false,
    pasteReplace: false,
    images: true,
    printerModel: "P1S",
    powerW: 120,
    kwhPrice: 0,
    defaultPriceKg: 0,
    printerPrice: 0,
    lifetimeH: 4000,
    maintPerHour: 0,
    onboarded: false,
    startDelaySec: 30,
    lastSync: 0,
    // Per printer (by its name in the cloud): { model, id, price, lifetimeH }. Empty fields use the values above.
    printers: {},
    filterWarned: false,
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
  // "1 990 ₽", "1990,5" and 1990 all read as numbers.
  const n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
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
  // A spool without a price, a colour without a spool, or no spool at all: the default price per kg.
  const fallback = num(st.defaultPriceKg);
  const priced = (link) => spoolPrice(link) || fallback;
  if (override) filament = (grams * override) / 1000;
  else if (parts.length) {
    const covered = parts.reduce((sum, p) => sum + p.grams, 0);
    filament = parts.reduce((sum, p) => sum + (p.grams * priced(p.link)) / 1000, 0);
    filament += (Math.max(0, grams - covered) * fallback) / 1000;
  } else if (fm.spool) filament = (grams * priced(linkTarget(fm.spool))) / 1000;
  else filament = (grams * fallback) / 1000;

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
  // A failed job never gets the estimate: it only ran as long as it ran (0 if it never started).
  const seconds = state === "printing" ? est : state === "failed" ? ran : ran || est;

  // For a failed job the cloud reports the full sliced weight: scale it by how far the job got.
  // Without a runtime it never really started (0 g); without a slicer estimate the full weight
  // is only an upper bound. Either way the grams are marked as estimated.
  let share = 1;
  let estimated = false;
  if (state === "failed") {
    estimated = true;
    if (ran <= 0) share = 0;
    else if (est > 0) share = Math.min(1, ran / est);
  }

  const round1 = (x) => Math.round(x * 10) / 10;
  const filaments = (Array.isArray(task.amsDetailMapping) ? task.amsDetailMapping : [])
    .map((m) => ({
      // target* is the AMS slot the job really used; source* is the colour in the model file.
      type: String(m.targetFilamentType || m.filamentType || "").trim(),
      color: hex6(m.targetColor || m.sourceColor),
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
    cover: /^https?:\/\//.test(String(task.cover || "")) ? String(task.cover) : "",
    device: task.deviceName || task.deviceId || "",
    filaments,
  };
}

/** Pick the spool for one filament: same material, same colour where spools have one; must be unambiguous. */
function matchSpool(filament, spools, st, printer) {
  st = st || LOCALE_DEFAULTS.en;
  const first = (s) => s.toLowerCase().split(/\s+/)[0];
  const type = String(filament.type || "").toLowerCase();
  // A spool tied to one printer is only used for prints on that printer.
  const usable = spools.filter((s) => s.status !== st.spoolEmpty && !(s.printer && printer && s.printer !== printer));
  const byType = usable.filter((s) => s.material && type && first(s.material) === first(type));
  const byColor = byType.filter((s) => s.colorHex && s.colorHex === filament.color);
  // Several fitting spools: open ones first, then by name.
  const pick = (all) => {
    // Spools tied to this printer come before spools that fit any printer.
    const here = printer ? all.filter((s) => s.printer === printer) : [];
    const list = here.length ? here : all;
    if (list.length <= 1) return list[0] || null;
    const open = list.filter((s) => s.status === st.spoolOpen);
    const pool = open.length ? open : list;
    return pool.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))[0];
  };
  if (byColor.length) return pick(byColor);
  // A colour picked by hand is rarely the exact AMS value: accept the nearest close colour.
  const near = byType
    .filter((s) => s.colorHex)
    .map((s) => ({ s, d: colorDistance(s.colorHex, filament.color) }))
    .filter((x) => x.d <= COLOR_CLOSE);
  if (near.length) {
    const best = Math.min(...near.map((x) => x.d));
    return pick(near.filter((x) => x.d <= best + 2).map((x) => x.s));
  }
  // Fall back to material only, among spools that have no colour set.
  return pick(byType.filter((s) => !s.colorHex));
}

/** Why no spool fits a print: a short reason for the user, or "" when one does. */
function whyNoSpool(filaments, spools, st, printer) {
  st = st || LOCALE_DEFAULTS.en;
  const list = filaments.filter((f) => f.grams > 0);
  if (!list.length) return t("whyNoFilament");
  const first = (s) => String(s || "").toLowerCase().split(/\s+/)[0];
  const out = [];
  for (const f of list) {
    if (matchSpool(f, spools, st, printer)) continue;
    const label = `${f.type || "?"} ${colorName(f.color, LANG) || "#" + f.color}`;
    const usable = spools.filter((s) => s.status !== st.spoolEmpty && !(s.printer && printer && s.printer !== printer));
    const sameType = usable.filter((s) => first(s.material) === first(f.type));
    if (!sameType.length) out.push(t("whyNoMaterial", { f: label }));
    else {
      const names = sameType.map((s) => `${s.name} (${colorName(s.colorHex, LANG) || "—"})`).slice(0, 3).join(", ");
      out.push(t("whyNoColor", { f: label, list: names }));
    }
  }
  return out.join("; ");
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

function filamentLines(rec) {
  return rec.filaments.map((f) => `${f.type || "?"} #${f.color || "??????"} — ${f.grams} g`);
}

/** Filament lines stored on a print ("PETG #000000 — 4.8 g") back to { type, color, grams }. */
function parseFilaments(list) {
  const out = [];
  for (const line of [].concat(list || [])) {
    const m = String(line).match(/^(.*?)\s*#([0-9A-Fa-f]{6})\s*—\s*([\d.,]+)\s*g/);
    if (m) out.push({ type: m[1].trim(), color: m[2].toUpperCase(), grams: parseFloat(m[3].replace(",", ".")) || 0 });
  }
  return out;
}

/** Grams per matched spool for a print's filaments, most used first. */
function spoolUsage(filaments, spools, st, printer) {
  const usage = [];
  for (const f of filaments) {
    const s = matchSpool(f, spools, st, printer);
    if (!s || !(f.grams > 0)) continue;
    const existing = usage.find((u) => u.spool === s);
    if (existing) existing.grams += f.grams;
    else usage.push({ spool: s, grams: f.grams });
  }
  return usage.sort((a, b) => b.grams - a.grams);
}

/**
 * What the plugin should write about spools on a print, or null to leave it alone.
 * A spool the user chose (spool differs from spool_auto) is never touched; an automatic one
 * is worked out again on every sync, so spools added later
 * and every colour of a multi-colour print get picked up.
 * `late`: the print ended before it got this spool; the link is then kept as it is.
 * (spool_deducted is a legacy flag from when spools tracked what was left: it freezes the link.)
 */
function autoSpools(fm, spools, st, late) {
  if (fm.spool_deducted && !fm.spool_late) return null;
  const current = String(fm.spool || "").trim();
  const auto = String(fm.spool_auto || "").trim();
  if (current && current !== auto) return null;
  if (!current && Array.isArray(fm.usage) && fm.usage.length && !auto) return null;
  const usage = spoolUsage(parseFilaments(fm.filaments), spools, st, String(fm.printer || ""));
  const round = (g) => Math.round(g * 10) / 10;
  const next = usage.length
    ? {
        spool: `[[${usage[0].spool.name}]]`,
        usage: usage.map((u) => `[[${u.spool.name}]]: ${round(u.grams)}`),
        spool_auto: `[[${usage[0].spool.name}]]`,
        spool_late: late || fm.spool_late ? true : undefined,
        spool_deducted: late || fm.spool_late ? true : fm.spool_deducted,
      }
    : {
        spool: auto ? "" : fm.spool,
        usage: auto ? undefined : fm.usage,
        spool_auto: undefined,
        spool_late: undefined,
        spool_deducted: fm.spool_late ? undefined : fm.spool_deducted,
      };
  const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  if (Object.keys(next).every((k) => same(fm[k], next[k]))) return null;
  return next;
}

/** Apply a patch from autoSpools to front matter; undefined removes a key. */
function applyPatch(fm, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete fm[k];
    else fm[k] = v;
  }
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

/** Material + colour pairs seen in imported prints ("PETG #000000 — 4.8 g"), most used first. */
function cloudColors(prints) {
  const map = new Map();
  for (const fm of prints) {
    if (!fm || fm.type !== "print") continue;
    for (const line of [].concat(fm.filaments || [])) {
      const m = String(line).match(/^(.*?)\s*#([0-9A-Fa-f]{6})\s*—\s*([\d.,]+)\s*g/);
      if (!m) continue;
      const material = m[1].trim() || "?";
      const hex = m[2].toUpperCase();
      const key = `${material}|${hex}`;
      const e = map.get(key) || { material, hex, grams: 0, prints: 0 };
      e.grams += num(m[3]);
      e.prints++;
      map.set(key, e);
    }
  }
  return [...map.values()]
    .map((e) => Object.assign(e, { grams: Math.round(e.grams) }))
    .sort((a, b) => b.grams - a.grams || b.prints - a.prints);
}

/** Common filament materials for the spool window; materials from the cloud are added to these. */
const MATERIALS = ["PLA", "PLA Matte", "PLA Silk", "PLA-CF", "PETG", "PETG HF", "PETG-CF", "ABS", "ASA", "TPU", "PA", "PA-CF", "PC", "PVA", "HIPS"];

const COLOR_NAMES = [
  ["000000", "Black", "Чёрный"], ["FFFFFF", "White", "Белый"], ["808080", "Grey", "Серый"],
  ["C0C0C0", "Light grey", "Светло-серый"], ["4D4D4D", "Dark grey", "Тёмно-серый"],
  ["E53935", "Red", "Красный"], ["8B0000", "Dark red", "Тёмно-красный"], ["FF8C00", "Orange", "Оранжевый"],
  ["FFD600", "Yellow", "Жёлтый"], ["43A047", "Green", "Зелёный"], ["68724D", "Olive", "Оливковый"],
  ["1E88E5", "Blue", "Синий"], ["0D2B6B", "Navy", "Тёмно-синий"], ["4FC3F7", "Light blue", "Голубой"],
  ["8E24AA", "Purple", "Фиолетовый"], ["F48FB1", "Pink", "Розовый"], ["795548", "Brown", "Коричневый"],
  ["E8D5B0", "Beige", "Бежевый"], ["D2B48C", "Sand", "Песочный"], ["C8A2A0", "Dusty pink", "Пудровый"],
  ["F3EBD8", "Cream", "Кремовый"], ["B0B0B0", "Silver", "Серебристый"], ["D4AF37", "Gold", "Золотой"],
];

/** How far apart two colours look (CIE76 ΔE in Lab); Infinity if either is not a colour. */
function colorDistance(a, b) {
  const lab = (hex) => {
    const h = hex6(hex);
    if (!/^[0-9A-F]{6}$/.test(h)) return null;
    const lin = [0, 2, 4].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
    });
    const [r, g, bl] = lin;
    const f = (x) => (x > 0.008856 ? Math.cbrt(x) : 7.787 * x + 16 / 116);
    const x = f((r * 0.4124 + g * 0.3576 + bl * 0.1805) / 0.95047);
    const y = f(r * 0.2126 + g * 0.7152 + bl * 0.0722);
    const z = f((r * 0.0193 + g * 0.1192 + bl * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const A = lab(a);
  const B = lab(b);
  return A && B ? Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) : Infinity;
}

/** Colours this close count as the same filament: two reds or a white and a cream match; red and orange do not. */
const COLOR_CLOSE = 25;

/** Nearest plain colour name for a hex value. */
function colorName(hex, lang) {
  const h = hex6(hex);
  if (!/^[0-9A-F]{6}$/.test(h)) return "";
  const rgb = (x) => [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  const [r, g, b] = rgb(h);
  let best = null;
  let bestD = Infinity;
  for (const c of COLOR_NAMES) {
    const [R, G, B] = rgb(c[0]);
    // Weighted RGB distance: close enough to how people name colours.
    let d = 2 * (r - R) ** 2 + 4 * (g - G) ** 2 + 3 * (b - B) ** 2;
    // A visibly tinted colour is not grey or silver, however close its brightness.
    if (Math.max(r, g, b) - Math.min(r, g, b) > 30 && Math.max(R, G, B) - Math.min(R, G, B) < 10) d += 20000;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return lang === "ru" ? best[2] : best[1];
}

/**
 * Spending summary over finished and failed prints.
 * prints: frontmatter objects; now: Date. Months come from `printed` (YYYY-MM-DD), else `created`.
 */
function printStats(prints, st, now) {
  st = st || LOCALE_DEFAULTS.en;
  now = now || new Date();
  const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const thisMonth = ym(now);
  const prevMonth = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const blank = () => ({ cost: 0, grams: 0, hours: 0, count: 0 });
  const out = { total: blank(), month: blank(), prev: blank(), failed: blank(), priced: 0 };
  for (const fm of prints) {
    if (!fm || fm.type !== "print") continue;
    const done = fm.status === st.statusDone;
    const failed = fm.status === st.statusFailed;
    if (!done && !failed) continue;
    const cost = num(fm.cost);
    if (cost > 0) out.priced++;
    const add = (b) => {
      b.cost += cost;
      b.grams += num(fm.grams);
      b.hours += num(fm.time_h) + num(fm.time_m) / 60;
      b.count++;
    };
    add(out.total);
    if (failed) add(out.failed);
    const when = String(fm.printed || fm.created || "").slice(0, 7);
    if (when === thisMonth) add(out.month);
    if (when === prevMonth) add(out.prev);
  }
  for (const b of [out.total, out.month, out.prev, out.failed]) {
    b.cost = round2(b.cost);
    b.grams = Math.round(b.grams);
    b.hours = Math.round(b.hours * 10) / 10;
  }
  return out;
}

/** 1234.5 → "1 234,50 ₽" in Russian, "$1,234.50"-style digits otherwise. */
function money(x, st) {
  const cur = (st && st.currency) || "";
  const n = Number(x || 0).toLocaleString(LANG === "ru" ? "ru-RU" : "en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return cur ? `${n} ${cur}` : n;
}

/**
 * Which device is the main one, from the per-device notes.
 * devices: [{ id, name, main, since, lastSync }] (times in ms). The latest claim wins.
 */
function mainDevice(devices) {
  const mains = devices.filter((d) => d.main);
  mains.sort((a, b) => (b.since || 0) - (a.since || 0));
  return mains[0] || null;
}

/** Should this device stop being the main one? True when another device claimed it later. */
function shouldYield(devices, myId) {
  const me = devices.find((d) => d.id === myId);
  const winner = mainDevice(devices);
  return !!(winner && winner.id !== myId && (!me || !me.main || (winner.since || 0) > (me.since || 0)));
}

/** The preview picture a page advertises for link previews (og:image / twitter:image). */
function pageImage(html, pageUrl) {
  html = String(html || "");
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  for (const key of ["og:image", "og:image:url", "twitter:image"]) {
    for (const tag of metas) {
      const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i);
      if (!name || name[1].toLowerCase() !== key) continue;
      const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i);
      if (!content) continue;
      const raw = content[1].replace(/&amp;/g, "&").trim();
      try {
        const abs = new URL(raw, pageUrl).toString();
        if (/^https?:/.test(abs)) return abs;
      } catch (e) {
        /* bad URL */
      }
    }
  }
  return "";
}

/**
 * Weight and print time a MakerWorld page states for a print profile, or null.
 * The page carries its data as JSON (__NEXT_DATA__); a profile there has `weight` (g) and
 * `prediction` (s). The profile from the link (#profileId-…) wins, else the first one.
 */
function modelEstimate(html, profileId) {
  html = String(html || "");
  const pick = (list) => {
    const want = String(profileId || "");
    const hit = want && list.find((p) => String(p.profileId) === want || String(p.id) === want);
    return hit || list.find((p) => p.isDefault) || list[0];
  };
  const usable = (o) => o && typeof o === "object" && num(o.weight) > 0 && num(o.prediction) > 0;
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  let found = [];
  if (m) {
    try {
      const seen = new Set();
      const walk = (v, depth) => {
        if (!v || typeof v !== "object" || depth > 12 || seen.has(v)) return;
        seen.add(v);
        if (Array.isArray(v)) {
          const list = v.filter(usable);
          if (list.length && list.length === v.length && !found.length) found = list;
          v.forEach((x) => walk(x, depth + 1));
        } else Object.keys(v).forEach((k) => walk(v[k], depth + 1));
      };
      walk(JSON.parse(m[1]), 0);
    } catch (e) {
      found = [];
    }
  }
  if (!found.length) {
    // No JSON block: the first object that states both.
    const re = /\{[^{}]*?"(?:prediction|weight)"\s*:\s*[\d.]+[^{}]*?\}/g;
    let r;
    while ((r = re.exec(html))) {
      const w = r[0].match(/"weight"\s*:\s*([\d.]+)/);
      const p = r[0].match(/"prediction"\s*:\s*(\d+)/);
      const id = r[0].match(/"profileId"\s*:\s*"?(\d+)/);
      const o = w && p && { weight: w[1], prediction: p[1], profileId: id ? id[1] : "" };
      if (usable(o)) found.push(o);
    }
  }
  if (!found.length) return null;
  const p = pick(found);
  const minutes = Math.round(num(p.prediction) / 60);
  return { grams: Math.round(num(p.weight) * 10) / 10, time_h: Math.floor(minutes / 60), time_m: minutes % 60 };
}

/** Image type from the first bytes (servers often say "binary/octet-stream"). */
function sniffImage(buf) {
  const b = new Uint8Array(buf || new ArrayBuffer(0)).subarray(0, 12);
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "gif";
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") return "webp";
  return "";
}

/** Model name from a page's og:title / <title>, without the site suffix. */
function pageTitle(html) {
  html = String(html || "");
  let raw = "";
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i);
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    if (name && content && name[1].toLowerCase() === "og:title") {
      raw = content[1];
      break;
    }
  }
  if (!raw) {
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    raw = m ? m[1] : "";
  }
  raw = raw.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  // Drop trailing " - Free 3D Print Model - MakerWorld"-style parts.
  const parts = raw.split(/\s+[|–—-]\s+/);
  while (parts.length > 1 && /makerworld|printables|thingiverse|cults|free|download|\b3d\b|\bstl\b|\bmodel/i.test(parts[parts.length - 1])) parts.pop();
  raw = parts.join(" - ").replace(/\s+/g, " ").trim();
  return raw.length > 120 ? raw.slice(0, 120).trim() : raw;
}

/** File extension for a downloaded image. */
function imageExt(contentType, url) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  const m = String(url || "").split(/[?#]/)[0].match(/\.(png|jpe?g|webp|gif)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

/** Recognise a model page link. Returns null for anything else. */
function parseModelUrl(text) {
  // Phone keyboards may capitalise the scheme ("Https://…").
  const url = String(text || "").trim().replace(/^https?:/i, (m) => m.toLowerCase());
  if (!url || /\s/.test(url)) return null;
  for (const { site, re } of MODEL_SITES) {
    const m = url.match(re);
    if (!m) continue;
    const isCults = site === "Cults3D";
    const id = m[1];
    const slugTitle = slugToTitle(isCults ? m[1] : m[2]);
    const title = slugTitle || `${site} ${id}`;
    const profile = url.match(/#profileId-(\d+)/i);
    return { site, id, title, url, profileId: profile ? profile[1] : "", titleFromUrl: !!slugTitle };
  }
  return null;
}

/** The Bases file for the tracker. */
function buildBase(root, st, lang) {
  const L = lang === "ru"
    ? { queue: "Очередь", all: "Все печати", month: "По месяцам", failed: "Провалы", spools: "Катушки",
        status: "Статус", spool: "Катушка", grams: "Граммы", printed: "Дата печати", hours: "Часы", time: "Время",
        cost: "Стоимость", priceKg: "Цена за кг", monthCol: "Месяц", usage: "Расход", material: "Материал",
        color: "Цвет", brand: "Бренд", spoolStatus: "Состояние",
        noDate: "без даты", h: "ч ", m: "м", g: " г", model: "Модель", digits: 0,
        costView: "Стоимость", fil: "Пластик", power: "Электричество", wear: "Износ" }
    : { queue: "Queue", all: "All prints", month: "By month", failed: "Failed", spools: "Spools",
        status: "Status", spool: "Spool", grams: "Grams", printed: "Printed", hours: "Hours", time: "Time",
        cost: "Cost", priceKg: "Price per kg", monthCol: "Month", usage: "Usage", material: "Material",
        color: "Colour", brand: "Brand", spoolStatus: "State",
        noDate: "no date", h: "h ", m: "m", g: " g", model: "Model", digits: 2,
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
  card: if(estimate, "≈ ", "") + if(grams, grams + ${q(L.g)}, "") + if(formula.time, "  ·  ⏱ " + formula.time, "") + if(formula.cost, "  ·  " + formula.cost + ${q(cur)}, "")
  spool_price_kg: if(price && weight_g, (price / weight_g * 1000).round(0), "")
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
  note.spool_status:
    displayName: ${q(L.spoolStatus)}
  formula.spool_price_kg:
    displayName: ${q(L.priceKg)}
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
    image: note.cover
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
      - formula.spool_price_kg
    sort:
      - property: file.name
        direction: ASC
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
    // A failed onload leaves Obsidian without a loaded instance to unload, so its status bar item
    // and handlers would stay behind (one more "Bambu: …" per reinstall/reload). Keep the instance
    // loaded and report the error instead.
    try {
      await this.init();
    } catch (e) {
      console.error("[bambu-print-sync] load", e);
      new Notice(`Bambu Print Sync: ${(e && e.message) || e}`, 15000);
    }
  }

  async init() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.syncing = false;

    this.statusEl = this.addStatusBarItem();
    // Drop items left by an earlier instance that never unloaded.
    const bar = this.statusEl.parentElement;
    if (bar && bar.querySelectorAll) bar.querySelectorAll(".bambu-print-sync-status").forEach((el) => el.remove());
    if (this.statusEl.addClass) this.statusEl.addClass("bambu-print-sync-status");
    this.updateStatusBar();

    this.addRibbonIcon("printer", t("ribbon"), () => this.sync());
    this.addRibbonIcon("list-plus", t("addLinkTitle"), () => new AddLinkModal(this.app, this).open());
    // ```bambu-print-sync``` block: buttons placed above an embedded base.
    this.registerMarkdownCodeBlockProcessor("bambu-print-sync", (src, el) => this.renderButtons(el));
    this.addCommand({ id: "sync", name: t("cmdSync"), callback: () => this.sync() });
    this.addCommand({ id: "login", name: t("cmdLogin"), callback: () => new LoginModal(this.app, this).open() });
    this.addCommand({ id: "new-print", name: t("cmdNewPrint"), callback: () => this.newNote("print") });
    this.addCommand({ id: "new-spool", name: t("cmdNewSpool"), callback: () => this.newNote("spool") });
    this.addCommand({
      id: "attach-spools",
      name: t("cmdAttachSpools"),
      callback: async () => {
        const n = await this.attachToPrints();
        const why = this.unmatchedRunning();
        const lines = [`Bambu: ${t("attachDone", { n })}`].concat(why.slice(0, 3).map((w) => `• ${w.name}: ${w.why}`));
        new Notice(lines.join("\n"), why.length ? 15000 : 5000);
      },
    });
    this.addCommand({ id: "create-base", name: t("cmdBase"), callback: () => this.createBase() });
    this.addCommand({ id: "add-link", name: t("cmdAddLink"), callback: () => new AddLinkModal(this.app, this).open() });
    this.addCommand({
      id: "toggle-primary",
      name: t("cmdPrimary"),
      callback: () => (this.isPrimary() ? this.releaseMain() : this.claimMain(true)),
    });
    this.addCommand({
      id: "pick-spool",
      name: t("cmdPickSpool"),
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        const ok = !!(f && this.isPrint(f));
        if (!checking) {
          if (ok) new SpoolPickModal(this.app, this, f).open();
          else new Notice(t("notAPrint"));
        }
        return ok;
      },
    });
    this.addCommand({ id: "create-dashboard", name: t("cmdDashboard"), callback: () => this.createDashboard(true) });
    this.addCommand({ id: "recalc-cost", name: t("cmdRecalc"), callback: () => this.recalcAll(true) });

    this.costTimers = new Map();
    this.registerEvent(this.app.metadataCache.on("changed", (file) => this.onNoteChanged(file)));
    // Change the spool of a print from its note: the ⋮ menu and a button in the note's top bar.
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!this.isPrint(file)) return;
        menu.addItem((item) =>
          item.setTitle(t("cmdPickSpool")).setIcon("disc-3").onClick(() => new SpoolPickModal(this.app, this, file).open())
        );
      })
    );
    this.registerEvent(this.app.workspace.on("file-open", () => this.addSpoolAction()));
    this.app.workspace.onLayoutReady(() => this.addSpoolAction());

    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt, editor) => this.onPaste(evt, editor))
    );

    this.settingTab = new BambuSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.app.workspace.onLayoutReady(() => {
      this.maybeOnboard();
      // Let a vault sync plugin pull notes from other devices first.
      this.startTimer = window.setTimeout(async () => {
        try {
          await this.checkDevices();
        } catch (e) {
          console.error("[bambu-print-sync] devices", e);
        }
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

  /** Remember the printers on the account and their models; warn once if a filter hides some. */
  async learnPrinters() {
    const st = this.settings;
    let list = [];
    try {
      list = await this.fetchDevices();
    } catch (e) {
      console.debug("[bambu-print-sync] printers", e);
      return;
    }
    if (!st.printers || typeof st.printers !== "object") st.printers = {};
    let changed = false;
    for (const d of list) {
      const name = d.name || d.dev_id;
      if (!name) continue;
      const model = d.dev_product_name || d.dev_model_name || "";
      const cur = st.printers[name] || {};
      if (!st.printers[name] || cur.id !== d.dev_id || (!cur.model && model)) {
        st.printers[name] = Object.assign({}, cur, { id: d.dev_id, model: cur.model || model });
        changed = true;
      }
    }
    if (st.deviceId && list.length > 1 && !st.filterWarned) {
      const only = list.find((d) => d.dev_id === st.deviceId);
      new Notice(t("filterWarn", { name: only ? only.name : st.deviceId, n: list.length }), 15000);
      st.filterWarned = true;
      changed = true;
    }
    if (changed) await this.saveSettings();
  }

  /** Printer names from the account and from print notes. */
  knownPrinters() {
    const names = new Set(Object.keys(this.settings.printers || {}));
    for (const f of this.filesIn(this.settings.printsFolder)) {
      const p = this.fm(f).printer;
      if (p) names.add(String(p));
    }
    return [...names].sort();
  }

  /** Cost settings for one printer: its own model and price over the common ones. */
  costSettings(printer) {
    const st = this.settings;
    const o = (st.printers || {})[String(printer || "")];
    if (!o) return st;
    const watts = num(o.powerW) || PRINTER_POWER[o.model] || st.powerW;
    return Object.assign({}, st, {
      powerW: watts,
      printerPrice: o.price === "" || o.price == null ? st.printerPrice : num(o.price),
      lifetimeH: o.lifetimeH === "" || o.lifetimeH == null ? st.lifetimeH : num(o.lifetimeH),
    });
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

  /** Files inside one folder (and its subfolders) only, without listing the whole vault. */
  filesIn(folder, ext = "md") {
    const out = [];
    const walk = (f) => {
      if (f instanceof TFile) {
        if (f.extension === ext) out.push(f);
      } else if (f && Array.isArray(f.children)) {
        f.children.forEach(walk);
      }
    };
    walk(this.app.vault.getAbstractFileByPath(normalizePath(folder)));
    return out;
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

  /** Download an image and set it as the note's cover. Quietly does nothing on failure. */
  async saveCover(file, url, key) {
    if (!this.settings.images || !url) return false;
    try {
      if (this.fm(file).cover) return false;
      const res = await requestUrl({ url, method: "GET", throw: false });
      if (res.status >= 400 || !res.arrayBuffer || !res.arrayBuffer.byteLength) return false;
      const headers = res.headers || {};
      const ct = headers["content-type"] || headers["Content-Type"] || "";
      const sniffed = sniffImage(res.arrayBuffer);
      if (!sniffed && !/^image\//i.test(ct)) return false;
      const dir = normalizePath(`${this.rootFolder()}/${t("imagesFolder")}`);
      await this.ensureFolder(dir);
      const name = `${safeFileName(key)}.${sniffed || imageExt(ct, url)}`;
      const path = `${dir}/${name}`;
      if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.createBinary(path, res.arrayBuffer);
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        if (!fm.cover) fm.cover = `[[${name}]]`;
      });
      return true;
    } catch (e) {
      console.debug("[bambu-print-sync] image", e);
      return false;
    }
  }

  /**
   * Weight and time the model page states, written into a planned print that has none yet,
   * so its cost can be worked out before printing. Marked `estimate`: the sync replaces it.
   */
  async saveEstimate(file, model, html) {
    if (model.site !== "MakerWorld") return false;
    const e = modelEstimate(html, model.profileId || this.fm(file).makerworld_profile);
    const fm = this.fm(file);
    if (!e || fm.status !== this.settings.statusPlanned || num(fm.grams) > 0 || num(fm.time_h) || num(fm.time_m)) return false;
    await this.app.fileManager.processFrontMatter(file, (f) => {
      f.grams = e.grams;
      f.time_h = e.time_h;
      f.time_m = e.time_m;
      f.estimate = true;
    });
    if (this.isPrimary()) await this.updateCost(file, false);
    return true;
  }

  /**
   * Planned prints added by link on another device may arrive without the weight and time
   * (MakerWorld) or the picture, for example when the phone went to sleep right after adding.
   * Read the model page once per session and fill in what is missing.
   */
  async fillEstimates() {
    const st = this.settings;
    this.estimateTried = this.estimateTried || new Set();
    let covers = 0;
    for (const file of this.filesIn(st.printsFolder)) {
      const fm = this.fm(file);
      if (fm.type !== "print" || fm.status !== st.statusPlanned || this.estimateTried.has(file.path)) continue;
      const model = parseModelUrl(String(fm.model_url || ""));
      if (!model) continue;
      const needEstimate = model.site === "MakerWorld" && !(num(fm.grams) > 0);
      const needCover = st.images && !fm.cover;
      if (!needEstimate && !needCover) continue;
      this.estimateTried.add(file.path);
      try {
        const res = await requestUrl({ url: model.url, method: "GET", throw: false });
        if (res.status >= 400) continue;
        if (needEstimate) await this.saveEstimate(file, model, res.text);
        const img = needCover && pageImage(res.text, model.url);
        if (img && (await this.saveCover(file, img, `${model.site}-${model.id}`))) covers++;
      } catch (e) {
        console.debug("[bambu-print-sync] model page", e);
      }
    }
    return covers;
  }

  /** Picture (and the weight and time estimate) for a model link, from its page. */
  async fetchModelImage(file, model) {
    if (!this.settings.images) {
      try {
        const res = await requestUrl({ url: model.url, method: "GET", throw: false });
        if (res.status < 400) await this.saveEstimate(file, model, res.text);
      } catch (e) {
        console.debug("[bambu-print-sync] model page", e);
      }
      return false;
    }
    try {
      const res = await requestUrl({ url: model.url, method: "GET", throw: false });
      if (res.status >= 400) return false;
      // A link without a name in it ("/models/12703"): name the card after the page.
      const name = !model.titleFromUrl && pageTitle(res.text);
      if (name) {
        await this.app.fileManager.processFrontMatter(file, (fm) => (fm.bambu_title = name));
        const dir = file.parent ? file.parent.path : this.settings.printsFolder;
        if (file.path !== normalizePath(`${dir}/${safeFileName(name)}.md`)) {
          await this.app.fileManager.renameFile(file, this.uniquePath(dir, name));
        }
      }
      await this.saveEstimate(file, model, res.text);
      const img = pageImage(res.text, model.url);
      return img ? await this.saveCover(file, img, `${model.site}-${model.id}`) : false;
    } catch (e) {
      console.debug("[bambu-print-sync] model page", e);
      return false;
    }
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
        printer: String(fm.printer || "").trim(),
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
    this.local(PRIMARY_KEY, on ? "1" : "0");
  }

  /** Read (one argument) or write a value kept on this device only. */
  local(key, value) {
    try {
      if (value === undefined) return this.app.loadLocalStorage ? this.app.loadLocalStorage(key) : null;
      if (this.app.saveLocalStorage) this.app.saveLocalStorage(key, value);
    } catch (e) {
      /* no local storage */
    }
    return value;
  }

  /* ---------- devices: one service note per device, so the vault sync never has to merge them ---------- */

  deviceId() {
    let id = this.local(DEVICE_ID_KEY);
    if (!id) id = this.local(DEVICE_ID_KEY, Math.random().toString(16).slice(2, 10));
    return String(id);
  }

  deviceName() {
    const saved = this.local(DEVICE_NAME_KEY);
    if (saved) return String(saved);
    const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    const android = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/);
    if (android && android[1] && !/^(K|wv)$/.test(android[1].trim())) return android[1].trim();
    if (/iPad/.test(ua)) return "iPad";
    if (/iPhone/.test(ua)) return "iPhone";
    if (Platform && Platform.isMacOS) return "Mac";
    if (Platform && Platform.isWin) return "Windows";
    if (Platform && Platform.isLinux) return "Linux";
    return `${Platform && Platform.isMobile ? "Phone" : "Computer"} ${this.deviceId().slice(0, 4)}`;
  }

  devicesFolder() {
    return normalizePath(`${this.rootFolder()}/${t("devicesFolder")}`);
  }

  readDevices() {
    const ms = (v) => {
      const x = Date.parse(v || "");
      return isNaN(x) ? 0 : x;
    };
    return this.filesIn(this.devicesFolder())
      .map((file) => ({ file, fm: this.fm(file) }))
      .filter((d) => d.fm.type === "bambu-device" && d.fm.device_id)
      .map((d) => ({
        file: d.file,
        id: String(d.fm.device_id),
        name: String(d.fm.device || d.file.basename),
        main: d.fm.main === true || d.fm.main === "true",
        since: ms(d.fm.main_since),
        lastSync: ms(d.fm.last_sync),
      }));
  }

  /** Create or update this device's own note. Only fields that change are written. */
  async writeDevice(patch) {
    const id = this.deviceId();
    const mine = this.readDevices().find((d) => d.id === id);
    let file = mine && mine.file;
    if (!file) {
      await this.ensureFolder(this.devicesFolder());
      const body = ["---", "type: bambu-device", `device_id: ${q(id)}`, "---", t("deviceNote"), ""].join("\n");
      file = await this.app.vault.create(this.uniquePath(this.devicesFolder(), this.deviceName()), body);
    }
    const want = Object.assign({ device: this.deviceName(), plugin_version: this.manifest ? this.manifest.version : "" }, patch);
    const fm = this.fm(file);
    if (Object.keys(want).every((k) => fm[k] === want[k])) return file;
    await this.app.fileManager.processFrontMatter(file, (f) => Object.assign(f, want));
    return file;
  }

  /** Turn the main-device switch on here, asking first if another device is actively the main one. */
  async claimMain(ask = true) {
    const other = mainDevice(this.readDevices().filter((d) => d.id !== this.deviceId()));
    if (ask && other && Date.now() - Math.max(other.lastSync, other.since) < RECENT_MS) {
      const ok = await new Promise((resolve) => new TakeoverModal(this.app, other, resolve).open());
      if (!ok) return false;
    }
    this.setPrimary(true);
    await this.writeDevice({ main: true, main_since: new Date().toISOString() });
    new Notice(t("nowPrimary"));
    this.refreshSettings();
    if (this.settings.token) this.sync(true);
    return true;
  }

  async releaseMain() {
    this.setPrimary(false);
    if (this.readDevices().some((d) => d.id === this.deviceId())) await this.writeDevice({ main: false });
    new Notice(t("nowSecondary"));
    this.refreshSettings();
  }

  /** Before importing: step down if another device took over since. Returns false when this device yields. */
  async confirmStillMain() {
    const devices = this.readDevices();
    const id = this.deviceId();
    if (shouldYield(devices, id)) {
      const winner = mainDevice(devices);
      this.setPrimary(false);
      await this.writeDevice({ main: false });
      new Notice(t("yielded", { name: winner.name }), 15000);
      this.refreshSettings();
      return false;
    }
    const me = devices.find((d) => d.id === id);
    if (!me || !me.main) await this.writeDevice({ main: true, main_since: new Date().toISOString() });
    return true;
  }

  /** After start: keep this device's note current and warn if nobody imports prints. */
  async checkDevices() {
    const devices = this.readDevices();
    const id = this.deviceId();
    const me = devices.find((d) => d.id === id);
    const main = this.isPrimary();
    // Only take part once the tracker is in use: a device that imports, or a vault that already has device notes.
    if (!devices.length && !(main && this.settings.token)) return;
    if (main && shouldYield(devices, id)) return this.confirmStillMain();
    if (!me || me.main !== main) await this.writeDevice(main ? { main: true, main_since: new Date().toISOString() } : { main: false });

    const lastWarn = Number(this.local(WARNED_KEY)) || 0;
    if (Date.now() - lastWarn < RECENT_MS) return;
    let msg = "";
    let offer = false;
    if (main && !this.settings.token) msg = t("warnNoLogin");
    else if (!main) {
      const winner = mainDevice(devices.filter((d) => d.id !== id));
      if (!winner) {
        msg = t("warnNoMain");
        offer = true;
      } else if (Date.now() - Math.max(winner.lastSync, winner.since) > STALE_MS) {
        msg = t("warnStale", { name: winner.name, when: this.when(Math.max(winner.lastSync, winner.since)) });
        offer = true;
      }
    }
    if (!msg) return;
    this.local(WARNED_KEY, String(Date.now()));
    this.warn(msg, offer);
  }

  warn(msg, offerMain) {
    const frag = document.createDocumentFragment();
    frag.createDiv({ text: msg });
    const row = frag.createDiv({ cls: "bambu-notice-actions" });
    const notice = new Notice(frag, 0);
    const button = (text, fn) => {
      const b = row.createEl("button", { text });
      b.addEventListener("click", () => {
        if (notice.hide) notice.hide();
        fn();
      });
    };
    if (offerMain) button(t("makeMainBtn"), () => this.claimMain(true));
    button(t("openSettingsBtn"), () => this.openSettings());
  }

  openSettings() {
    const s = this.app.setting;
    if (s && s.open) {
      s.open();
      if (s.openTabById) s.openTabById(this.manifest.id);
    }
  }

  when(ms) {
    if (!ms) return t("never");
    const d = new Date(ms);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    // Another device may have become the main one since: then step down instead of importing.
    let stillMain = true;
    try {
      stillMain = await this.confirmStillMain();
    } catch (e) {
      console.error("[bambu-print-sync] devices", e);
    }
    if (!stillMain || this.syncing) return;
    this.syncing = true;
    if (this.statusEl) this.statusEl.setText(t("sbSyncing"));
    const st = this.settings;
    try {
      await this.learnPrinters();
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
      // keep the frozen one, else the oldest, and move the rest to the trash.
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
          // A finished job is final: leave whatever the user edited alone,
          // except the filament list, which older versions filled from the model file's colours.
          if (finals.includes(fm.status) && fm.status === rec.status) {
            const lines = filamentLines(rec);
            if (JSON.stringify([].concat(fm.filaments || [])) !== JSON.stringify(lines)) {
              await this.app.fileManager.processFrontMatter(file, (pfm) => {
                pfm.filaments = lines;
              });
              updated++;
            }
            continue;
          }
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

      // Older finished prints: add the MakerWorld link if the cloud knows the model.
      for (const rec of records) {
        const f = rec.designId && byId.get(rec.id);
        if (!f || this.fm(f).model_url) continue;
        await this.app.fileManager.processFrontMatter(f, (fm) => {
          if (!fm.makerworld_id) fm.makerworld_id = rec.designId;
          if (!fm.model_url) {
            fm.model_url = `https://makerworld.com/models/${rec.designId}`;
            fm.model_site = "MakerWorld";
          }
        });
      }

      // Plate previews from the cloud for prints that have no picture yet.
      let covers = 0;
      if (st.images) {
        for (const rec of records) {
          const f = rec.cover && byId.get(rec.id);
          if (f && !this.fm(f).cover && (await this.saveCover(f, rec.cover, `bambu-${rec.id}`))) covers++;
        }
      }

      st.lastSync = Date.now();
      await this.saveSettings();
      await this.writeDevice({ main: true, last_sync: new Date(st.lastSync).toISOString() });
      this.refreshSettings();

      // Spools added after a print was imported: link them now.
      const attached = await this.attachToPrints();
      // Planned models added on another device without weight, time or picture: read their page.
      covers += await this.fillEstimates();
      // Prints still without a filament cost get one once a spool or the default price is known.
      for (const f of this.filesIn(st.printsFolder)) await this.updateCost(f, false);

      const parts = [];
      if (created) parts.push(t("created", { n: created }));
      if (linked) parts.push(t("linked", { n: linked }));
      if (updated) parts.push(t("updated", { n: updated }));
      if (covers) parts.push(t("covers", { n: covers }));
      if (attached) parts.push(t("attached", { n: attached }));
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

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.type = "print";
      fm.status = rec.status;
      fm.bambu_task_id = rec.id;
      // The model page's estimate gives way to the real job: its cost is worked out again.
      if (fm.estimate) {
        for (const k of ["estimate", "cost", "cost_filament", "cost_power", "cost_wear"]) delete fm[k];
      }
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
      // MakerWorld model the job was printed from: gives imported prints a model link.
      if (rec.designId && !fm.makerworld_id) fm.makerworld_id = rec.designId;
      if (rec.designId && !fm.model_url) {
        fm.model_url = `https://makerworld.com/models/${rec.designId}`;
        fm.model_site = "MakerWorld";
      }
      fm.filaments = filamentLines(rec);
      fm.source = "bambu-cloud";
      if (!fm.created) fm.created = rec.printed || localDate(new Date().toISOString());
      const patch = autoSpools(fm, spools, this.settings, false);
      if (patch) applyPatch(fm, patch);
      if (!Array.isArray(fm.tags)) fm.tags = fm.tags ? [fm.tags] : [];
      if (!fm.tags.includes("3d-print")) fm.tags.push("3d-print");
    });
  }

  /* ---------- notes and base ---------- */

  async newNote(kind) {
    if (kind === "spool") return new SpoolModal(this.app, this).open();
    const st = this.settings;
    const folder = kind === "print" ? st.printsFolder : st.spoolsFolder;
    await this.ensureFolder(folder);
    const today = localDate(new Date().toISOString());
    const path = this.uniquePath(folder, kind === "print" ? t("newPrintName") : t("newSpoolName"));
    const fmLines = kind === "print"
      ? ["type: print", `status: ${q(st.statusPlanned)}`, 'spool: ""', "grams:", "time_h:", "time_m:", "plate: 1", "printed:", `created: ${today}`, "tags:", "  - 3d-print"]
      : ["type: spool", "material: PLA", "color:", "color_hex:", "brand:", "weight_g: 1000", "price:", `spool_status: ${q(st.spoolOpen)}`, `bought: ${today}`, "tags:", "  - 3d-spool"];
    const body = kind === "print" ? `## ${t("notes")}\n` : spoolPrintsBlock(LANG);
    const file = await this.app.vault.create(path, ["---", ...fmLines, "---", "", body].join("\n"));
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  /** Create a spool note from the spool window. Returns the file. */
  async createSpool(o) {
    const st = this.settings;
    await this.ensureFolder(st.spoolsFolder);
    const today = localDate(new Date().toISOString());
    const name = [o.material, o.colorName || colorName(o.hex, LANG)].filter(Boolean).join(" ") || t("newSpoolName");
    const weight = num(o.weight) || 1000;
    const lines = [
      "---",
      "type: spool",
      `material: ${q(o.material || "PLA")}`,
      `color: ${q(o.colorName || colorName(o.hex, LANG))}`,
      `color_hex: ${q(hex6(o.hex))}`,
      `brand: ${q(o.brand || "")}`,
      ...(o.printer ? [`printer: ${q(o.printer)}`] : []),
      `weight_g: ${weight}`,
      `price: ${num(o.price) || ""}`,
      `spool_status: ${q(st.spoolOpen)}`,
      `bought: ${today}`,
      "tags:",
      "  - 3d-spool",
      "---",
      "",
      spoolPrintsBlock(LANG),
    ];
    const file = await this.app.vault.create(this.uniquePath(st.spoolsFolder, name), lines.join("\n"));
    const spool = { file, name: file.basename, material: o.material || "PLA", colorHex: hex6(o.hex), status: st.spoolOpen, printer: o.printer || "" };
    const n = await this.attachToPrints(spool);
    new Notice(
      t("spoolCreated", { name: file.basename }) + (n ? ` ${t("spoolAttached", { n })}` : "") + (num(o.price) > 0 ? "" : `. ${t("spoolNoPrice")}`)
    );
    return file;
  }

  /** Running prints with a colour that has no spool, with the reason. */
  unmatchedRunning() {
    const st = this.settings;
    const spools = this.spoolList();
    const out = [];
    for (const file of this.filesIn(st.printsFolder)) {
      const fm = this.fm(file);
      if (fm.type !== "print" || fm.status !== st.statusPrinting) continue;
      const current = String(fm.spool || "").trim();
      if (current && current !== String(fm.spool_auto || "").trim()) continue; // chosen by hand
      const why = whyNoSpool(parseFilaments(fm.filaments), spools, st, String(fm.printer || ""));
      if (why) out.push({ name: file.basename, why });
    }
    return out;
  }

  /**
   * Put spools onto prints, matched by material, colour and printer. Finished prints that get
   * a spool only now are marked spool_late, and their link is then kept as it is.
   * `only`: a spool just created, which the metadata cache may not know yet.
   */
  async attachToPrints(only) {
    const st = this.settings;
    const spools = only ? this.spoolList().filter((s) => s.file !== only.file).concat(only) : this.spoolList();
    const finals = [st.statusDone, st.statusFailed];
    let n = 0;
    for (const file of this.filesIn(st.printsFolder)) {
      const fm = this.fm(file);
      if (fm.type !== "print") continue;
      const final = finals.includes(fm.status);
      if (!final && fm.status !== st.statusPrinting) continue;
      // Finished and never auto-linked before (or linked late before): late.
      const late = final && (!!fm.spool_late || !String(fm.spool_auto || "").trim());
      const patch = autoSpools(fm, spools, st, late);
      if (!patch) continue;
      await this.app.fileManager.processFrontMatter(file, (pfm) => applyPatch(pfm, patch));
      n++;
    }
    return n;
  }

  /** Spools that can still be used, for pickers. */
  openSpools() {
    return this.spoolList().filter((s) => s.status !== this.settings.spoolEmpty);
  }

  async setSpool(file, spoolName) {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.spool = spoolName ? `[[${spoolName}]]` : "";
      // Chosen by hand: the sync no longer changes it, and one spool takes all the grams.
      delete fm.spool_auto;
      if (!fm.spool_deducted) delete fm.usage;
    });
    // The spool's price changes what the print cost, even for a finished one.
    if (this.isPrimary()) await this.updateCost(file, true);
    if (spoolName) new Notice(t("spoolSet", { name: spoolName }));
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
  async addModel(model, spoolName) {
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
        `spool: ${spoolName ? q(`[[${spoolName}]]`) : '""'}`,
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
      this.fetchModelImage(file, model);
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

  /** A spool button in the top bar of an open print note (one per view). */
  addSpoolAction() {
    const leaf = this.app.workspace.getMostRecentLeaf ? this.app.workspace.getMostRecentLeaf() : null;
    const view = leaf && leaf.view;
    if (!view || typeof view.addAction !== "function") return;
    const file = view.file;
    if (view.bambuSpoolAction) {
      view.bambuSpoolAction.toggle(!!(file && this.isPrint(file)));
      return;
    }
    if (!file || !this.isPrint(file)) return;
    view.bambuSpoolAction = view.addAction("disc-3", t("cmdPickSpool"), () => {
      const f = view.file;
      if (f && this.isPrint(f)) new SpoolPickModal(this.app, this, f).open();
    });
  }

  isPrint(file) {
    return file instanceof TFile && file.path.startsWith(normalizePath(this.settings.printsFolder) + "/") && this.fm(file).type === "print";
  }

  isSpool(file) {
    return file instanceof TFile && file.path.startsWith(normalizePath(this.settings.spoolsFolder) + "/") && this.fm(file).type === "spool";
  }

  onNoteChanged(file) {
    // Spending tiles update on every device, including secondary ones.
    if (this.isPrint(file)) this.refreshStats();
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
    const c = computeCost(fm, (link) => this.spoolPricePerKg(link, file.path), this.costSettings(fm.printer));
    if (!c) return false;
    // A finished print keeps its cost (prices change later), unless it had no filament cost yet
    // and now has one: a spool was linked or got its price.
    if (!force && final && num(fm.cost) > 0 && !(num(fm.cost_filament) === 0 && c.cost_filament > 0)) return false;
    if (Object.keys(c).every((k) => num(fm[k]) === c[k] && fm[k] !== undefined)) return false;
    await this.app.fileManager.processFrontMatter(file, (f) => Object.assign(f, c));
    return true;
  }

  /** Give a filament cost to prints that have none yet (finished ones keep everything else). */
  async fillCosts() {
    if (!this.isPrimary()) return 0;
    let n = 0;
    for (const f of this.filesIn(this.settings.printsFolder)) if (await this.updateCost(f, false)) n++;
    if (n) new Notice(t("recalcDone", { n }));
    return n;
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
      this.filesIn(root, "base").length > 0;
    this.settings.onboarded = true;
    await this.saveSettings();
    if (!exists) new WelcomeModal(this.app, this).open();
  }

  renderButtons(el) {
    const stats = el.createDiv({ cls: "bambu-stats" });
    this.statBoxes = (this.statBoxes || []).filter((b) => b.isConnected !== false);
    this.statBoxes.push(stats);
    this.fillStats(stats);
    const bar = el.createDiv({ cls: "bambu-buttons" });
    const btn = (icon, label, cta, fn) => {
      const b = bar.createEl("button", { cls: "bambu-button" + (cta ? " mod-cta" : "") });
      const ic = b.createSpan({ cls: "bambu-button-icon" });
      if (setIcon) setIcon(ic, icon);
      b.createSpan({ cls: "bambu-button-label", text: label });
      b.addEventListener("click", (e) => {
        e.preventDefault();
        fn();
      });
    };
    btn("plus", t("btnAddModel"), true, () => new AddLinkModal(this.app, this).open());
    btn("refresh-cw", t("btnSync"), false, () => this.sync());
    btn("file-plus", t("btnNewPrint"), false, () => this.newNote("print"));
    btn("disc-3", t("btnNewSpool"), false, () => this.newNote("spool"));
  }

  fillStats(box) {
    const st = this.settings;
    const prints = this.filesIn(st.printsFolder).map((f) => this.fm(f));
    const s = printStats(prints, st, new Date());
    box.empty();
    const tile = (label, b, sub, main) => {
      const tl = box.createDiv({ cls: "bambu-stat" + (main ? " bambu-stat-main" : "") });
      tl.createDiv({ cls: "bambu-stat-label", text: label });
      tl.createDiv({ cls: "bambu-stat-value", text: money(b.cost, st) });
      tl.createDiv({ cls: "bambu-stat-sub", text: sub });
    };
    const kg = (g) => (Math.round(g / 100) / 10).toLocaleString(LANG === "ru" ? "ru-RU" : "en-US");
    const sub = (b) => t("statsPrints", { n: b.count, kg: kg(b.grams), h: Math.round(b.hours) });
    tile(t("statsTotal"), s.total, sub(s.total), true);
    tile(t("statsMonth"), s.month, sub(s.month));
    tile(t("statsPrev"), s.prev, sub(s.prev));
    tile(t("statsFailed"), s.failed, t("statsFailedSub", { n: s.failed.count }));
    if (!s.priced && s.total.count) box.createDiv({ cls: "bambu-stat-hint", text: t("statsNoPrices") });
  }

  /** Refresh the spending tiles shortly after print notes change. */
  refreshStats() {
    if (!this.statBoxes || !this.statBoxes.length) return;
    if (this.statsTimer) window.clearTimeout(this.statsTimer);
    this.statsTimer = window.setTimeout(() => {
      this.statBoxes = this.statBoxes.filter((b) => b.isConnected !== false);
      for (const b of this.statBoxes) this.fillStats(b);
    }, 800);
  }

  /** A note with the buttons and the embedded base: the place to work with the queue. */
  async createDashboard(open) {
    const basePath = await this.createBase(true);
    const root = this.rootFolder();
    const path = normalizePath(`${root}/${t("dashboardName")}.md`);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      const baseName = basePath.split("/").pop();
      // cssclasses: the dashboard gets the full pane width (styles.css), even with readable line length on.
      file = await this.app.vault.create(path, "---\ncssclasses:\n  - bambu-dashboard\n---\n```bambu-print-sync\n```\n\n![[" + baseName + "]]\n");
      new Notice(t("dashboardCreated", { path }));
    }
    if (open && file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
    return path;
  }

  async setupTracker() {
    await this.ensureFolder(this.settings.printsFolder);
    await this.ensureFolder(this.settings.spoolsFolder);
    await this.createBase(true);
    const path = await this.createDashboard(false);
    const file = path && this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
  }

  async createBase(quiet) {
    const root = this.rootFolder();
    await this.ensureFolder(root);
    // Older versions named the base after the folder; keep using it if it is there.
    const names = LANG === "ru" ? ["База печатей.base", "3D печать.base"] : ["Print tracker.base", "3D printing.base"];
    const found = names.map((n) => normalizePath(`${root}/${n}`)).find((p) => this.app.vault.getAbstractFileByPath(p));
    const path = found || normalizePath(`${root}/${names[0]}`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      if (!quiet) new Notice(t("baseExists", { path }));
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
    this.refreshSettings();
  }

  /** Redraw the settings tab if it is open, so login state shows at once. */
  refreshSettings() {
    const tab = this.settingTab;
    if (tab && tab.containerEl && tab.containerEl.isConnected) tab.display();
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

/** A colour square; the colour is data, so it is passed as a CSS variable. */
function swatch(parent, hex, cls) {
  const sq = parent.createSpan({ cls: "bambu-swatch-color" + (cls ? " " + cls : "") });
  const v = /^[0-9A-F]{6}$/.test(hex6(hex)) ? `#${hex6(hex)}` : "transparent";
  if (sq.setCssProps) sq.setCssProps({ "--bambu-swatch": v });
  return sq;
}

/** Selectable spool chips (colour + name). onPick receives the spool name or "". */
function renderSpoolChips(parent, plugin, current, onPick) {
  const wrap = parent.createDiv({ cls: "bambu-pick" });
  wrap.createDiv({ cls: "setting-item-name", text: t("pickSpool") });
  const spools = plugin.openSpools();
  if (!spools.length) {
    wrap.createDiv({ cls: "setting-item-description", text: t("pickSpoolNone") });
    return wrap;
  }
  const row = wrap.createDiv({ cls: "bambu-chips" });
  const chips = [];
  let picked = current || "";
  for (const sp of spools) {
    const chip = row.createEl("button", { cls: "bambu-chip" });
    swatch(chip, sp.colorHex);
    chip.createSpan({ text: sp.name });
    if (sp.name === picked) chip.addClass("is-active");
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      picked = picked === sp.name ? "" : sp.name;
      for (const c of chips) c.el.toggleClass("is-active", c.name === picked);
      onPick(picked);
    });
    chips.push({ el: chip, name: sp.name });
  }
  return wrap;
}

class SpoolPickModal extends Modal {
  constructor(app, plugin, file) {
    super(app);
    this.plugin = plugin;
    this.file = file;
  }

  onOpen() {
    const { contentEl } = this;
    this.setTitle ? this.setTitle(t("pickSpoolTitle")) : contentEl.createEl("h3", { text: t("pickSpoolTitle") });
    const current = linkTarget(this.plugin.fm(this.file).spool);
    renderSpoolChips(contentEl, this.plugin, current, async (name) => {
      await this.plugin.setSpool(this.file, name);
      if (name) this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class SpoolModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.v = { material: "PLA", hex: "000000", colorName: "", brand: "Bambu Lab", weight: 1000, price: "" };
  }

  onOpen() {
    const { contentEl } = this;
    const v = this.v;
    this.setTitle ? this.setTitle(t("spoolTitle")) : contentEl.createEl("h3", { text: t("spoolTitle") });

    const st = this.plugin.settings;
    const prints = this.plugin.filesIn(st.printsFolder).map((f) => this.plugin.fm(f));
    const colors = cloudColors(prints);
    const owned = this.plugin.openSpools();
    const first = (x) => String(x || "").toLowerCase().split(/\s+/)[0];

    this.modalEl.addClass("bambu-spool-modal");
    const section = (title, desc) => {
      const h = contentEl.createDiv({ cls: "bambu-section" });
      h.createDiv({ cls: "bambu-section-title", text: title });
      if (desc) h.createDiv({ cls: "bambu-section-desc", text: desc });
    };
    section(t("spoolFromPrints"), colors.length ? t("spoolFromPrintsHint") : t("spoolNoColors"));
    const grid = contentEl.createDiv({ cls: "bambu-swatches" });
    const tiles = [];

    // Inputs that a tile fills in.
    let materialInput;
    let colorInput;
    let nameInput;
    const fill = () => {
      if (materialInput) materialInput.setValue(v.material);
      if (colorInput) colorInput.setValue(`#${v.hex}`);
      if (nameInput) nameInput.setValue(v.colorName);
    };

    for (const c of colors) {
      const tile = grid.createEl("button", { cls: "bambu-swatch" });
      swatch(tile, c.hex, "is-large");
      const info = tile.createDiv({ cls: "bambu-swatch-info" });
      info.createDiv({ cls: "bambu-swatch-title", text: colorName(c.hex, LANG) || `#${c.hex}` });
      const has = owned.some((s) => first(s.material) === first(c.material) && colorDistance(s.colorHex, c.hex) <= COLOR_CLOSE);
      info.createDiv({ cls: "bambu-swatch-sub", text: `${c.material} · ${has ? t("spoolOwned") : t("spoolUsed", { g: c.grams, n: c.prints })}` });
      if (has) tile.addClass("is-owned");
      tile.addEventListener("click", (e) => {
        e.preventDefault();
        Object.assign(v, { material: c.material, hex: c.hex, colorName: colorName(c.hex, LANG) });
        for (const x of tiles) x.toggleClass("is-active", x === tile);
        fill();
      });
      tiles.push(tile);
    }

    section(t("spoolOther"));
    const materials = [...new Set([...colors.map((c) => c.material), ...MATERIALS])].filter((m) => m && m !== "?");
    new Setting(contentEl).setName(t("spoolMaterial")).addDropdown((d) => {
      for (const m of materials) d.addOption(m, m);
      // A tile may bring a material that is not listed yet.
      const setValue = d.setValue.bind(d);
      d.setValue = (x) => {
        if (x && !materials.includes(x)) {
          materials.push(x);
          d.addOption(x, x);
        }
        return setValue(x);
      };
      materialInput = d;
      if (colors[0]) v.material = colors[0].material;
      d.setValue(v.material).onChange((x) => (v.material = x));
    });
    new Setting(contentEl).setName(t("spoolColor")).addColorPicker((c) => {
      colorInput = c;
      c.setValue(`#${v.hex}`).onChange((x) => {
        v.hex = hex6(x);
        v.colorName = colorName(v.hex, LANG);
        if (nameInput) nameInput.setValue(v.colorName);
        for (const tl of tiles) tl.removeClass("is-active");
      });
    });
    new Setting(contentEl).setName(t("spoolColorName")).addText((c) => {
      nameInput = c;
      v.colorName = colorName(v.hex, LANG);
      c.setValue(v.colorName).onChange((x) => (v.colorName = x.trim()));
    });
    new Setting(contentEl).setName(t("spoolBrand")).addText((c) => c.setValue(v.brand).onChange((x) => (v.brand = x.trim())));
    new Setting(contentEl).setName(t("spoolWeight")).addText((c) => c.setValue(String(v.weight)).onChange((x) => (v.weight = x)));
    new Setting(contentEl)
      .setName(t("spoolPrice"))
      .setDesc(t("spoolPriceDesc", { cur: st.currency || "" }))
      .addText((c) => {
        c.inputEl.inputMode = "decimal";
        c.setPlaceholder("—").onChange((x) => (v.price = x));
      });
    const printers = this.plugin.knownPrinters();
    if (printers.length > 1) {
      new Setting(contentEl).setName(t("spoolPrinter")).addDropdown((d) => {
        d.addOption("", t("spoolPrinterAny"));
        for (const p of printers) d.addOption(p, p);
        d.setValue("").onChange((x) => (v.printer = x));
      });
    }
    new Setting(contentEl).addButton((b) =>
      b.setCta().setButtonText(t("spoolCreate")).onClick(async () => {
        const file = await this.plugin.createSpool(v);
        this.close();
        if (file) await this.app.workspace.getLeaf(false).openFile(file);
      })
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}

class TakeoverModal extends Modal {
  constructor(app, other, done) {
    super(app);
    this.other = other;
    this.done = done;
    this.answer = false;
  }

  onOpen() {
    const { contentEl } = this;
    const when = `${new Date(Math.max(this.other.lastSync, this.other.since)).toLocaleString()}`;
    this.setTitle ? this.setTitle(t("takeoverTitle")) : contentEl.createEl("h3", { text: t("takeoverTitle") });
    contentEl.createEl("p", { text: t("takeoverText", { name: this.other.name, when }) });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText(t("cancel")).onClick(() => this.close()))
      .addButton((b) =>
        b.setCta().setButtonText(t("takeoverYes")).onClick(() => {
          this.answer = true;
          this.close();
        })
      );
  }

  onClose() {
    this.contentEl.empty();
    this.done(this.answer);
  }
}

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
    list.createEl("li", { text: `${this.plugin.rootFolder()}/${LANG === "ru" ? "База печатей" : "Print tracker"}.base` });
    list.createEl("li", { text: `${this.plugin.rootFolder()}/${t("dashboardName")}.md` });
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
      const file = await this.plugin.addModel(model, this.spool);
      if (file) this.close();
    };
    new Setting(contentEl).addText((c) => {
      c.setPlaceholder("https://makerworld.com/…").onChange((v) => (url = v.trim()));
      c.inputEl.addClass("bambu-link-input");
      c.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      window.setTimeout(() => c.inputEl.focus(), 0);
    });
    renderSpoolChips(contentEl, this.plugin, "", (name) => (this.spool = name));
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
        c.setValue(isMain).onChange(async (v) => {
          if (v) {
            if (!(await this.plugin.claimMain(true))) c.setValue(false);
          } else await this.plugin.releaseMain();
          this.display();
        })
      );
    const winner = mainDevice(this.plugin.readDevices());
    const myId = this.plugin.deviceId();
    const status = !winner
      ? isMain ? t("mainIsThis", { when: this.plugin.when(s.lastSync) }) : t("mainNone")
      : winner.id === myId
        ? t("mainIsThis", { when: this.plugin.when(winner.lastSync || s.lastSync) })
        : t("mainIs", { name: winner.name, when: this.plugin.when(winner.lastSync) });
    dev.descEl.createDiv({ text: status, cls: "bambu-main-status" });
    dev.descEl.createDiv({ text: t("primaryDesc"), cls: "setting-item-description" });
    new Setting(containerEl)
      .setName(t("deviceName"))
      .setDesc(t("deviceNameDesc"))
      .addText((c) =>
        c.setValue(this.plugin.deviceName()).onChange((v) => {
          v = v.trim();
          if (v) this.plugin.local(DEVICE_NAME_KEY, v);
        })
      );

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
            // Remember them for per-printer cost; the field stays empty so every printer is synced.
            await this.plugin.learnPrinters();
            this.display();
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
          // Prints that had no filament cost get one with the new default price.
          if (key === "defaultPriceKg") {
            clearTimeout(this.fillTimer);
            this.fillTimer = setTimeout(() => this.plugin.fillCosts(), 1500);
          }
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

    new Setting(containerEl).setName(t("hModels")).setHeading();
    toggle(t("pasteToQueue"), "pasteToQueue", t("pasteToQueueDesc"));
    toggle(t("pasteReplace"), "pasteReplace", t("pasteReplaceDesc"));
    toggle(t("images"), "images", t("imagesDesc"));

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
    text(t("defaultPriceKg"), "defaultPriceKg", t("defaultPriceKgDesc"), numeric);
    text(t("printerPrice"), "printerPrice", null, numeric);
    text(t("lifetimeH"), "lifetimeH", t("lifetimeHDesc"), numeric);
    text(t("maintPerHour"), "maintPerHour", t("maintPerHourDesc"), numeric);
    text(t("currency"), "currency");
    const rate = (num(s.powerW) * num(s.kwhPrice)) / 1000 + (num(s.lifetimeH) > 0 ? num(s.printerPrice) / num(s.lifetimeH) : 0) + num(s.maintPerHour);
    new Setting(containerEl)
      .setName(t("machineRate", { v: `${round2(rate)} ${s.currency || ""}`.trim() }))
      .addButton((b) => b.setButtonText(t("recalc")).onClick(() => this.plugin.recalcAll(true)));

    // Several printers: model, price and lifetime for each; empty fields use the common values above.
    const printers = this.plugin.knownPrinters();
    if (printers.length > 1) {
      new Setting(containerEl).setName(t("hPrinters")).setDesc(t("printersDesc")).setHeading();
      if (!s.printers || typeof s.printers !== "object") s.printers = {};
      for (const name of printers) {
        const o = s.printers[name] || (s.printers[name] = {});
        const rate = () => {
          const c = this.plugin.costSettings(name);
          return (num(c.powerW) * num(c.kwhPrice)) / 1000 + (num(c.lifetimeH) > 0 ? num(c.printerPrice) / num(c.lifetimeH) : 0) + num(c.maintPerHour);
        };
        const row = new Setting(containerEl).setName(name).setDesc(t("printerRate", { v: `${round2(rate())} ${s.currency || ""}`.trim() }));
        row.addDropdown((d) => {
          d.addOption("", t("printerSame"));
          for (const m of Object.keys(PRINTER_POWER)) d.addOption(m, `${m} · ~${PRINTER_POWER[m]} W`);
          d.setValue(PRINTER_POWER[o.model] ? o.model : "").onChange(async (v) => {
            o.model = v;
            await save();
            this.display();
          });
        });
        row.addText((c) =>
          c.setPlaceholder(t("printerPriceShort")).setValue(o.price == null ? "" : String(o.price)).onChange(async (v) => {
            o.price = v.trim() === "" ? "" : numeric(v);
            await save();
          })
        );
        row.addText((c) =>
          c.setPlaceholder(t("lifetimeShort")).setValue(o.lifetimeH == null ? "" : String(o.lifetimeH)).onChange(async (v) => {
            o.lifetimeH = v.trim() === "" ? "" : numeric(v);
            await save();
          })
        );
      }
    }

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
module.exports._test = { num, modelEstimate, cloudColors, colorName, printStats, mainDevice, shouldYield, pageTitle, pageImage, imageExt, sniffImage, taskToRecord, matchSpool, whyNoSpool, autoSpools, parseUsage, parseFilaments, spoolUsage, normalizeName, cleanTitle, linkTarget, safeFileName, buildBase, parseModelUrl, computeCost, colorDistance, PRINTER_POWER, LOCALE_DEFAULTS };
