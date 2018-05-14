const CronJob = require('cron').CronJob;
const config = require('config');
const worker = require('./worker.js');

const job = new CronJob({
  cronTime: config.CRON_TIME,
  onTick: worker.start,
  start: true,
  timeZone: "America/Los_Angeles"
});

job.start();