const os = require('os')
const path = require('path')

// in browser this will be local storage
const dir = path.join(os.homedir(), ".ssb-lite")

require('./core').init(dir)
