const test = require('tape')
const pull = require('pull-stream')

test('write 1 message', t => {
  require('../core.js').init('/tmp/ssb-browser-validate')

  SSB.events.on('SSB: loaded', function() {
    const post = { type: 'post', text: 'Testing!' }
    
    SSB.publish(post, (err, postMsg) => {
      if (err) console.error(err)

      t.equal(postMsg.value.content.text, post.text, 'text correct')
      t.end()
    })
  })
})

