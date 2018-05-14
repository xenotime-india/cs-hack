const http = require('http');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const api = require('./api');
const middleware = require('./middleware');
const config = require('config');

let app = express();
app.server = http.createServer(app);

// logger
app.use(morgan('dev'));

// 3rd party middleware
app.use(cors({
  exposedHeaders: config.corsHeaders
}));

app.use(bodyParser.json({
  limit : config.bodyLimit
}));

app.use(middleware());

// api router
app.get('/', (req, res) => {
  res.send('App is running fine..');
});
app.use('/api', api());

app.server.listen(config.PORT, () => {
  console.log(`Started on port ${config.PORT}`);
});

module.exports = app;