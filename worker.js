#! /app/.heroku/node/bin/node
const puppeteer = require('puppeteer');
const request = require('request');
const redis = require('redis');
const {promisify} = require('util');
const moment = require('moment');
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');
const config = require('config');
const fetch = require('node-fetch')
const { isEqual, difference } = require('lodash');

const redisClient = redis.createClient({
  url: config.REDIS_URL
});

const logger = config.logger();

const redisGetAsync = promisify(redisClient.get).bind(redisClient);
const redisSetAsync = promisify(redisClient.set).bind(redisClient);

const asyncPostRequest = promisify(request.post);

const itemToSearch = config.ITEM_LIST.split(',');

const getCookieData = (response) => {
  console.log(response.headers['set-cookie']);
  return response.headers['set-cookie'].map((cookie) => {
    return cookie.split(/[;] */).reduce((result, pairStr) => {
      const arr = pairStr.split('=');
      if (arr.length === 2) {
        if(arr[0] !== 'path' && arr[0] !== 'expires') {
          result = {...result, ...{ name: arr[0], value: arr[1], domain: 'appirio.myshopify.com' }};
        } else if(arr[0] === 'expires') {
          result = {...result, ...{'expires': moment(arr[1]).valueOf()}};
        } else {
          result = {...result, ...{[arr[0]]: arr[1]}};
        }
      }
      return result;
    }, {});
  });
};

const interceptedRequest = interceptedRequest => {
  if (interceptedRequest.url().toLowerCase().indexOf('.jpg') > 0 ||
    interceptedRequest.url().toLowerCase().indexOf('.png') > 0 ||
    interceptedRequest.url().toLowerCase().indexOf('.woff') > 0 ||
    interceptedRequest.url().toLowerCase().indexOf('.ttf') > 0 ||
    interceptedRequest.url().toLowerCase().indexOf('/css?') > 0 ||
    interceptedRequest.url().toLowerCase().endsWith('.css'))
    interceptedRequest.abort();
  else
    interceptedRequest.continue();
}

const robotProcess = async (cookieData, { link }) => {
  let browser = await puppeteer.launch(config.PRODUCTION ? {args: ['--no-sandbox']} : {headless: false, devtools: true});
  try {
    let [ page ] = await browser.pages();
    await page.setCookie(...cookieData);
    await page.setRequestInterception(true);
    page.on('request', interceptedRequest);
    await page.setDefaultNavigationTimeout(60000);

    const addBtn = '.swell-buy-product-btn';
    const yesBtn = '.jconfirm-box .btn-default';
    const continueBtn = '.step__footer__continue-btn';
    const checkoutBtn = '#checkout';

    logger.log('info', 'Staring fake browser for robot ..');

    await page.goto(link, {waitUntil: 'networkidle2'});

    await page.waitFor(5 * 1000);

    /*let result = await page.evaluate(async ({addBtn, yesBtn}) => {
      await new Promise(resolve => setTimeout(resolve, 7000));
      console.log(document.querySelector(addBtn));
      document.querySelector(addBtn).click();
      await new Promise(resolve => setTimeout(resolve, 1000));
      document.querySelector(yesBtn).click();
      await new Promise(resolve => setTimeout(resolve, 5000));
      return {OK: 200}
    }, {addBtn, yesBtn});
    console.log(await result);
    */

    await page.click(addBtn);

    await page.waitFor(2 * 1000);

    await page.click(yesBtn);

    await page.waitFor(5 * 1000);

    logger.log('info', 'Add to card done & starting checkout process..');

    page = await browser.newPage();
    await page.setCookie(...cookieData);
    await page.setRequestInterception(true);
    page.on('request', interceptedRequest);
    await page.setDefaultNavigationTimeout(60000);
    await page.goto(config.STORE_CART_URL, {waitUntil: 'networkidle2'});
    await page.waitFor(2 * 1000);
    await page.click(checkoutBtn);

    await page.waitForNavigation();
    await page.waitFor(2 * 1000);
    await page.click(continueBtn);

    await page.waitForNavigation();
    await page.waitFor(2 * 1000);
    await page.click(continueBtn);

    if(config.PRODUCTION) {
      await page.waitForNavigation();
      await page.waitFor(2 * 1000);
      await page.click(continueBtn);

      await page.waitForNavigation();
      await page.waitFor(2 * 1000);
      await page.click(continueBtn);

      await page.waitForNavigation();
      await page.waitFor(2 * 1000);
    }

    await browser.close();

    logger.log('info', 'Ending robot');
  }
  catch(ex) {
    await browser.close();
    logger.log('error', ex);
  }
};

