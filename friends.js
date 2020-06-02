var OffsetLog = require('flumelog-aligned-offset')
var OffsetLogCompat = require('flumelog-aligned-offset/compat')
var codec = require('flumecodec/json')
var path = require('path')
var isFeed = require('ssb-ref').isFeed
var pull = require('pull-stream')

module.exports = function (dir, ssbId, config) {
  config = config || {}

  var log = OffsetLogCompat(OffsetLog(
    path.join(dir, 'friends.offset'),
    {blockSize:1024*64, codec:codec}
  ))
    
  console.time("contacts reduce")
    
  var hops = {}
  hops[ssbId] = 0
    
  pull(
    log.stream(),
    pull.drain(logEntry => {
      var data = logEntry.value

      var from = data.value.author
      var to = data.value.content.contact
      var value =
	data.value.content.blocking || data.value.content.flagged ? -1 :
	data.value.content.following === true ? 1
	: -2

      if(isFeed(from) && isFeed(to)) {
        hops[from] = hops[from] || {}
        hops[from][to] = value
      }
    }, () => {
      console.timeEnd("contacts reduce")
      console.log(hops)
    })
  )

  log.add = function (id, msg, cb) {
    var data = {
      key: id,
      value: msg,
      timestamp: Date.now()
    }
    log.append(data, function (err) {
      if(err) cb(err)
      else cb(null, data)
    })
  }

  return log
}
