type ImportFileLike = {
  name: string;
  webkitRelativePath?: string;
};

type ImportDocumentLike = {
  name: string;
  stem: string;
  cadastralNumber: string;
};

export function normalizeImportPath(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.includes("\0") || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error("Некоректний відносний шлях файлу.");
  }
  return normalized.split("/").filter((part) => part && part !== ".").join("/");
}

export function importFilePath(file: ImportFileLike) {
  return normalizeImportPath(file.webkitRelativePath || file.name);
}

export function importPathKey(path: string) {
  return normalizeImportPath(path).toLocaleLowerCase();
}

export function importPathStem(path: string) {
  return normalizeImportPath(path).replace(/\.(pdf|geojson|json)$/i, "").toLocaleLowerCase();
}

export function importPathDirectory(path: string) {
  const normalized = normalizeImportPath(path);
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? "" : normalized.slice(0, separator).toLocaleLowerCase();
}

export function importPathBasename(path: string) {
  return normalizeImportPath(path).split("/").at(-1)!;
}

export function matchImportDocument<T extends ImportDocumentLike>(geoPath: string, cadastralNumber: string, documents: T[]) {
  const directory = importPathDirectory(geoPath);
  const localDocuments = documents.filter((document) => importPathDirectory(document.name) === directory);
  const byStem = localDocuments.find((document) => document.stem === importPathStem(geoPath));
  if (byStem) return { document: byStem, ambiguous: false };

  const cadastralDigits = digits(cadastralNumber);
  if (cadastralDigits.length !== 19) return { document: null, ambiguous: false };
  const byCadastral = localDocuments.filter((document) => digits(document.cadastralNumber) === cadastralDigits);
  return byCadastral.length === 1
    ? { document: byCadastral[0], ambiguous: false }
    : { document: null, ambiguous: byCadastral.length > 1 };
}

export function appendImportFile(form: FormData, file: File) {
  const path = importFilePath(file);
  form.append("files", file, importPathBasename(path));
  form.append("paths", path);
}

export function uploadedImportFiles(form: FormData) {
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  const paths = form.getAll("paths").filter((value): value is string => typeof value === "string");
  if (paths.length && paths.length !== files.length) throw new Error("Не вдалося відновити структуру вибраних папок.");
  return files.map((file, index) => {
    const path = normalizeImportPath(paths[index] || file.name);
    return path === file.name ? file : new File([file], path, { type: file.type, lastModified: file.lastModified });
  });
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}
