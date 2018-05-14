const redis = require('redis');
const config = require('config');
const moment = require('moment');
const { sortBy } = require('lodash');
const {promisify} = require('util');

const logger = config.logger();

const redisClient = redis.createClient({
  url: config.REDIS_URL
});

const redisGetAsync = promisify(redisClient.get).bind(redisClient);

module.exports = () => async (req, res) => {

  let notifications = await redisGetAsync('notifications') || '[]';
  notifications = JSON.parse(notifications);
  notifications = sortBy(notifications, o => new moment(o.timestamp)).reverse();

  res.json({ notifications });
}