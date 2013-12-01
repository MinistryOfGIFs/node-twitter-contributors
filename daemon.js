var util = require("util"),
    twitter = require("twitter"),
    Tumblr = require("tumblrwks"),
    request = require('request'),
    Stream = require("user-stream"),
    fs = require('fs'),
    environment = "prod", // 'dev' for development or 'prod' for production
    config_file = require("./config.json"), // See config-sample.json
    config = config_file[environment],
    logfile = "./logs/" + config.twitter.screen_name + "-log.txt", // name of the file you want log messages to output to
    friends = [], // Users this account follows, populated when the 'friends' event is streamed on connection
    tweet_queue = [],
    show_heartbeat = true, // logs '--^v--' to stdout only
    heartbeat_timer = null,
    tweet_rate = 30, // Minutes between Tweets
    queue_timer = {},
    processing_queue = 0,
    reconnecting = 0;

var errorCodes = {
  "403": { message: " ERROR 403: Forbidden", reconnectTimeout: 240 },
  "420": { message: " ERROR 420: Enhance Your Calm", reconnectTimeout: 600 },
  "429": { message: " ERROR 429: Too Many Requests", reconnectTimeout: 900 },
  "503": { message: " ERROR 503: Service Unavailable", reconnectTimeout: 240 },
  "default": { message: " ERROR ", reconnectTimeout: 240 }
};
// Misc helpers

function timestamp() {
  var d = new Date();
  var parts = d.toString().split(' ');
  var day = parts[2];
  var month = parts[1];
  var time = parts[4];
  return [day, month, time].join(' ');
}

function log(message) {
  fs.appendFile(logfile, message + "\n", function (err) {
    if (err) { throw err; }
    console.log(message);
  });
}

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
      log(timestamp() + " Heartbeat timed out, reconnecting in 4 minutes");
      clearInterval(heartbeat_timer);
      reconnectStream(240);
    }
  }, 1000);
}

// twttr setup and helpers

var twttr = new twitter({
  consumer_key: config.twitter.consumer_key,
  consumer_secret: config.twitter.consumer_secret,
  access_token_key: config.twitter.oauth_token,
  access_token_secret: config.twitter.oauth_secret,
  rest_base: "https://api.twitter.com/1.1"
});

var tumblr = new Tumblr(
  {
    consumerKey: config.tumblr.consumer_key,
    consumerSecret: config.tumblr.consumer_secret,
    accessToken: config.tumblr.oauth_token,
    accessSecret: config.tumblr.oauth_secret

  }, config.tumblr.blog_name + ".tumblr.com");

function sendTweet(status, callback) {
  twttr.updateStatus(status,
    function (data) {
      if (data.id_str) {
        callback(data.id_str, data.text);
      }
    }
  );
}

function sendDM(user_id, text) {
  twttr.newDirectMessage(parseInt(user_id, 10), text, function (data) {
// twttr.newDirectMessage({user_id: user_id}, text, function (data) {
    if (data.recipient) {
      log(timestamp() + " DM sent to @" + data.recipient.screen_name + ": " + data.text);
    } else if (data.statusCode) {
      log(timestamp() + " DM error: " + data.statusCode + ": " + data.message);
    }
  });
}

function postFromQueue(){
  var url_info = tweet_queue.shift();
  tumblr.post('/post', {
    type: 'text',
    title: "#", // I don't like the permalink format, this negates them
    body: "<a href=\"" + url_info.url + "\" target=\"_blank\"><img src=\"" + url_info.url + "\" class=\"inline-tweet-media\"/></a><br/><a href=\"" + url_info.url + "\">Source</a>"
  }, function(err, post_data){
    var post_url = "http://" + config.tumblr.blog_url + "/post/" + post_data.id;
    sendTweet(url_info.url, function(tweet_id, tweet_text){
      var msg = timestamp() + " Tweeted https://twitter.com/" + config.twitter.screen_name + "/status/" + tweet_id;
      log(msg);
      sendDM(url_info.user_id, msg);
    });
  });

}

