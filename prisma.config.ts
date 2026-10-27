// Konfiguracja Prisma CLI (migracje, generowanie klienta).
// Dokumentacja: https://pris.ly/prisma-config
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migracje idą przez połączenie bezpośrednie / „session pooler” (port 5432),
    // a aplikacja w czasie działania używa DATABASE_URL (patrz src/lib/db.ts).
    url: process.env["DIRECT_URL"],
  },
});
