environment = "dev", // 'dev' for development or 'prod' for production
config_file = require("./config.json"), // See config-sample.json
config      = config_file[environment],
util        = require("util"),
twitter     = require("user-stream");

var userStream = new Stream({
  consumer_key: config.twitter.consumer_key,
  consumer_secret: config.twitter.consumer_secret,
  access_token_key: config.twitter.oauth_token,
  access_token_secret: config.twitter.oauth_secret,
});

var errorCodes = {
  "403": { message: " ERROR 403: Forbidden", reconnectTimeout: 240 },
  "420": { message: " ERROR 420: Enhance Your Calm", reconnectTimeout: 600 },
  "429": { message: " ERROR 429: Too Many Requests", reconnectTimeout: 900 },
  "503": { message: " ERROR 503: Service Unavailable", reconnectTimeout: 240 },
  "default": { message: " ERROR ", reconnectTimeout: 240 }
};
