module.exports = function (log) {
  const bKey = new Buffer('key')
  var keyToSeq = {}

  var count = 0
  const start = Date.now()

  // FIXME: persistance

  log.stream({}).pipe({
    paused: false,
    write: function (data) {
      var p = 0 // note you pass in p!
      p = bipf.seekKey(data.value, p, bKey)
      const key = bipf.decode(data.value, p)
      console.log(key)
      keyToSeq[key] = data.seq
      count++
    },
    end: () => {
      console.log(`key index full scan time: ${Date.now()-start}ms, total items: ${count}`)
    }
  })

  return {
    get: function(key, cb) {
      if (!keyToSeq[key])
        cb('Key not found:' + key)
      else
        full.get(keyToSeq[key], cb)
    }
  }
}
