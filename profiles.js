var OffsetLog = require('flumelog-aligned-offset')
var OffsetLogCompat = require('flumelog-aligned-offset/compat')
var codec = require('flumecodec/json')
var path = require('path')
var isFeed = require('ssb-ref').isFeed
var pull = require('pull-stream')

module.exports = function (dir, ssbId, config) {
  config = config || {}

  var log = OffsetLogCompat(OffsetLog(
    path.join(dir, 'profiles.offset'),
    {blockSize:1024*64, codec:codec}
  ))

  console.time("profiles reduce")

  let profiles = {}

  log.getProfiles = function(cb) {
    if (Object.keys(profiles).length > 0)
      return cb(null, profiles)

    pull(
      log.stream(),
      pull.drain(logEntry => {
        var data = logEntry.value

        let profile = profiles[data.value.author] || {}

	content = data.value.content

        if (content.name)
   	  profile.name = content.name

        if (content.description)
   	  profile.description = content.description

        if (content.image && typeof content.image.link === 'string')
   	  profile.image = content.image.link
        else if (typeof content.image === 'string')
          profile.image = content.image

	profiles[data.value.author] = profile
	  
      }, (err) => {
        console.timeEnd("profiles reduce")
        cb(err, profiles)
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
