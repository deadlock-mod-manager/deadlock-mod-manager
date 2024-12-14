import { Cron } from 'croner'

const jobs: Cron[] = []

export const registerJob = (job: Cron) => {
  jobs.push(job)
}

export const startJobs = () => {
  jobs.forEach((job) => {
    job.resume()
  })
}

export const stopJobs = () => {
  jobs.forEach((job) => {
    job.pause()
  })
}
