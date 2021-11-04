const pull = require('pull-stream')
const pullCont = require('pull-cont')
const sort = require('ssb-sort')
const { reEncrypt } = require('ssb-db2/indexes/private')
const {
  where,
  and,
  toCallback,
  hasRoot,
  author,
  type,
  startFrom,
  paginate
} = require('ssb-db2/operators')

exports.manifest = {
  getTangle: 'async'
}
exports.permissions = {
  anonymous: {allow: Object.keys(exports.manifest)}
}

exports.name = 'partial-replication'

exports.init = function (sbot, config) {
  return {
    getTangle: function(msgId, cb) {
      if (!msgId) return cb("msg not found:" + msgId)

      SSB.db.get(msgId, (err, msg) => {
        if (err) return cb(err)
        if (msg.meta && msg.meta.private === true) return cb(null, [])
        SSB.db.query(
          where(and(hasRoot(msgId))),
          toCallback((err, msgs) => {
            if (err) return cb(err)
            msgs = msgs.filter(x => !x.meta || x.meta.private !== true)
            cb(null, [reEncrypt(msg), ...sort(msgs).map(m => reEncrypt(m.value))])
          })
        )
      })
    }
  }
}
