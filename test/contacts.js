const test = require('tape')
const pull = require('pull-stream')

const dir = '/tmp/ssb-browser-contacts'

require('rimraf').sync(dir)

require('../core.js').init(dir)

SSB.on('SSB: loaded', function() {
  test('Base', t => {
    const contactMsg = { type: 'contact',
                         contact: '@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.ed25519',
                         following: true }
    SSB.db.publish(contactMsg, (err) => {
      function onGraph(err, graph) {
        console.log("done graph!")
        t.equal(graph.following[0], contactMsg.contact)
        t.end()
      }
      SSB.helpers.getGraphForFeed(SSB.id, onGraph)
    })
  })
})
