var util = require("util"),
    twitter = require("twitter"),
    Stream = require("user-stream"),
    fs = require('fs'),
    request = require('request'),
    environment = "dev", // 'dev' for development or 'prod' for production
    config_file = require("./config.json"), // See config-sample.json
    config = config_file[environment],
    logfile = "./logs/" + config.screen_name + "-log.txt", // name of the file you want log messages to output to
    friends = [], // Users this account follows, populated when the 'friends' event is streamed on connection
    tweet_queue = [],
    show_heartbeat = true, // logs '--^v--' to stdout only
    heartbeat_timer = null,
    tweet_rate = 15, // Minutes between Tweets
    queue_timer = {},
    processing_queue = 0;

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
  timeout = timeout || 0;
  heartbeat_timer = setInterval(function () {
    if (timeout > 1) {
      timeout--;
    } else {
      log(timestamp() + " Heartbeat timed out, reconnecting...");
      clearInterval(heartbeat_timer);
      reconnectStream();
    }
  }, 1000);
}

// twttr setup and helpers

var twttr = new twitter({
  consumer_key: config.consumer_key,
  consumer_secret: config.consumer_secret,
  access_token_key: config.oauth_token,
  access_token_secret: config.oauth_secret,
  rest_base: "https://api.twitter.com/1.1"
});

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
  twttr.newDirectMessage({user_id: user_id}, text, function (data) {
    if (data.recipient) {
      log(timestamp() + " DM sent to @" + data.recipient.screen_name + ": " + data.text);
    } else if (data.statusCode) {
      log(timestamp() + " DM error: " + data.statusCode + ": " + data.message);
    }
  });
}

function tweetFromQueue(){
  var url_info = tweet_queue.shift();
  sendTweet(url_info.url, function(tweet_id, tweet_text){
    var msg = timestamp() + " Tweeted https://twitter.com/" + config.screen_name + "/status/" + tweet_id;
    log(msg);
    sendDM(url_info.user_id, msg);
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
        tweetFromQueue();
      }
    }, tweet_rate * 60e3);
  }
}

// userStream setup and helpers

var userStream = new Stream({
  consumer_key: config.consumer_key,
  consumer_secret: config.consumer_secret,
  access_token_key: config.oauth_token,
  access_token_secret: config.oauth_secret,
});

function initStream() {
  // Verify credentials and connect if successful
  twttr.verifyCredentials(function (data) {
    if (data.id_str) {
      userStream.stream();
      heartbeatTimer(120);
    } else {
      log(timestamp() + " Error\n" + util.inspect(data, {depth:null}));
      log(timestamp() + " Connection failed, retrying in 2 minutes...");
      reconnectStream(120);
    }
  });
}

function reconnectStream(timeout) {
  // Kill current connection and reconnect
  timeout = timeout || 0;
  setTimeout(function () {
    userStream.destroy();
    initStream();
  }, timeout * 1000);
}

function handleEvent(event, data) {
  if (event === 'follow') {
    // Handle outgoing follow events for the authed user as well as incoming follows
    if (data.source.id_str === config.user_id) {
      friends.push(data.target.id_str);
      log(timestamp() + " Added @" + data.target.screen_name + " to friends.");
    } else {
      // Notify the admin when followed by a user with more than x followers
      if (parseInt(data.source.followers_count, 10) > 1000) {
        sendDM(config.admin_id, timestamp() + " Followed by @" + data.source.screen_name + " (" + data.source.followers_count + " followers)");
      }
    }
  } else if (event === 'unfollow') {
    // This event is only available for the current authed user. This is not received when a user unfollows you.
    if (data.source.id_str === config.user_id) {
      friends = friends.filter(function (friend) {
        return friend !== data.target.id_str;
      });
      log(timestamp() + " Removed @" + data.target.screen_name + " from friends.");
    }
  }
}

function parseMessage (data) {
  // Handle incoming DMs

  if (data.user_id !== config.user_id) {
    log(timestamp() + " " + data.message_type + " from @" + data.screen_name + "(" + data.user_id + ") " + data.message_id);
    if (friends.indexOf(data.user_id) > -1) {
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
            console.log('queued');
            sendDM(tmp_queue.user_id, timestamp() + " Queued " + tmp_queue.url);
            processQueue();
          }else{
            tweetFromQueue();
          }
        });
      });
    }
  }
}

// Initialize userStream
initStream();

// userStream listeners
userStream.on("connected", function (data) {
  log(timestamp() + " Connected to @" + config.screen_name + ".");
});

userStream.on("data", function (data) {
  if (data.warning) {
    log(timestamp() + " WARNING");
    sendDM(config.admin_id, timestamp() + " WARNING: [" + data.code + "] " + data.message);
  }
  if (data.friends) {
    friends = data.friends.map(String); // TODO: Update this for 64bit user IDs
  }
  if (data.event) {
    handleEvent(data.event, data);
  }
  if (data.entities && data.entities.hashtags && !data.in_reply_to_status_id_str && !data.retweeted) {
    var user_mentions = data.entities.user_mentions,
        users = [];
    for(var i = 0; i < user_mentions.length; i++){
      users.push(user_mentions[i].id_str);
    }
    if (users.length === 1 && users.indexOf(config.user_id) > -1) {
      var tweet_data = { message_id: data.id_str,
                   message_type: "Tweet",
                   created_at: data.created_at,
                   user_id: data.user.id_str,
                   screen_name: data.user.screen_name,
                   text: data.text };
      parseMessage(tweet_data);
    }
  }
  if (data.direct_message) {
    if (data.direct_message.sender.id_str === config.admin_id) {
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

  reconnectStream(240);

  if (error.type && error.type === 'response') {
    var errorCode = error.data.code;
    switch (errorCode) {
      case "420":
        sendDM(config.admin_id, timestamp() + " ERROR 420: Rate limited, Reconnecting in 10 minutes.");
        reconnectStream(600);
        break;
      case "503":
        sendDM(config.admin_id, timestamp() + " ERROR 503: Reconnecting in 2 minutes.");
        reconnectStream(240);
        break;
      default:
        sendDM(config.admin_id, timestamp() + " ERROR: " + errorCode);
    }
  }

  if (error.type && error.type === 'request') {
    sendDM(config.admin_id, timestamp() + " SOCKET ERROR: Reconnecting in 2 minutes.");
    reconnectStream(240);
  }

});

userStream.on("close", function (error) {
  log(timestamp() + " Closed:");
  log(error);
  log(timestamp() + " Reconnecting...");
  userStream.destroy();
  userStream.stream();
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

