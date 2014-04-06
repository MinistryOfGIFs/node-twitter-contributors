twitter = require("twitter"),
loggr  = require('./logger.js');

function twttr_actions(config){
	var logger = new loggr(config);

	var twttr = new twitter({
	  consumer_key: config.twitter.consumer_key,
	  consumer_secret: config.twitter.consumer_secret,
	  access_token_key: config.twitter.oauth_token,
	  access_token_secret: config.twitter.oauth_secret,
	  rest_base: "https://api.twitter.com/1.1"
	});

	this.dm = function(user_id, text) {
	  twttr.newDirectMessage({user_id: user_id}, text, function (data) {
	    if (data.recipient) {
	      logger.log(logger.timestamp() + " DM sent to @" + data.recipient.screen_name + ": " + data.text);
	    } else if (data.statusCode) {
	      logger.log(logger.timestamp() + " DM error: " + data.statusCode + ": " + data.message);
	    }
	  })
	},
	this.tweet = function(status, callback) {
	  twttr.updateStatus(status,
	    function (data) {
	      if (data.id_str) {
	        callback(data.id_str, data.text);
	      } else if (data.statusCode) {
          console.log(util.inspect(data, {depth:null}));
	      	logger.log(logger.timestamp() + " Tweet error: " + data.statusCode + ": " + data.message);
	    	}
	    }
	  )
	},
	this.delete = function(statusid, callback) {
	  twttr.destroyStatus(statusid,
	    function (data) {
	      if (data.id_str) {
	        callback(data.id_str, data.text);
	      } else if (data.statusCode) {
          console.log(util.inspect(data, {depth:null}));
	      	logger.log(logger.timestamp() + " Tweet delete error: " + data.statusCode + ": " + data.message);
	    	}
	    }
	  )
	},
	this.verify = function(callback) {
		twttr.verifyCredentials(function(data) {
			callback(data);
		});
  },
	this.getUserTimeline = function(params, callback) {
		twttr.getUserTimeline(params, function(data) {
			callback(data);
		});
	},
	this.rateLimitStatus = function(params, callback) {
		twttr.rateLimitStatus(params, function(data) {
			callback(data);
		});
	}
}

module.exports = twttr_actions;