function processQueue(){
  if (processing_queue === 0){
    processing_queue = 1;
    queue_timer = setInterval(function(){
      if (tweet_queue.length < 1){
        processing_queue = 0;
        clearInterval(queue_timer);
      }else{
        postFromQueue();
      }
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

function initStream() {
  // Verify credentials and connect if successful
  twttr.verifyCredentials(function (data) {
    if (data.id_str) {
      userStream.stream();
      reconnecting = 0;
      heartbeatTimer(120);
    } else if (data.statusCode) {
      log(timestamp() + " Connection error: " + data.statusCode + ": " + data.message);
      var errorCode = data.statusCode;
      if (errorCodes[errorCode]){
        log(timestamp() + errorCodes[errorCode].message);
        sendDM(config.twitter.admin_id, timestamp() + errorCodes[errorCode].message);
        reconnectStream(errorCodes[errorCode].reconnectTimeout);
      } else {
        log(timestamp() + errorCodes["default"].message);
        log(util.inspect(error, {depth:null}));
        sendDM(config.twitter.admin_id, timestamp() + errorCodes["default"].message + errorCode);
        reconnectStream(errorCodes["default"].reconnectTimeout);
      }
    } else {
      console.log(timestamp() + "### ERROR ###");
      console.log(timestamp() + util.inspect(data, {depth:null}));
      console.log(timestamp() + " Connection failed, retrying in 4 minutes...");
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
      log(timestamp() + " Added @" + data.target.screen_name + " to friends.");
    } else {
      // Notify the admin when followed by a user with more than x followers
      if (parseInt(data.source.followers_count, 10) > 1000) {
        sendDM(config.twitter.admin_id, timestamp() + " Followed by @" + data.source.screen_name + " (" + data.source.followers_count + " followers)");
      }
    }
  } else if (event === 'unfollow') {
    // This event is only available for the current authed user. This is not received when a user unfollows you.
    if (data.source.id_str === config.twitter.user_id) {
      friends = friends.filter(function (friend) {
        return friend !== data.target.id_str;
      });
      log(timestamp() + " Removed @" + data.target.screen_name + " from friends.");
    }
  }
}

function parseMessage (data) {
  // Handle incoming Tweets and DMs
  console.log(util.inspect(data));
  if (data.user_id !== config.twitter.user_id) {
    log(timestamp() + " " + data.message_type + " from @" + data.screen_name + "(" + data.user_id + ") " + data.message_id);
    var urls = parseURLs(data.text);
    urls.forEach(function (url) {
      var tmp_queue = { message_id: data.message_id,
                        created_at: data.created_at,
                        user_id: data.user_id,
                        screen_name: data.screen_name,
                        text: data.text,
                        url: url };
      tweet_queue.push(tmp_queue);
      twttr.getUserTimeline({"count": 1}, function(tweet_data){
        var system_date = new Date();
        var tweet_date = tweet_data[0] ? new Date(Date.parse(tweet_data[0].created_at)) : 0;
        var since_last = Math.floor((system_date - tweet_date) / 60000);
        if (since_last <= tweet_rate){
          sendDM(tmp_queue.user_id, timestamp() + " Queued " + tmp_queue.url);
          processQueue();
        }else{
          postFromQueue();
        }
      });
    });
  }
}

// Initialize userStream
initStream();

// userStream listeners
userStream.on("connected", function (data) {
  log(timestamp() + " Connected to @" + config.twitter.screen_name + ".");
});

userStream.on("data", function (data) {
  if (data.warning) {
    log(timestamp() + " WARNING");
    sendDM(config.twitter.admin_id, timestamp() + " WARNING: [" + data.code + "] " + data.message);
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
      var tweet_data = { message_id: data.id_str,
                   message_type: "Tweet",
                   created_at: data.created_at,
                   user_id: data.user.id_str,
                   screen_name: data.user.screen_name,
                   text: data.entities.urls[0].expanded_url };
      parseMessage(tweet_data);
    }
  }
  if (data.direct_message && friends.indexOf(data.direct_message.sender.id_str) > -1) {
    if (data.direct_message.sender.id_str === config.twitter.admin_id) {
      if (data.direct_message.text === "queue") {
        sendDM(data.direct_message.sender.id_str, timestamp() + " " + (tweet_queue.length || 0) + " links queued");
      }
    }
    var dm_data = { message_id: data.direct_message.id_str,
                 message_type: "DM",
                 created_at: data.direct_message.created_at,
                 user_id: data.direct_message.sender.id_str,
                 screen_name: data.direct_message.sender.screen_name,
                 text: data.direct_message.text };
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
      log(timestamp() + errorCodes[errorCode].message);
      sendDM(config.twitter.admin_id, timestamp() + errorCodes[errorCode].message);
      reconnectStream(errorCodes[errorCode].reconnectTimeout);        
    } else {
      log(timestamp() + errorCodes.default.message);
      log(util.inspect(error, {depth:null}));
      sendDM(config.twitter.admin_id, timestamp() + errorCodes.default.message + errorCode);
      reconnectStream(errorCodes.default.reconnectTimeout);        
    }
  }

  if (error.type && error.type === 'request') {
    sendDM(config.twitter.admin_id, timestamp() + " SOCKET ERROR: Reconnecting in 4 minutes.");
    reconnectStream(480);
  }

});

userStream.on("close", function (error) {
  log(timestamp() + " Closed:");
  log(util.inspect(error, {depth:null}));
  log(timestamp() + " Reconnecting...");
  reconnectStream(480);
});

userStream.on("heartbeat", function () {
  clearInterval(heartbeat_timer);
  heartbeatTimer(120);
  if (show_heartbeat) {
    console.log(timestamp() + " - --^v--");
  }
});

userStream.on("garbage", function (data) {
  log(timestamp() + " Can't be formatted:");
  log(data);
});

