const { version } = require('../package.json');
const { Router } = require('express');
const registerDevice = require('./registerDevice');
const getAllNotifications = require('./getAllNotifications');

module.exports = () => {
  let api = Router();

  api.post('/registerDevice', registerDevice());
  api.get('/getAllNotifications', getAllNotifications());

  // perhaps expose some API metadata at the root
  api.get('/', (req, res) => {
    res.json({ version });
  });

  return api;
}