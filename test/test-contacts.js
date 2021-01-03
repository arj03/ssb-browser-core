const test = require('tape')
const pull = require('pull-stream')

const dir = '/tmp/ssb-browser-contacts'

require('rimraf').sync(dir)

require('../core.js').init(dir)

SSB.events.on('SSB: loaded', function() {
  test('Base', t => {
    const contactMsg = { type: 'contact',
                         contact: '@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.ed25519',
                         following: true }
    SSB.publish(contactMsg, (err) => {
      SSB.db.onDrain('contacts', () => {
        SSB.db.getIndex('contacts').getGraphForFeed(SSB.net.id, (err, graph) => {
          t.equal(graph.following[0], contactMsg.contact)
          t.end()
        })
      })
    })
  })
})
