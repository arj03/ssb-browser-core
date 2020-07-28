const bipf = require('bipf')
const Obv = require('obv')
const AtomicFile = require('atomic-file')
const debounce = require('lodash.debounce')
const path = require('path')

module.exports = function (log, dir) {
  const queueLatest = require('../waiting-queue')()
  const queueKey = require('../waiting-queue')()
  const queueSequence = require('../waiting-queue')()

  var seq = Obv()
  seq.set(0)

  var keyToSeq = {}
  var authorSequenceToSeq = {}
  var authorLatest = {}

  var f = AtomicFile(path.join(dir, "indexes/full.json"))

  function atomicSave()
  {
    f.set({
      seq: seq.value,
      keyToSeq,
      authorSequenceToSeq,
      authorLatest
    }, () => {})
  }
  var save = debounce(atomicSave, 250)

  f.get((err, data) => {
    var count = 0
    const start = Date.now()

    if (!err) {
      seq.set(data.seq)
      keyToSeq = data.keyToSeq
      authorSequenceToSeq = data.authorSequenceToSeq
      authorLatest = data.authorLatest
    }

    function handleData(data) {
      var p = 0 // note you pass in p!
      p = bipf.seekKey(data.value, p, new Buffer('key'))
      const key = bipf.decode(data.value, p)
      keyToSeq[key] = data.seq

      p = 0
      p = bipf.seekKey(data.value, p, new Buffer('value'))
      if (~p) {
        var p2 = bipf.seekKey(data.value, p, new Buffer('author'))
        const author = bipf.decode(data.value, p2)
        var p3 = bipf.seekKey(data.value, p, new Buffer('sequence'))
        const sequence = bipf.decode(data.value, p3)
        var p4 = bipf.seekKey(data.value, p, new Buffer('timestamp'))
        const timestamp = bipf.decode(data.value, p4)
        authorSequenceToSeq[[author, sequence]] = data.seq
        var latestSequence = 0
        if (authorLatest[author])
          latestSequence = authorLatest[author].sequence
        if (sequence > latestSequence) {
          authorLatest[author] = {
            id: key,
            sequence,
            timestamp
          }
        }
      }

      seq.set(data.seq)
      count++

      save()
    }

    log.stream({ gt: seq.value }).pipe({
      paused: false,
      write: handleData,
      end: () => {
        console.log(`key index full scan time: ${Date.now()-start}ms, total items: ${count}`)

        log.stream({ gt: seq.value, live: true }).pipe({
          paused: false,
          write: handleData
        })

        queueLatest.done(null, authorLatest)
        queueKey.done(null, keyToSeq)
        queueSequence.done(null, authorSequenceToSeq)
      }
    })
  })

  return {
    keysGet: function(key, cb) {
      queueKey.get(() => {
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
        if (!authorLatest[feedId])
          cb('Author not found:' + feedId)
        else
          cb(null, authorLatest[feedId])
      })
    },
    getLast: function(cb) {
      queueLatest.get(cb)
    },
    seq,
    keyToSeq(key, cb) {
      queueKey.get(() => {
        if (!keyToSeq[key])
          cb('Key not found:' + key)
        else
          cb(null, keyToSeq[key])
      })
    },
    removeFeedFromLatest: function(feedId) {
      delete authorLatest[feedId]
    },
    remove: function(cb) {
      f.destroy(cb)
    }
  }
}
