import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

const updates: Record<string, unknown>[] = [];
let failResultWrite = false;
const db = {
  select: () => ({
    from: () => ({
      where: () => ({
        get: async () => ({
          id: "job-1",
          jobType: "course",
          url: "https://bulletins.nyu.edu/courses/csci_ua/",
        }),
      }),
    }),
  }),
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        if (failResultWrite && values.status === "completed")
          throw new Error("Database unavailable");
        updates.push(values);
      },
    }),
  }),
  insert: () => ({ values: async () => {} }),
};
mock.module("./drizzle", () => ({ default: () => db }));
const { default: worker } = await import("./index");

const env = { SCRAPER_API_KEY: "test-key" } as CloudflareBindings;
const fetchSpy = spyOn(globalThis, "fetch");
afterEach(() => {
  fetchSpy.mockReset();
  updates.length = 0;
  failResultWrite = false;
});

async function runCourseJob() {
  fetchSpy.mockResolvedValue(
    new Response(`
    <h1 class="page-title">Computer Science (CSCI-UA)</h1>
    <div class="courseblock">
      <span class="detail-code"><strong>CSCI-UA 101</strong></span>
      <span class="detail-title"><strong>Introduction</strong></span>
      <span class="detail-hours_html"><strong>(4 Credits)</strong></span>
    </div>
  `),
  );
  const ack = mock(() => {});
  const retry = mock(() => {});
  const pending: Promise<unknown>[] = [];
  await worker.queue(
    {
      messages: [{ body: { jobId: "job-1" }, ack, retry }],
    } as unknown as MessageBatch<{ jobId: string }>,
    env,
    {
      waitUntil: (promise: Promise<unknown>) => {
        pending.push(promise);
      },
    } as ExecutionContext,
  );
  await Promise.all(pending);
  return { ack, retry };
}

describe("Standalone scraper worker", () => {
  test("protects triggers with the scraper API key", async () => {
    const missing = await worker.fetch(
      new Request("https://scraper.test/api/courses", { method: "POST" }),
      env,
    );
    expect(missing.status).toBe(401);
    const invalid = await worker.fetch(
      new Request("https://scraper.test/api/courses", {
        method: "POST",
        headers: { "X-API-KEY": "wrong-key" },
      }),
      env,
    );
    expect(invalid.status).toBe(403);
  });

  test("persists parsed output before acknowledging the job without calling a backend", async () => {
    const { ack, retry } = await runCourseJob();
    expect(updates[1]).toMatchObject({
      status: "completed",
      result: [{ code: "CSCI-UA 101", prerequisites: [] }],
    });
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://bulletins.nyu.edu/courses/csci_ua/",
    );
  });

  test("retries instead of completing a job when saving its result fails", async () => {
    failResultWrite = true;
    const { ack, retry } = await runCourseJob();
    expect(updates.at(-1)).toEqual({ status: "failed" });
    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
