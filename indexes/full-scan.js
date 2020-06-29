const bipf = require('bipf')

module.exports = function (log) {
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
        authorLatestSequence[author] = sequence
      }

      count++
    },
    end: () => {
      console.log(`key index full scan time: ${Date.now()-start}ms, total items: ${count}`)
    }
  })

  return {
    keysGet: function(key, cb) {
      if (!keyToSeq[key])
        cb('Key not found:' + key)
      else
        full.get(keyToSeq[key], cb)
    },
    clockGet: function(key, cb) {
      if (!authorSequenceToSeq[key])
        cb('Key not found:' + key)
      else
        full.get(authorSequenceToSeq[key], cb)
    },
    lastGet: function(feedId, cb) {
      if (!authorLatestSequence[feedId])
        cb('Author not found:' + feedId)
      else
        cb(null, authorLatestSequence[feedId])
    },
    lastIndex: authorLatestSequence
  }
}
