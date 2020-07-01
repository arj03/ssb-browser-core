const bipf = require('bipf')

module.exports = function (log) {
  const queueLatest = require('../waiting-queue')()
  const queueKey = require('../waiting-queue')()
  const queueSequence = require('../waiting-queue')()

  const bKey = new Buffer('key')
  const bValue = new Buffer('value')
  const bAuthor = new Buffer('author')
  const bSequence = new Buffer('sequence')

  var keyToSeq = {}
  var authorSequenceToSeq = {}
  var authorLatestSequence = {}

  var count = 0
  const start = Date.now()

  // FIXME: persistance

  log.stream({}).pipe({
    paused: false,
    write: function (data) {
      var p = 0 // note you pass in p!
      p = bipf.seekKey(data.value, p, bKey)
      const key = bipf.decode(data.value, p)
      keyToSeq[key] = data.seq

      p = 0
      p = bipf.seekKey(data.value, p, bValue)
      if (~p) {
        var p2 = bipf.seekKey(data.value, p, bAuthor)
        const author = bipf.decode(data.value, p2)
        var p3 = bipf.seekKey(data.value, p, bSequence)
        const sequence = bipf.decode(data.value, p3)
        authorSequenceToSeq[[author, sequence]] = data.seq
        if (sequence > (authorLatestSequence[author] || 0))
          authorLatestSequence[author] = sequence
      }

      count++
    },
    end: () => {
      console.log(`key index full scan time: ${Date.now()-start}ms, total items: ${count}`)

      queueLatest.done(null, authorLatestSequence)
      queueKey.done(null, keyToSeq)
      queueSequence.done(null, authorSequenceToSeq)
    }
  })

  return {
    keysGet: function(key, cb) {
      queueKey.get(() => {
        console.log(log)
        if (!keyToSeq[key])
          cb('Key not found:' + key)
        else
          log.get(keyToSeq[key], (err, data) => {
            if (err) return cb(err)
            cb(null, bipf.decode(data, 0))
          })
      })
    },
    clockGet: function(key, cb) {
      queueSequence.get(() => {
        if (!authorSequenceToSeq[key])
          cb('Key not found:' + key)
        else
          log.get(authorSequenceToSeq[key], (err, data) => {
            if (err) return cb(err)
            cb(null, bipf.decode(data, 0))
          })
      })
    },
    lastGet: function(feedId, cb) {
      queueLatest.get(() => {
        if (!authorLatestSequence[feedId])
          cb('Author not found:' + feedId)
        else
          cb(null, authorLatestSequence[feedId])
      })
    },
    getLast: function(cb) {
      queueLatest.get(cb)
    }
  }
}
