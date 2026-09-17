import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

type Database = PostgresJsDatabase & { $client: postgres.Sql };

const getDB = (env: Pick<CloudflareBindings, "DATABASE_URL">): Database => {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  //callers must close db.$client after use.
  const client = postgres(env.DATABASE_URL, {
    prepare: false,
    max: 1,
  });

  return drizzle(client);
};

export default getDB;


