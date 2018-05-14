#! /app/.heroku/node/bin/node
const puppeteer = require('puppeteer');
const request = require('request');
const redis = require('redis');
const {promisify} = require('util');
const config = require('config');
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

const robotProcess = async (cookieData, { link }) => {
  let browser = await puppeteer.launch(config.PRODUCTION ? {args: ['--no-sandbox']} : {headless: false, devtools: true});
  try {
    let [ page ] = await browser.pages();
    await page.setCookie(...cookieData);
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

    await page.setDefaultNavigationTimeout(60000);
    await page.goto(config.STORE_CART_URL, {waitUntil: 'networkidle2'});
    await page.waitFor(2 * 1000);
    await page.click(checkoutBtn);

    await page.waitForNavigation();
    await page.waitFor(2 * 1000);
    await page.click(continueBtn);

    await page.waitForNavigation();
    await page.waitFor(2 * 1000);
    //await page.click(continueBtn);

    await page.waitForNavigation();
    await page.waitFor(2 * 1000);
    //await page.click(continueBtn);

    await page.waitForNavigation();
    await page.waitFor(2 * 1000);
    //await page.click(continueBtn);

    await page.waitForNavigation();
    await page.waitFor(2 * 1000);

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

  const cookieData = getCookieData(response);

  logger.log('info', 'Staring fake browser..');

  const browser = await puppeteer.launch(config.PRODUCTION ? { args: ['--no-sandbox'] } : {headless: false, devtools: true});
  const [ page ] = await browser.pages();
  await page.setCookie(...cookieData);

  await page.goto(config.STORE_SCAN_URL, {waitUntil: 'networkidle2'});

  const resultsSelector = '.product';
  await page.waitForSelector(resultsSelector);

  logger.log('info', 'Staring DOM scan..');

  const scanResult = await page.evaluate(({itemToSearch,resultsSelector}) => {
    const filterData = Array.from(document.querySelectorAll(resultsSelector)).filter(item => itemToSearch.includes(item.dataset.alpha) && item.querySelectorAll('.so.icn').length == 0)
    return filterData.length > 0 ? filterData.map(item => ({name:item.dataset.alpha,link:item.querySelector('a').href})) : null;
  }, {itemToSearch,resultsSelector}) || [];

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
    }
  }
  logger.log('info', 'End Process..');
}
//start();

module.exports = {
  start
};

