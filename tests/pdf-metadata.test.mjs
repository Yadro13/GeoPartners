import assert from "node:assert/strict";
import test from "node:test";
import { extractLandDocumentMetadata } from "../src/lib/pdf-metadata.ts";

const sample = `
Інформація Державного земельного кадастру
Час та дата запиту: 09:07 05-08-2026
Кадастровий номер земельної ділянки 6820982100:04:051:0018
Площа земельної ділянки 4.7236
Відомості про суб'єктів права власності на земельну ділянку
Прізвище, ім'я та по батькові фізичної
особи Яржемська Раїса Андріївна
Дата державної реєстрації права 01.01.2020
Прізвище, ім'я та по батькові фізичної
особи Петренко Олена Іванівна
Дата державної реєстрації права 02.01.2020
Відомості про суб'єкта речового права на земельну ділянку
Вид речового права Право оренди землі
Найменування юридичної особи ФЕРМЕРСЬКЕ ГОСПОДАРСТВО
"ДОВГА НАЗВА"
ДРУГИЙ РЯДОК НАЗВИ
Код ЄДРПОУ юридичної особи 12345678
`;

test("extracts document currency, every owner, and the full multiline lessee", () => {
  const metadata = extractLandDocumentMetadata(sample);

  assert.equal(metadata.documentActualAt, "2026-08-05");
  assert.equal(metadata.owner, "Яржемська Раїса Андріївна, Петренко Олена Іванівна");
  assert.equal(metadata.lessee, 'ФЕРМЕРСЬКЕ ГОСПОДАРСТВО "ДОВГА НАЗВА" ДРУГИЙ РЯДОК НАЗВИ');
});

test("leaves optional document fields empty when a PDF block is absent", () => {
  const metadata = extractLandDocumentMetadata("Кадастровий номер земельної ділянки 6820982100:04:051:0019");

  assert.equal(metadata.documentActualAt, "");
  assert.equal(metadata.owner, "");
  assert.equal(metadata.lessee, "");
});
