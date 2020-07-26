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
      if (!err && data.seq >= SSB.db.getStatus().log) {
        seq.set(data.seq)
        hops = data.hops
        queue.done(null, hops)
      } else {
        console.time("contacts")

        db.querySeq(query, data.seq, (err, results) => {
          hops = data.hops
          results.forEach(updateData)

          console.timeEnd("contacts")

          seq.set(db.getSeq(query))
          save()

          queue.done(null, hops)
        })
      }

      db.liveQuerySingleIndex(query, (err, results) => {
        results.forEach(updateData)
      })
    })
  })

  return self = {
    isFollowing: function(source, dest) {
      return hops[source][dest] === 1
    },
    isBlocking: function(source, dest) {
      return hops[source][dest] === -1
    },
    getGraphForFeed: function(feed, cb) {
      queue.get((err, hops) => {
        cb(err, self.getGraphForFeedSync(feed))
      })
    },
    // might return empty when hops is not loaded yet
    getGraphForFeedSync: function(feed) {
      let following = []
      let blocking = []
      let extended = []

      for (var relation in hops[feed]) {
        if (self.isFollowing(feed, relation))
          following.push(relation)
        else if (self.isBlocking(feed, relation))
          blocking.push(relation)
      }

      for (var feedId in hops) {
        if (feedId === feed)
          continue

        if (!following.includes(feedId))
          continue

        for (var relation in hops[feedId]) {
          if (self.isFollowing(feedId, relation)) {
            if (relation === feed)
              continue

            if (following.includes(relation))
              continue

            if (blocking.includes(relation))
              continue

            extended.push(relation)
          }
        }
      }

      return {
        following,
        blocking,
        extended: [...new Set(extended)]
      }
    },
    seq,
    remove: function(cb) {
      f.destroy(cb)
    }
  }
}
