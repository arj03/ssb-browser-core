const isFeed = require('ssb-ref').isFeed
const Obv = require('obv')

module.exports = function (db) {
  const queue = require('../waiting-queue')()
  const bContactValue = Buffer.from('contact')

  var seq = Obv()
  seq.set(0)

  const query = {
    type: 'EQUAL',
    data: {
      seek: db.seekType,
      value: bContactValue,
      indexType: "type"
    }
  }

  function updateDate(data) {
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
  }

  var hops = {}

  db.onReady(() => {
    const filename = "/indexes/contacts.json"
    const indexWriter = require('./index-persistance')()
    indexWriter.load(filename, (err, file) => {
      if (!err) {
        seq.set(file.seq)
        hops = file.data
        queue.done(null, hops)
      } else {
        console.time("contacts")

        db.query(query, 0, (err, results) => {
          results.forEach(updateDate)
          seq.set(db.getSeq(query))

          console.timeEnd("contacts")

          indexWriter.save(filename, seq.value,
                           () => Buffer.from(JSON.stringify(hops)))

          queue.done(null, hops)
        })
      }

      db.liveQuerySingleIndex(query, (err, results) => {
        results.forEach(updateDate)
        seq.set(db.getSeq(query))
        indexWriter.save(filename, seq.value,
                         () => Buffer.from(JSON.stringify(hops)))
      })
    })
  })

  return {
    getHops: function(cb) {
      queue.get(cb)
    },
    seq
  }
}
