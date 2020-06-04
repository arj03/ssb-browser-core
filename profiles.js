var OffsetLog = require('flumelog-aligned-offset')
var OffsetLogCompat = require('./offset-log-since')
var codec = require('flumecodec/json')
var path = require('path')
var isFeed = require('ssb-ref').isFeed
var push = require('push-stream')

module.exports = function (dir, ssbId, config) {
  config = config || {}

  var log = OffsetLogCompat(OffsetLog(
    path.join(dir, 'profiles.offset'),
    {blockSize:1024*64, codec:codec}
  ))

  let profiles = null
  let waiting = []
  
  log.getProfiles = function(cb) {
    if (profiles == null && waiting.length > 0)
      return waiting.push(cb)
    else if (profiles != null)
      return cb(null, profiles)

    waiting.push(cb)
    console.time("profiles reduce")

    let profilesBuild = {}
    
    push(
      log.stream(),
      push.drain(logEntry => {
        var data = logEntry.value

        let profile = profilesBuild[data.value.author] || {}

	content = data.value.content

        if (content.name)
   	  profile.name = content.name

        if (content.description)
   	  profile.description = content.description

        if (content.image && typeof content.image.link === 'string')
   	  profile.image = content.image.link
        else if (typeof content.image === 'string')
          profile.image = content.image

	profilesBuild[data.value.author] = profile

      }, (err) => {
        console.timeEnd("profiles reduce")

        profiles = profilesBuild
        
        for (var i = 0; i < waiting.length; ++i)
          waiting[i](err, profiles)
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
