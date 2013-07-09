var twitter = require("twitter"),
  Stream = require("user-stream"),
  fs = require('fs'),
  config = require("./config.json"), // See config-sample.json
  friends = [], // Users this account follows
  tweetQueue = {},
  environment = "dev", // 'dev' for development or 'prod' for production
  show_heartbeat = true, // logs '--^v--' to stdout only
  logfile = "log.txt"; // name of the file you want log messages to output to

config = config[environment];

// Misc helpers

function padNum (n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
};

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function timestamp () {
  var d = new Date();
  var time = [padNum(d.getHours()), padNum(d.getMinutes()), padNum(d.getSeconds())].join(':');
  return [padNum(d.getDate()), months[d.getMonth()], time].join(' ');
}

function log (message, time){
  var message = time ? message : timestamp() + " - " + message;
  fs.appendFile(logfile, message + "\n", function (err) {
    if (err) throw err;
    console.log(message);
  })
}

function parseURLs (text) {
  var source = (text || "").toString(),
    urlArray = [],
    matchArray,
    regex = /(((https?):\/\/)[\-\w@:%_\+.~#?,&\/\/=]+)/g;

  while( (matchArray = regex.exec( source )) !== null ){
    var url = matchArray[0];
    urlArray.push( url );
  }
  return urlArray
}

// twttr functions

function sendTweet (status) {
  twttr.updateStatus(status,
    function (data) {
      if (data.id_str) {
        log("Tweet " + data.id_str + ": " + data.text, timestamp());
      }
    }
  );
}

function sendDM (user_id, text) {
  twttr.newDirectMessage(user_id, text,
    function (data) {
      if (data.recipient) {
        log("DM to @" + data.recipient.id_str + ": " + data.text, timestamp())
      }
    }
  );
}

// userStream helpers

function handleEvent (event, data){
  switch (event)
  {
    case "follow":
      if (data.source.id_str === config.user_id) {
        friends.push(data.target.id_str);
        log("Added @" + data.target.screen_name + " to friends.", timestamp())
      }
    break;
    case "unfollow":
      if (data.source.id_str === config.user_id) {
        friends = friends.filter(function (friend) {
          return friend !== data.target.id_str;
        });
        log("Removed @" + data.target.screen_name + " from friends.", timestamp())
      }
    break;
  }
}

function parseDM (data){
  var message_id = data.direct_message.id_str,
    sender_id  = data.direct_message.sender.id_str,
    screen_name  = data.direct_message.sender.screen_name;

  if (sender_id !== config.user_id) {

    log("DM from @" + screen_name + "(" + sender_id + ") " + message_id, timestamp());

    if (sender_id === config.admin_id) {
      if (data.direct_message.text = "ping"){
        sendDM(parseInt(sender_id), timestamp() + " pong!")        
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

      tweetQueue[message_id] = tmpQueue;

      if (tweetQueue[message_id] && tweetQueue[message_id].urls.length > 0){
        if (tweetQueue[message_id].urls.length > 1){
          sendDM(parseInt(sender_id), timestamp() + " Received " + tweetQueue[message_id].urls.length + " links: \n" + tweetQueue[message_id].urls.join(" \n"));
          tweetQueue[message_id].urls.forEach(function (url) {
            sendTweet(url);
          });
        }else{
          sendDM(parseInt(sender_id), timestamp() + " Received " + tweetQueue[message_id].urls.length + " link: \n" + tweetQueue[message_id].urls[0]);
          sendTweet(tweetQueue[message_id].urls[0]);
        }

      }

    }

  }

}

// Create Twitter REST API and user-stream clients

var twttr = new twitter ({
  consumer_key: config.consumer_key,
  consumer_secret: config.consumer_secret,
  access_token_key: config.oauth_token,
  access_token_secret: config.oauth_secret,
  rest_base: "https://api.twitter.com/1.1"
});

var userStream = new Stream({
  consumer_key: config.consumer_key,
  consumer_secret: config.consumer_secret,
  access_token_key: config.oauth_token,
  access_token_secret: config.oauth_secret,
});

// Verify credentials and connect if successful

twttr.verifyCredentials(function (data) {
  if (data.id_str){
    userStream.stream();
  } else {
    log("Error", timestamp());
    log(data, false)
  }
});

// userStream listeners

userStream.on("connected", function (data) {
  log("Listening to " + config.screen_name, timestamp());
  sendDM(parseInt(config.admin_id), timestamp() + " Listening to " + config.screen_name);
});

userStream.on("data", function (data) {
  if (data.warning) {
    log("WARNING");
    sendDM(parseInt(config.admin_id), timestamp() + " WARNING: [" + data.code + "] " + data.message);
  }
  if (data.friends) {
    friends = data.friends.map(String); // TODO: Update this for 64bit user IDs
    log("Loaded friends");
  }
  if (data.event) {
    handleEvent(data.event, data);
  }  
  if (data.direct_message) {
    parseDM(data);
  };
});

userStream.on("error", function (error) {
  log("ERROR!");
  log(error, true);
  sendDM(parseInt(config.admin_id), timestamp() + " ERROR");
});

userStream.on("close", function (error) {
  log(error);
  log("Reconnecting")
  sendDM(parseInt(config.admin_id), timestamp() + " Reconnecting");
  userStream.stream();
});

userStream.on("heartbeat", function (){
  if (show_heartbeat = true) {
    console.log(timestamp() + " - --^v--")
  }
});

userStream.on("garbage", function (data){
  log("Can't be formatted:");
  log(data);
});

