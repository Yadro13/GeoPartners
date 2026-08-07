import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

export type LandDocumentMetadata = {
  cadastralNumber: string;
  areaHa: number;
  owner: string;
  lessee: string;
  documentActualAt: string;
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
    owner: extractSubjects(ownershipLines).join(", "),
    lessee: extractSubjects(rightLines).join(", "),
    documentActualAt: extractRequestDate(normalized),
    location: extractFollowingValue(lines, /Місце розташування/i),
    purpose: extractFollowingValue(lines, /Цільове призначення/i),
  };
}

function extractSubjects(lines: string[]) {
  const subjects: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/Прізвище.*ім['’]?я.*по батькові.*фізичної/i.test(lines[index])) {
      const value = extractFieldValue(lines, index, /.*фізичної\s*/i, [/^Дата державної/i, /^Номер запису/i, /^Орган,? що/i, /^Відомості про/i]);
      if (value) subjects.push(value.replace(/^особи\s*/i, "").trim());
    } else if (/Найменування юридичної особи/i.test(lines[index])) {
      const value = extractFieldValue(lines, index, /.*Найменування юридичної особи\s*/i, [/^Код (ЄДРПОУ|РНОКПП)/i, /^Дата державної/i, /^Номер запису/i, /^Орган,? що/i, /^Вид речового права/i, /^Відомості про/i]);
      if (value) subjects.push(value);
    }
  }
  return [...new Set(subjects.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function extractFieldValue(lines: string[], index: number, label: RegExp, stops: RegExp[]) {
  const values: string[] = [];
  const sameLine = lines[index].replace(label, "").trim();
  if (sameLine) values.push(sameLine);
  for (let next = index + 1; next < lines.length; next += 1) {
    if (stops.some((pattern) => pattern.test(lines[next]))) break;
    values.push(lines[next]);
  }
  return values.join(" ").trim();
}

function extractRequestDate(text: string) {
  const match = text.match(/(?:Час\s+та\s+дата|Дата\s+та\s+час)\s+запиту\s*:?\s*(\d{1,2}):(\d{2})\s+(\d{1,2})[-./]([01]?\d)[-./](\d{4})/i);
  if (!match) return "";
  const [, , , day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function extractFollowingValue(lines: string[], label: RegExp) {
  const index = findLine(lines, label);
  if (index < 0) return "";
  const sameLine = lines[index].replace(label, "").trim();
  if (sameLine) return sameLine;
  return lines[index + 1] ?? "";
}

function findLine(lines: string[], pattern: RegExp) { return lines.findIndex((line) => pattern.test(line)); }
