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

exports.name = 'partial-replication'

exports.init = function (sbot, config) {
  return self = {
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
    }
  }
}

