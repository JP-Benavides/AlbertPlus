import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { ZUpsertCourseWithPrerequisites } from "../../lib/schemas";
import { discoverCourses, scrapeCourse } from "./index";

const fetchSpy = spyOn(globalThis, "fetch");
afterEach(() => fetchSpy.mockReset());

describe("Course catalog parser", () => {
  test("discovers subject pages without a database or backend", async () => {
    fetchSpy.mockResolvedValue(
      new Response(`
      <a href="/courses/">Catalog</a>
      <a href="/courses/csci_ua/">Computer Science</a>
      <a href="/programs/">Programs</a>
    `),
    );
    expect(await discoverCourses("https://bulletins.nyu.edu/courses/")).toEqual(
      ["https://bulletins.nyu.edu/courses/csci_ua/"],
    );
  });

  test("parses multiple courses and validates the standalone output contract", async () => {
    fetchSpy.mockResolvedValue(
      new Response(`
      <h1 class="page-title">Computer Science (CSCI-UA)</h1>
      <div class="courseblock">
        <span class="detail-code"><strong>CSCI-UA 101</strong></span>
        <span class="detail-title"><strong>Introduction to Computer Science</strong></span>
        <span class="detail-hours_html"><strong>(4 Credits)</strong></span>
        <div class="courseblockextra">An introduction to programming.</div>
        <div class="detail-prerequisites">Prerequisites: CSCI-UA 2 or CSCI-UA 3</div>
      </div>
      <div class="courseblock">
        <span class="detail-code"><strong>CSCI-UA 102</strong></span>
        <span class="detail-title"><strong>Data Structures</strong></span>
        <span class="detail-hours_html"><strong>(4 Credits)</strong></span>
      </div>
    `),
    );
    const courses = await scrapeCourse(
      "https://bulletins.nyu.edu/courses/csci_ua/",
    );
    expect(courses).toHaveLength(2);
    expect(courses[0].course).toMatchObject({
      code: "CSCI-UA 101",
      programName: "Computer Science",
      credits: 4,
      school: "College of Arts and Science",
      level: "undergraduate",
    });
    expect(courses[0].prerequisites).toEqual([
      { type: "alternative", courses: ["CSCI-UA 2", "CSCI-UA 3"] },
    ]);
    expect(courses[1].prerequisites).toEqual([]);
    for (const result of courses) {
      expect(
        ZUpsertCourseWithPrerequisites.safeParse({
          ...result.course,
          prerequisites: result.prerequisites,
        }).success,
      ).toBe(true);
    }
  });

  test("rejects failed page requests", async () => {
    fetchSpy.mockResolvedValue(new Response("Not found", { status: 404 }));
    await expect(
      scrapeCourse("https://bulletins.nyu.edu/courses/missing/"),
    ).rejects.toThrow("Failed to fetch course page: 404");
  });
});
