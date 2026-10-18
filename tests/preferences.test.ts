import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { loadEnvConfig } from "@next/env";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createDatabase } from "../src/server/db";
import { documents, evidence, preferences } from "../src/server/db/schema";
import { appRouter } from "../src/server/router";
import { seedPreferences } from "./preference-fixtures";

loadEnvConfig(process.cwd());

test("preferences persist through the tRPC router in an isolated PostgreSQL database", async (t) => {
  assert.ok(process.env.DATABASE_URL, "Set DATABASE_URL and start PostgreSQL before running tests.");
  const url = new URL(process.env.DATABASE_URL);
  const name = "flashpoint_test_" + randomUUID().replaceAll("-", "");
  const admin = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5_000 });
  let database: ReturnType<typeof createDatabase> | undefined;

  // The generated database belongs to this test. Never migrate or clear the app database.
  await admin.query(`CREATE DATABASE "${name}"`);
  try {
    url.pathname = "/" + name;
    database = createDatabase(url.toString());
    const { db } = database;
    await migrate(db, { migrationsFolder: "./drizzle" });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const caller = appRouter.createCaller({ db });

    await t.test("empty state, then seeded suggestions list with their source evidence", async () => {
      assert.deepEqual(await caller.preferences.list(), []);
      await seedPreferences(db);
      const loaded = await caller.preferences.list();
      assert.equal(loaded.length, 4);
      assert.ok(loaded.every((item) => item.status === "pending" && item.version === 0));
      assert.equal((await db.select().from(documents)).length, 2);
      assert.equal((await db.select().from(evidence)).length, 7);
      assert.equal(loaded[0].evidence[0].document, "Brand tracker.docx");
      assert.match(loaded[0].evidence[0].quote, /Which brands come to mind/);
    });

    const [first, second, third] = await caller.preferences.list();
    const editedRule = "Use fully labeled five-point scales for satisfaction questions.";
    await t.test("confirm, edit, and deny persist with the original evidence", async () => {
      await caller.preferences.decide({ id: first.id, version: first.version, status: "confirmed" });
      await caller.preferences.decide({ id: second.id, version: second.version, status: "confirmed", rule: "  " + editedRule + "  " });
      await caller.preferences.decide({ id: third.id, version: third.version, status: "denied" });
      const saved = await caller.preferences.list();
      assert.equal(saved.filter((item) => item.status === "confirmed").length, 2);
      assert.equal(saved[1].rule, editedRule);
      assert.equal(saved[2].status, "denied");
      assert.deepEqual(saved[1].evidence, second.evidence);
      const [row] = await db.select().from(preferences).where(eq(preferences.id, second.id));
      assert.equal(row.suggestedRule, second.rule);
      assert.ok(row.reviewedAt instanceof Date);
      assert.equal(row.version, 1);
    });

    await t.test("invalid rules, statuses, IDs, and stale updates are rejected without writes", async () => {
      const before = await caller.preferences.list();
      for (const rule of ["short", " ".repeat(20), "x".repeat(501)]) {
        await assert.rejects(caller.preferences.decide({ id: second.id, version: 1, status: "confirmed", rule }),
          (error) => error instanceof TRPCError && error.code === "BAD_REQUEST");
      }
      await assert.rejects(caller.preferences.decide({ id: "not-a-uuid", version: 1, status: "denied" }),
        (error) => error instanceof TRPCError && error.code === "BAD_REQUEST");
      // @ts-expect-error Exercise runtime validation independently of the typed client.
      await assert.rejects(caller.preferences.decide({ id: first.id, version: 1, status: "approved" }),
        (error) => error instanceof TRPCError && error.code === "BAD_REQUEST");
      await assert.rejects(caller.preferences.decide({ id: first.id, version: 0, status: "denied" }),
        (error) => error instanceof TRPCError && error.code === "CONFLICT");
      await assert.rejects(caller.preferences.decide({ id: randomUUID(), version: 0, status: "denied" }),
        (error) => error instanceof TRPCError && error.code === "NOT_FOUND");
      assert.deepEqual(await caller.preferences.list(), before);
    });

    await t.test("return to review removes approval and clears its review timestamp", async () => {
      await caller.preferences.decide({ id: first.id, version: 1, status: "pending" });
      const saved = await caller.preferences.list();
      assert.deepEqual(saved.filter((item) => item.status === "confirmed").map((item) => item.id), [second.id]);
      const [row] = await db.select().from(preferences).where(eq(preferences.id, first.id));
      assert.equal(row.reviewedAt, null);
      assert.equal(row.version, 2);
    });

    await t.test("a fresh connection recovers saved decisions", async () => {
      const before = await caller.preferences.list();
      await database!.pool.end();
      database = createDatabase(url.toString());
      const freshCaller = appRouter.createCaller({ db: database.db });
      assert.deepEqual(await freshCaller.preferences.list(), before);
    });
  } finally {
    await database?.pool.end();
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
});
