import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

export type LandDocumentMetadata = {
  cadastralNumber: string;
  areaHa: number;
  owner: string;
  lessee: string;
  location: string;
  purpose: string;
};

export async function parseLandDocument(buffer: Buffer): Promise<LandDocumentMetadata> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return extractLandDocumentMetadata(result.text);
  } finally {
    await parser.destroy();
  }
}

export function extractLandDocumentMetadata(text: string): LandDocumentMetadata {
  const normalized = text.replaceAll("\r", "").replace(/[ \t]+/g, " ");
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const cadastralMatch = normalized.match(/\b(\d{10})\s*[:\-]?\s*(\d{2})\s*[:\-]?\s*(\d{3})\s*[:\-]?\s*(\d{4})\b/);
  const areaMatch = normalized.match(/Площа земельної ділянки\s+([\d.,]+)/i);
  const ownershipStart = findLine(lines, /Відомості про суб'єктів права власності/i);
  const rightStart = findLine(lines, /Відомості про суб'єкт(?:а|ів) речового права/i);
  const ownershipLines = lines.slice(Math.max(0, ownershipStart), rightStart > ownershipStart ? rightStart : lines.length);
  const rightLines = rightStart >= 0 ? lines.slice(rightStart) : [];

  return {
    cadastralNumber: cadastralMatch ? `${cadastralMatch[1]}:${cadastralMatch[2]}:${cadastralMatch[3]}:${cadastralMatch[4]}` : "",
    areaHa: areaMatch ? Number(areaMatch[1].replace(",", ".")) || 0 : 0,
    owner: extractPerson(ownershipLines) || extractLegalEntity(ownershipLines),
    lessee: extractLegalEntity(rightLines) || extractPerson(rightLines),
    location: extractFollowingValue(lines, /Місце розташування/i),
    purpose: extractFollowingValue(lines, /Цільове призначення/i),
  };
}

function extractPerson(lines: string[]) {
  const index = findLine(lines, /Прізвище.*ім['’]?я.*по батькові.*фізичної/i);
  if (index < 0) return "";
  const sameLine = lines[index].replace(/.*фізичної\s*/i, "").replace(/^особи\s*/i, "").trim();
  if (sameLine) return sameLine;
  const candidate = lines.slice(index + 1, index + 4).find((line) => !/^особи$/i.test(line) && !/^Дата /i.test(line)) ?? "";
  return candidate.replace(/^особи\s+/i, "").trim();
}

function extractLegalEntity(lines: string[]) {
  const index = findLine(lines, /Найменування юридичної особи/i);
  if (index < 0) return "";
  const sameLine = lines[index].replace(/.*Найменування юридичної особи\s*/i, "").trim();
  const after = lines[index + 1] ?? "";
  const suffix = after && !/^Код /i.test(after) ? after : "";
  return [sameLine, suffix].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function extractFollowingValue(lines: string[], label: RegExp) {
  const index = findLine(lines, label);
  if (index < 0) return "";
  const sameLine = lines[index].replace(label, "").trim();
  if (sameLine) return sameLine;
  return lines[index + 1] ?? "";
}

function findLine(lines: string[], pattern: RegExp) { return lines.findIndex((line) => pattern.test(line)); }
