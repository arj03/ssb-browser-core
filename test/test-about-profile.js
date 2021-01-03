const test = require('tape')
const pull = require('pull-stream')

const dir = '/tmp/ssb-browser-about'

require('rimraf').sync(dir)

require('../core.js').init(dir)

SSB.events.on('SSB: loaded', function() {
  test('Base', t => {
    const aboutMsg = { type: 'about',
                       about: SSB.net.id,
                       name: 'arj' }
    SSB.publish(aboutMsg, (err) => {
      SSB.db.onDrain('profile', () => {
        const profiles = SSB.db.getIndex('profiles').getProfiles()
        t.equal(profiles[SSB.net.id].name, aboutMsg.name)
        t.end()
      })
    })
  })
})
