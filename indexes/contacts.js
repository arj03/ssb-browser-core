const jitdb = require('jitdb')
const isFeed = require('ssb-ref').isFeed

module.exports = function (log) {
  const bValue = new Buffer('value')
  const bContent = new Buffer('content')

  const bType = new Buffer('type')
  const bContactValue = new Buffer('contact')

  function seekType(buffer) {
    var p = 0 // note you pass in p!
    p = bipf.seekKey(buffer, p, bValue)

    if (~p) {
      p = bipf.seekKey(buffer, p, bContent)
      if (~p)
        return bipf.seekKey(buffer, p, bType)
    }
  }

  var db = jitdb(log.path, "./indexes")
  const query = { type: 'EQUAL', data: { seek: seekType, value: bContactType, indexName: "type_contact" } }

  var hops = {}

  db.query(query, false, (err, results) => {
    results.forEach(data => {
      var data = logEntry.value

      var from = data.value.author
      var to = data.value.content.contact
      var value =
          data.value.content.blocking || data.value.content.flagged ? -1 :
          data.value.content.following === true ? 1
          : -2

      if(isFeed(from) && isFeed(to)) {
        hops[from] = hops[from] || {}
        hops[from][to] = value
      }
    })
  })

  // FIXME: persistance
  // FIXME: changes

  return {
    getHops: function(cb) {
      cb(null, hops)
    }
  }
}
