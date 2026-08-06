/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");
const { unzipSync, zipSync } = require("fflate");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

const baseUrl = process.env.BASE_URL || "http://localhost:3000/ui-preview";
const appOrigin = new URL(baseUrl).origin;
const reportLocales = {
  uk: { heading: "Матриця проходження етапів", xlsxButton: "Завантажити XLSX", pdfButton: "Завантажити PDF", docxButton: "Завантажити DOCX", printButton: "Друкувати", fileTitle: "Зведений звіт по земельних ділянках", xlsxTitle: "Звіт про проходження етапів земельних ділянок", matrixSheet: "Матриця етапів", detailsSheet: "Деталі", dateFormat: "dd.mm.yyyy" },
  de: { heading: "Matrix des Phasenfortschritts", xlsxButton: "XLSX herunterladen", pdfButton: "PDF herunterladen", docxButton: "DOCX herunterladen", printButton: "Drucken", fileTitle: "Zusammenfassung der Grundstücke", xlsxTitle: "Bericht zum Fortschritt der Grundstücksphasen", matrixSheet: "Phasenmatrix", detailsSheet: "Details", dateFormat: "dd.mm.yyyy" },
  en: { heading: "Stage progress matrix", xlsxButton: "Download XLSX", pdfButton: "Download PDF", docxButton: "Download DOCX", printButton: "Print", fileTitle: "Land plot summary report", xlsxTitle: "Land plot stage progress report", matrixSheet: "Stage matrix", detailsSheet: "Details", dateFormat: "mm/dd/yyyy" },
};
const wtgReportLocales = {
  uk: { kind: "wtg", viewButton: "За ВЕУ", plotsButton: "За ділянками", fileTitle: "Звіт за ВЕУ", xlsxTitle: "Звіт за ВЕУ", matrixSheet: "ВЕУ та етапи", detailsSheet: "Кандидати ВЕУ", dateFormat: "dd.mm.yyyy" },
  de: { kind: "wtg", viewButton: "Nach WEA", plotsButton: "Nach Fläche", fileTitle: "WEA-Bericht", xlsxTitle: "WEA-Bericht", matrixSheet: "WEA und Phasen", detailsSheet: "WEA-Kandidaten", dateFormat: "dd.mm.yyyy" },
  en: { kind: "wtg", viewButton: "By WTG", plotsButton: "By plot", fileTitle: "WTG report", xlsxTitle: "WTG report", matrixSheet: "WTGs and stages", detailsSheet: "WTG candidates", dateFormat: "mm/dd/yyyy" },
};

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${message.text()} ${message.location().url || ""}`.trim()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });

  await page.goto(`${appOrigin}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Мова інтерфейсу").selectOption("de");
  await page.getByRole("heading", { name: "Anmelden", exact: true }).waitFor();
  assert((await page.getAttribute("html", "lang")) === "de", "German locale updates the document language");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Anmelden", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mobile-shell");
  await page.getByRole("button", { name: "Grundstücke", exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "German mobile workspace has no horizontal overflow");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-german.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".desktop-shell");
  await page.getByTitle("Ebenen").waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "German desktop workspace has no horizontal overflow");
  await page.getByTitle("Berichte").click();
  await page.getByRole("button", { name: "Nach Fläche", exact: true }).click();
  await page.getByRole("heading", { name: "Matrix des Phasenfortschritts", exact: true }).waitFor();
  await page.getByRole("button", { name: "Excel herunterladen", exact: true }).waitFor();
  await page.goto(`${appOrigin}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Sprache der Benutzeroberfläche").selectOption("en");
  await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
  await page.getByLabel("Interface language").selectOption("uk");
  await page.getByRole("heading", { name: "Вхід", exact: true }).waitFor();
  console.log("stage=locales");

  await page.goto(`${baseUrl}?view=users`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Користувачі", exact: true }).waitFor();
  const userManagementBounds = await page.locator(".user-management-page").boundingBox();
  assert((await page.locator(".desktop-rail .rail-button").count()) === 6, "desktop user management uses the complete workspace rail");
  assert((await page.locator('.desktop-rail .rail-button[title="Користувачі"][data-active="true"]').count()) === 1, "user management marks the user section as active");
  assert((await page.getByRole("link", { name: "Історія заявок", exact: true }).count()) === 1, "user registry exposes registration history without an intermediate screen");
  assert(await page.getByRole("combobox", { name: "Роль tester@example.com" }).isEnabled(), "pending applicant role is editable");
  assert(await page.getByRole("combobox", { name: "Рівень доступу tester@example.com" }).isEnabled(), "pending applicant access is editable");
  assert(await page.getByRole("combobox", { name: "Статус tester@example.com" }).isDisabled(), "pending applicant decision stays protected");
  const userSelectTypography = await page.getByRole("combobox", { name: "Роль tester@example.com" }).evaluate((element) => { const style = getComputedStyle(element); return { family: style.fontFamily, size: style.fontSize }; });
  const userMetaTypography = await page.locator(".user-meta span").first().evaluate((element) => { const style = getComputedStyle(element); return { family: style.fontFamily, size: style.fontSize }; });
  assert(userSelectTypography.family === userMetaTypography.family && userSelectTypography.size === userMetaTypography.size, "user dropdown typography matches the surrounding table text");
  assert(await page.getByRole("button", { name: "Зберегти tester@example.com" }).isEnabled(), "pending applicant settings can be saved");
  assert((await page.getByRole("link", { name: "Розглянути заявку tester@example.com" }).count()) === 1, "pending applicant exposes the review action");
  assert(await page.getByRole("combobox", { name: "Роль admin@example.com" }).isDisabled(), "protected administrator remains locked");
  const usersUrl = page.url();
  await page.getByTitle("Карта").click();
  await page.locator(".desktop-map").waitFor();
  await page.getByTitle("Користувачі").click();
  await page.getByRole("heading", { name: "Користувачі", exact: true }).waitFor();
  assert(page.url() === usersUrl, "user management switches inside the current workspace without navigation");
  await page.getByTitle("Профіль").click();
  await page.getByRole("heading", { name: "Профіль", exact: true }).waitFor();
  await page.getByRole("link", { name: "Користувачі", exact: true }).click();
  await page.getByRole("heading", { name: "Користувачі", exact: true }).waitFor();
  assert(page.url() === usersUrl, "profile opens user management inside the current workspace");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-desktop-user-management.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Користувачі", exact: true }).waitFor();
  await page.locator(".mobile-shell").waitFor();
  assert((await page.locator('.mobile-nav button[data-active="true"]').count()) === 1, "mobile user management keeps the workspace navigation active");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile user management has no horizontal overflow");
  assert((await page.locator(".user-actions").first().getByRole("button").count()) === 1, "mobile pending applicant keeps save action");
  assert((await page.locator(".user-actions").first().getByRole("link").count()) === 1, "mobile pending applicant keeps review action");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-user-management.png") });
  console.log("stage=user-management");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}?view=registration-result`, { waitUntil: "domcontentloaded" });
  await page.getByText("Підтверджено", { exact: true }).waitFor();
  assert((await page.locator(".admin-rail .admin-rail__link").count()) === 6, "desktop registration review preserves the complete application rail");
  await page.getByText("Другий адміністратор", { exact: false }).waitFor();
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-desktop-registration-result.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Доступ підтверджено після перевірки даних користувача та погодження рівня доступу.", { exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile registration result has no horizontal overflow");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-registration-result.png") });
  console.log("stage=registration-result");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.removeItem("geopartners-preview"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".leaflet-overlay-pane path");
  assert((await page.locator(".leaflet-overlay-pane path").count()) === 3, "desktop map renders three plots");
  assert((await page.locator('.desktop-rail button[title="Користувачі"]').count()) === 1, "administrator navigation exposes user management as a workspace section");
  console.log("stage=map");
  await page.getByTitle("Сповіщення").click();
  await page.getByText("Черга сповіщень працює штатно", { exact: true }).waitFor();
  assert((await page.locator(".notification-status dd").count()) === 3, "administrator notification center shows outbox metrics");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-notification-status.png") });
  await page.getByRole("dialog").getByRole("button", { name: "Закрити" }).click();
  await page.getByTitle("Шари").click();
  await page.getByRole("heading", { name: "Шари", exact: true }).waitFor();
  await page.getByRole("button", { name: "Супутник" }).click();
  const categoryDescription = page.getByRole("textbox", { name: "Опис категорії Без категорії" });
  await categoryDescription.fill("Ділянки, для яких категорію ще не визначено.");
  await categoryDescription.blur();
  assert((await categoryDescription.inputValue()) === "Ділянки, для яких категорію ще не визначено.", "administrator can edit a category description");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-desktop-category-descriptions.png") });
  console.log("stage=layers");

  await page.getByTitle("Налаштування").evaluate((element) => element.click());
  await page.getByRole("heading", { name: "Статуси ділянок", exact: true }).waitFor();
  assert((await page.locator(".plot-status-row textarea").count()) === 15, "administrator sees the complete ordered status directory");
  assert((await page.locator(".plot-status-row textarea").first().inputValue()) === "обрана ділянка як варіант", "status directory preserves the requested first item");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-desktop-plot-statuses.png") });
  console.log("stage=statuses");

  await page.getByTitle("Звіти").click();
  await page.getByRole("heading", { name: "Зведений звіт" }).waitFor();
  await expectDownload(page, () => page.getByRole("button", { name: "CSV" }).click(), ".csv");
  console.log("stage=csv");
  await page.getByRole("heading", { name: "Звіт за ВЕУ", exact: true }).waitFor();
  assert((await page.locator(".report-matrix--wtg tbody tr").count()) === 1, "WTG report groups the main and alternative candidates into one row");
  await page.getByText("6820982100:04:051:0020", { exact: true }).waitFor();
  await expectDownload(page, () => page.getByRole("button", { name: "Завантажити PDF" }).click(), ".pdf", wtgReportLocales.uk);
  await expectDownload(page, () => page.getByRole("button", { name: "Завантажити DOCX" }).click(), ".docx", wtgReportLocales.uk);
  await expectDownload(page, () => page.getByRole("button", { name: "Завантажити XLSX", exact: true }).click(), ".xlsx", wtgReportLocales.uk);
  console.log("stage=wtg-exports");
  await page.getByRole("button", { name: "За ділянками", exact: true }).click();
  await page.getByRole("heading", { name: reportLocales.uk.heading, exact: true }).waitFor();
  await expectDownload(page, () => page.getByRole("button", { name: "Завантажити PDF" }).click(), ".pdf", reportLocales.uk);
  await expectDownload(page, () => page.getByRole("button", { name: "Завантажити DOCX" }).click(), ".docx", reportLocales.uk);
  await expectDownload(page, () => page.getByRole("button", { name: "Завантажити XLSX", exact: true }).click(), ".xlsx", reportLocales.uk);
  console.log("stage=plot-exports");
  assert((await page.locator(".report-matrix tbody tr").count()) === 3, "desktop status report renders one matrix row per visible plot");
  assert((await page.locator(".report-matrix thead .report-matrix__stage").count()) === 15, "desktop status report renders the ordered stage directory");
  await page.setViewportSize({ width: 1920, height: 900 });
  const matrixHeaderBounds = await page.locator(".report-matrix thead").boundingBox();
  assert(matrixHeaderBounds && matrixHeaderBounds.height < 110, "desktop status matrix header uses its content height without excess top space");
  await page.setViewportSize({ width: 1440, height: 900 });
  assert(await page.locator(".report-matrix tbody .report-matrix__category").first().evaluate((element) => getComputedStyle(element).display === "table-cell"), "category values preserve table-cell layout");
  assert((await page.locator(".report-matrix tbody .report-matrix__category-content .category-line__swatch").count()) === 3, "category values render their color markers");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "desktop status report keeps horizontal scrolling inside the matrix");
  assert(await page.locator(".report-matrix-wrap").evaluate((element) => element.scrollWidth <= element.clientWidth), "desktop status report fits the full matrix without horizontal scrolling");
  const reportModeBounds = await page.locator(".status-report__mode .segmented-control").boundingBox();
  await page.locator('.status-report__mode button[data-active="false"]').first().click();
  const changedReportModeBounds = await page.locator(".status-report__mode .segmented-control").boundingBox();
  assert(reportModeBounds && changedReportModeBounds && reportModeBounds.x === changedReportModeBounds.x && reportModeBounds.width === changedReportModeBounds.width, "report mode controls stay fixed when the active mode changes");
  await page.getByRole("button", { name: "Витрати", exact: true }).click();
  await expectDownload(page, () => page.getByRole("button", { name: "Завантажити Excel" }).click(), ".xlsx", reportLocales.uk);
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-desktop-status-report.png"), fullPage: true });
  console.log("stage=xlsx");

  await verifyPrintReport(page, reportLocales.uk);
  for (const locale of ["de", "en"]) {
    const expected = reportLocales[locale];
    const expectedWtg = wtgReportLocales[locale];
    await page.locator(".language-switcher select").selectOption(locale);
    await page.getByRole("heading", { name: expected.heading, exact: true }).waitFor();
    await expectDownload(page, () => page.getByRole("button", { name: expected.xlsxButton, exact: true }).click(), ".xlsx", expected);
    await expectDownload(page, () => page.getByRole("button", { name: expected.pdfButton, exact: true }).click(), ".pdf", expected);
    await expectDownload(page, () => page.getByRole("button", { name: expected.docxButton, exact: true }).click(), ".docx", expected);
    await verifyPrintReport(page, expected);
    await page.getByRole("button", { name: expectedWtg.viewButton, exact: true }).click();
    await page.getByRole("heading", { name: expectedWtg.fileTitle, exact: true }).waitFor();
    await expectDownload(page, () => page.getByRole("button", { name: expected.xlsxButton, exact: true }).click(), ".xlsx", expectedWtg);
    await expectDownload(page, () => page.getByRole("button", { name: expected.pdfButton, exact: true }).click(), ".pdf", expectedWtg);
    await expectDownload(page, () => page.getByRole("button", { name: expected.docxButton, exact: true }).click(), ".docx", expectedWtg);
    await page.getByRole("button", { name: expectedWtg.plotsButton, exact: true }).click();
  }
  await page.locator(".language-switcher select").selectOption("uk");
  await page.getByRole("heading", { name: reportLocales.uk.heading, exact: true }).waitFor();
  console.log("stage=localized-reports");

  await page.getByTitle("Журнал").click();
  await page.getByRole("heading", { name: "Журнал змін", exact: true }).waitFor();
  const auditBounds = await page.locator(".audit-page").boundingBox();
  assert(userManagementBounds && auditBounds && Math.round(auditBounds.width) === Math.round(userManagementBounds.width), "audit log matches the user management workspace width");
  assert((await page.locator(".audit-row").count()) === 4, "desktop audit log renders demo entries");
  await page.getByRole("button", { name: "Імпорти", exact: true }).click();
  await page.getByText("Імпорт завершено: додано 3, оновлено 0.").waitFor();
  assert((await page.locator(".audit-row").count()) === 1, "audit scope filters import events");
  await page.getByRole("button", { name: "Усі", exact: true }).click();
  await page.getByPlaceholder("Ділянка або користувач").fill("Олена");
  await page.getByText("Олена Коваль").waitFor();
  assert((await page.locator(".audit-row").count()) === 1, "audit search filters by actor");
  await page.getByPlaceholder("Ділянка або користувач").fill("подія-якої-немає");
  await page.getByText("Подій за цими параметрами немає.", { exact: true }).waitFor();
  assert((await page.locator(".audit-row").count()) === 0, "audit search has an explicit empty state");
  await page.getByPlaceholder("Ділянка або користувач").fill("");
  await page.locator(".audit-row").first().waitFor();
  await page.locator(".audit-row summary").first().click();
  await page.getByText("Файли пакета").waitFor();
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-audit-log.png") });
  await page.locator(".audit-row summary").first().click();
  await page.locator(".audit-row summary").nth(1).click();
  await page.getByRole("button", { name: "Порівняти та відновити", exact: true }).click();
  await page.getByRole("heading", { name: "Порівняння версій", exact: true }).waitFor();
  await page.locator(".version-compare__map .leaflet-overlay-pane path").nth(1).waitFor();
  assert((await page.locator(".version-diff-list > div").count()) >= 2, "version comparison lists changed values");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-version-comparison.png") });
  await page.getByRole("button", { name: "Відновити цю версію", exact: true }).click();
  await page.getByText("Версію успішно відновлено.", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-audit-restore.png") });
  console.log("stage=audit");

  await page.getByTitle("Налаштування").evaluate((element) => element.click());
  await page.getByRole("heading", { name: "Налаштування", exact: true }).waitFor();
  await page.getByRole("button", { name: "Імпортувати дані" }).click();
  await page.getByRole("button", { name: /^Вибрати папку/ }).waitFor();
  await page.getByRole("button", { name: /^Вибрати GeoJSON, PDF або ZIP/ }).waitFor();
  assert(await page.getByRole("dialog").evaluate((dialog) => dialog.contains(document.activeElement)), "modal moves keyboard focus inside");
  await page.keyboard.press("Shift+Tab");
  assert(await page.getByRole("dialog").evaluate((dialog) => dialog.contains(document.activeElement)), "modal traps backward keyboard focus");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert(await page.getByRole("button", { name: "Імпортувати дані" }).evaluate((button) => button === document.activeElement), "modal returns focus to its trigger");
  await page.getByRole("button", { name: "Імпортувати дані" }).click();
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({ name: "damaged.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip") });
  await page.getByText("damaged.zip: вміст файлу не відповідає формату ZIP.").waitFor();
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles(zipUpload());
  await page.getByText("1 ZIP", { exact: true }).waitFor();
  await page.getByText("1 GeoJSON", { exact: true }).waitFor();
  await page.getByText("1 PDF", { exact: true }).waitFor();
  await page.getByText(/Пропущено непідтримуваний файл: package.zip: docs\/README.txt/).waitFor();
  await page.getByRole("button", { name: "Перевірити пакет (2)", exact: true }).click();
  await page.getByText("0 помилок").waitFor();
  assert(!(await page.getByRole("button", { name: "Підтвердити імпорт (1)", exact: true }).isDisabled()), "ZIP pair reaches the normal import review");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-import-zip-review.png") });
  await page.getByRole("button", { name: "Змінити файли" }).click();
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({ name: "repairable.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(repairableGeometryPackage())) });
  await page.getByRole("button", { name: "Перевірити пакет (1)", exact: true }).click();
  await page.getByText(/Зовнішнє кільце не замкнене/).waitFor();
  await page.getByText(/Повторюваних вершин:/).waitFor();
  assert(await page.getByRole("button", { name: /Підтвердити імпорт/ }).isDisabled(), "repairable geometry is blocked before repair");
  await page.getByRole("button", { name: "Застосувати (1)", exact: true }).click();
  await page.getByText("Виправлення застосовано").waitFor();
  assert(!(await page.getByRole("button", { name: /Підтвердити імпорт/ }).isDisabled()), "safe repairs unblock a valid update");
  assert((await page.locator(".import-review__details dd").first().textContent()) !== "0 га", "safe repair recalculates the polygon area");
  await page.getByRole("button", { name: "Скасувати", exact: true }).click();
  await page.getByText(/Зовнішнє кільце не замкнене/).waitFor();
  assert(await page.getByRole("button", { name: /Підтвердити імпорт/ }).isDisabled(), "undo restores original geometry errors");
  await page.getByRole("button", { name: "Застосувати (1)", exact: true }).click();
  await page.getByText("Виправлення застосовано").waitFor();
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-import-repaired-review.png") });
  await page.getByRole("button", { name: /Підтвердити імпорт \(1\)/ }).click();
  await page.getByText(/Імпорт завершено:/).waitFor();
  await page.getByRole("button", { name: "Імпортувати дані" }).click();
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({ name: "invalid-geometries.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(invalidGeometryPackage())) });
  await page.getByRole("button", { name: "Перевірити пакет (1)", exact: true }).click();
  await page.getByText(/Самоперетинів контуру:/).waitFor();
  await page.getByText(/Зовнішнє кільце не замкнене/).waitFor();
  await page.getByText(/Повторюваних вершин:/).waitFor();
  await page.getByText(/Сегментів коротших за/).waitFor();
  assert(await page.getByRole("button", { name: /Підтвердити імпорт/ }).isDisabled(), "invalid geometries block import during review");
  assert((await page.locator(".map-validation-marker--error").count()) >= 3, "geometry errors are marked on the review map");
  assert((await page.locator(".map-validation-marker--warning").count()) >= 1, "short segments are marked as warnings");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-import-geometry-review.png") });
  await page.getByRole("button", { name: "Змінити файли" }).click();
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({ name: "selective.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(selectiveGeometryPackage())) });
  await page.getByRole("button", { name: "Перевірити пакет (1)", exact: true }).click();
  await page.getByText(/Самоперетинів контуру:/).waitFor();
  assert(await page.getByRole("button", { name: /Підтвердити імпорт/ }).isDisabled(), "invalid selected candidate blocks a mixed package");
  await page.getByRole("button", { name: "Зняти вибір", exact: true }).click();
  await page.getByText("0/2 вибрано").waitFor();
  assert(await page.getByRole("button", { name: "Підтвердити імпорт (0)", exact: true }).isDisabled(), "an empty candidate selection cannot be submitted");
  await page.getByRole("button", { name: "Вибрати всі", exact: true }).click();
  await page.getByLabel("Імпортувати 1111111111:11:111:1101", { exact: true }).uncheck();
  await page.getByText("1/2 вибрано").waitFor();
  assert(!(await page.getByRole("button", { name: "Підтвердити імпорт (1)", exact: true }).isDisabled()), "excluding the invalid candidate unblocks the valid subset");
  assert((await page.locator(".map-validation-marker--error").count()) === 0, "excluded geometry markers are removed from the active review");
  assert((await page.locator(".import-review__details dd").first().textContent()) !== "0 га", "GeoJSON area is calculated when the property is absent");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-import-selection-review.png") });
  await page.getByRole("button", { name: "Підтвердити імпорт (1)", exact: true }).click();
  await page.getByText(/Імпорт завершено:/).waitFor();
  await page.getByRole("button", { name: "Імпортувати дані" }).click();
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles(geoJsonUpload("1111111111:11:111:1111.geojson"));
  await page.getByRole("button", { name: "Перевірити пакет (1)", exact: true }).click();
  await page.getByText(/(?:Мікронакладання|Накладання).*6820982100:04:051:0018/).waitFor();
  assert(!(await page.getByRole("button", { name: /Підтвердити імпорт/ }).isDisabled()), "overlapping import remains available during review");
  await page.getByText("PDF не додано", { exact: true }).waitFor();
  assert((await page.locator(".map-conflict-area").count()) >= 1, "import review map highlights overlap area");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-import-overlap-review.png") });
  await page.getByRole("button", { name: "Змінити файли" }).click();
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles([
    geoJsonUpload("6820982100040510018.geojson"),
    pdfUpload("6820982100040510018.pdf", "6820982100:04:051:0019"),
  ]);
  await page.getByRole("button", { name: /Перевірити пакет \(2\)/ }).click();
  await page.getByText(/Кадастровий номер не збігається/).waitFor();
  assert(await page.getByRole("button", { name: /Підтвердити імпорт/ }).isDisabled(), "mismatched cadastral blocks import");
  await page.getByRole("button", { name: "Змінити файли" }).click();
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles([
    geoJsonUpload("6820982100040510018.geojson"),
    pdfUpload("6820982100040510018.pdf", "6820982100:04:051:0018"),
  ]);
  await page.getByRole("button", { name: /Перевірити пакет \(2\)/ }).click();
  await page.getByText("0 помилок").waitFor();
  assert((await page.locator(".import-review__map .leaflet-overlay-pane path").count()) === 1, "import preview renders the contour");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-import-review.png") });
  await page.getByRole("button", { name: /Підтвердити імпорт \(1\)/ }).click();
  await page.getByText(/Імпорт завершено:/).waitFor();
  console.log("stage=import");

  await page.getByTitle("Карта").click();
  await page.locator(".plot-row").first().click();
  await page.getByText("6820982100:04:051:0018", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Документи" }).click();
  await page.getByText("6820982100040510018.pdf").waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Закрити" }).click();
  await page.getByTitle("Редагувати ділянку").click();
  await page.locator(".geometry-editor__neighbor").first().waitFor();
  assert((await page.locator(".geometry-conflicts").count()) === 0, "shared cadastral boundaries are not treated as area overlaps");
  assert(!(await page.getByRole("button", { name: "Зберегти", exact: true }).isDisabled()), "boundary-touching existing plot remains saveable");
  await page.getByRole("dialog").getByRole("button", { name: "Закрити" }).click();
  await page.getByTitle("Додати ділянку").click();
  await page.getByLabel("Кадастровий номер", { exact: true }).fill("0000000000:00:000:0001");
  assert((await page.getByRole("dialog").getByLabel("Назва").count()) === 0, "plot editor omits the redundant name field");
  await page.locator('select[name="category"]').selectOption({ label: "ВЕУ" });
  await page.locator(".result-link-row__toggle input").check();
  await page.getByLabel("ВЕУ: номер").fill("1");
  await page.locator(".geometry-editor__neighbor").first().waitFor();
  assert((await page.locator(".geometry-editor__neighbor").count()) === 3, "geometry editor shows neighboring plots as snap references");
  const neighborGeometry = await page.evaluate(() => JSON.parse(localStorage.getItem("geopartners-preview") || "{}").plots?.[0]?.geometry);
  await page.locator("details.geometry-source").evaluate((element) => { element.open = true; });
  await page.locator('textarea[name="geometry"]').fill(JSON.stringify(neighborGeometry));
  await page.getByText("Накладання дозволено").waitFor();
  assert(!(await page.getByRole("button", { name: "Зберегти", exact: true }).isDisabled()), "overlap does not block plot saving");
  assert((await page.locator(".geometry-editor__neighbor--conflict").count()) === 1, "conflicting neighbor is highlighted");
  assert((await page.locator(".geometry-editor__conflict-area").count()) >= 1, "overlap area is highlighted");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-overlap-warning.png") });
  await page.locator(".geometry-editor").getByRole("button", { name: "Очистити", exact: true }).click();
  await page.getByText("Накладання дозволено").waitFor({ state: "detached" });
  await page.locator("details.geometry-source").evaluate((element) => { element.open = false; });
  await page.getByRole("button", { name: "Новий", exact: true }).click();
  await drawPolygon(page);
  await page.getByText("Новий контур готовий").waitFor();
  const calculatedArea = Number(await page.getByLabel("Площа, га").inputValue());
  assert(calculatedArea > 0, "drawing a contour calculates its area in hectares");
  await page.getByText("За контуром").waitFor();
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-desktop-editor.png") });
  await page.getByRole("button", { name: "Зберегти", exact: true }).click();
  await page.getByText("Ділянку додано.").waitFor();
  assert((await page.locator(".plot-row").count()) === 4, "adding a plot updates desktop list");
  await page.getByTitle("Редагувати ділянку").click();
  const editor = page.locator(".geometry-editor");
  const geometrySource = page.locator('textarea[name="geometry"]');
  const editorMetrics = await page.locator(".workspace-modal__body").evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  assert(editorMetrics.scrollHeight <= editorMetrics.clientHeight + 1, `desktop plot editor fits without an internal vertical scrollbar (${editorMetrics.scrollHeight}/${editorMetrics.clientHeight})`);
  await page.locator(".result-group-editor summary").click();
  await page.locator(".result-group-editor select").selectOption({ label: "6820982100:04:051:0019" });
  await page.getByLabel("6820982100:04:051:0020", { exact: true }).check();
  const originalGeometry = await geometrySource.inputValue();
  const originalArea = await page.getByLabel("Площа, га").inputValue();
  await editor.getByRole("button", { name: "Вершини", exact: true }).click();
  const originalVertex = await firstVertexCenter(editor);
  await dragFirstVertex(page, editor, 28, 12);
  const movedVertex = await firstVertexCenter(editor);
  assert(Math.abs(movedVertex.x - originalVertex.x) > 10, "vertex moves while editing");
  await editor.getByRole("button", { name: "Скасувати", exact: true }).click();
  assert((await geometrySource.inputValue()) === originalGeometry, "cancel restores the saved contour");
  assert((await page.getByLabel("Площа, га").inputValue()) === originalArea, "cancel restores the saved area");
  await editor.getByRole("button", { name: "Вершини", exact: true }).click();
  await dragFirstVertex(page, editor, -24, 18);
  await editor.getByRole("button", { name: "Вершини", exact: true }).click();
  await page.waitForFunction((value) => document.querySelector('textarea[name="geometry"]')?.value !== value, originalGeometry);
  const editedArea = await page.getByLabel("Площа, га").inputValue();
  assert(editedArea !== originalArea, "editing the contour recalculates its area");
  await page.getByRole("button", { name: "Зберегти", exact: true }).click();
  await page.getByText("Зміни ділянки збережено.").waitFor();
  await page.reload();
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("geopartners-preview") || "{}").plots?.find((plot) => plot.properties.cadastralNumber === "0000000000:00:000:0001"));
  assert(persisted, "edited plot persists after reload");
  const linkedCandidates = await page.evaluate(() => JSON.parse(localStorage.getItem("geopartners-preview") || "{}").plots?.filter((plot) => ["6820982100:04:051:0019", "6820982100:04:051:0020"].includes(plot.properties.cadastralNumber)).every((plot) => plot.properties.resultLinks?.some((link) => link.type === "wtg" && link.number === "1")));
  assert(linkedCandidates, "WTG group editor persists the selected main and alternative candidates");
  assert(JSON.stringify(persisted.geometry) !== JSON.stringify(JSON.parse(originalGeometry)), "edited contour persists after reload");
  assert(String(persisted.properties.areaHa) === editedArea, "calculated area persists after reload");
  await page.getByTitle("Звіти").click();
  const linkedWtgRow = page.locator(".report-matrix--wtg tbody tr").filter({ hasText: "0000000000:00:000:0001" });
  const linkedWtgText = await linkedWtgRow.innerText();
  assert(linkedWtgText.includes("6820982100:04:051:0019") && linkedWtgText.includes("6820982100:04:051:0020"), "WTG report shows the selected main, alternative, and final plots in one row");
  await page.getByTitle("Карта").click();
  await page.waitForSelector(".leaflet-overlay-pane path");
  await page.waitForSelector(".leaflet-tile-loaded");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-desktop-smoke.png") });
  console.log("stage=crud");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForSelector(".mobile-shell");
  await page.waitForSelector(".leaflet-overlay-pane path");
  await page.waitForSelector(".leaflet-tile-loaded");
  await page.getByRole("button", { name: "Шари", exact: true }).click();
  await page.getByRole("textbox", { name: "Опис категорії Без категорії" }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile category editor has no horizontal overflow");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-category-descriptions-admin.png") });
  await page.locator(".mobile-overlay-page").getByRole("button", { name: "Закрити" }).click();
  await page.getByRole("button", { name: "Сповіщення", exact: true }).click();
  await page.getByText("Черга сповіщень працює штатно", { exact: true }).waitFor();
  const mobileNotifications = await page.getByRole("dialog").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileNotifications.width === mobileNotifications.clientWidth && mobileNotifications.clientWidth <= mobileNotifications.viewport, "mobile notification status has no horizontal overflow");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-notification-status.png") });
  await page.getByRole("dialog").getByRole("button", { name: "Закрити" }).click();
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-smoke.png") });
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight }));
  assert(dimensions.width === dimensions.viewportWidth && dimensions.height === dimensions.viewportHeight, "mobile shell has no page overflow");
  await page.getByRole("button", { name: "Профіль", exact: true }).click();
  await page.getByRole("heading", { name: "Статуси ділянок", exact: true }).waitFor();
  const mobileStatuses = await page.locator(".plot-status-settings").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileStatuses.width === mobileStatuses.clientWidth && mobileStatuses.clientWidth <= mobileStatuses.viewport, "mobile status directory has no horizontal overflow");
  assert((await page.locator(".plot-status-row textarea").count()) === 15, "mobile administrator sees all plot statuses");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-plot-statuses.png") });
  await page.getByRole("button", { name: "Ділянки", exact: true }).click();
  assert((await page.locator(".plot-row").count()) === 4, "mobile list contains saved plots");
  await page.locator(".plot-row").nth(1).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Етапи \(/ }).click();
  await page.getByRole("heading", { name: "Етапи ділянки", exact: true }).waitFor();
  const mobileStages = await page.getByRole("dialog").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileStages.width === mobileStages.clientWidth && mobileStages.clientWidth <= mobileStages.viewport, "mobile plot stages have no horizontal overflow");
  assert((await page.getByRole("dialog").getByRole("checkbox").count()) === 15, "mobile plot stages show the complete ordered checklist");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-plot-stages.png") });
  await page.getByRole("dialog").getByRole("button", { name: "Скасувати", exact: true }).click();
  await page.getByRole("button", { name: "Імпорт", exact: true }).click();
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({ name: "selective.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(selectiveGeometryPackage())) });
  await page.getByRole("button", { name: "Перевірити пакет (1)", exact: true }).click();
  await page.getByLabel("Імпортувати 1111111111:11:111:1101", { exact: true }).uncheck();
  await page.getByText("1/2 вибрано").waitFor();
  const mobileSelectionReview = await page.getByRole("dialog").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileSelectionReview.width === mobileSelectionReview.clientWidth && mobileSelectionReview.clientWidth <= mobileSelectionReview.viewport, "mobile candidate selection has no horizontal overflow");
  assert(!(await page.getByRole("button", { name: "Підтвердити імпорт (1)", exact: true }).isDisabled()), "mobile candidate selection unblocks the valid subset");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-import-selection-review.png") });
  await page.getByRole("button", { name: "Змінити файли" }).click();
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles({ name: "repairable.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(repairableGeometryPackage())) });
  await page.getByRole("button", { name: "Перевірити пакет (1)", exact: true }).click();
  await page.getByRole("button", { name: "Застосувати (1)", exact: true }).click();
  await page.getByText("Виправлення застосовано").waitFor();
  const mobileRepairReview = await page.getByRole("dialog").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileRepairReview.width === mobileRepairReview.clientWidth && mobileRepairReview.clientWidth <= mobileRepairReview.viewport, "mobile repair review has no horizontal overflow");
  assert(!(await page.getByRole("button", { name: /Підтвердити імпорт/ }).isDisabled()), "mobile safe repair unblocks the valid geometry");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-import-repaired-review.png") });
  await page.getByRole("button", { name: "Скасувати", exact: true }).click();
  assert(await page.getByRole("button", { name: /Підтвердити імпорт/ }).isDisabled(), "mobile undo restores the geometry errors");
  await page.getByRole("button", { name: "Змінити файли" }).click();
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles(geoJsonUpload("1111111111:11:111:1111.geojson"));
  await page.getByRole("button", { name: "Перевірити пакет (1)", exact: true }).click();
  await page.getByText(/(?:Мікронакладання|Накладання).*6820982100:04:051:0018/).waitFor();
  const mobileConflictReview = await page.getByRole("dialog").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileConflictReview.width === mobileConflictReview.clientWidth && mobileConflictReview.clientWidth <= mobileConflictReview.viewport, "mobile overlap review has no horizontal overflow");
  assert(!(await page.getByRole("button", { name: /Підтвердити імпорт/ }).isDisabled()), "mobile overlap review keeps import available");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-import-overlap-review.png") });
  await page.getByRole("button", { name: "Змінити файли" }).click();
  await page.locator('input[type="file"]:not([webkitdirectory])').setInputFiles([
    geoJsonUpload("6820982100040510018.geojson"),
    pdfUpload("6820982100040510018.pdf", "6820982100:04:051:0018"),
  ]);
  await page.getByRole("button", { name: /Перевірити пакет \(2\)/ }).click();
  await page.getByText("0 помилок").waitFor();
  const mobileImport = await page.getByRole("dialog").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileImport.width === mobileImport.clientWidth && mobileImport.clientWidth <= mobileImport.viewport, "mobile import review has no horizontal overflow");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-import-review.png") });
  await page.getByRole("dialog").getByRole("button", { name: "Закрити" }).click();
  await page.getByRole("button", { name: "Карта", exact: true }).evaluate((element) => element.click());
  await page.getByRole("button", { name: "Додати ділянку", exact: true }).evaluate((element) => element.click());
  await page.getByRole("heading", { name: "Нова ділянка" }).waitFor();
  await page.locator(".geometry-editor__neighbor").first().waitFor();
  const mobileEditor = await page.locator(".geometry-editor").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileEditor.width === mobileEditor.clientWidth && mobileEditor.clientWidth <= mobileEditor.viewport, "mobile geometry editor has no horizontal overflow");
  assert((await page.locator(".geometry-editor__toolbar button").count()) === 4, "mobile geometry editor exposes all contour commands");
  assert((await page.locator(".geometry-editor__neighbor").count()) === 4, "mobile geometry editor renders neighboring plots");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-editor.png") });
  await page.getByRole("dialog").getByRole("button", { name: "Закрити" }).click();
  await page.getByRole("button", { name: "Звіти", exact: true }).click();
  await page.getByRole("heading", { name: "Зведений звіт" }).waitFor();
  await page.getByRole("button", { name: "За ділянками", exact: true }).click();
  assert((await page.locator(".mobile-stage-report__list article").count()) === 4, "mobile status report renders one row per visible plot");
  await page.getByText("Етап 1", { exact: true }).waitFor();
  assert((await page.locator(".mobile-stage-report__stage-value").count()) === 4, "mobile status report renders the selected stage as a dedicated column");
  await page.getByRole("button", { name: "Проходження", exact: true }).click();
  assert((await page.locator(".mobile-stage-report__stage-mark").count()) === 4, "mobile progress mode renders one completion mark per plot");
  await page.getByRole("button", { name: "Дати", exact: true }).click();
  assert((await page.locator(".mobile-stage-report__stage-detail").count()) === 4, "mobile date mode renders one stage value per plot");
  await page.getByRole("button", { name: "Витрати", exact: true }).click();
  assert((await page.locator('.mobile-stage-report__mode button[aria-pressed="true"]').textContent()) === "Витрати", "mobile report keeps the selected cell mode");
  await page.getByRole("button", { name: "Наступний етап" }).click();
  await page.getByText("Етап 2 із 15", { exact: true }).waitFor();
  await page.getByText("Етап 2", { exact: true }).waitFor();
  const mobileStageReport = page.locator(".mobile-stage-report");
  await mobileStageReport.dispatchEvent("pointerdown", { pointerType: "touch", clientX: 320, clientY: 500 });
  await mobileStageReport.dispatchEvent("pointerup", { pointerType: "touch", clientX: 210, clientY: 505 });
  await page.getByText("Етап 3 із 15", { exact: true }).waitFor();
  await page.locator(".mobile-stage-report__nav select").selectOption("0");
  await page.getByText("Етап 1 із 15", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Проходження", exact: true }).click();
  const mobileReport = await page.locator(".status-report").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileReport.width === mobileReport.clientWidth && mobileReport.clientWidth <= mobileReport.viewport, "mobile status report has no horizontal overflow");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-status-report.png"), fullPage: true });
  assert((await page.locator(".mobile-nav button").count()) === 5, "mobile navigation exposes the audit tab");
  await page.getByRole("button", { name: "Журнал", exact: true }).click();
  await page.getByRole("heading", { name: "Журнал змін", exact: true }).waitFor();
  assert((await page.locator(".audit-row").count()) === 4, "mobile audit log renders entries");
  await page.locator(".audit-row summary").first().click();
  await page.getByText("Файли пакета").waitFor();
  await page.locator(".audit-row summary").first().click();
  await page.locator(".audit-row summary").nth(1).click();
  await page.getByRole("button", { name: "Порівняти та відновити", exact: true }).click();
  await page.getByRole("heading", { name: "Порівняння версій", exact: true }).waitFor();
  const mobileVersionCompare = await page.getByRole("dialog").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileVersionCompare.width === mobileVersionCompare.clientWidth && mobileVersionCompare.clientWidth <= mobileVersionCompare.viewport, "mobile version comparison has no horizontal overflow");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-version-comparison.png") });
  await page.getByRole("dialog").getByRole("button", { name: "Закрити" }).click();
  const mobileAudit = await page.locator(".audit-page").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileAudit.width === mobileAudit.clientWidth && mobileAudit.clientWidth <= mobileAudit.viewport, "mobile audit log has no horizontal overflow");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-audit-log.png") });
  await page.getByRole("button", { name: "Профіль", exact: true }).click();
  await page.getByRole("heading", { name: "Профіль", exact: true }).waitFor();
  console.log("stage=mobile");

  await page.goto(`${baseUrl}?role=user`, { waitUntil: "domcontentloaded" });
  assert((await page.getByRole("button", { name: "Додати ділянку", exact: true }).count()) === 0, "read-only mobile user cannot create plots");
  await page.getByRole("button", { name: "Ділянки", exact: true }).click();
  assert((await page.getByRole("button", { name: "Імпорт", exact: true }).count()) === 0, "mobile user cannot open bulk import");
  await page.getByRole("button", { name: "Журнал", exact: true }).click();
  await page.getByRole("heading", { name: "Журнал змін", exact: true }).waitFor();
  await page.locator(".audit-row summary").nth(1).click();
  assert((await page.getByRole("button", { name: "Порівняти та відновити", exact: true }).count()) === 0, "mobile user cannot restore versions");
  await page.getByRole("button", { name: "Карта", exact: true }).evaluate((element) => element.click());
  await page.getByRole("button", { name: "Шари", exact: true }).click();
  await page.getByText("Категорії захищено", { exact: true }).waitFor();
  await page.getByText("Ділянки, для яких категорію ще не визначено.", { exact: true }).waitFor();
  assert(!(await page.locator('.category-setting input[type="checkbox"]').first().isDisabled()), "user can toggle local layer visibility");
  assert(await page.locator('.category-setting input[type="color"]').first().isDisabled(), "user cannot change shared category colors");
  assert((await page.locator(".category-setting textarea").count()) === 0, "user sees category descriptions without edit controls");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile category descriptions have no horizontal overflow");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-user-permissions.png") });
  await page.locator(".mobile-overlay-page").getByRole("button", { name: "Закрити" }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.waitForSelector(".desktop-shell");
  assert((await page.getByTitle("Користувачі").count()) === 0, "desktop user has no user-management navigation");
  assert((await page.getByRole("button", { name: "Імпорт", exact: true }).count()) === 0, "desktop user cannot open bulk import");
  assert((await page.getByTitle("Додати ділянку").count()) === 0, "read-only desktop user cannot create plots");
  assert((await page.getByTitle("Редагувати ділянку").count()) === 0, "read-only desktop user cannot edit plots");
  await page.getByTitle("Профіль").click();
  await page.getByText("Тільки читання", { exact: true }).waitFor();
  await page.getByTitle("Карта").click();
  await page.getByRole("button", { name: "Документи", exact: true }).waitFor();
  await page.getByRole("button", { name: "Картка", exact: true }).waitFor();
  await page.getByRole("button", { name: /^Етапи \(/ }).click();
  await page.getByRole("heading", { name: "Етапи ділянки", exact: true }).waitFor();
  assert(await page.getByRole("dialog").getByRole("checkbox").first().isDisabled(), "read-only user can view but cannot change plot stages");
  assert((await page.getByRole("dialog").getByRole("button", { name: "Зберегти етапи", exact: true }).count()) === 0, "read-only stage dialog has no save action");
  await page.getByRole("dialog").locator(".form-actions").getByRole("button", { name: "Закрити", exact: true }).click();
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-desktop-read-only.png") });

  await page.goto(`${baseUrl}?role=user&access=edit`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".desktop-shell");
  assert((await page.getByTitle("Додати ділянку").count()) === 1, "editor user can create plots");
  await page.getByTitle("Редагувати ділянку").click();
  await page.getByRole("heading", { name: "Редагування ділянки", exact: true }).waitFor();
  assert((await page.getByRole("dialog").getByRole("button", { name: "Видалити", exact: true }).count()) === 0, "desktop user cannot delete plots");
  assert((await page.getByRole("dialog").getByRole("button", { name: "Зберегти", exact: true }).count()) === 1, "editor user can edit plots");
  await page.getByRole("dialog").getByRole("button", { name: "Закрити" }).click();
  await page.getByRole("button", { name: /^Етапи \(/ }).click();
  await page.getByRole("heading", { name: "Етапи ділянки", exact: true }).waitFor();
  const editorStage = page.getByRole("dialog").getByRole("checkbox", { name: /отримана згода власника/ });
  await editorStage.check();
  const editorStageDate = page.getByRole("dialog").getByLabel("Дата й час: отримана згода власника", { exact: true });
  assert(Boolean(await editorStageDate.inputValue()), "checking a plot stage assigns the current datetime");
  await editorStageDate.fill("2026-07-25T14:30");
  await page.getByRole("dialog").getByLabel("Витрати: отримана згода власника", { exact: true }).fill("1250.50");
  await page.getByRole("dialog").getByRole("button", { name: "Зберегти етапи", exact: true }).click();
  await page.getByText("Зміни ділянки збережено.", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^Етапи \(/ }).click();
  assert(await page.getByRole("dialog").getByRole("checkbox", { name: /отримана згода власника/ }).isChecked(), "editor user can mark a non-sequential plot stage as completed");
  assert((await page.getByRole("dialog").getByLabel("Дата й час: отримана згода власника", { exact: true }).inputValue()) === "2026-07-25T14:30", "plot stage completion datetime persists");
  assert(Number(await page.getByRole("dialog").getByLabel("Витрати: отримана згода власника", { exact: true }).inputValue()) === 1250.5, "plot stage expense persists");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-desktop-plot-stages-edit.png") });
  await page.getByRole("dialog").getByRole("button", { name: "Скасувати", exact: true }).click();
  await page.getByTitle("Налаштування").evaluate((element) => element.click());
  await page.getByRole("heading", { name: "Налаштування", exact: true }).waitFor();
  assert((await page.getByRole("button", { name: "Імпортувати дані", exact: true }).count()) === 0, "settings hide import from a user");
  assert((await page.getByRole("heading", { name: "Статуси ділянок", exact: true }).count()) === 0, "editor user cannot manage the status directory");
  await page.getByRole("button", { name: "Експортувати GeoJSON", exact: true }).waitFor();
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-desktop-editor-permissions.png") });
  console.log("stage=permissions");

  await page.goto(`${baseUrl}?role=user&google=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".desktop-shell");
  await page.getByTitle("Профіль").click();
  await page.getByRole("button", { name: "Підключити", exact: true }).click();
  await page.getByText("Підключено", { exact: true }).waitFor();
  assert((await page.getByRole("button", { name: "Підключити", exact: true }).count()) === 0, "linked Google account is not offered twice");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-google-link-profile.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForSelector(".mobile-shell");
  await page.getByRole("button", { name: "Профіль", exact: true }).click();
  await page.getByRole("button", { name: "Підключити", exact: true }).click();
  await page.getByText("Підключено", { exact: true }).waitFor();
  const mobileGoogleProfile = await page.locator(".profile-layout").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileGoogleProfile.width === mobileGoogleProfile.clientWidth && mobileGoogleProfile.clientWidth <= mobileGoogleProfile.viewport, "mobile Google connection has no horizontal overflow");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-google-link-profile.png") });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}?google=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".desktop-shell");
  await page.getByTitle("Профіль").click();
  assert((await page.getByText("Google", { exact: true }).count()) === 0, "administrator profile remains password-only");

  await page.goto(`${appOrigin}/sign-in`, { waitUntil: "domcontentloaded" });
  assert((await page.getByRole("button", { name: "Увійти через Google", exact: true }).count()) === 0, "sign-in hides Google until OAuth is configured");
  await page.goto(`${appOrigin}/sign-in?error=account_not_linked`, { waitUntil: "domcontentloaded" });
  await page.getByText("Google-акаунт ще не підключено до цього облікового запису.", { exact: true }).waitFor();
  await page.goto(`${appOrigin}/sign-in?error=FORBIDDEN`, { waitUntil: "domcontentloaded" });
  await page.getByText("Для цього облікового запису вхід через Google недоступний.", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Забули пароль?", exact: true }).click();
  await page.getByRole("heading", { name: "Відновлення пароля", exact: true }).waitFor();
  assert((await page.getByRole("button", { name: "Надіслати посилання", exact: true }).count()) === 1, "password recovery form is available");
  await page.goto(`${appOrigin}/reset-password`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Посилання недійсне або вже прострочене/).waitFor();
  assert((await page.getByRole("link", { name: "Запросити нове посилання", exact: true }).count()) === 1, "invalid reset link has a recovery path");
  await page.goto(`${appOrigin}/sign-up`, { waitUntil: "domcontentloaded" });
  assert((await page.getByRole("button", { name: "Зареєструватися через Google", exact: true }).count()) === 0, "sign-up hides Google until OAuth is configured");
  await page.goto(`${appOrigin}/sign-up?error=access_denied`, { waitUntil: "domcontentloaded" });
  await page.getByText("Вхід через Google скасовано.", { exact: true }).waitFor();
  console.log("stage=oauth-ui");

  const statePage = await context.newPage();
  await statePage.goto(`${appOrigin}/missing-e2e-page`, { waitUntil: "domcontentloaded" });
  await statePage.getByRole("heading", { name: "Сторінку не знайдено", exact: true }).waitFor();
  assert(await statePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "desktop not-found state has no horizontal overflow");
  await statePage.setViewportSize({ width: 390, height: 844 });
  await statePage.reload({ waitUntil: "domcontentloaded" });
  await statePage.getByRole("heading", { name: "Сторінку не знайдено", exact: true }).waitFor();
  assert(await statePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile not-found state has no horizontal overflow");
  await statePage.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-not-found.png") });
  await statePage.close();
  console.log("stage=system-states");

  assert(errors.length === 0, `browser console is clean: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, desktopPlots: 4, mobile: dimensions, downloads: ["csv", "pdf", "docx", "xlsx"] }));
  await browser.close();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});

