const pull = require('pull-stream')
const pullCont = require('pull-cont')
const sort = require('ssb-sort')
const { originalValue, originalData } = require('./msg-utils')

exports.manifest = {
  getFeed: 'source',
  getFeedReverse: 'source',
  getTangle: 'async',
  getMessagesOfType: 'source'
}
exports.permissions = {
  anonymous: {allow: Object.keys(exports.manifest)}
}

exports.name = 'partial-replication'

exports.init = function (sbot, config) {
  return {
    getFeed: function (opts) {
      return pull(
        sbot.createHistoryStream(opts)
      )
    },

    getFeedReverse: function (opts) {
      return pull(
        pullCont(function(cb) {
          sbot.dbGetLastestSequence(opts.id, (err, latestSeq) => {
            if (err) throw err

            var seqStart = latestSeq ? latestSeq.sequence - (opts.limit - 1) : 0
            if (seqStart < 0)
              seqStart = 0

            opts.seq = seqStart

            cb(null, sbot.createHistoryStream(opts))
          })
        })
      )
    },

    getTangle: function(msgId, cb) {
      if (!msgId) return cb("msg not found:" + msgId)

      SSB.db.get(msgId, (err, msg) => {
        if (err) return cb(err)
        if (msg.meta && msg.meta.private === 'true') return cb(null, [])
        SSB.db.getMessagesByRoot(msgId, (err, msgs) => {
          if (err) return cb(err)
          msgs = msgs.filter(x => !x.value.meta || x.value.meta.private !== 'true')
          cb(null, [originalValue(msg), ...sort(msgs).map(m => originalValue(m.value))])
        })
      })
    },

    // opts: { id: feedId, type: string, seq: int?, limit: int? }
    getMessagesOfType: function(opts)
    {
      if (!opts.id) throw new Error("id is required!")
      if (!opts.type) throw new Error("type is required!")

      const seq = opts.sequence || opts.seq || 0
      const limit = opts.limit || 1e10
      const query = {
        type: 'AND',
        data: [{
          type: 'EQUAL',
          data: {
            seek: SSB.db.jitdb.seekAuthor,
            value: opts.id,
            indexType: "author",
            indexAll: true
          }
        }, {
          type: 'EQUAL',
          data: {
            seek: SSB.db.jitdb.seekType,
            value: opts.type,
            indexType: "type",
          }
        }]
      }

      return pull(
        pullCont(function(cb) {
          if (seq) // sequences starts with 1, offset starts with 0 ;-)
            SSB.db.jitdb.query(query, seq - 1, limit, true, (err, results) => {
              results = results.filter(x => !x.value.meta || x.value.meta.private !== 'true').map(x => x.value)
              cb(err, pull.values(results))
            })
          else
            SSB.db.jitdb.query(query, (err, results) => {
              results = results.filter(x => !x.value.meta || x.value.meta.private !== 'true').map(x => x.value)
              cb(err, pull.values(results))
            })
        })
      )
    }
  }
}

