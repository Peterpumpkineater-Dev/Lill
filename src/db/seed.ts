import { config } from "../config";
import { MemoryRepository } from "./repositories/memory.repo";
import { pool } from "./pool";
import { childLogger } from "../core/logger";

const log = childLogger("seed");

async function seed(): Promise<void> {
  const memory = new MemoryRepository();

  await memory.upsert({
    scope: "brand",
    key: "brand.voice",
    value: config.brand.voice,
    tags: ["voice", "brand"],
    importance: 1,
  });

  await memory.upsert({
    scope: "brand",
    key: "brand.handle",
    value: config.brand.handle,
    tags: ["brand"],
    importance: 1,
  });

  await memory.upsert({
    scope: "brand",
    key: "brand.primary_traffic_url",
    value: config.brand.primaryTrafficUrl,
    tags: ["traffic", "brand"],
    importance: 1,
  });

  await memory.upsert({
    scope: "preference",
    key: "publish.platforms",
    value: ["reddit", "twitter", "fansly"],
    tags: ["publish", "platforms"],
    importance: 0.9,
  });

  await memory.upsert({
    scope: "preference",
    key: "publish.interval_minutes",
    value: config.publish.defaultIntervalMinutes,
    tags: ["publish", "schedule"],
    importance: 0.8,
  });

  await memory.upsert({
    scope: "audience",
    key: "audience.insights.default",
    value: {
      peakHours: [12, 18, 21, 23],
      interests: ["fitness", "lifestyle", "exclusive"],
      tone: "direct and warm",
    },
    tags: ["audience", "insights"],
    importance: 0.7,
  });

  log.info("seed complete");
}

seed()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    log.error({ err }, "seed failed");
    await pool.end();
    process.exit(1);
  });
