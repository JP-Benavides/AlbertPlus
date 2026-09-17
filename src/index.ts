import { count, desc, eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import { html } from "hono/html";
import getDB from "./drizzle";
import { errorLogs, jobs } from "./drizzle/schema";
import { JobError, type JobMessage } from "./lib/queue";
import {
  ZUpsertCourseOfferings,
  ZUpsertCourseWithPrerequisites,
  ZUpsertProgramWithRequirements,
} from "./lib/schemas";
import {
  discoverCourseOfferings,
  scrapeCourseOfferings,
} from "./modules/courseOfferings";
import { discoverCourses, scrapeCourse } from "./modules/courses";
import { discoverPrograms, scrapeProgram } from "./modules/programs";

const app = new Hono<{ Bindings: CloudflareBindings }>();
const COURSE_SCRAPE_DELAY_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const validateApiKey = async (
  c: Context<{ Bindings: CloudflareBindings }>,
  next: Next,
) => {
  const apiKey = c.req.header("X-API-KEY");

  if (!apiKey) {
    return c.json({ error: "Missing API key" }, 401);
  }

  if (apiKey !== c.env.SCRAPER_API_KEY) {
    return c.json({ error: "Invalid API key" }, 403);
  }

  await next();
};

app.get("/", async (c) => {
  const db = getDB(c.env);
  try {
    const [statusCounts, recentJobs, recentErrors] = await Promise.all([
      db
        .select({ status: jobs.status, total: count() })
        .from(jobs)
        .groupBy(jobs.status),
      db
        .select({
          id: jobs.id,
          jobType: jobs.jobType,
          status: jobs.status,
          url: jobs.url,
          createdAt: jobs.createdAt,
          startedAt: jobs.startedAt,
          completedAt: jobs.completedAt,
        })
        .from(jobs)
        .orderBy(desc(jobs.createdAt), desc(jobs.id))
        .limit(50),
      db
        .select({
          jobId: errorLogs.jobId,
          errorType: errorLogs.errorType,
          errorMessage: errorLogs.errorMessage,
          timestamp: errorLogs.timestamp,
        })
        .from(errorLogs)
        .orderBy(desc(errorLogs.timestamp))
        .limit(20),
    ]);
    const totals = new Map(
      statusCounts.map(({ status, total }) => [status, total]),
    );
    const formatDate = (date: Date | null) => date?.toISOString() ?? "—";
    c.header("Cache-Control", "no-store");
    return c.html(html`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="refresh" content="15">
          <title>Scraping dashboard</title>
          <style>
            body { font-family: system-ui, sans-serif; margin: 0; background: #f5f7fa; color: #172033; }
            main { max-width: 1400px; margin: auto; padding: 24px; }
            h1 { margin-bottom: 8px; }
            .summary { display: flex; flex-wrap: wrap; gap: 16px; margin: 24px 0; }
            .card { background: white; padding: 20px; border: 1px solid #d8dee9; border-radius: 8px; flex: 1; min-width: 130px; }
            .card strong { display: block; font-size: 2rem; }
            .table { overflow-x: auto; background: white; border: 1px solid #d8dee9; border-radius: 8px; }
            table { border-collapse: collapse; width: 100%; text-align: left; }
            th, td { padding: 12px; border-bottom: 1px solid #e5e9f0; vertical-align: top; }
            th { background: #edf1f7; }
            td { overflow-wrap: anywhere; min-width: 100px; }
            .pending { color: #795600; } .processing { color: #185abc; }
            .completed { color: #16703b; } .failed { color: #b42318; }
            a { color: #185abc; }
          </style>
        </head>
        <body><main>
          <h1>Scraping dashboard</h1>
          <p>Updated ${formatDate(new Date())} · Refreshes every 15 seconds · <a href="/">Refresh now</a></p>
          <section class="summary" aria-label="Job totals">
            <div class="card">Total jobs<strong>${statusCounts.reduce((sum, row) => sum + row.total, 0)}</strong></div>
            ${(["pending", "processing", "completed", "failed"] as const).map(
              (status) => html`
              <div class="card ${status}">${status}<strong>${totals.get(status) ?? 0}</strong></div>
            `,
            )}
          </section>
          <h2>Latest 50 jobs</h2>
          <div class="table"><table>
            <thead><tr><th>Job ID</th><th>Type</th><th>Status</th><th>URL</th><th>Created (UTC)</th><th>Started (UTC)</th><th>Completed (UTC)</th></tr></thead>
            <tbody>${
              recentJobs.length
                ? recentJobs.map(
                    (job) => html`
              <tr><td>${job.id}</td><td>${job.jobType}</td><td class="${job.status}">${job.status}</td><td>${job.url}</td><td>${formatDate(job.createdAt)}</td><td>${formatDate(job.startedAt)}</td><td>${formatDate(job.completedAt)}</td></tr>
            `,
                  )
                : html`<tr><td colspan="7">No scraping jobs yet.</td></tr>`
            }</tbody>
          </table></div>
          <h2>Latest 20 errors</h2>
          <div class="table"><table>
            <thead><tr><th>Time (UTC)</th><th>Job ID</th><th>Type</th><th>Message</th></tr></thead>
            <tbody>${
              recentErrors.length
                ? recentErrors.map(
                    (error) => html`
              <tr><td>${formatDate(error.timestamp)}</td><td>${error.jobId ?? "—"}</td><td>${error.errorType}</td><td>${error.errorMessage}</td></tr>
            `,
                  )
                : html`<tr><td colspan="4">No errors recorded.</td></tr>`
            }</tbody>
          </table></div>
        </main></body>
      </html>`);
  } finally {
    await db.$client.end();
  }
});

// Endpoint to trigger major discovery scraping
app.post("/api/programs", validateApiKey, async (c) => {
  try {
    const db = getDB(c.env);

    const programsUrl = new URL(
      "/programs",
      c.env.SCRAPING_BASE_URL,
    ).toString();

    const [createdJob] = await db
      .insert(jobs)
      .values({ url: programsUrl, jobType: "discover-programs" })
      .returning();

    await c.env.SCRAPING_QUEUE.send({ jobId: createdJob.id });

    await db.$client.end();

    console.log(`Created major discovery job [id: ${createdJob.id}]`);

    return c.json({
      success: true,
      jobId: createdJob.id,
      jobType: createdJob.jobType,
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Database configuration is missing" }, 500);
  }
});

// Endpoint to trigger course discovery scraping
app.post("/api/courses", validateApiKey, async (c) => {
  try {
    const db = getDB(c.env);

    const coursesUrl = new URL("/courses", c.env.SCRAPING_BASE_URL).toString();

    const [createdJob] = await db
      .insert(jobs)
      .values({ url: coursesUrl, jobType: "discover-courses" })
      .returning();

    await c.env.SCRAPING_QUEUE.send({ jobId: createdJob.id });

    await db.$client.end();

    console.log(`Created course discovery job [id: ${createdJob.id}]`);

    return c.json({
      success: true,
      jobId: createdJob.id,
      jobType: createdJob.jobType,
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Database configuration is missing" }, 500);
  }
});

export default {
  fetch: app.fetch,

  async queue(
    batch: MessageBatch<JobMessage>,
    env: CloudflareBindings,
    _ctx: ExecutionContext,
  ) {
    const db = getDB(env);

    try {
      for (const message of batch.messages) {
        const { jobId } = message.body;

        try {
          const [job] = await db
            .select()
            .from(jobs)
            .where(eq(jobs.id, jobId))
            .limit(1);

          if (!job) {
            message.ack();
            continue;
          }

          await db
            .update(jobs)
            .set({ status: "processing", startedAt: new Date() })
            .where(eq(jobs.id, jobId));

          let result: unknown = null;

          switch (job.jobType) {
            case "discover-programs": {
              const programUrls = await discoverPrograms(job.url);
              const newJobs = await db
                .insert(jobs)
                .values(
                  programUrls.map((url) => ({
                    url,
                    jobType: "program" as const,
                  })),
                )
                .returning();

              await env.SCRAPING_QUEUE.sendBatch(
                newJobs.map((j) => ({ body: { jobId: j.id } })),
              );
              break;
            }
            case "discover-courses": {
              const courseUrls = await discoverCourses(job.url);
              // NOTE: Cloudflare Queues has a limit of 100 messages per sendBatch()
              console.log(`Discovered ${courseUrls.length} course URLs`);

              const BATCH_SIZE = 10;
              for (let i = 0; i < courseUrls.length; i += BATCH_SIZE) {
                const batch = courseUrls.slice(i, i + BATCH_SIZE);

                const newJobs = await db
                  .insert(jobs)
                  .values(
                    batch.map((url) => ({
                      url,
                      jobType: "course" as const,
                    })),
                  )
                  .returning();

                await env.SCRAPING_QUEUE.sendBatch(
                  newJobs.map((j) => ({ body: { jobId: j.id } })),
                );

                console.log(
                  `Queued batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(courseUrls.length / BATCH_SIZE)} (${newJobs.length} jobs)`,
                );
              }
              break;
            }
            case "program": {
              const res = await scrapeProgram(job.url, db, env);

              result = ZUpsertProgramWithRequirements.parse({
                ...res.program,
                requirements: res.requirements,
              });
              break;
            }
            case "course": {
              // A single URL may contain multiple courses
              if (COURSE_SCRAPE_DELAY_MS > 0) {
                await sleep(COURSE_SCRAPE_DELAY_MS);
              }
              const courses = await scrapeCourse(job.url);

              console.log(`Scraped ${courses.length} courses from ${job.url}`);

              result = courses.map((courseData) =>
                ZUpsertCourseWithPrerequisites.parse({
                  ...courseData.course,
                  prerequisites: courseData.prerequisites,
                }),
              );
              break;
            }
            case "discover-course-offerings": {
              const metadata = job.metadata as {
                term: "spring" | "summer" | "fall" | "j-term";
                year: number;
              } | null;

              if (!metadata?.term || !metadata?.year) {
                throw new JobError(
                  "Missing term or year in job metadata",
                  "validation",
                );
              }

              const courseOfferingUrls = await discoverCourseOfferings(
                job.url,
                metadata.term,
                metadata.year,
              );
              const newJobs = await db
                .insert(jobs)
                .values(
                  courseOfferingUrls.map((url) => ({
                    url,
                    jobType: "course-offering" as const,
                    metadata: { term: metadata.term, year: metadata.year },
                  })),
                )
                .returning();

              await env.SCRAPING_QUEUE.sendBatch(
                newJobs.map((j) => ({ body: { jobId: j.id } })),
              );
              break;
            }
            case "course-offering": {
              const courseOfferings = await scrapeCourseOfferings(job.url);

              result = ZUpsertCourseOfferings.parse(courseOfferings);
              break;
            }
          }

          await db
            .update(jobs)
            .set({ status: "completed", completedAt: new Date(), result })
            .where(eq(jobs.id, jobId));

          message.ack();
        } catch (error) {
          message.retry();
          const jobError =
            error instanceof JobError
              ? error
              : new JobError(
                  error instanceof Error ? error.message : "Unknown error",
                );

          try {
            await db.insert(errorLogs).values({
              jobId: jobId,
              errorType: jobError.type,
              errorMessage: jobError.message,
              stackTrace: jobError.stack || null,
              timestamp: new Date(),
            });

            await db
              .update(jobs)
              .set({ status: "failed" })
              .where(eq(jobs.id, jobId));
          } catch {
            console.error(`Could not persist failure details for job ${jobId}`);
          }
        }
      }
    } finally {
      await db.$client.end();
    }
  },
};
