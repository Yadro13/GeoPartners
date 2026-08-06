import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, category, plot, plotStatus, plotVersion } from "@/db/schema";
import { defaultCategories, type CategoryDefinition } from "@/data/demo";
import type { PlotFeature } from "@/components/workspace/types";
import { getCurrentUser } from "@/lib/access";
import { deleteDocument, putDocument } from "@/lib/document-storage";
import { normalizeImport } from "@/lib/plot-data";
import { parseLandDocument, type LandDocumentMetadata } from "@/lib/pdf-metadata";
import { featureToPlotValues, plotRowToFeature } from "@/lib/plots";
import { findPlotConflicts, validatePolygonGeometry } from "@/lib/geometry";
import { auditValues, changedPlotFields, versionSnapshot } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { getDataWorkspace } from "@/lib/data-workspace";
import { readPdfBuffer, validateUploadFiles } from "@/lib/import-upload";
import { errorFields, serverLog } from "@/lib/server-log";
import { plotIdentityKey } from "@/lib/plot-special-fields";
import { mergeExistingPlotForImport } from "@/lib/import-merge";
import { importPathKey, importPathStem, matchImportDocument, uploadedImportFiles } from "@/lib/import-file-path";

export const runtime = "nodejs";

type ParsedPdf = { name: string; file: File; buffer: Buffer; stem: string; cadastralNumber: string; metadata: LandDocumentMetadata };
type ExistingPlot = typeof plot.$inferSelect;
type PreparedPlot = { feature: PlotFeature; document?: ParsedPdf; existing?: ExistingPlot; category: CategoryDefinition; pdfObjectKey: string | null };

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.approvalStatus !== "approved") return NextResponse.json({ error: "Не авторизовано." }, { status: 401 });
  if (!hasPermission(currentUser, "imports.run")) return NextResponse.json({ error: "Імпорт доступний лише адміністратору." }, { status: 403 });
  const startedAt = Date.now();
  const workspace = await getDataWorkspace();
  const uploadedKeys: string[] = [];
  try {
    const form = await request.formData(); const files = uploadedImportFiles(form);
    validateUploadFiles(files);
    const geoFiles = files.filter((file) => /\.(geo)?json$/i.test(file.name)); const pdfFiles = files.filter((file) => /\.pdf$/i.test(file.name));
    serverLog("info", "import.started", { workspace, fileCount: files.length, geoJsonCount: geoFiles.length, pdfCount: pdfFiles.length });
    if (!geoFiles.length) throw new Error("Додайте хоча б один GeoJSON з координатами.");
    const [pdfs, existingRows, statusRows] = await Promise.all([Promise.all(pdfFiles.map(parsePdfFile)), db.select().from(plot).where(eq(plot.workspace, workspace)), db.select({ id: plotStatus.id, name: plotStatus.name }).from(plotStatus).where(eq(plotStatus.workspace, workspace)).orderBy(asc(plotStatus.sortOrder))]);
    const existingByIdentity = new Map(existingRows.map((row) => [plotIdentityKey(row.cadastralNumber), row]));
    const knownStatuses = new Set(statusRows.map(({ name }) => name));
    const knownStatusIds = new Set(statusRows.map(({ id }) => id));
    const importedCategories: Record<string, CategoryDefinition> = {}; const warnings: string[] = []; const usedPdfs = new Set<string>(); const prepared: PreparedPlot[] = []; const batchCadastrals = new Set<string>();

    for (const geoFile of geoFiles) {
      const parsed = normalizeImport(JSON.parse(await geoFile.text()), geoFile.name);
      if (parsed.skipped.length) throw new Error(parsed.skipped.join(" "));
      Object.assign(importedCategories, parsed.categories);
      for (const original of parsed.plots) {
        const geoStem = importPathStem(geoFile.name); const geoCad = cadastralDigits(original.properties.cadastralNumber);
        const match = matchImportDocument(geoFile.name, original.properties.cadastralNumber, pdfs); let document = match.document ?? undefined;
        if (match.ambiguous) warnings.push(`${geoFile.name}: у цій папці знайдено кілька PDF з тим самим кадастровим номером; GeoJSON імпортовано без документа.`);
        if (document && geoCad.length === 19 && document.metadata.cadastralNumber && cadastralDigits(document.metadata.cadastralNumber) !== geoCad) throw new Error(`Кадастровий номер у ${geoFile.name} не збігається з ${document.file.name}.`);
        if (document) usedPdfs.add(importPathKey(document.file.name));
        const metadata = document?.metadata;
        let feature: PlotFeature = { ...original, properties: { ...original.properties, cadastralNumber: metadata?.cadastralNumber || original.properties.cadastralNumber, areaHa: metadata?.areaHa || original.properties.areaHa, owner: metadata?.owner || original.properties.owner, lessee: metadata?.lessee || original.properties.lessee, documentActualAt: metadata?.documentActualAt || original.properties.documentActualAt, sourceFilename: original.properties.sourceFilename || geoStem } };
        if (feature.properties.status && !knownStatuses.has(feature.properties.status)) {
          warnings.push(`${geoFile.name}: статус «${feature.properties.status}» відсутній у довіднику; ділянку імпортовано без статусу.`);
          feature.properties.status = "";
        }
        const unknownProgress = (feature.properties.statusProgress ?? []).filter(({ statusId }) => !knownStatusIds.has(statusId));
        if (unknownProgress.length) {
          warnings.push(`${geoFile.name}: частина етапів відсутня у довіднику; невідомі етапи пропущено.`);
          feature.properties.statusProgress = (feature.properties.statusProgress ?? []).filter(({ statusId }) => knownStatusIds.has(statusId));
        }
        if (!(feature.properties.statusProgress?.length) && feature.properties.status) {
          const legacyStatus = statusRows.find(({ name }) => name === feature.properties.status);
          if (legacyStatus) feature.properties.statusProgress = [{ statusId: legacyStatus.id, completedAt: new Date().toISOString(), cost: null }];
        }
        const identity = plotIdentityKey(feature.properties.cadastralNumber);
        if (batchCadastrals.has(identity)) throw new Error(`${feature.properties.cadastralNumber}: кадастровий номер або ідентифікатор повторюється у пакеті.`);
        batchCadastrals.add(identity);
        const existing = existingByIdentity.get(identity);
        if (existing) {
          const merged = mergeExistingPlotForImport(feature, plotRowToFeature(existing), { incomingDocumentName: document?.file.name, decisions: feature.properties.importDecisions });
          feature = merged.plot;
          if (!merged.includeDocument) document = undefined;
        }
        const completedStatusIds = new Set((feature.properties.statusProgress ?? []).map(({ statusId }) => statusId));
        feature.properties.status = [...statusRows].reverse().find(({ id }) => completedStatusIds.has(id))?.name ?? "";
        const categoryId = feature.properties.category || "default"; const categoryDefinition = importedCategories[categoryId] ?? defaultCategories[categoryId] ?? { name: categoryId, description: "", color: "#2f86a6", visible: true };
        importedCategories[categoryId] = categoryDefinition;
        prepared.push({ feature, document, existing, category: categoryDefinition, pdfObjectKey: existing?.pdfObjectKey ?? null });
      }
    }
    for (const pdf of pdfs) if (!usedPdfs.has(importPathKey(pdf.file.name))) warnings.push(`${pdf.file.name}: не знайдено відповідний GeoJSON, PDF не імпортовано.`);
    if (!prepared.length) throw new Error("У пакеті немає придатних ділянок.");
    for (const item of prepared) {
      const validation = validatePolygonGeometry(item.feature.geometry); const errors = validation.issues.filter(({ level }) => level === "error");
      if (errors.length) throw new Error(`${item.feature.properties.cadastralNumber}: ${errors.map(({ message }) => message).join(" ")}`);
      warnings.push(...validation.issues.filter(({ level }) => level === "warning").map(({ message }) => `${item.feature.properties.cadastralNumber}: ${message}`));
    }
    const finalPlots = new Map(existingRows.map((row) => [row.id, plotRowToFeature(row)]));
    for (const item of prepared) finalPlots.set(item.feature.properties.id, item.feature);
    const overlapPairs = new Set<string>();
    for (const item of prepared) {
      const neighbors = [...finalPlots.values()].filter(({ properties }) => properties.id !== item.feature.properties.id);
      const conflicts = findPlotConflicts(item.feature.geometry, neighbors);
      for (const conflict of conflicts) {
        const pairKey = [item.feature.properties.id, conflict.plotId].sort().join(":");
        if (overlapPairs.has(pairKey)) continue;
        overlapPairs.add(pairKey);
        warnings.push(`${item.feature.properties.cadastralNumber}: накладання з ${conflict.cadastralNumber}; координати GeoJSON збережено без змін.`);
      }
    }

    const batchId = crypto.randomUUID();
    const addedCount = prepared.filter(({ existing }) => !existing).length; const updatedCount = prepared.length - addedCount;
    try {
      for (const item of prepared) if (item.document) {
        item.pdfObjectKey = `plots/${workspace}/${item.feature.properties.id}/${batchId}-${safeFilename(item.document.file.name)}`;
        await putDocument(item.pdfObjectKey, item.document.buffer); uploadedKeys.push(item.pdfObjectKey);
      }
      await db.transaction(async (tx) => {
        for (const [id, item] of Object.entries(importedCategories)) {
          const systemRole = defaultCategories[id]?.systemRole ?? null;
          await tx.insert(category).values({ workspace, id, ...item, systemRole }).onConflictDoNothing({ target: [category.workspace, category.id] });
        }
        for (const item of prepared) {
          const values = { ...featureToPlotValues(item.feature), pdfObjectKey: item.pdfObjectKey };
          if (item.existing) await tx.update(plot).set(values).where(and(eq(plot.workspace, workspace), eq(plot.id, item.existing.id)));
          else await tx.insert(plot).values({ ...values, workspace });
          const before = item.existing ? plotRowToFeature(item.existing) : null; const changes = changedPlotFields(before, item.feature);
          const auditId = crypto.randomUUID();
          await tx.insert(auditLog).values({ id: auditId, ...auditValues(currentUser, workspace, { action: item.existing ? "plot.updated" : "plot.created", entityType: "plot", entityId: item.feature.properties.id, cadastralNumber: item.feature.properties.cadastralNumber, summary: `${item.existing ? "Оновлено" : "Створено"} ділянку ${item.feature.properties.cadastralNumber} через імпорт.`, details: { changes, source: "import", batchId, document: item.document?.file.name ?? null } }) });
          if (item.existing) await tx.insert(plotVersion).values({ workspace, plotId: item.existing.id, auditLogId: auditId, action: "plot.updated", snapshot: versionSnapshot(item.existing), createdBy: currentUser.id });
        }
        await tx.insert(auditLog).values(auditValues(currentUser, workspace, { action: "import.completed", entityType: "import", entityId: batchId, summary: `Імпорт завершено: додано ${addedCount}, оновлено ${updatedCount}.`, details: { added: addedCount, updated: updatedCount, files: files.map(({ name }) => name), cadastralNumbers: prepared.map(({ feature }) => feature.properties.cadastralNumber) } }));
      });
    } catch (error) {
      await Promise.all(uploadedKeys.map((key) => deleteDocument(key))); throw error;
    }

    const savedRows = await db.select().from(plot).where(eq(plot.workspace, workspace)); const savedById = new Map(savedRows.map((row) => [row.id, row]));
    serverLog("info", "import.completed", { workspace, added: addedCount, updated: updatedCount, warningCount: warnings.length, durationMs: Date.now() - startedAt });
    return NextResponse.json({ plots: prepared.map((item) => plotRowToFeature(savedById.get(item.feature.properties.id)!)), categories: importedCategories, warnings });
  } catch (error) {
    serverLog("error", "import.failed", { workspace, uploadedCount: uploadedKeys.length, durationMs: Date.now() - startedAt, ...errorFields(error) });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не вдалося імпортувати пакет." }, { status: 400 });
  }
}

async function parsePdfFile(file: File): Promise<ParsedPdf> { const buffer = await readPdfBuffer(file); const metadata = await parseLandDocument(buffer); return { name: file.name, file, buffer, stem: importPathStem(file.name), cadastralNumber: metadata.cadastralNumber, metadata }; }
function cadastralDigits(value: string) { return value.replace(/\D/g, ""); }
function safeFilename(name: string) { return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160); }
