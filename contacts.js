var OffsetLog = require('flumelog-aligned-offset')
var OffsetLogCompat = require('./offset-log-since')
var codec = require('flumecodec/json')
var path = require('path')
var isFeed = require('ssb-ref').isFeed
var push = require('push-stream')

module.exports = function (dir, ssbId, config) {
  config = config || {}

  var log = OffsetLogCompat(OffsetLog(
    path.join(dir, 'contacts.offset'),
    {blockSize:1024*64, codec:codec}
  ))

  let hops = null
  let waiting = []

  log.getHops = function(cb) {
    if (hops == null && waiting.length > 0)
      return waiting.push(cb)
    else if (hops != null)
      return cb(null, hops)

    waiting.push(cb)

    console.time("contacts reduce")

    let hopsBuild = {}
    hopsBuild[ssbId] = {}

    push(
      log.stream(),
      push.drain(logEntry => {
        var data = logEntry.value

        var from = data.value.author
        var to = data.value.content.contact
        var value =
	    data.value.content.blocking || data.value.content.flagged ? -1 :
	    data.value.content.following === true ? 1
	    : -2

        if(isFeed(from) && isFeed(to)) {
          hopsBuild[from] = hopsBuild[from] || {}
          hopsBuild[from][to] = value
        }
      }, (err) => {
        console.timeEnd("contacts reduce")
        
        hops = hopsBuild
        
        for (var i = 0; i < waiting.length; ++i)
          waiting[i](err, hops)
        waiting = []
      })
    )
  }

  log.add = function(id, msg, cb) {
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
