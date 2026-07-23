/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");
const { zipSync } = require("fflate");
const path = require("node:path");
const os = require("node:os");

const baseUrl = process.env.BASE_URL || "http://localhost:3000/ui-preview";

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${message.text()} ${message.location().url || ""}`.trim()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.removeItem("geopartners-preview"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".leaflet-overlay-pane path");
  assert((await page.locator(".leaflet-overlay-pane path").count()) === 3, "desktop map renders three plots");
  console.log("stage=map");
  await page.getByTitle("Шари").click();
  await page.getByRole("heading", { name: "Шари", exact: true }).waitFor();
  await page.getByRole("button", { name: "Супутник" }).click();
  console.log("stage=layers");

  await page.getByTitle("Звіти").click();
  await page.getByRole("heading", { name: "Зведений звіт" }).waitFor();
  await expectDownload(page, () => page.getByRole("button", { name: "CSV" }).click(), ".csv");
  console.log("stage=csv");
  await expectDownload(page, () => page.getByRole("button", { name: "Завантажити PDF" }).click(), ".pdf");
  console.log("stage=pdf");
  await expectDownload(page, () => page.getByRole("button", { name: "Завантажити DOCX" }).click(), ".docx");
  console.log("stage=docx");

  await page.getByTitle("Журнал").click();
  await page.getByRole("heading", { name: "Журнал змін", exact: true }).waitFor();
  assert((await page.locator(".audit-row").count()) === 4, "desktop audit log renders demo entries");
  await page.getByRole("button", { name: "Імпорти", exact: true }).click();
  await page.getByText("Імпорт завершено: додано 3, оновлено 0.").waitFor();
  assert((await page.locator(".audit-row").count()) === 1, "audit scope filters import events");
  await page.getByRole("button", { name: "Усі", exact: true }).click();
  await page.getByPlaceholder("Ділянка або користувач").fill("Олена");
  await page.getByText("Олена Коваль").waitFor();
  assert((await page.locator(".audit-row").count()) === 1, "audit search filters by actor");
  await page.getByPlaceholder("Ділянка або користувач").fill("");
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
  await page.locator('input[type="file"]').setInputFiles({ name: "damaged.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip") });
  await page.getByText("damaged.zip: вміст файлу не відповідає формату ZIP.").waitFor();
  await page.locator('input[type="file"]').setInputFiles(zipUpload());
  await page.getByText("1 ZIP", { exact: true }).waitFor();
  await page.getByText("1 GeoJSON", { exact: true }).waitFor();
  await page.getByText("1 PDF", { exact: true }).waitFor();
  await page.getByText(/Пропущено непідтримуваний файл: package.zip: docs\/README.txt/).waitFor();
  await page.getByRole("button", { name: "Перевірити пакет (2)", exact: true }).click();
  await page.getByText("0 помилок").waitFor();
  assert(!(await page.getByRole("button", { name: "Підтвердити імпорт (1)", exact: true }).isDisabled()), "ZIP pair reaches the normal import review");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-import-zip-review.png") });
  await page.getByRole("button", { name: "Змінити файли" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "repairable.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(repairableGeometryPackage())) });
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
  await page.locator('input[type="file"]').setInputFiles({ name: "invalid-geometries.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(invalidGeometryPackage())) });
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
  await page.locator('input[type="file"]').setInputFiles({ name: "selective.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(selectiveGeometryPackage())) });
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
  await page.locator('input[type="file"]').setInputFiles(geoJsonUpload("1111111111:11:111:1111.geojson"));
  await page.getByRole("button", { name: "Перевірити пакет (1)", exact: true }).click();
  await page.getByText(/(?:Мікронакладання|Накладання).*6820982100:04:051:0018/).waitFor();
  assert(!(await page.getByRole("button", { name: /Підтвердити імпорт/ }).isDisabled()), "overlapping import remains available during review");
  assert((await page.locator(".map-conflict-area").count()) >= 1, "import review map highlights overlap area");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-import-overlap-review.png") });
  await page.getByRole("button", { name: "Змінити файли" }).click();
  await page.locator('input[type="file"]').setInputFiles([
    geoJsonUpload("6820982100040510018.geojson"),
    pdfUpload("6820982100040510018.pdf", "6820982100:04:051:0019"),
  ]);
  await page.getByRole("button", { name: /Перевірити пакет \(2\)/ }).click();
  await page.getByText(/Кадастровий номер не збігається/).waitFor();
  assert(await page.getByRole("button", { name: /Підтвердити імпорт/ }).isDisabled(), "mismatched cadastral blocks import");
  await page.getByRole("button", { name: "Змінити файли" }).click();
  await page.locator('input[type="file"]').setInputFiles([
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
  await page.getByLabel("Назва").fill("Тестова ділянка");
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
  await page.getByLabel("Назва").fill("Оновлена тестова ділянка");
  await page.getByRole("button", { name: "Зберегти", exact: true }).click();
  await page.getByText("Зміни ділянки збережено.").waitFor();
  await page.reload();
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("geopartners-preview") || "{}").plots?.find((plot) => plot.properties.name === "Оновлена тестова ділянка"));
  assert(persisted, "edited plot persists after reload");
  assert(JSON.stringify(persisted.geometry) !== JSON.stringify(JSON.parse(originalGeometry)), "edited contour persists after reload");
  assert(String(persisted.properties.areaHa) === editedArea, "calculated area persists after reload");
  await page.waitForSelector(".leaflet-overlay-pane path");
  await page.waitForSelector(".leaflet-tile-loaded");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-desktop-smoke.png") });
  console.log("stage=crud");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForSelector(".mobile-shell");
  await page.waitForSelector(".leaflet-overlay-pane path");
  await page.waitForSelector(".leaflet-tile-loaded");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-smoke.png") });
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight }));
  assert(dimensions.width === dimensions.viewportWidth && dimensions.height === dimensions.viewportHeight, "mobile shell has no page overflow");
  await page.getByRole("button", { name: "Ділянки", exact: true }).click();
  assert((await page.locator(".plot-row").count()) === 4, "mobile list contains saved plots");
  await page.getByRole("button", { name: "Імпорт", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "selective.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(selectiveGeometryPackage())) });
  await page.getByRole("button", { name: "Перевірити пакет (1)", exact: true }).click();
  await page.getByLabel("Імпортувати 1111111111:11:111:1101", { exact: true }).uncheck();
  await page.getByText("1/2 вибрано").waitFor();
  const mobileSelectionReview = await page.getByRole("dialog").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileSelectionReview.width === mobileSelectionReview.clientWidth && mobileSelectionReview.clientWidth <= mobileSelectionReview.viewport, "mobile candidate selection has no horizontal overflow");
  assert(!(await page.getByRole("button", { name: "Підтвердити імпорт (1)", exact: true }).isDisabled()), "mobile candidate selection unblocks the valid subset");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-import-selection-review.png") });
  await page.getByRole("button", { name: "Змінити файли" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "repairable.geojson", mimeType: "application/geo+json", buffer: Buffer.from(JSON.stringify(repairableGeometryPackage())) });
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
  await page.locator('input[type="file"]').setInputFiles(geoJsonUpload("1111111111:11:111:1111.geojson"));
  await page.getByRole("button", { name: "Перевірити пакет (1)", exact: true }).click();
  await page.getByText(/(?:Мікронакладання|Накладання).*6820982100:04:051:0018/).waitFor();
  const mobileConflictReview = await page.getByRole("dialog").evaluate((element) => ({ width: element.scrollWidth, clientWidth: element.clientWidth, viewport: innerWidth }));
  assert(mobileConflictReview.width === mobileConflictReview.clientWidth && mobileConflictReview.clientWidth <= mobileConflictReview.viewport, "mobile overlap review has no horizontal overflow");
  assert(!(await page.getByRole("button", { name: /Підтвердити імпорт/ }).isDisabled()), "mobile overlap review keeps import available");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-import-overlap-review.png") });
  await page.getByRole("button", { name: "Змінити файли" }).click();
  await page.locator('input[type="file"]').setInputFiles([
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
  await page.getByRole("button", { name: "Ділянки", exact: true }).click();
  assert((await page.getByRole("button", { name: "Імпорт", exact: true }).count()) === 0, "mobile user cannot open bulk import");
  await page.getByRole("button", { name: "Журнал", exact: true }).click();
  await page.getByRole("heading", { name: "Журнал змін", exact: true }).waitFor();
  await page.locator(".audit-row summary").nth(1).click();
  assert((await page.getByRole("button", { name: "Порівняти та відновити", exact: true }).count()) === 0, "mobile user cannot restore versions");
  await page.getByRole("button", { name: "Карта", exact: true }).evaluate((element) => element.click());
  await page.getByRole("button", { name: "Шари", exact: true }).click();
  await page.getByText("Категорії захищено", { exact: true }).waitFor();
  assert(!(await page.locator('.category-setting input[type="checkbox"]').first().isDisabled()), "user can toggle local layer visibility");
  assert(await page.locator('.category-setting input[type="color"]').first().isDisabled(), "user cannot change shared category colors");
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-mobile-user-permissions.png") });
  await page.locator(".mobile-overlay-page").getByRole("button", { name: "Закрити" }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.waitForSelector(".desktop-shell");
  assert((await page.getByTitle("Користувачі").count()) === 0, "desktop user has no user-management navigation");
  assert((await page.getByRole("button", { name: "Імпорт", exact: true }).count()) === 0, "desktop user cannot open bulk import");
  assert((await page.getByTitle("Додати ділянку").count()) === 1, "desktop user can create plots");
  await page.getByTitle("Редагувати ділянку").click();
  await page.getByRole("heading", { name: "Редагування ділянки", exact: true }).waitFor();
  assert((await page.getByRole("dialog").getByRole("button", { name: "Видалити", exact: true }).count()) === 0, "desktop user cannot delete plots");
  assert((await page.getByRole("dialog").getByRole("button", { name: "Зберегти", exact: true }).count()) === 1, "desktop user can edit plots");
  await page.getByRole("dialog").getByRole("button", { name: "Закрити" }).click();
  await page.getByTitle("Налаштування").evaluate((element) => element.click());
  await page.getByRole("heading", { name: "Налаштування", exact: true }).waitFor();
  assert((await page.getByRole("button", { name: "Імпортувати дані", exact: true }).count()) === 0, "settings hide import from a user");
  await page.getByRole("button", { name: "Експортувати GeoJSON", exact: true }).waitFor();
  await page.screenshot({ path: path.join(os.tmpdir(), "geopartners-desktop-user-permissions.png") });
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

  const appOrigin = new URL(baseUrl).origin;
  await page.goto(`${appOrigin}/sign-in`, { waitUntil: "domcontentloaded" });
  assert((await page.getByRole("button", { name: "Увійти через Google", exact: true }).count()) === 0, "sign-in hides Google until OAuth is configured");
  await page.getByRole("link", { name: "Забули пароль?", exact: true }).click();
  await page.getByRole("heading", { name: "Відновлення пароля", exact: true }).waitFor();
  assert((await page.getByRole("button", { name: "Надіслати посилання", exact: true }).count()) === 1, "password recovery form is available");
  await page.goto(`${appOrigin}/reset-password`, { waitUntil: "domcontentloaded" });
  await page.getByText(/Посилання недійсне або вже прострочене/).waitFor();
  assert((await page.getByRole("link", { name: "Запросити нове посилання", exact: true }).count()) === 1, "invalid reset link has a recovery path");
  await page.goto(`${appOrigin}/sign-up`, { waitUntil: "domcontentloaded" });
  assert((await page.getByRole("button", { name: "Зареєструватися через Google", exact: true }).count()) === 0, "sign-up hides Google until OAuth is configured");
  console.log("stage=oauth-ui");

  assert(errors.length === 0, `browser console is clean: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, desktopPlots: 4, mobile: dimensions, downloads: ["csv", "pdf", "docx"] }));
  await browser.close();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});

async function expectDownload(page, action, extension) {
  const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
  await action();
  const download = await downloadPromise;
  assert(download.suggestedFilename().endsWith(extension), `${extension} download has expected filename`);
  await download.cancel();
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
