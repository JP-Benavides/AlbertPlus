import {
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name"),
  phone: varchar("phone", { length: 256 }),
});

export const jobs = pgTable("jobs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  url: text("url").notNull(),
  status: text("status", {
    enum: ["pending", "processing", "completed", "failed"],
  })
    .notNull()
    .default("pending"),
  jobType: text("job_type", {
    enum: [
      "discover-programs",
      "discover-courses",
      "discover-course-offerings",
      "program",
      "course",
      "course-offering",
    ],
  }).notNull(),
  metadata: jsonb("metadata"),
  result: jsonb("result").$type<unknown>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
});

export const errorLogs = pgTable("error_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  jobId: text("job_id").references(() => jobs.id),
  errorType: text("error_type", {
    enum: ["network", "parsing", "validation", "timeout", "unknown"],
  }).notNull(),
  errorMessage: text("error_message").notNull(),
  stackTrace: text("stack_trace"),
  timestamp: timestamp("timestamp", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
});
