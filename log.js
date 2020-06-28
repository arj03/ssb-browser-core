var OffsetLog = require('flumelog-aligned-offset')
var OffsetLogCompat = require('./offset-log-since')
var bipf = require('bipf')
var path = require('path')

module.exports = function (dir, ssbId, config) {
  config = config || {}
    
  var log = OffsetLogCompat(OffsetLog(
    path.join(dir, 'log.bipf'),
    { blockSize:1024*64, codec: bipf }
  ))

  log.add = function (id, msg, cb) {
    var data = {
      key: id,
      value: msg,
      timestamp: Date.now()
    }
    log.append(data, false, function (err) {
      if (err) cb(err)
      else cb(null, data)
    })
  }

  return log
}
