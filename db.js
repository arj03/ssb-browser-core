const push = require('push-stream')
const pull = require('pull-stream')

const hash = require('ssb-keys/util').hash
const validate = require('ssb-validate')
const keys = require('ssb-keys')

const Log = require('./log')
const FullScanIndexes = require('./indexes/full-scan')
const Contacts = require('./indexes/contacts')
const Profiles = require('./indexes/profiles')
const Partial = require('./indexes/partial')
const JITDb = require('jitdb')

function getId(msg) {
  return '%'+hash(JSON.stringify(msg, null, 2))
}

exports.init = function (dir, ssbId, config) {
  const log = Log(dir, ssbId, config)
  const jitdb = JITDb(log, "/indexes")
  const contacts = Contacts(jitdb)
  const profiles = Profiles(jitdb)
  const fullIndex = FullScanIndexes(log)
  const partial = Partial()

  function get(id, cb) {
    fullIndex.keysGet(id, (err, data) => {
      if (data)
        cb(null, data.value)
      else
        cb(err)
    })
  }

  function add(msg, cb) {
    var id = getId(msg)

    fullIndex.keysGet(id, (err, data) => {
      if (data)
        cb(null, data.value)
      else {
        // store encrypted messages for us unencrypted for views
        // ebt will turn messages into encrypted ones before sending
        if (typeof (msg.content) === 'string') {
          const decrypted = keys.unbox(msg.content, SSB.net.config.keys.private)
          if (decrypted) {
            const cyphertext = msg.content

            msg.content = decrypted
            msg.meta = {
	      private: "true",
	      original: {
	        content: cyphertext
	      }
            }
          }
        }

        log.add(id, msg, cb)
      }
    })
  }

  function del(key, cb) {
    fullIndex.keysGet(key, (err, val, seq) => {
      if (err) return cb(err)
      if (seq == null) return cb(new Error('seq is null!'))

      log.del(seq, cb)
    })
  }

  // FIXME: deleteFeed

  function decryptMessage(msg) {
    return keys.unbox(msg.content, SSB.net.config.keys.private)
  }

  const hmac_key = null

  function validateAndAddOOO(msg, cb) {
    try {
      var state = validate.initial()
      validate.appendOOO(SSB.state, hmac_key, msg)

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

  function getStatus() {
    const partialState = partial.get()
    const hops = contacts.getHopsSync()

    let profilesSynced = 0
    let contactsSynced = 0
    let messagesSynced = 0
    let total = 0

    var following = []
    for (var relation in hops[ssbId])
      if (hops[ssbId][relation] >= 0)
        following.push(relation)

    for (var feedId in hops) {
      if (feedId === ssbId)
        continue

      if (!following.includes(feedId))
        continue

      for (var relation in hops[feedId]) {
        if (hops[feedId][relation] >= 0) {
          if (feedId === relation)
            continue

          if (partialState[relation] && partialState[relation]['syncedProfile'])
            profilesSynced += 1
          if (partialState[relation] && partialState[relation]['syncedContacts'])
            contactsSynced += 1
          if (partialState[relation] && partialState[relation]['syncedMessages'])
            messagesSynced += 1

          total += 1
        }
      }
    }

    return {
      log: log.since.value,
      full: fullIndex.seq.value,
      contacts: contacts.seq.value,
      profiles: profiles.seq.value,
      partial: {
        total,
        profilesSynced,
        contactsSynced,
        messagesSynced
      }
    }
  }

  function getMissingFeeds(missingAttr, cb) {
    let partialState = partial.get()
    contacts.getHops((err, hops) => {
      let feedsToSync = []

      // FIXME: respect hops (https://github.com/ssbc/layered-graph)
      var following = [ssbId]
      for (var relation in hops[ssbId])
        if (hops[ssbId][relation] >= 0)
          following.push(relation)

      for (var feedId in hops) {
        if (!following.includes(feedId))
          continue

        for (var relation in hops[feedId]) {
          if (hops[feedId][relation] >= 0) {
            if (relation === ssbId)
              continue

            if (!partialState[relation] || !partialState[relation][missingAttr])
              feedsToSync.push(relation)
          }
        }
      }

      cb(err, [...new Set(feedsToSync)])
    })
  }

  function syncMissingSequence() {
    SSB.connected((rpc) => {
      getMissingFeeds('syncedMessages', (err, feedsToSync) => {
        console.log(`syncing messages for ${feedsToSync.length} feeds`)
        console.time("downloading messages")

        pull(
          pull.values(feedsToSync),
          pull.asyncMap((feed, cb) => {
            //console.log("downloading messages for", feed)
            //console.time("downloading messages")
            pull(
              rpc.partialReplication.getFeedReverse({ id: feed, keys: false, limit: 25 }),
              pull.asyncMap(SSB.db.validateAndAdd),
              pull.collect((err, msgs) => {
                if (err) {
                  console.error(err.message)
                  return cb(err)
                }

                SSB.state.queue = []
                //console.timeEnd("downloading messages")

                partial.updateState(feed, { syncedMessages: true })

                cb()
              })
            )
          }),
          pull.collect(() => {
            console.log("done")
            console.timeEnd("downloading messages")
          })
        )
      })
    })
  }

  function syncMissingProfiles() {
    SSB.connected((rpc) => {
      getMissingFeeds('syncedProfile', (err, feedsToSync) => {
        console.log(`syncing profiles for ${feedsToSync.length} feeds`)
        console.time("downloading profiles")

        pull(
          pull.values(feedsToSync),
          pull.asyncMap((feed, cb) => {
            //console.log("downloading profile for", feed)
            //console.time("syncing profile")
            pull(
              rpc.partialReplication.getMessagesOfType({id: feed, type: 'about'}),
              pull.asyncMap(SSB.db.validateAndAddOOO),
              pull.collect((err, msgs) => {
                if (err) {
                  console.error(err.message)
                  return cb(err)
                }

                //console.timeEnd("syncing profile")
                //console.log(msgs.length)

                partial.updateState(feed, { syncedProfile: true })

                cb()
              })
            )
          }),
          pull.collect(() => {
            console.log("done")
            console.timeEnd("downloading profiles")
          })
        )
      })
    })
  }

  function syncMissingContacts() {
    SSB.connected((rpc) => {
      getMissingFeeds('syncedContacts', (err, feedsToSync) => {
        console.log(`syncing contacts for ${feedsToSync.length} feeds`)
        console.time("downloading contacts")

        pull(
          pull.values(feedsToSync),
          pull.asyncMap((feed, cb) => {
            //console.log("downloading contacts for", feed)
            //console.time("syncing contacts")
            pull(
              rpc.partialReplication.getMessagesOfType({id: feed, type: 'contact'}),
              pull.asyncMap(SSB.db.validateAndAddOOO),
              pull.collect((err, msgs) => {
                if (err) {
                  console.error(err.message)
                  return cb(err)
                }

                //console.timeEnd("syncing contacts")
                //console.log(msgs.length)

                partial.updateState(feed, { syncedContacts: true })

                cb()
              })
            )
          }),
          pull.collect(() => {
            console.log("done")
            console.timeEnd("downloading contacts")
          })
        )
      })
    })
  }

  function clearIndexes() {
    contacts.remove(() => {})
    profiles.remove(() => {})
    fullIndex.remove(() => {})
    partial.remove(() => {})
  }

  return {
    get,
    add,
    del,
    validateAndAdd,
    validateAndAddOOO,
    getStatus,
    getLast: fullIndex.getLast,
    getHops: contacts.getHops,
    getProfiles: profiles.getProfiles,
    jitdb,
    clearIndexes,

    // partial stuff
    partial,
    syncMissingProfiles,
    syncMissingContacts,
    syncMissingSequence,
    getMissingFeeds // debugging
  }
}
