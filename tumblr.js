var util = require("util");
var Tumblr = require('tumblrwks');

var oauth = {
  consumer_key: 'FDPeg1BvSvysJpKLkklW4zFhcYGphKq5FdQWcLhB2IdHJFmX6Q',
  consumer_secret: 'Kww8rNG49T6Pe83WkiV8VoveJCYG3hv8gKlcV7f7Zh2Pd7h7My',
  token: 'Q7pqkvBtfYul38l55couHdToQSi9wnUIYLUttOPnhDHgMYo7UP',
  token_secret: 'VHlWZ22dBalxdAxzIvlmzhfuUFEnXJmbvrtRkC3LINLvUEeFsM'
};

var tumblr = new Tumblr(
  {
    consumerKey: 'FDPeg1BvSvysJpKLkklW4zFhcYGphKq5FdQWcLhB2IdHJFmX6Q',
    consumerSecret: 'Kww8rNG49T6Pe83WkiV8VoveJCYG3hv8gKlcV7f7Zh2Pd7h7My',
    accessToken: 'Q7pqkvBtfYul38l55couHdToQSi9wnUIYLUttOPnhDHgMYo7UP',
    accessSecret: 'VHlWZ22dBalxdAxzIvlmzhfuUFEnXJmbvrtRkC3LINLvUEeFsM'

  }, "ministryofgifs-test.tumblr.com"
  // specify the blog url now or the time you want to use
);

tumblr.post('/post', {type: 'text', title: 'tumblrwkstesting', body: '<h3>should work!! </h3>'}, function(err, json){
  console.log(json);
});