fs = require('fs');

function logger(config){
  logfile = "./logs/" + config.twitter.screen_name + "-log.txt", // name of the file you want log messages to output to
  this.timestamp = function() {
    var d     = new Date();
    var parts = d.toString().split(' ');
    var day   = parts[2];
    var month = parts[1];
    var time  = parts[4];
    return [day, month, time].join(' ');
  },
  this.epochTimestamp = function() {
    return Date.now();
  },
  this.log = function(message) {
    fs.appendFile(logfile, message + "\n", function (err) {
      if (err) { throw err; }
      console.log(message);
    });
  }
}

module.exports = logger;