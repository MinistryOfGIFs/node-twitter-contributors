### @GIFs contributor daemon ###

This is a Node.js daemon to allow multiple users to post link to one Twitter account and Tumblr blog. It also tracks favs and provides feedback to contributors when their links get engagement.

While @GIFs is currently running on a Raspberry Pi, you may run this in any Node environment.

#### Installation & Setup ####

Install and configure [Node](http://nodejs.org/) and [NPM](https://www.npmjs.org/)

Create [Twitter API keys](https://apps.twitter.com/) and add them to config.json

Create [Tumblr API keys](http://www.tumblr.com/oauth/apps) and add them to config.json

#### Additional Configuration ####

Configs found in daemon.js:
```javascript
    environment      = "prod", // 'dev' for development or 'prod' for production
    config_file      = require("./config.json"), // See config-sample.json
    show_heartbeat   = false, // false logs heartbeat message to stdout only, true logs to logfile as well
    tweet_rate       = 20, // Minutes between Tweets
```

config.json
```javascript
{
  "prod": {
    "twitter": {
      "screen_name": "<main username>",
      "user_id": "<id of the account to control>",
      "admin_id": "<id of the account that will receive errors and notices>",
      "consumer_key": "xxx",
      "consumer_secret": "xxx",
      "oauth_token": "xxx",
      "oauth_secret": "xxx"
    },
    "tumblr": {
      "blog_name": "blog",
      "blog_url": "blog.tumblr.com",
      "consumer_key": "xxx",
      "consumer_secret": "xxx",
      "oauth_token": "xxx",
      "oauth_secret": "xxx"
    }
  },
  "dev": {
    "twitter": {
      "screen_name": "<dev username>",
      "user_id": "<id of the account to control during development>",
      "admin_id": "<id of the account that will receive errors and notices during development>",
      "consumer_key": "xxx",
      "consumer_secret": "xxx",
      "oauth_token": "xxx",
      "oauth_secret": "xxx"
    },
    "tumblr": {
      "blog_name": "blog-test",
      "blog_url": "blog-test.tumblr.com",
      "consumer_key": "xxx",
      "consumer_secret": "xxx",
      "oauth_token": "xxx",
      "oauth_secret": "xxx"
    }
  }
}
```
**TODO:**

* Track retweet counts
* Periodically backfill fav counts to make sure local counts match Twitter's counts
* Create contributor leaderboard


[Follow @GIFs on Twitter](https://twitter.com/gifs)

[Follow Ministry of GIFs on Facebook](https://www.facebook.com/theministryofgifs)

[Ministry of GIFs Tumblr archive](http://ministryofgifs.org)
