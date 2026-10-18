import type { ModDownload } from "@deadlock-mods/database";
import type { ModFilesUpdatedEventData } from "@deadlock-mods/shared";
import type { ModFileProcessingJobData } from "@/types/jobs";

/** One job per file version, however many times it gets scheduled */
export const modFileJobId = (job: ModFileProcessingJobData): string =>
  [
    job.provider,
    job.submissionType,
    job.submissionId,
    job.fileId,
    new Date(job.upstreamUpdatedAt).getTime(),
  ].join("-");

export const buildModFileJob = (
  event: ModFilesUpdatedEventData,
  download: ModDownload,
): ModFileProcessingJobData => ({
  provider: event.provider,
  submissionType: event.submissionType,
  submissionId: event.submissionId,
  fileId: download.remoteId,
  upstreamUpdatedAt: event.filesUpdatedAt,
  url: download.url,
  file: download.file,
  size: download.size,
});
