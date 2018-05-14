#! /app/.heroku/node/bin/node
const puppeteer = require('puppeteer');
const request = require('request');
const redis = require('redis');
const {promisify} = require('util');
const moment = require('moment');
const config = require('config');
const winston = require('winston');
const fetch = require('node-fetch');
const { isEqual, difference } = require('lodash');

const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      colorize: 'all',
    }),
  ],
});

const asyncPostRequest = promisify(request.post);

const start = async () => {

  logger.log('info', 'Staring Process..');
  const response = await asyncPostRequest(config.STORE_LOGIN_URL, {
    form: {
      'customer[email]': config.STORE_USER_NAME,
      'customer[password]': config.STORE_PASSWORD
    }
  });
  logger.log('info', 'Auth request completed..');

  const cookieData = response.headers['set-cookie'].map((cookie) => {
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

  console.log(cookieData);

  logger.log('info', 'Staring fake browser..');
  const newItem = [{name:'Leather & Metal Key Fob',link:'https://appirio.myshopify.com/products/leather-metal-key-fob'}];

  if(config.ROBOT) {
    const robot = JSON.parse(config.ROBOT);

    const robotItem = newItem.find(item => item.name === robot.item);

    if(robotItem) {

      logger.log('info', 'Starting robot');
      console.log(robotItem);

      let browser = await puppeteer.launch({headless: false, devtools: true});
      let page = await browser.newPage();
      await page.setCookie(...cookieData);

      const addBtn = '.swell-buy-product-btn';
      const yesBtn = '.jconfirm-box .btn-default';

      logger.log('info', 'Staring fake browser for robot ..');

      await page.goto(robotItem.link, {waitUntil: 'networkidle0'});

      await page.waitFor(2 * 1000);

      await page.click(addBtn);

      await page.waitFor(2 * 1000);

      await page.click(yesBtn);

      await page.waitFor(5 * 1000);

      page = await browser.newPage();
      await page.setCookie(...cookieData);

      await page.goto('https://appirio.myshopify.com/cart',{waitUntil: 'networkidle2'});

      const checkoutBtn = '#checkout';

      await page.click(checkoutBtn);

      await page.waitForNavigation();
      await page.waitFor(2 * 1000);

      const continueBtn = '.step__footer__continue-btn';

      await page.click(continueBtn);

      await page.waitForNavigation();
      await page.waitFor(2 * 1000);

      await page.click(continueBtn);

      await page.waitForNavigation();
      await page.waitFor(2 * 1000);

      //await page.click(continueBtn);

      //await page.waitForNavigation();

      //await page.click(continueBtn);

      //await page.waitForNavigation();

      //await browser.close();

      logger.log('info', 'Ending robot');
    }
  }

  logger.log('info', 'End Process..');
}

start();