async function expectDownload(page, action, extension, expected) {
  const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
  await action();
  const download = await downloadPromise;
  assert(download.suggestedFilename().endsWith(extension), `${extension} download has expected filename`);
  if (!expected && extension !== ".xlsx") return download.cancel();
  const target = path.join(os.tmpdir(), `geopartners-report-${Date.now()}${extension}`);
  await download.saveAs(target);
  try {
    if (extension === ".xlsx") {
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(target);
    assert(workbook.worksheets.length === 2, "Excel report contains matrix and detail sheets");
    if (expected?.kind === "wtg") {
      assert(workbook.worksheets[0].rowCount >= 5, "WTG Excel contains grouped rows");
      assert(workbook.worksheets[1].rowCount >= 3, "WTG Excel contains complete candidate details");
    } else {
      assert(workbook.worksheets[0].rowCount >= 8, "Excel matrix contains plot rows and totals");
      assert(workbook.worksheets[1].rowCount >= 46, "Excel detail sheet contains all plot-stage combinations");
    }
      if (expected) {
        assert(workbook.worksheets[0].name === expected.matrixSheet, `Excel matrix sheet is localized as ${expected.matrixSheet}`);
        assert(workbook.worksheets[1].name === expected.detailsSheet, `Excel details sheet is localized as ${expected.detailsSheet}`);
        assert(workbook.worksheets[0].getCell("A1").value === expected.xlsxTitle, `Excel title is localized as ${expected.xlsxTitle}`);
        assert(workbook.worksheets[0].getCell(expected.kind === "wtg" ? "H5" : "F5").numFmt === expected.dateFormat, `Excel dates use ${expected.dateFormat}`);
      }
    } else if (extension === ".docx") {
      const archive = unzipSync(new Uint8Array(fs.readFileSync(target)));
      const documentXml = Buffer.from(archive["word/document.xml"]).toString("utf8");
      assert(documentXml.includes(expected.fileTitle), `DOCX title is localized as ${expected.fileTitle}`);
      const tableGrids = [...documentXml.matchAll(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/g)].map((match) => [...match[1].matchAll(/<w:gridCol w:w="(\d+)"\s*\/>/g)].map((column) => Number(column[1])));
      const minimumTables = expected.kind === "wtg" ? 2 : 4;
      assert(tableGrids.length >= minimumTables, "DOCX contains the expected report tables");
      assert((documentXml.match(/<w:tblLayout w:type="autofit"\s*\/>/g) ?? []).length >= minimumTables, "DOCX tables allow Word to auto-fit preferred widths to their content");
      if (expected.kind === "wtg") {
        assert(tableGrids[0].length === 3 && tableGrids[0].reduce((sum, width) => sum + width, 0) >= 9000, "WTG DOCX candidate table uses the full page width");
        assert(tableGrids[1].length === 3 && tableGrids[1][0] >= 4800, "WTG DOCX stage table prioritizes the stage description");
      } else {
        assert(tableGrids[0].length === 4 && tableGrids[0].reduce((sum, width) => sum + width, 0) >= 9000, "DOCX plot table uses the full readable page width");
        assert(tableGrids[0][0] >= 2400 && tableGrids[0][1] >= 2400 && tableGrids[0][2] >= 1000, "DOCX plot columns have deliberate readable widths");
        assert(tableGrids.slice(1).every((widths) => widths.length === 3 && widths[0] >= 4800 && widths[0] > widths[1] && widths[1] > widths[2]), "DOCX stage tables prioritize the stage description column");
      }
    } else if (extension === ".pdf") {
      const { PDFParse } = require("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(target)) });
      try {
        const result = await parser.getText();
        assert(result.text.includes(expected.fileTitle), `PDF title is localized as ${expected.fileTitle}`);
      } finally {
        await parser.destroy();
      }
    }
  } finally {
    fs.unlinkSync(target);
  }
}

async function verifyPrintReport(page, expected) {
  await page.evaluate(() => {
    window.__reportPrintCalled = false;
    window.print = () => { window.__reportPrintCalled = true; };
  });
  await page.getByRole("button", { name: expected.printButton, exact: true }).click();
  assert(await page.evaluate(() => window.__reportPrintCalled === true), `${expected.printButton} invokes browser printing`);
  await page.emulateMedia({ media: "print" });
  assert(await page.getByRole("heading", { name: expected.heading, exact: true }).isVisible(), `print report heading is localized as ${expected.heading}`);
  assert(await page.locator(".report-matrix-wrap").isVisible(), "print report includes the stage matrix");
  assert(await page.locator(".report-export").evaluate((element) => getComputedStyle(element).display === "none"), "print report hides download controls");
  await page.emulateMedia({ media: "screen" });
}

async function drawPolygon(page) {
  const box = await page.locator(".geometry-editor__map").boundingBox();
  assert(box, "geometry map is visible");
  const points = [
    [box.x + box.width * 0.12, box.y + box.height * 0.3],
    [box.x + box.width * 0.3, box.y + box.height * 0.32],
    [box.x + box.width * 0.28, box.y + box.height * 0.72],
    [box.x + box.width * 0.14, box.y + box.height * 0.7],
  ];
  for (const [x, y] of points.slice(0, -1)) await page.mouse.click(x, y);
  await page.mouse.dblclick(points.at(-1)[0], points.at(-1)[1]);
}

async function dragFirstVertex(page, editor, deltaX, deltaY) {
  const marker = editor.locator(".leaflet-marker-pane .marker-icon").first();
  await marker.waitFor();
  const box = await marker.boundingBox();
  assert(box, "editable polygon vertex is visible");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 6 });
  await page.mouse.up();
}

