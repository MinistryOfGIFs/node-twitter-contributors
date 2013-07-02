var _ = require("underscore"), 
    twitter = require("twitter"),
    Stream = require("user-stream"),
    OAuth = require("oauth").OAuth,
    config = require("./config.json"), // See config-sample.json
    friends = [], 
    tweetQueue = {},
    env_config = "prod";

config = config[env_config];

var twoauth = new OAuth(
  "https://api.twitter.com/oauth/request_token",
  "https://api.twitter.com/oauth/access_token",
  config.consumer_key,
  config.consumer_secret,
  "1.0",
  null,
  "HMAC-SHA1"
);

var Twit = new twitter ({
    consumer_key: config.consumer_key,
    consumer_secret: config.consumer_secret,
    access_token_key: config.oauth_token,
    access_token_secret: config.oauth_secret,
    rest_base: "https://api.twitter.com/1.1"
});

function Tweet (status) {
  Twit.updateStatus(status,
    function(data) {
      if (data["id_str"]){
        console.log("Tweet sent: " + data["text"]);
      }
    }
  );
}

function DM (user_id, text) {
  console.log("DM: " + user_id);
  Twit.newDirectMessage(user_id, text,
    function(data) {
      if (data["recipient"]){
        console.log("DM sent: " + data["text"])
      }
    }
  );
}

function findUrls (text) {
  var source = (text || "").toString(),
      urlArray = [],
      matchArray,
      regexToken = /(((https?):\/\/)[\-\w@:%_\+.~#?,&\/\/=]+)/g;
  
  while( (matchArray = regexToken.exec( source )) !== null ){
    var url = matchArray[0];
    urlArray.push( url );
  }
  return urlArray
}

function handle_event (event, data){
  switch (event)
  {
    case "follow":
      console.log("Follow event: " + data["source"]["id_str"] + " => " + data["target"]["id_str"]);
      if (data["source"]["id_str"] === config.user_id){
        console.log("Added @" + data["target"]["screen_name"] + " to friends.")
        friends.push(data["target"]["id_str"]);
      }
    break;
    case "unfollow":
    console.log("Unfollow event: " + data["source"]["id_str"] + " => " + data["target"]["id_str"]);
      if (data["source"]["id_str"] === config.user_id){
        console.log("Removed @" + data["target"]["screen_name"] + " from friends.")
        friends = _.without(friends, data["target"]["id_str"]);
      }
    break;
  }
}

function handle_queue (id) {
 //TODO: Finish this
  var messageTimer, 
      tweetTimer;

  clearTimeout(messageTimer);

  if (_.keys(tweetQueue).length){
    var message_id = _.keys(tweetQueue)[0];

    function tweet_links() {
      console.log("exec tweet_links");
      clearTimeout(tweetTimer);
      if (tweetQueue[message_id]["urls"].length) {
        var tweetURL = tweetQueue[message_id]["urls"].pop();
        console.log(tweetURL);
        Tweet(tweetURL);
        tweetQueue[message_id]["urls"].length;
        messageTimer = setTimeout(function(){tweet_links()}, 15000);
      }else{
        delete tweetQueue[message_id];
      }
    }

    tweet_links();

    if (_.keys(tweetQueue).length) {
      messageTimer = setTimeout(handle_queue, 15000);
    }
  }
}

function parse_dm_blob (data){
  var message_id = data["direct_message"]["id_str"],
      sender_id  = data["direct_message"]["sender"]["id_str"],
      screen_name  = data["direct_message"]["sender"]["screen_name"];

  console.log("DM from @" + screen_name + " " + sender_id);

  if (_.contains(friends,sender_id)){

    var tmpQueue = {};

    tmpQueue["message_id"] = message_id;
    tmpQueue["sender_id"]  = sender_id;
    tmpQueue["sender"]     = data["direct_message"]["sender"]["screen_name"];
    tmpQueue["created_at"] = data["direct_message"]["created_at"];
    tmpQueue["urls"] = [];

    _.each(findUrls(data["direct_message"]["text"]), function(url){
      tmpQueue["urls"].push(url)
    });

    tweetQueue[message_id] = tmpQueue;

    if (tweetQueue[message_id]){
      if (tweetQueue[message_id]["urls"].length > 1){
        DM(parseInt(sender_id), "Received " + tweetQueue[message_id]["urls"].length + " links");
        _.each(tweetQueue[message_id]["urls"], function(url, index){
          Tweet(url);
        });
      }else{
        DM(parseInt(sender_id), "Received " + tweetQueue[message_id]["urls"].length + " link");
        Tweet(tweetQueue[message_id]["urls"][0]);
      }

    }

  }

}

var userStream = new Stream({
  consumer_key: config.consumer_key,
  consumer_secret: config.consumer_secret,
  access_token_key: config.oauth_token,
  access_token_secret: config.oauth_secret,
});

userStream.stream();

userStream.on("connected", function(data) {
  console.log("Listening to " + config.screen_name)
  DM(parseInt(config.admin_id), "Listening to " + config.screen_name);
});

function stringIt(v){
  return v.toString();
}

userStream.on("data", function(data) {
  if (data["warning"]){
    console.log("WARNING");
    DM(parseInt(config.admin_id), " WARNING: [" + data["code"] + "] " + data["message"]);
  }
  if (data["friends"]){
    friends = data["friends"].map(String); // TODO: Update this for 64bit user IDs
    console.log("Loaded friends");
  }
  if (data["event"]){
    handle_event(data["event"], data);
  }  
  if (data["direct_message"]){
    parse_dm_blob(data);
  };
  // console.log(data);
});

userStream.on("error", function(error) {
  console.log("ERROR!");
  console.log(error);
  DM(parseInt(config.admin_id), "ERROR");
});

userStream.on("close", function(error) {
  console.log(error);
  console.log("Reconnecting")
  DM(parseInt(config.admin_id), "Reconnecting");
  userStream.stream();
});

userStream.on("heartbeat", function(){
    console.log("--v^v---");
});

userStream.on("garbage", function(data){
    console.log("Can't be formatted:");
    console.log(data);
});

