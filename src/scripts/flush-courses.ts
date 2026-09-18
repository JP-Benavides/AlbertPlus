import { config } from "dotenv";
import { flushCourses } from "../courses";

export async function runFlushCourses(): Promise<void> {
  config({ path: "./.db.env", quiet: true });
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl?.trim()) {
    console.error(
      "DATABASE_URL is missing. Set it in .db.env or your environment.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const url = new URL(databaseUrl);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      throw new Error("Unsupported database protocol");
    }
  } catch {
    console.error("DATABASE_URL must be a valid PostgreSQL connection string.");
    process.exitCode = 1;
    return;
  }

  try {
    const result = await flushCourses({ DATABASE_URL: databaseUrl });
    console.log(JSON.stringify(result, null, 2));
  } catch {
    // Driver errors may include credentials, SQL parameters, or scraped data.
    console.error(
      "Course flush failed. Check database connectivity, the courses schema, and completed course results.",
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await runFlushCourses();
}
