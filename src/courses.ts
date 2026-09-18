import { and, asc, eq, sql } from "drizzle-orm";
import { array } from "zod/mini";
import getDB from "./drizzle";
import { courses, jobs } from "./drizzle/schema";
import { JobError } from "./lib/queue";
import { ZUpsertCourseWithPrerequisites } from "./lib/schemas";

const courseResultsSchema = array(ZUpsertCourseWithPrerequisites);
const UPSERT_BATCH_SIZE = 100;

export const flushCourses = async (env: {
  DATABASE_URL: string;
}): Promise<{ jobsProcessed: number; coursesUpserted: number }> => {
  const db = getDB(env);

  try {
    const results = await db
      .select({ jobId: jobs.id, result: jobs.result })
      .from(jobs)
      .where(and(eq(jobs.status, "completed"), eq(jobs.jobType, "course")))
      // Later entries replace older results before any database writes.
      .orderBy(asc(jobs.completedAt), asc(jobs.id));

    let jobsProcessed = 0;
    let coursesUpserted = 0;
    const uniqueCourses = new Map<string, typeof courses.$inferInsert>();

    for (const job of results) {
      const parsed = courseResultsSchema.safeParse(job.result);
      if (!parsed.success) {
        throw new JobError(
          `Invalid course results for job ${job.jobId}: ${parsed.error.message}`,
          "validation",
        );
      }

      // PostgreSQL cannot update the same conflict key twice in one insert.
      for (const course of parsed.data) {
        uniqueCourses.set(course.code, {
          code: course.code,
          level: String(course.level),
          title: course.title,
          school: course.school,
          credits: String(course.credits),
          program: course.program,
          programName: course.programName,
          prerequisites: course.prerequisites,
          metadata: {
            courseUrl: course.courseUrl,
            description: course.description,
          },
        });
      }

      jobsProcessed++;
    }

    const rows = [...uniqueCourses.values()];
    if (rows.length > 0) {
      // Commit the flush together, even when it requires multiple batches.
      await db.transaction(async (tx) => {
        for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
          const changed = await tx
            .insert(courses)
            .values(rows.slice(i, i + UPSERT_BATCH_SIZE))
            .onConflictDoUpdate({
              target: courses.code,
              set: {
                level: sql`excluded.level`,
                title: sql`excluded.title`,
                school: sql`excluded.school`,
                credits: sql`excluded.credits`,
                program: sql`excluded.program`,
                programName: sql`excluded.program_name`,
                prerequisites: sql`excluded.prerequisites`,
                metadata: sql`excluded.metadata`,
              },
              // Null-safe comparison, including JSONB values. Unchanged
              // conflicts are checked but do not receive an UPDATE.
              setWhere: sql`(
                  ${courses.level}, ${courses.title}, ${courses.school},
                  ${courses.credits}, ${courses.program}, ${courses.programName},
                  ${courses.prerequisites}, ${courses.metadata}
                ) IS DISTINCT FROM (
                  excluded.level, excluded.title, excluded.school,
                  excluded.credits, excluded.program, excluded.program_name,
                  excluded.prerequisites, excluded.metadata
                )`,
            })
            .returning({ code: courses.code });
          coursesUpserted += changed.length;
        }
      });
    }

    // Keep source job results available for inspection and reruns.
    return { jobsProcessed, coursesUpserted };
  } finally {
    await db.$client.end();
  }
};
