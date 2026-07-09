import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import { config } from "../../config";
import { childLogger } from "../logger";

const log = childLogger("queue");

function parseRedisConnection(): ConnectionOptions {
  const url = new URL(config.redis.url);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

export type JobHandler<T> = (data: T, job: Job<T>) => Promise<void>;

export class QueueManager {
  private connection = parseRedisConnection();
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();

  getQueue(name: string): Queue {
    const key = `${config.redis.prefix}${name}`;
    let q = this.queues.get(key);
    if (!q) {
      q = new Queue(key, { connection: this.connection });
      this.queues.set(key, q);
    }
    return q;
  }

  async enqueue<T>(
    name: string,
    data: T,
    opts?: {
      delayMs?: number;
      attempts?: number;
      jobId?: string;
      priority?: number;
    }
  ): Promise<string> {
    const queue = this.getQueue(name);
    const job = await queue.add(name, data as never, {
      delay: opts?.delayMs,
      attempts: opts?.attempts ?? 3,
      jobId: opts?.jobId,
      priority: opts?.priority,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    });
    log.debug({ queue: name, jobId: job.id }, "job enqueued");
    return job.id ?? "";
  }

  startWorker<T>(name: string, handler: JobHandler<T>, concurrency = 2): Worker {
    const key = `${config.redis.prefix}${name}`;
    if (this.workers.has(key)) {
      return this.workers.get(key)!;
    }

    const worker = new Worker(
      key,
      async (job: Job) => {
        log.debug({ queue: name, jobId: job.id }, "job started");
        await handler(job.data as T, job as Job<T>);
      },
      { connection: this.connection, concurrency }
    );

    worker.on("failed", (job, err) => {
      log.error({ queue: name, jobId: job?.id, err }, "job failed");
    });

    worker.on("completed", (job) => {
      log.debug({ queue: name, jobId: job.id }, "job completed");
    });

    this.workers.set(key, worker);
    log.info({ queue: name, concurrency }, "worker started");
    return worker;
  }

  async depth(name: string): Promise<number> {
    const queue = this.getQueue(name);
    const counts = await queue.getJobCounts("waiting", "delayed", "active");
    return (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.active ?? 0);
  }

  async totalDepth(): Promise<number> {
    let total = 0;
    for (const name of ["publish", "analytics", "scheduler", "agents"]) {
      try {
        total += await this.depth(name);
      } catch {
        // queue may not exist yet
      }
    }
    return total;
  }

  async close(): Promise<void> {
    await Promise.all([...this.workers.values()].map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.workers.clear();
    this.queues.clear();
  }
}

export const queueManager = new QueueManager();

export const QUEUE_NAMES = {
  PUBLISH: "publish",
  ANALYTICS: "analytics",
  SCHEDULER: "scheduler",
  AGENTS: "agents",
} as const;
