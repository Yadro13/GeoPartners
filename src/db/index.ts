import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/geopartners";

const globalForDb = globalThis as unknown as { geoPartnersPool?: Pool };

export const pool = globalForDb.geoPartnersPool ?? new Pool({ connectionString, max: 10 });

if (process.env.NODE_ENV !== "production") globalForDb.geoPartnersPool = pool;

export const db = drizzle(pool, { schema });
