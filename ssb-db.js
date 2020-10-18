// name is blank as in ssb-db to merge into global namespace
// most of this stuff is from ssb-db

const pull = require('pull-stream')
const pullCont = require('pull-cont')
var Obv = require('obv')
const { originalData } = require('./msg-utils')

exports.manifest =  {
  createHistoryStream: 'source'
}

exports.permissions = {
  anonymous: {allow: ['createHistoryStream'], deny: null}
}

exports.init = function (sbot, config) {
  sbot.createHistoryStream = function(opts) {
    // default values
    const seq = opts.sequence || opts.seq || 0
    const limit = opts.limit || 1e10
    const keys = opts.keys === false ? false : true
    const values = opts.values === false ? false : true

    const query = {
      type: 'EQUAL',
      data: {
        seek: SSB.db.jitdb.seekAuthor,
        value: opts.id,
        indexType: "author",
        indexAll: true
      }
    }

    function formatMsg(msg) {
      let fixedMsg = originalData(msg)
      if (!keys && values)
        return fixedMsg.value
      else if (keys && !values)
        return fixedMsg.key
      else
        return fixedMsg
    }

    return pull(
      pullCont(function(cb) {
        const partialState = SSB.db.partial.getSync()
        if (seq && partialState[opts.id] && partialState[opts.id].full === true) {
          // sequences starts with 1, offset starts with 0 ;-)
          SSB.db.jitdb.query(query, seq - 1, limit, true, (err, results) => {
            cb(err, pull.values(results.map(x => formatMsg(x))))
          })
        }
        else if (seq) {
          // for partial feeds we don't know where seq is compared to
          // and offset, so we lean on the fact that we probably don't
          // have a lot of messages for this feed.

          SSB.db.jitdb.query(query, (err, results) => {
            if (err) return cb(err)
            pull(
              pull.values(results),
              pull.filter(x => x.value.sequence >= seq),
              pull.take(limit),
              pull.collect((err, filtered) => {
                cb(null, pull.values(filtered.map(x => formatMsg(x))))
              })
            )
          })
        }
        else
          SSB.db.jitdb.query(query, (err, results) => {
            cb(err, pull.values(results.map(x => formatMsg(x))))
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
    SSB.db.getDataFromAuthorSequence((typeof seqid === 'string') ? seqid.split(':') : seqid, function (err, value) {
      if (err) cb(err)
      else cb(null, originalData(value))
    })
  }

  return {}
}