const start = async () => {

  logger.log('info', 'Staring Process..');
  const response = await asyncPostRequest(config.STORE_LOGIN_URL, {
    form: {
      'customer[email]': config.STORE_USER_NAME,
      'customer[password]': config.STORE_PASSWORD
    }
  });
  logger.log('info', 'Auth request completed..');

  /*const cookieData = [
    { name: '_secure_session_id',
      value: config.SECURE_SESSION_ID,
      domain: 'appirio.myshopify.com',
      path: '/' }];*/

  const cookieData = getCookieData(response);

  logger.log('info', 'Staring fake browser..');

  const browser = await puppeteer.launch(config.PRODUCTION ? { args: ['--no-sandbox'] } : {headless: false, devtools: true});
  const [ page ] = await browser.pages();
  await page.setRequestInterception(true);
  page.on('request', interceptedRequest);
  await page.setCookie(...cookieData);

  await page.goto(config.STORE_SCAN_URL, {waitUntil: 'networkidle2'});

  const resultsSelector = '.product';

  await page.waitForSelector(resultsSelector);

  await page.waitFor(1000);

  logger.log('info', 'Staring DOM scan..');

  const scanResult = await page.$$eval(resultsSelector, (products, itemToSearch) => {
    const filterData = products.filter(item => itemToSearch.includes(item.dataset.alpha) && item.querySelectorAll('.so.icn').length == 0)
    return filterData.length > 0 ? filterData.map(item => ({name:item.dataset.alpha,link:item.querySelector('a').href})) : [];
  }, itemToSearch);

  await browser.close();

  logger.log('info', 'Scan Result..');
  logger.log('debug', scanResult);

  logger.log('info', 'Found in stock..');
  logger.log('debug', scanResult);

  let oldItemList = await redisGetAsync('products') || '[]';
  oldItemList = JSON.parse(oldItemList);

  logger.log('info', 'OLD State..');
  logger.log('debug', oldItemList);

  if(!isEqual(scanResult.sort(), oldItemList.sort())) {

    await redisSetAsync('products',JSON.stringify(scanResult));
    const newItem = difference(scanResult, oldItemList);

    if(newItem && newItem.length > 0) {
      if(config.ROBOT) {
        const robot = JSON.parse(config.ROBOT);

        const robotItem = newItem.find(item => item.name === robot.item);

        if(robotItem) {

          logger.log('info', 'Starting robot');
          logger.log('debug',robotItem);

          const response = await asyncPostRequest(config.STORE_LOGIN_URL, {
            form: {
              'customer[email]': robot.username,
              'customer[password]': robot.password
            }
          });
          logger.log('info', 'Auth request completed..');

          const cookieData = getCookieData(response);
          await robotProcess(cookieData, robotItem);
        }
      }

      if(!config.IS_ROBOT_ONLY) {
        logger.log('info', 'Sending Email..');

        let notifications = await redisGetAsync('notifications') || '[]';
        notifications = JSON.parse(notifications);

        notifications.push({timestamp: moment.utc().format(), message: newItem});

        await redisSetAsync('notifications', JSON.stringify(notifications));

        logger.log('info', 'Required Notification');
        logger.log('debug', newItem);

        const htmlBody = newItem.map(currentValue => `<li><a href="${currentValue.link}">${currentValue.name}</a></li>`).join('');

        const client = nodemailer.createTransport(sgTransport({
          auth: {
            api_user: config.SENDGRID_USERNAME,
            api_key: config.SENDGRID_PASSWORD
          }
        }));

        const mailOptions = {
          from: config.FROM_GMAIL_ADDRESS,
          to: config.TO_GMAIL_ADDRESS,
          subject: 'IMPORTANT :: CS Alert', // Subject line
          html: `<h3>Available Item List.</h3><ui>${htmlBody}</ui>`// plain text body
        };

        client.sendMail(mailOptions);

        let existingDevice = await redisGetAsync('devices') || '[]';
        existingDevice = JSON.parse(existingDevice);

        logger.log('debug', existingDevice);

        const messages = existingDevice.map(device => ({
          to: device,
          sound: 'default',
          title: 'Store Item available',
          body: newItem.map(currentValue => currentValue.name).join(', ')
        }));

        await fetch(config.EXPO_PUSH_NOTI_URL, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages)
        });
      }
    }
  }
  logger.log('info', 'End Process..');
}
//start();

module.exports = {
  start
};

