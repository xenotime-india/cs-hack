const redis = require('redis');
const config = require('config');
const {promisify} = require('util');

const logger = config.logger();

const redisClient = redis.createClient({
  url: config.REDIS_URL
});

const redisGetAsync = promisify(redisClient.get).bind(redisClient);
const redisSetAsync = promisify(redisClient.set).bind(redisClient);

module.exports = () => async (req, res) => {

  const { deviceToken } = req.body;

  logger.log('info', 'register new device request.');
  logger.log('debug', req.body);

  let existingDevice = await redisGetAsync('devices') || '[]';
  existingDevice = new Set(JSON.parse(existingDevice));

  logger.log('info', 'already registered devices.');
  logger.log('debug', existingDevice);

  existingDevice.add(deviceToken);

  await redisSetAsync('devices', JSON.stringify([...existingDevice]));

  res.json({ status: 200, message: 'device added successfully'});
}