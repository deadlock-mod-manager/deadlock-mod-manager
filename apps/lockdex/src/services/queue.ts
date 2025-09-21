import { ModFileProcessingQueue } from "@/queues/mod-file-processing-queue";
import { ModsQueue } from "@/queues/mods-queue";

export const modsQueue = new ModsQueue();
export const modFileProcessingQueue = new ModFileProcessingQueue();
