var util = require("util"),
    twitter = require("twitter"),
    Stream = require("user-stream"),
    fs = require('fs');
    environment = "dev", // 'dev' for development or 'prod' for production
    config_file = require("./config.json"), // See config-sample.json
    config = config_file[environment],
    logfile = "./logs/" + config.screen_name + "-log.txt", // name of the file you want log messages to output to
    friends = [], // Users this account follows
    tweet_queue = {},
    show_heartbeat = true, // logs '--^v--' to stdout only
    heartbeat_timer = null;

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
    if (err) throw err;
    console.log(message);
  })
}

var parseURLregex = /(((https?):\/\/)[\-\w@:%_\+.~#?,&\/\/=]+)/g;
function parseURLs(text) {
  return String(text || '').match(parseURLregex);
}

function heartbeatTimer(timeout) {
  timeout = timeout || 0
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

function sendTweet(status) {
  twttr.updateStatus(status,
    function (data) {
      if (data.id_str) {
        log(timestamp() + " Tweeted " + data.id_str + ": " + data.text);
      }
    }
  );
}

function sendDM(user_id, text) {
  twttr.newDirectMessage(parseInt(user_id), text, function (data) {
    if (data.recipient) {
      log(timestamp() + " DM sent to @" + data.recipient.screen_name + ": " + data.text);
    }
  });
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
  })
}

function reconnectStream(timeout) {
  // Kill current connection and reconnect
  timeout = timeout || 0;
  reconnect_timer = setTimeout(function () {
    userStream.destroy();
    initStream();
  }, timeout * 1000);
}

function handleEvent(event, data) {
  if (event === 'follow') {
    // Handle follow events for the authed user as well as incoming follows
    if (data.source.id_str === config.user_id) {
      friends.push(data.target.id_str);
      log(timestamp() + " Added @" + data.target.screen_name + " to friends.")
    } else {
      // Notify the admin when followed by a user with more than x followers
      if (parseInt(data.source.followers_count) > 2000) {
        sendDM(config.admin_id, timestamp() + " Followed by @" + data.source.screen_name + " (" + data.source.followers_count + " followers)");
      };
    }
  } else if (event === 'unfollow') {
    // This event is only available for the current authed user. This is not received when a user unfollows you.
    if (data.source.id_str === config.user_id) {
      friends = friends.filter(function (friend) {
        return friend !== data.target.id_str;
      });
      log(timestamp() + " Removed @" + data.target.screen_name + " from friends.")
    }
  }
}

function parseDM (data) {
  // Handle incoming DMs
  var message_id = data.direct_message.id_str,
    sender_id  = data.direct_message.sender.id_str,
    screen_name  = data.direct_message.sender.screen_name;

  if (sender_id !== config.user_id) {

    log(timestamp() + " DM from @" + screen_name + "(" + sender_id + ") " + message_id);

    if (sender_id === config.admin_id) {
      if (data.direct_message.text === "ping") {
        sendDM(sender_id, timestamp() + " pong!");
      }
    }

    if (friends.indexOf(sender_id) > -1) {

      var tmpQueue = {
        message_id: message_id,
        sender_id: sender_id,
        sender: data.direct_message.sender.screen_name,
        created_at: data.direct_message.created_at,
        urls: parseURLs(data.direct_message.text)
      };

      tweet_queue[message_id] = tmpQueue;

      if (tweet_queue[message_id] && tweet_queue[message_id].urls.length > 0) {
        if (tweet_queue[message_id].urls.length > 1) {
          sendDM(sender_id, timestamp() + " Received " + tweet_queue[message_id].urls.length + " links: \n" + tweet_queue[message_id].urls.join(" \n"));
          tweet_queue[message_id].urls.forEach(function (url) {
            sendTweet(url);
          });
        } else {
          sendDM(sender_id, timestamp() + " Received " + tweet_queue[message_id].urls.length + " link: \n" + tweet_queue[message_id].urls[0]);
          sendTweet(tweet_queue[message_id].urls[0]);
        }

      }

    }

  }

}
// Initialize userStream

initStream();

// userStream listeners

userStream.on("connected", function (data) {
  log(timestamp() + " Connected to @" + config.screen_name + ".");
  sendDM(config.admin_id, timestamp() + " Connected.");
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
  if (data.direct_message) {
    parseDM(data);
  };
});

userStream.on("error", function (error) {
  log(timestamp() + " Error:\n" + util.inspect(error, {depth:null}));

  if (error[type] = 'response') {
    var errorCode = error[data][code];
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

  if (error[type] = 'request') {
    sendDM(config.admin_id, timestamp() + " SOCKET ERROR: Reconnecting in 2 minutes.");
    reconnectStream(240);
  }

});

userStream.on("close", function (error) {
  log(timestamp() + " Closed:");
  log(error);
  log(timestamp() + " Reconnecting...");
  sendDM(config.admin_id, timestamp() + " Reconnecting...");
  userStream.destroy();
  userStream.stream();
});

userStream.on("heartbeat", function () {
  clearInterval(heartbeat_timer);
  heartbeatTimer(120);
  if (show_heartbeat = true) {
    console.log(timestamp() + " - --^v--");
  }
});

userStream.on("garbage", function (data) {
  log(timestamp() + " Can't be formatted:");
  log(data);
});

