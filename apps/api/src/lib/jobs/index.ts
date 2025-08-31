import type { Cron } from 'croner';

const jobs: Cron[] = [];

export const registerJob = (job: Cron) => {
  jobs.push(job);
};

export const startJobs = () => {
  for (const job of jobs) {
    job.resume();
  }
};

export const stopJobs = () => {
  for (const job of jobs) {
    job.pause();
  }
};
