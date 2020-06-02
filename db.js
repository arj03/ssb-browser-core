const pull = require('pull-stream')

const hash = require('ssb-keys/util').hash
const validate = require('ssb-validate')
const keys = require('ssb-keys')

const Friends = require('./friends')
const Own = require('./own')
const Latest = require('./latest')

function getId(msg) {
  return '%'+hash(JSON.stringify(msg, null, 2))
}

exports.init = function (dir, ssbId, config) {
  const friends = Friends(dir, ssbId, config)
  const own = Own(dir, ssbId, config)
  const latest = Latest(dir, ssbId, config)

  function get(id, cb) {
    latest.get(id, (err, data) => {
      if (data)
	cb(null, data.value)
      else
	cb(err)
    })
  }

  function add(msg, cb) {
    var id = getId(msg)

    if (msg.author == ssbId)
      own.add(id, msg, cb)
    if (msg.content.type == 'contact')
      friends.add(id, msg, cb)
    if (msg.content.type == 'post')
      latest.add(id, msg, cb)
  }

  function decryptMessage(msg) {
    return keys.unbox(msg.content, SSB.net.config.keys.private)
  }

  const hmac_key = null

  function validateAndAddStrictOrder(msg, cb) {
    const knownAuthor = msg.author in SSB.state.feeds

    try {
      if (!knownAuthor)
        SSB.state = validate.appendOOO(SSB.state, hmac_key, msg)
      else
        SSB.state = validate.append(SSB.state, hmac_key, msg)

      if (SSB.state.error)
        return cb(SSB.state.error)

      add(msg, cb)
    }
    catch (ex)
    {
      return cb(ex)
    }
  }

  function validateAndAdd(msg, cb) {
    const knownAuthor = msg.author in SSB.state.feeds
    const earlierMessage = knownAuthor && msg.sequence < SSB.state.feeds[msg.author].sequence
    const skippingMessages = knownAuthor && msg.sequence > SSB.state.feeds[msg.author].sequence + 1

    const alreadyChecked = knownAuthor && msg.sequence == SSB.state.feeds[msg.author].sequence
    if (alreadyChecked && cb)
      return cb()

    if (!knownAuthor || earlierMessage || skippingMessages)
      SSB.state = validate.appendOOO(SSB.state, hmac_key, msg)
    else
      SSB.state = validate.append(SSB.state, hmac_key, msg)

    if (SSB.state.error)
      return cb(SSB.state.error)

    add(msg, cb)
  }

  function getStatus() {
    return {
      own: own.since.value,
      latest: latest.since.value,
      friends: friends.since.value,
      //contacts: friends.contacts2.since.value
    }
  }
  
  return {
    get,
    add,
    validateAndAdd,
    validateAndAddStrictOrder,
    getStatus
  }
}
