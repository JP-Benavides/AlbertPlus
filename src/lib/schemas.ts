import * as z from "zod/mini";

const ZSchoolLevel = z.enum(["undergraduate", "graduate"] as const);

export const ZSchoolName = z.enum([
  "College of Arts and Science",
  "Graduate School of Arts and Science",
  "College of Dentistry",
  "Gallatin School of Individualized Study",
  "Leonard N. Stern School of Business",
  "Liberal Studies",
  "NYU Abu Dhabi",
  "NYU Shanghai",
  "NYU Grossman School of Medicine",
  "NYU Grossman Long Island School of Medicine",
  "Robert F. Wagner Graduate School of Public Service",
  "Rory Meyers College of Nursing",
  "School of Global Public Health",
  "School of Law",
  "School of Professional Studies",
  "Silver School of Social Work",
  "Steinhardt School of Culture, Education, and Human Development",
  "Tandon School of Engineering",
  "Tisch School of the Arts",
  "Non-School Based Programs - UG",
] as const);

const ZCourseLevel = z.union([ZSchoolLevel, z.number()]);

export const ZUpsertCourseWithPrerequisites = z.object({
  program: z.string(),
  programName: z.string(),
  code: z.string(),
  level: ZCourseLevel,
  title: z.string(),
  credits: z.int(),
  description: z.string(),
  courseUrl: z.string(),
  school: ZSchoolName,
  prerequisites: z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("required"),
        courses: z.array(z.string()),
      }),
      z.object({
        type: z.literal("alternative"),
        courses: z.array(z.string()),
      }),
      z.object({
        type: z.literal("options"),
        courses: z.array(z.string()),
        creditsRequired: z.number(),
      }),
    ]),
  ),
});

export const ZUpsertProgramWithRequirements = z.object({
  name: z.string(),
  level: ZSchoolLevel, // undergraduate or graduate
  school: ZSchoolName,
  programUrl: z.string(),
  requirements: z.array(
    z.discriminatedUnion("type", [
      z.object({
        isMajor: z.boolean(),
        description: z.optional(z.string()),
        type: z.literal("required"),
        courses: z.array(z.string()),
      }),
      z.object({
        isMajor: z.boolean(),
        description: z.optional(z.string()),
        type: z.literal("alternative"),
        courses: z.array(z.string()),
      }),
      z.object({
        isMajor: z.boolean(),
        description: z.optional(z.string()),
        type: z.literal("options"),
        courses: z.array(z.string()),
        courseLevels: z.array(
          z.object({
            program: z.string(), // CSCI-UA
            level: z.coerce.number(), // 4 (represents any classes at 400 level)
          }),
        ),
        creditsRequired: z.number(),
      }),
    ]),
  ),
});

export const ZUpsertRequirements = z.array(
  z.discriminatedUnion("type", [
    z.object({
      programId: z.string(),
      isMajor: z.boolean(),
      description: z.optional(z.string()),
      type: z.literal("required"),
      courses: z.array(z.string()),
    }),
    z.object({
      programId: z.string(),
      isMajor: z.boolean(),
      description: z.optional(z.string()),
      type: z.literal("alternative"),
      courses: z.array(z.string()),
    }),
    z.object({
      programId: z.string(),
      isMajor: z.boolean(),
      description: z.optional(z.string()),
      type: z.literal("options"),
      courses: z.array(z.string()),
      courseLevels: z.array(
        z.object({
          program: z.string(),
          level: z.coerce.number(),
        }),
      ),
      creditsRequired: z.number(),
    }),
  ]),
);

export const ZUpsertPrerequisites = z.array(
  z.discriminatedUnion("type", [
    z.object({
      courseId: z.string(),
      type: z.literal("required"),
      courses: z.array(z.string()),
    }),
    z.object({
      courseId: z.string(),
      type: z.literal("alternative"),
      courses: z.array(z.string()),
    }),
    z.object({
      courseId: z.string(),
      type: z.literal("options"),
      courses: z.array(z.string()),
      creditsRequired: z.number(),
    }),
  ]),
);

export const ZUpsertCourseOfferings = z.array(
  z.object({
    courseCode: z.string(), // CSCI-UA 102
    classNumber: z.number(), // 10349
    title: z.optional(z.string()),
    section: z.string(),
    description: z.optional(z.string()),
    year: z.number(), // 2025
    term: z.enum(["spring", "summer", "fall", "j-term"]),
    level: z.enum(["undergraduate", "graduate"]),
    school: ZSchoolName,
    instructors: z.array(z.string()),
    location: z.optional(z.string()),
    days: z.array(
      z.enum([
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ]),
    ),
    startTime: z.string(), // 13:00
    endTime: z.string(), // 14:15
    status: z.enum(["open", "closed", "waitlist"]),
    waitlistNum: z.optional(z.number()),
    isCorequisite: z._default(z.boolean(), false),
    corequisiteOf: z.optional(z.number()),
  }),
);
