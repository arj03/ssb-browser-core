module.exports = function () {
  var waiting = []
  var isReady = false
  var errResult, dataResult

  return {
    isReady,

    done: function(err, data) {
      isReady = true
      errResult = err
      dataResult = data

      for (var i = 0; i < waiting.length; ++i)
        waiting[i](err, data)

      waiting = []
    },

    get: function(cb) {
      if (isReady)
        cb(errResult, dataResult)
      else
        waiting.push(cb)
    }
  }
}
