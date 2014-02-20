tumblrwks = require("tumblrwks");

function tumblr_actions(config){
	var tumblr = new tumblrwks({
	  consumerKey: config.tumblr.consumer_key,
	  consumerSecret: config.tumblr.consumer_secret,
	  accessToken: config.tumblr.oauth_token,
	  accessSecret: config.tumblr.oauth_secret
	}, config.tumblr.blog_name + ".tumblr.com");

  this.post = function(url, cb){
  	tumblr.post('/post', {
	    type: 'text',
	    title: "#", // I don't like the permalink format, this negates them
	    body: "<a href=\"" + url + "\" target=\"_blank\"><img src=\"" + url + "\" class=\"inline-tweet-media\"/></a><br/><a href=\"" + url + "\">Source</a>"
	  }, function(err, post_data){
	  	cb(err, post_data);
	  });
  }

}

module.exports = tumblr_actions;