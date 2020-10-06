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
      // since createHistoryStream is already exposed, this does not leak private messages
      return pull(
        sbot.createHistoryStream(opts)
      )
    },
  }
}

