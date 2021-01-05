const pull = require('pull-stream')
const pullCont = require('pull-cont')
const sort = require('ssb-sort')
const { reEncrypt } = require('ssb-db2/indexes/private')
const {
  and,
  toCallback,
  hasRoot,
  author,
  type,
  startFrom,
  paginate
} = require('ssb-db2/operators')

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
          SSB.db.getLatest(opts.id, (err, latest) => {
            if (err) {
              console.error("Got error on feed reverse", err)
              return cb(null, pull.empty())
            }

            var seqStart = latest ? latest.sequence - (opts.limit - 1) : 0
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
        if (msg.meta && msg.meta.private === true) return cb(null, [])
        SSB.db.query(
          and(hasRoot(msgId)),
          toCallback((err, msgs) => {
            if (err) return cb(err)
            msgs = msgs.filter(x => !x.meta || x.meta.private !== true)
            cb(null, [reEncrypt(msg), ...sort(msgs).map(m => reEncrypt(m.value))])
          })
        )
      })
    },

    // opts: { id: feedId, type: string, seq: int?, limit: int? }
    getMessagesOfType: function(opts)
    {
      if (!opts.id) throw new Error("id is required!")
      if (!opts.type) throw new Error("type is required!")

      const seq = opts.sequence || opts.seq || 0
      const limit = opts.limit || 1e10

      return pull(
        pullCont(function(cb) {
          let q = SSB.db.query(
            and(author(opts.id), type(opts.type))
          )

          if (seq) // sequences starts with 1, offset starts with 0 ;-)
            q = SSB.db.query(q, (startFrom(seq-1)))

          SSB.db.query(
            q,
            paginate(limit),
            toCallback((err, answer) => {
              if (err) return cb(err)
              let results = answer.results.map(x => reEncrypt(x).value)
              cb(null, pull.values(results))
            })
          )
        })
      )
    }
  }
}
