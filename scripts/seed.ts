// Demo seed helper. The in-memory repository self-seeds on first use
// (see lib/db/memory-repo.ts), so this script simply prints the demo accounts.
// For a Postgres deployment, translate db/schema.sql seed rows here.

console.log("Registry demo tenant seeds on first use. Demo accounts:");
console.log("  admin@demo.test    (ADMIN)");
console.log("  contrib@demo.test  (CONTRIBUTOR)");
console.log("  viewer@demo.test   (VIEWER)");
console.log("Seeded vendor: Acme AI Ltd");
