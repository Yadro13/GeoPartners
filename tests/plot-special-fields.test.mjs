import assert from "node:assert/strict";
import test from "node:test";
import { formatPlotSpecialDetails, plotIdentityKey, sourcePlotIdentifier } from "../src/lib/plot-special-fields.ts";

const baseProperties = {
  id: "plot-1",
  cadastralNumber: "utg_road_1",
  name: "",
  category: "roads",
  areaHa: 1.25,
  projectCapacity: 0,
  mainCandidateCadastral: "",
  owner: "",
  lessee: "",
  resultLinks: [{ type: "road", number: "1" }],
};

test("plot identity normalizes cadastral numbers and textual identifiers", () => {
  assert.equal(plotIdentityKey("6820982100:04:051:0018"), "cad:6820982100040510018");
  assert.equal(plotIdentityKey("UTG_Road_1"), "id:utg_road_1");
});

test("GeoJSON without cadastral metadata uses the filename stem as identifier", () => {
  assert.equal(sourcePlotIdentifier("folder/utg_road_1.geojson"), "utg_road_1");
  assert.equal(sourcePlotIdentifier("folder/road.geojson", 1, 3), "road-2");
});

test("special report details are localized and include specialized values", () => {
  const road = formatPlotSpecialDetails({ ...baseProperties, roadOwnershipType: "municipal" }, "road", "uk");
  assert.match(road, /Комунальна/);
  const servitude = formatPlotSpecialDetails({ ...baseProperties, servitudeValidFrom: "2026-08-01", servitudeValidUntil: "2027-08-01", servitudePaymentAmount: 1200, servitudePaymentPeriod: "yearly" }, "servitude", "en");
  assert.match(servitude, /yearly/);
  const substation = formatPlotSpecialDetails({ ...baseProperties, substationType: "110\/35 kV", substationCapacityMw: 80 }, "substation", "de");
  assert.match(substation, /80 MW/);
});
