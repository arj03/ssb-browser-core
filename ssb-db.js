// name is blank as in ssb-db to merge into global namespace
// most of this stuff is from ssb-db

const pull = require('pull-stream')
var Obv = require('obv')

exports.manifest =  {
  createHistoryStream: 'source'
}

exports.permissions = {
  anonymous: {allow: ['createHistoryStream'], deny: null}
}

exports.init = function (sbot, config) {
  // ebt stuff

  sbot.createHistoryStream = function() {
    return pull.empty()
  }

  sbot.post = Obv()

  sbot.getVectorClock = function (_, cb) {
    if (!cb) cb = _

    function getClock()
    {
      var last = SSB.db.last.get()
      var clock = {}
      for (var k in last) {
        clock[k] = last[k].sequence
      }
      cb(null, clock)
    }

    SSB.events.on('SSB: loaded', getClock)
  }

  function isString (s) {
    return typeof s === 'string'
  }

  function originalValue(value) {
    var copy = {}

    for (let key in value) {
      if (key !== 'meta' && key !== 'cyphertext' && key !== 'private' && key !== 'unbox') {
	copy[key] = value[key]
      }
    }

    if (value.meta && value.meta.original) {
      for (let key in value.meta.original) {
	copy[key] = value.meta.original[key]
      }
    }

    return copy
  }

  function originalData(data) {
    data.value = originalValue(data.value)
    return data
  }

  sbot.getAtSequence = function (seqid, cb) {
    // will NOT expose private plaintext
    SSB.db.clock.get(isString(seqid) ? seqid.split(':') : seqid, function (err, value) {
      if (err) cb(err)
      else cb(null, originalData(value))
    })
  }

  sbot.add = function(msg, cb) {
    SSB.db.validateAndAddStrictOrder(msg, cb)
  }

  return {}
}
