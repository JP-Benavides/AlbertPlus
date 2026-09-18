import { expect, test } from "bun:test";

// Isolate mocks from the Worker's existing global database mock.
async function runCommand(databaseUrl: string, fail = false) {
  const script = `
    import { mock } from "bun:test";
    const course = {
      code: "ANTH-UH 1010", level: "undergraduate", title: "Anthropology",
      school: "NYU Abu Dhabi", credits: 4, program: "ANTH-UH",
      programName: "Anthropology", prerequisites: [],
      courseUrl: "https://bulletins.nyu.edu/courses/anth_uh/", description: "Intro"
    };
    mock.module("./src/drizzle", () => ({ default: (env) => {
      if (env.DATABASE_URL !== process.env.DATABASE_URL) throw new Error("Environment overridden");
      return {
        select: () => ({ from: () => ({ where: () => ({ orderBy: async () => [
          {jobId: "test-job", result: [course]}
        ] }) }) }),
        transaction: async (fn) => fn({ insert: () => ({ values: () => ({
          onConflictDoUpdate: () => ({ returning: async () => {
            if (${fail}) throw new Error("secret-password query-parameters");
            return [{code: course.code}];
          } })
        }) }) }),
        $client: { end: async () => console.error("test-client-closed") }
      };
    } }));
    const { runFlushCourses } = await import("./src/scripts/flush-courses");
    await runFlushCourses();
  `;
  const child = Bun.spawn([process.execPath, "-e", script], {
    cwd: new URL("../../", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("flush command reports counts and closes the client", async () => {
  const result = await runCommand("postgresql://test:password@localhost/test");
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    jobsProcessed: 1,
    coursesUpserted: 1,
  });
  expect(result.stderr).toContain("test-client-closed");
});

test("flush command rejects missing configuration before opening a client", async () => {
  const result = await runCommand("");
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("DATABASE_URL is missing");
  expect(result.stderr).not.toContain("test-client-closed");
});

test("flush command rejects malformed URLs without printing them", async () => {
  const result = await runCommand("secret-password");
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("valid PostgreSQL connection string");
  expect(result.stderr).not.toContain("secret-password");
});

test("flush command closes on database failure and keeps query details private", async () => {
  const result = await runCommand(
    "postgresql://test:password@localhost/test",
    true,
  );
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Course flush failed");
  expect(result.stderr).toContain("test-client-closed");
  expect(result.stderr).not.toContain("secret-password");
  expect(result.stderr).not.toContain("query-parameters");
});
