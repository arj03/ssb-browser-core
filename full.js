var OffsetLog = require('flumelog-aligned-offset')
var OffsetLogCompat = require('./offset-log-since')
var codec = require('flumecodec/json')
var path = require('path')

module.exports = function (dir, ssbId, config) {
  config = config || {}
    
  var log = OffsetLogCompat(OffsetLog(
    path.join(dir, 'full.offset'),
    {blockSize:1024*64, codec:codec}
  ))

  // FIXME: probably key index for replication + half-insert

  log.add = function (id, msg, cb) {
    var data = {
      key: id,
      value: msg,
      timestamp: Date.now()
    }
    log.append(data, false, function (err) {
      if(err) cb(err)
      else cb(null, data)
    })
  }

  return log
}