async function firstVertexCenter(editor) {
  const box = await editor.locator(".leaflet-marker-pane .marker-icon").first().boundingBox();
  assert(box, "editable polygon vertex is visible");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function assert(value, message) {
  if (!value) throw new Error(`Assertion failed: ${message}`);
}

function invalidGeometryPackage() {
  return { type: "FeatureCollection", features: [
    { type: "Feature", properties: { id: "invalid-self", cadastralNumber: "1111111111:11:111:1101" }, geometry: { type: "Polygon", coordinates: [[[26.64, 49.45], [26.641, 49.451], [26.64, 49.451], [26.641, 49.45], [26.64, 49.45]]] } },
    { type: "Feature", properties: { id: "invalid-open", cadastralNumber: "1111111111:11:111:1102" }, geometry: { type: "Polygon", coordinates: [[[26.642, 49.45], [26.643, 49.45], [26.643, 49.451], [26.642, 49.451]]] } },
    { type: "Feature", properties: { id: "invalid-duplicate", cadastralNumber: "1111111111:11:111:1103" }, geometry: { type: "Polygon", coordinates: [[[26.644, 49.45], [26.6440001, 49.45], [26.645, 49.45], [26.645, 49.45], [26.645, 49.451], [26.644, 49.45]]] } },
  ] };
}

function repairableGeometryPackage() {
  return { type: "Feature", properties: { id: "repair-update", cadastralNumber: "6820982100:04:051:0018" }, geometry: { type: "Polygon", coordinates: [[
    [26.65297, 49.44633], [26.65294, 49.44369], [26.65294, 49.44369], [26.6529, 49.44171], [26.65147, 49.44226], [26.65157, 49.44588],
  ]] } };
}

function selectiveGeometryPackage() {
  return { type: "FeatureCollection", features: [
    { type: "Feature", properties: { id: "selective-invalid", cadastralNumber: "1111111111:11:111:1101" }, geometry: { type: "Polygon", coordinates: [[[26.64, 49.45], [26.641, 49.451], [26.64, 49.451], [26.641, 49.45], [26.64, 49.45]]] } },
    { type: "Feature", properties: { id: "selective-update", cadastralNumber: "6820982100:04:051:0018" }, geometry: { type: "Polygon", coordinates: [[[26.65297, 49.44633], [26.65294, 49.44369], [26.6529, 49.44171], [26.65147, 49.44226], [26.65157, 49.44588], [26.65297, 49.44633]]] } },
  ] };
}

function geoJsonUpload(name) {
  return {
    name,
    mimeType: "application/geo+json",
    buffer: Buffer.from(JSON.stringify({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [26.6529714205102, 49.446334845838],
            [26.6529425532864, 49.4436905486125],
            [26.6529020932764, 49.4417105416452],
            [26.6514738752057, 49.4422607980263],
            [26.6515718428895, 49.445879930341],
            [26.6529714205102, 49.446334845838],
          ],
        },
        properties: { type: "LineString", coordSys: "SC63" },
      }],
    })),
  };
}

function pdfUpload(name, cadastralNumber) {
  return {
    name,
    mimeType: "application/pdf",
    buffer: minimalPdf(cadastralNumber),
  };
}

function zipUpload() {
  const geo = geoJsonUpload("6820982100040510018.geojson");
  const pdf = pdfUpload("6820982100040510018.pdf", "6820982100:04:051:0018");
  return {
    name: "package.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync({
      "docs/6820982100040510018.geojson": new Uint8Array(geo.buffer),
      "docs/6820982100040510018.pdf": new Uint8Array(pdf.buffer),
      "docs/README.txt": new TextEncoder().encode("service note"),
    })),
  };
}

function minimalPdf(text) {
  const escaped = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let content = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(content));
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n`;
  content += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) content += `${String(offset).padStart(10, "0")} 00000 n \n`;
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(content);
}
