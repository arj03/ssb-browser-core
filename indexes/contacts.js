const isFeed = require('ssb-ref').isFeed

module.exports = function (db) {
  const queue = require('../waiting-queue')()
  const bContactValue = Buffer.from('contact')

  var hops = {}

  db.onReady(() => {
    const query = {
      type: 'EQUAL',
      data: {
        seek: db.seekType,
        value: bContactValue,
        indexName: "type_contact"
      }
    }

    console.time("contacts")

    db.query(query, 0, (err, results) => {
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

      queue.done(null, hops)
    })
  })

  // FIXME: persistance
  // FIXME: changes

  return {
    getHops: function(cb) {
      queue.get(cb)
    }
  }
}
