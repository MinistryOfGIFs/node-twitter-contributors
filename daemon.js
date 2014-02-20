var util             = require("util"),
    logger           = require('./logger.js'),
    environment      = "prod", // 'dev' for development or 'prod' for production
    config_file      = require("./config.json"), // See config-sample.json
    config           = config_file[environment],
    database         = require('./db.js'),
    twttr_actions    = require('./twttr_actions.js'),
    tumblr_actions   = require("./tumblr_actions.js"),
    request          = require('request'),
    Stream           = require("user-stream"),
    friends          = [], // Users this account follows, populated when the 'friends' event is streamed on connection
    show_heartbeat   = true, // logs '--^v--' to stdout only
    heartbeat_timer  = null,
    tweet_rate       = 30, // Minutes between Tweets
    queue_timer      = {},
    processing_queue = 0,
    reconnecting     = 0;

var db      = new database(config),
    twitter = new twttr_actions(config),
    tumblr  = new tumblr_actions(config),
    logger  = new logger(config);

// Misc helpers

var parseURLregex = /(((https?):\/\/)[\-\w@:%_\+.~#?,&\/\/=]+)/g;
function parseURLs(text) {
  return String(text).match(parseURLregex) || [];
}

function expandURLs (urls, cb) {
  var expandedURLs = [];
  var expandURL = function(urls) {
    if (expandedURLs.length === urls.length) {
      cb(null, expandedURLs);
      } else {
      request({ method: "HEAD", url: urls[expandedURLs.length], followAllRedirects: true }, function(err, response) {
        if (err) { return cb(err); }
        // console.log(response.request.response.headers['content-type']);
        expandedURLs.push(response.request.href);
        expandURL(urls);
      });
    }
  };
  expandURL(urls);
}

function heartbeatTimer(timeout) {
  if ( reconnecting = 1 ) { return }
  timeout = timeout || 0;
  heartbeat_timer = setInterval(function () {
    if (timeout > 1) {
      timeout--;
    } else {
      logger.log(logger.timestamp() + " Heartbeat timed out, reconnecting in 4 minutes");
      clearInterval(heartbeat_timer);
      reconnectStream(240);
    }
  }, 1000);
}

// queue helpers

function postFromQueue(){
  db.getOldest(function(results){
    url_info = results[0];
    tumblr.post(url_info.url, function(err, post_data){
      var post_url = "http://" + config.tumblr.blog_url + "/post/" + post_data.id;
      twitter.tweet(url_info.url, function(tweet_id, tweet_text){
        updateVals = {
          "queue_state": 1,
          "posted_at": logger.epochTimestamp(),
          "tumblr_id": post_data.id,
          "tweet_id": tweet_id
        };
        db.update(updateVals, url_info.record_id);
        var msg = logger.timestamp() + " Posted (" + url_info.record_id + "):\nhttps://twitter.com/" + config.twitter.screen_name + "/status/" + tweet_id + "\n" + post_url;
        logger.log(msg);
        twitter.dm(url_info.user_id, msg);
      });
    });
  });
}

function processQueue(){
  if (processing_queue === 0){
    processing_queue = 1;
    queue_timer = setInterval(function(){
      db.get("queue_state", 0, function(tweet_queue){
        if (tweet_queue.length < 1){
          processing_queue = 0;
          clearInterval(queue_timer);
        }else{
          postFromQueue();
        }
      });
    }, tweet_rate * 60e3);
  }
}

// userStream setup and helpers

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

function initStream() {
  // Verify credentials and connect if successful
  twitter.verify(function (data) {
    if (data.id_str) {
      userStream.stream();
      reconnecting = 0;
      heartbeatTimer(120);
    } else if (data.statusCode) {
      logger.log(logger.timestamp() + " Connection error: " + data.statusCode + ": " + data.message);
      var errorCode = data.statusCode;
      if (errorCodes[errorCode]){
        logger.log(logger.timestamp() + errorCodes[errorCode].message);
        twitter.dm(config.twitter.admin_id, logger.timestamp() + errorCodes[errorCode].message);
        reconnectStream(errorCodes[errorCode].reconnectTimeout);
      } else {
        logger.log(logger.timestamp() + errorCodes["default"].message);
        logger.log(util.inspect(error, {depth:null}));
        twitter.dm(config.twitter.admin_id, logger.timestamp() + errorCodes["default"].message + errorCode);
        reconnectStream(errorCodes["default"].reconnectTimeout);
      }
    } else {
      console.log(logger.timestamp() + "### ERROR ###");
      console.log(logger.timestamp() + util.inspect(data, {depth:null}));
      console.log(logger.timestamp() + " Connection failed, retrying in 4 minutes...");
      reconnectStream(240);
    }
  });
}

function reconnectStream(timeout) {
  // Kill current connection and reconnect
  timeout = timeout || 0;
  reconnecting = 1;
  userStream.destroy();
  setTimeout(function () {
    initStream();
  }, timeout * 1000);
}

function handleEvent(event, data) {
  if (event === 'follow') {
    // Handle outgoing follow events for the authed user as well as incoming follows
    if (data.source.id_str === config.twitter.user_id) {
      friends.push(data.target.id_str);
      logger.log(logger.timestamp() + " Added @" + data.target.screen_name + " to friends.");
    } else {
      // Notify the admin when followed by a user with more than x followers
      if (parseInt(data.source.followers_count, 10) > 1000) {
        twitter.dm(config.twitter.admin_id, logger.timestamp() + " Followed by @" + data.source.screen_name + " (" + data.source.followers_count + " followers)");
      }
    }
  } else if (event === 'unfollow') {
    // This event is only available for the current authed user. This is not received when a user unfollows you.
    if (data.source.id_str === config.twitter.user_id) {
      friends = friends.filter(function (friend) {
        return friend !== data.target.id_str;
      });
      logger.log(logger.timestamp() + " Removed @" + data.target.screen_name + " from friends.");
    }
  } else if (event === 'favorite') {
    db.get("tweet_id", data.target_object.id_str, function(result){
      if(result.length > 0){
        db.update("favs","favs+1", result[0].record_id);
        logger.log(logger.timestamp() + " @" + data.source.screen_name + " faved " + data.target_object.id_str);
        var fav_count = (result[0].favs+1);
        if(fav_count % 10 == 0){
          var msg = logger.timestamp() + " Your post recieved " + fav_count + " favs: https://twitter.com/" + config.twitter.screen_name + "/status/" + result[0].tweet_id;
          twitter.dm(result[0].user_id, msg);
        }
      }
    });
  } else if (event === 'unfavorite') {
    db.get("tweet_id", data.target_object.id_str, function(result){
      if(result.length > 0){
        db.update("favs","favs-1", result[0].record_id);
        logger.log(logger.timestamp() + " @" + data.source.screen_name + " unfaved " + data.target_object.id_str);
      }
    });
  }
}

function parseMessage (data) {
  // Handle incoming Tweets and DMs
  if (data.user_id !== config.twitter.user_id) {
    logger.log(logger.timestamp() + " " + data.message_type + " from @" + data.screen_name + "(" + data.user_id + ") " + data.message_id);
    var urls = parseURLs(data.text);
    urls.forEach(function (url) {
      db.insert([null, data.message_id, data.user_id, data.screen_name, data.text, url, null, null, 0, 0, logger.epochTimestamp(), 0, 0], function(record_id){
        db.getLastPosted(function(result){
          var system_date = Date.now();
          var last_post = result.length > 0 ? result[0].posted_at : 0;
          var since_last = Math.floor((system_date - last_post) / 60000);
          if (since_last <= tweet_rate){
            twitter.dm(data.user_id, logger.timestamp() + " Queued (" + record_id + ") " + url);
            processQueue();
          }else{
            postFromQueue();
          }
        });
      });
    });
  }
}

// Initialize userStream
initStream();

// userStream listeners
userStream.on("connected", function (data) {
  logger.log(logger.timestamp() + " Connected to @" + config.twitter.screen_name + ".");
  // twitter.dm(config.twitter.admin_id, logger.timestamp() + " Connected to @" + config.twitter.screen_name + ".");
  processQueue();
});

userStream.on("data", function (data) {
  if (data.warning) {
    logger.log(logger.timestamp() + " WARNING");
    twitter.dm(config.twitter.admin_id, logger.timestamp() + " WARNING: [" + data.code + "] " + data.message);
  }
  if (data.friends) {
    friends = data.friends.map(String); // TODO: Update this for 64bit user IDs
  }
  if (data.event) {
    handleEvent(data.event, data);
  }
  if (data.entities && !data.in_reply_to_status_id_str && !data.retweeted_status && friends.indexOf(data.user.id_str) > -1) {
    var user_mentions = data.entities.user_mentions,
        users = [];
    for(var i = 0; i < user_mentions.length; i++){
      users.push(user_mentions[i].id_str);
    }
    if (users.length === 1 && users.indexOf(config.twitter.user_id) > -1) {
      var tweet_url = (data.entities.urls[0] = undefined ? data.entities.urls[0].expanded_url : data.text)
      var tweet_data = {
        message_id: data.id_str,
        message_type: "Tweet",
        created_at: data.created_at,
        user_id: data.user.id_str,
        screen_name: data.user.screen_name,
        text: tweet_url
      };
      parseMessage(tweet_data);
    }
  }
  if (data.direct_message && friends.indexOf(data.direct_message.sender.id_str) > -1) {
    if (data.direct_message.sender.id_str === config.twitter.admin_id) {
      if (data.direct_message.text === "queue") {
        db.get("queue_state", 0, function(tweet_queue){
          typeof data.direct_message.sender.id_str;
          twitter.dm(data.direct_message.sender.id_str, logger.timestamp() + " " + (tweet_queue.length || 0) + " links queued");
        });
      }
    }
    var dm_data = {
      message_id: data.direct_message.id_str,
      message_type: "DM",
      created_at: data.direct_message.created_at,
      user_id: data.direct_message.sender.id_str,
      screen_name: data.direct_message.sender.screen_name,
      text: data.direct_message.text
    };
    parseMessage(dm_data);
  }
});

userStream.on("error", function (error) {

  if (!error.type) {
    // Temporary debug statements until I get this damn thing working properly...
    console.log("###### ERROR TYPE MISSING ######");
    console.log(util.inspect(error, {depth:null}));
  }
  console.log(util.inspect(error, {depth:null}));

  if (error.type && error.type === 'response') {
    var errorCode = error.data.code;
    if (errorCodes[errorCode]){
      logger.log(logger.timestamp() + errorCodes[errorCode].message);
      twitter.dm(config.twitter.admin_id, logger.timestamp() + errorCodes[errorCode].message);
      reconnectStream(errorCodes[errorCode].reconnectTimeout);        
    } else {
      logger.log(logger.timestamp() + errorCodes.default.message);
      logger.log(util.inspect(error, {depth:null}));
      twitter.dm(config.twitter.admin_id, logger.timestamp() + errorCodes.default.message + errorCode);
      reconnectStream(errorCodes.default.reconnectTimeout);        
    }
  }

  if (error.type && error.type === 'request') {
    twitter.dm(config.twitter.admin_id, logger.timestamp() + " SOCKET ERROR: Reconnecting in 4 minutes.");
    reconnectStream(480);
  }

});

userStream.on("close", function (error) {
  logger.log(logger.timestamp() + " Closed:");
  logger.log(util.inspect(error, {depth:null}));
  logger.log(logger.timestamp() + " Reconnecting...");
  reconnectStream(480);
});

userStream.on("heartbeat", function () {
  clearInterval(heartbeat_timer);
  heartbeatTimer(120);
  if (show_heartbeat) {
    console.log(logger.timestamp() + " - --^v--");
  }
});

userStream.on("garbage", function (data) {
  logger.log(logger.timestamp() + " Can't be formatted:");
  // logger.log(data);
  // console.log(JSON.parse(data));
});
