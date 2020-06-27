// instead of flumelog-aligned-offset/compat which wraps stream in a
// pull stream this only adds since
var Obv = require('obv')

module.exports = function(log) {
    log.since = Obv()
    log.onWrite = log.since.set
    return log
}
