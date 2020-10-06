// name is blank as in ssb-db to merge into global namespace
// most of this stuff is from ssb-db

const pull = require('pull-stream')
const pullCont = require('pull-cont')
var Obv = require('obv')

exports.manifest =  {
  createHistoryStream: 'source'
}

exports.permissions = {
  anonymous: {allow: ['createHistoryStream'], deny: null}
}

exports.init = function (sbot, config) {
  sbot.createHistoryStream = function(streamOpts) {
    const query = {
      type: 'EQUAL',
      data: {
        seek: SSB.db.jitdb.seekAuthor,
        value: streamOpts.id,
        indexType: "author",
        indexAll: true
      }
    }

    function handleResults(results) {
      if (streamOpts.keys)
        return results.map(x => originalData(x))
      else
        return results.map(x => originalData(x).value)
    }

    return pull(
      pullCont(function(cb) {
        if (streamOpts.seq)
          SSB.db.jitdb.query(query, streamOpts.seq, streamOpts.limit ?? 1e10, (err, results) => {
            cb(err, pull.values(handleResults(results)))
          })
        else
          SSB.db.jitdb.query(query, (err, results) => {
            cb(err, pull.values(handleResults(results)))
          })
      })
    )
  }

  // all the rest is ebt stuff

  sbot.post = Obv()

  sbot.add = function(msg, cb) {
    SSB.db.validateAndAdd(msg, cb)
  }

  sbot.getAtSequence = function (seqid, cb) {
    // will NOT expose private plaintext
    SSB.db.getClock(isString(seqid) ? seqid.split(':') : seqid, function (err, value) {
      if (err) cb(err)
      else cb(null, originalData(value))
    })
  }

  // helpers

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

  return {}
}
