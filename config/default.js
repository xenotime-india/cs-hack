require('dotenv').config();
const winston = require('winston');

const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      colorize: 'all',
    }),
  ],
  level: process.env.LOGGER_LEVEL || 'silly'
});

module.exports = {
  PORT: process.env.PORT || 3001,
  PRODUCTION: process.env.NODE_ENV === 'production',
  STORE_USER_NAME: process.env.STORE_USER_NAME,
  STORE_PASSWORD: process.env.STORE_PASSWORD,
  FROM_GMAIL_ADDRESS: process.env.FROM_GMAIL_ADDRESS,
  TO_GMAIL_ADDRESS: process.env.TO_GMAIL_ADDRESS,
  ITEM_LIST: process.env.ITEM_LIST || '',
  CRON_TIME: process.env.CRON_TIME,
  SENDGRID_USERNAME: process.env.SENDGRID_USERNAME,
  SENDGRID_PASSWORD: process.env.SENDGRID_PASSWORD,
  REDIS_URL: process.env.REDIS_URL,
  REDIS_KEY: process.env.REDIS_KEY,
  NODE_ENV: process.env.NODE_ENV,
  EXPO_PUSH_NOTI_URL: process.env.EXPO_PUSH_NOTI_URL,
  STORE_LOGIN_URL: process.env.STORE_LOGIN_URL,
  STORE_SCAN_URL: process.env.STORE_SCAN_URL,
  STORE_CART_URL: process.env.STORE_CART_URL,
  corsHeaders: ["Link"],
  bodyLimit: "100kb",
  ROBOT: process.env.ROBOT,
  logger: () => (logger)
}
