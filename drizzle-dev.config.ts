import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "./.db.env" });

export default defineConfig({
  out: "./src/drizzle/migrations",
  schema: "./src/drizzle/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // biome-ignore lint/style/noNonNullAssertion: env variables must exist
    url: process.env.DATABASE_URL!,
  },
});
