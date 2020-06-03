const pull = require('pull-stream')

const hash = require('ssb-keys/util').hash
const validate = require('ssb-validate')
const keys = require('ssb-keys')

const Contacts = require('./contacts')
const Full = require('./full')
const Latest = require('./latest')
const Profiles = require('./profiles')

function getId(msg) {
  return '%'+hash(JSON.stringify(msg, null, 2))
}

exports.init = function (dir, ssbId, config) {
  const contacts = Contacts(dir, ssbId, config)
  const full = Full(dir, ssbId, config)
  const latest = Latest(dir, ssbId, config)
  const profiles = Profiles(dir, ssbId, config)

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

    let typeDB = null

    if (msg.content.type == 'contact')
      typeDB = function() { contacts.add(id, msg, cb) }
    else if (msg.content.type == 'post')
      typeDB = function() { latest.add(id, msg, cb) }
    else if (msg.content.type == 'about' && msg.content.about == msg.author)
      typeDB = function() { profiles.add(id, msg, cb) }

    // FIXME: hax
    if (msg.author == '@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.ed25519')
      full.add(id, msg, () => {
        if (typeDB)
          typeDB()
        else
          cb()
      })
    else if (typeDB)
      typeDB()
    else
      cb()
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
      full: full.since.value,
      latest: latest.since.value,
      contacts: contacts.since.value,
      profiles: profiles.since.value
    }
  }

  function latestMessages(cb) {
    pull(
      latest.stream(),
      pull.collect((err, messages) => {
        if (err) return cb(err)
        cb(null, messages.map(x => x.value))
      })
    )
  }
  
  return {
    get,
    add,
    validateAndAdd,
    validateAndAddStrictOrder,
    getStatus,
    latestMessages,
    getHops: contacts.getHops,
    getProfiles: profiles.getProfiles
  }
}
