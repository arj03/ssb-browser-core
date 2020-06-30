const bipf = require('bipf')
const isFeed = require('ssb-ref').isFeed

module.exports = function (db) {
  const bValue = Buffer.from('value')
  const bContent = Buffer.from('content')

  const bType = Buffer.from('type')
  const bContactValue = Buffer.from('contact')

  function seekType(buffer) {
    var p = 0 // note you pass in p!
    p = bipf.seekKey(buffer, p, bValue)

    if (~p) {
      p = bipf.seekKey(buffer, p, bContent)
      if (~p)
        return bipf.seekKey(buffer, p, bType)
    }
  }

  db.onReady(() => {
    const query = { type: 'EQUAL', data: { seek: seekType, value: bContactValue, indexName: "type_contact" } }

    var hops = {}

    console.time("contacts")

    db.query(query, false, (err, results) => {
      results.forEach(data => {
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

      console.timeEnd("contacts")
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
