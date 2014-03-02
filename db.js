var dblite   = require('dblite'),
    util     = require('util');

var serializeQuery = function(obj) {
  var pairs = [];
  for (var prop in obj) {
    if (!obj.hasOwnProperty(prop)) { continue }
    pairs.push(prop + '=' + obj[prop]);
  }
  return pairs.join(',');
};

function db(config) {
  var table_name = config.twitter.screen_name + "_db",
      database = new dblite('./' + config.twitter.screen_name + '.db');

  // createQuery = util.format("CREATE TABLE IF NOT EXISTS %s (ROWID INTEGER PRIMARY KEY, message_id TEXT, user_id TEXT, screen_name TEXT, message_text TEXT, url TEXT, tumblr_id TEXT, tweet_id TEXT, favs INTEGER, last_alert INTEGER, retweets INTEGER, queued_at INTEGER, posted_at INTEGER, queue_state INTEGER)", table_name);
  // database.query(createQuery);

  database.on('close', function (code) {
    // Without this, it logs "Bye bye" every time it closes the db, which is dumb.
    // console.log("Closing: " + code);
  });

  var responseTemplate = {
    record_id: Number,
    message_id: String,
    user_id: String,
    screen_name: String,
    message_text: String,
    url: String,
    tumblr_id: String,
    tweet_id: String,
    favs: Number,
    last_alert: Number,
    retweets: Number,
    queued_at: Number,
    posted_at: Number,
    queue_state: Number
  };

  this.get = function(column, value, cb){
    query = util.format("SELECT rowid, message_id, user_id, screen_name, message_text, url, tumblr_id, tweet_id, favs, last_alert, retweets, queued_at, posted_at, queue_state FROM %s WHERE %s = %s", table_name, column, value);
    database.query(query, responseTemplate, function(err, res){
      if(typeof cb === "function"){
        cb(res);
      };
    });
  },
  this.insert = function(values, cb){
    query = util.format("INSERT INTO %s VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ,?, ?)", table_name);
    database.query(query, values, function(err, res){
      database.lastRowID(table_name, function(rowid){
        if(typeof cb === "function"){
          cb(rowid);
        };
      });
    });
  },
  this.update = function(update_vals, record_id, cb){
    values = serializeQuery(update_vals);
    query = util.format("UPDATE %s SET %s WHERE rowid = %s", table_name, values, record_id);
    database.query(query, responseTemplate, function(err, res){
      if(typeof cb === "function"){
        cb(record_id);
      };
    });
  },
  this.getOldest = function(cb){
    query = util.format("SELECT * FROM %s WHERE queue_state = 0 ORDER BY ROWID ASC LIMIT 1", table_name);
    database.query(query, responseTemplate, function(err, res){
      if(typeof cb === "function"){
        cb(res);
      };
    });
  },
  this.getLastPosted = function(cb){
    query = util.format("SELECT * FROM %s WHERE queue_state = 1 ORDER BY posted_at DESC LIMIT 1", table_name);
    database.query(query, responseTemplate, function(err, res){
      if(typeof cb === "function"){
        cb(res);
      };
    });
  },
  this.query = function(query, cb){
    database.query(query, responseTemplate, function(err, res){
      if(typeof cb === "function"){
        cb(res);
      };
    });
  },
  this.close = function(){
    database.close();
  };

  // query = util.format("SELECT * FROM gifs_db");
  // database.query(query, responseTemplate, function(err, res){
  //   console.log(res);
  // });

  // query = util.format("DELETE FROM gifsdev_db where queue_state = 1 and posted_at is null");
  // database.query(query);

};

module.exports = db;