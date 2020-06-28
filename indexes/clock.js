// we only need this for ssb-ebt, so okay for now with only get one value

module.exports = function (log) {
  const bValue = new Buffer('value')
  const bAuthor = new Buffer('author')
  const bSequence = new Buffer('sequence')
  var authorSequenceToSeq = {}

  var count = 0
  const start = Date.now()

  // FIXME: persistance

  log.stream({}).pipe({
    paused: false,
    write: function (data) {
      var p = 0 // note you pass in p!
      p = bipf.seekKey(data.value, p, bValue)
      if (~p) {
        var p2 = bipf.seekKey(data.value, p, bAuthor)
        const author = bipf.decode(data.value, p2)
        var p3 = bipf.seekKey(data.value, p, bSequence)
        const sequence = bipf.decode(data.value, p3)
        authorSequenceToSeq[[author, sequence]] = data.seq
      }
      count++
    },
    end: () => {
      console.log(`clock index full scan time: ${Date.now()-start}ms, total items: ${count}`)
    }
  })

  return {
    get: function(key, cb) {
      if (!authorSequenceToSeq[key])
        cb('Key not found:' + key)
      else
        full.get(authorSequenceToSeq[key], cb)
    }
  }
}
