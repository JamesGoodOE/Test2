import type { Repository } from "@/lib/db/repository";
import { MemoryRepository } from "@/lib/db/memory-repo";

// Repository factory. DATA_STORE=memory (default) returns the seeded in-memory
// repo so the app runs with no external services. DATA_STORE=postgres would
// return a Postgres-backed implementation of the same interface (db/schema.sql
// is the production data model; the Supabase client wiring is a Phase-1 follow-up
// that drops in behind this factory without touching call sites).
let instance: Repository | null = null;

export function getRepository(): Repository {
  if (instance) return instance;
  const mode = process.env.DATA_STORE ?? "memory";
  switch (mode) {
    case "postgres":
      throw new Error(
        "DATA_STORE=postgres selected but the Postgres repository is not wired in this build. " +
          "Apply db/schema.sql and implement a PgRepository behind lib/db/repository.ts.",
      );
    case "memory":
    default:
      instance = new MemoryRepository();
      return instance;
  }
}
