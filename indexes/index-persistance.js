const RAF = require('polyraf')
const debounce = require('lodash.debounce')

module.exports = function () {
  return {
    // getDataBuffer is function that must return a buffer
    save: debounce(function(filename, seq, getDataBuffer, cb) {
      console.log("writing index to", filename)

      var b = Buffer.alloc(4)
      b.writeInt32LE(seq, 0)

      var file = RAF(filename)
      if (file.deleteable) {
        file.destroy(() => {
          file = RAF(filename)
          file.write(0, b, () => {
            file.write(4, getDataBuffer(), cb)
          })
        })
      } else {
        file.write(0, b, () => {
          file.write(4, getDataBuffer(), cb)
        })
      }
    }, 300),

    load: function(filename, cb) {
      const f = RAF(filename)
      f.stat((err, stat) => {
        if (err) return cb(err)
        if (stat.size == 0) return cb("empty file")
        f.read(0, 4, (err, seqBuffer) => {
          if (err) return cb(err)
          const seq = seqBuffer.readInt32LE(0)
          f.read(4, stat.size-4, (err, buf) => {
            if (err) return cb(err)
            else cb(null, {
              seq,
              data: JSON.parse(buf)
            })
          })
        })
      })
    }
  }
}
