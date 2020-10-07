const pull = require('pull-stream')
const pullCont = require('pull-cont')

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
    }
  }
}

