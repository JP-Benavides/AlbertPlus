/** biome-ignore-all lint/correctness/noUnusedFunctionParameters: bypass for now */
import { type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as z from "zod/mini";
import type {
  ZUpsertProgramWithRequirements,
  ZUpsertRequirements,
} from "../../lib/schemas";

type RequirementItem = z.infer<typeof ZUpsertRequirements>[number];

export type ProgramRequirement =
  | Omit<Extract<RequirementItem, { type: "required" }>, "programId">
  | Omit<Extract<RequirementItem, { type: "alternative" }>, "programId">
  | Omit<Extract<RequirementItem, { type: "options" }>, "programId">;

export async function discoverPrograms(url: string): Promise<string[]> {
  // TODO: implement this function
  return [];
}

export async function scrapeProgram(
  url: string,
  db: PostgresJsDatabase,
  env: CloudflareBindings,
): Promise<{
  program: Omit<z.infer<typeof ZUpsertProgramWithRequirements>, "requirements">;
  requirements: ProgramRequirement[];
}> {
  // TODO: implement this function
  throw new Error("Not implemented");
}
