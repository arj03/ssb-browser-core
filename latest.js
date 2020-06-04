var OffsetLog = require('flumelog-aligned-offset')
var OffsetLogCompat = require('./offset-log-since')
var codec = require('flumecodec/json')
var keys = require('ssb-keys')
var path = require('path')

module.exports = function (dir, ssbId, config) {
  config = config || {}

  var log = OffsetLogCompat(OffsetLog(
    path.join(dir, 'latest.offset'),
    {blockSize:1024*64, codec:codec}
  ))

  /* FIXME
  var store = Flume(log, true, (msg, cb) => {
    if (msg && msg.value && typeof (msg.value.content) === 'string') {
      var decrypted = keys.unbox(msg.value.content, SSB.net.config.keys.private)
      if (!decrypted) // not for us
        return cb(null, msg)

      var cyphertext = msg.value.content

      msg.value.content = decrypted
      msg.value.meta = {
	private: true,
	original: {
	  content: cyphertext
	}
      }

      cb(null, msg)
    } else
      cb(null, msg)
  })
*/

  /*
    FIXME: uses keys index
  store.del = (key, cb) => {
    store.keys.get(key, (err, val, seq) => {
      if (err) return cb(err)
      if (seq == null) return cb(new Error('seq is null!'))

      log.del(seq, cb)
    })
  }
  */

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

  // FIXME: key index
  log.get = (key, cb) => {
    cb(new Error("Not implemented"))
  }
  
  return log
}
