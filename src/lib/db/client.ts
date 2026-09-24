import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { AppError } from "@/lib/schemas/errors";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

let db: Db | null = null;

/**
 * Lazily creates the Drizzle client over Neon's HTTP driver (one round trip
 * per query, good for serverless). Lazy so `next build` works without DATABASE_URL.
 */
export function getDb(): Db {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new AppError("INTERNAL", { message: "DATABASE_URL is not set" });
  }
  db = drizzle({ client: neon(url), schema });
  return db;
}
