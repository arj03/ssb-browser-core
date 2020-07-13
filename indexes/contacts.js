const isFeed = require('ssb-ref').isFeed
const Obv = require('obv')
const AtomicFile = require('atomic-file')
const debounce = require('lodash.debounce')

module.exports = function (db) {
  const queue = require('../waiting-queue')()

  var seq = Obv()
  seq.set(0)

  const query = {
    type: 'EQUAL',
    data: {
      seek: db.seekType,
      value: Buffer.from('contact'),
      indexType: "type"
    }
  }

  function updateData(data) {
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

  var f = AtomicFile("indexes/contacts.json")

  function atomicSave()
  {
    f.set({seq: seq.value, hops}, () => {})
  }
  var save = debounce(atomicSave, 250)

  var hops = {}

  db.onReady(() => {
    f.get((err, data) => {
      if (!err) {
        seq.set(data.seq)
        hops = data.hops
        queue.done(null, hops)
      } else {
        console.time("contacts")

        db.query(query, 0, (err, results) => {
          results.forEach(updateData)
          console.timeEnd("contacts")

          seq.set(db.getSeq(query))
          save()

          queue.done(null, hops)
        })
      }

      db.liveQuerySingleIndex(query, (err, results) => {
        results.forEach(updateData)
        seq.set(db.getSeq(query))
        save()
      })
    })
  })

  return {
    getHops: function(cb) {
      queue.get(cb)
    },
    seq,
    remove: function(cb) {
      f.destroy(cb)
    }
  }
}
