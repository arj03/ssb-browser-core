const push = require('push-stream')
const pull = require('pull-stream')

const hash = require('ssb-keys/util').hash
const validate = require('ssb-validate')
const keys = require('ssb-keys')

const Contacts = require('./contacts')
const Full = require('./full')
const Latest = require('./latest')
const Profiles = require('./profiles')
const FeedIndex = require('./indexes/feed')

function getId(msg) {
  return '%'+hash(JSON.stringify(msg, null, 2))
}

exports.init = function (dir, ssbId, config) {
  const contacts = Contacts(dir, ssbId, config)
  const full = Full(dir, ssbId, config)
  const latest = Latest(dir, ssbId, config)
  const profiles = Profiles(dir, ssbId, config)
  const feedIndex = FeedIndex()
  
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

    if (msg.author == ssbId)
      full.add(id, msg, () => {
        if (typeDB)
          typeDB()
        else
          cb(null, { value: msg })
      })
    else if (typeDB)
      typeDB()
    else
      cb(null, { value: msg })
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
      return cb(null, { value: msg })

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
      profiles: profiles.since.value,
      feedIndex: feedIndex.get()
    }
  }

  // FIXME: cache?
  function latestMessages(cb) {
    console.time("extracted latest from db")
    push(
      latest.stream(),
      push.collect((err, messages) => {
        if (err) return cb(err)
        console.timeEnd("extracted latest from db")
        console.log("total latest messages", messages.length)
        cb(null, messages.map(x => x.value))
      })
    )
  }

  function getMissingFeeds(missingAttr, cb) {
    let feedState = feedIndex.get()
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
            if (!feedState[relation] || !feedState[relation][missingAttr]) {
              feedsToSync.push(relation)
            }
          }
        }
      }

      cb(err, [...new Set(feedsToSync)])
    })
  }
  
  function syncMissingSequence() {
    SSB.connected((rpc) => {
      getMissingFeeds('latestSequence', (err, feedsToSync) => {
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
                SSB.state.queue = []
                //console.timeEnd("downloading messages")

                if (err)
                  cb(err)
                else {
                  if (msgs.length > 0)
                    SSB.db.feedIndex.updateState(feed, {
                      latestSequence: msgs[msgs.length-1].value.sequence
                    })
                  cb()
                }
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
              pull.asyncMap(SSB.db.validateAndAdd),
              pull.collect((err, msgs) => {
                if (err) {
                  console.error(err.message)
                  return cb(err)
                }

                //console.timeEnd("syncing profile")
                //console.log(msgs.length)

                SSB.db.feedIndex.updateState(feed, {
                  syncedProfile: true
                })

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
              pull.asyncMap(SSB.db.validateAndAdd),
              pull.collect((err, msgs) => {
                if (err) {
                  console.error(err.message)
                  return cb(err)
                }

                //console.timeEnd("syncing contacts")
                //console.log(msgs.length)

                SSB.db.feedIndex.updateState(feed, {
                  syncedContacts: true
                })

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

  return {
    get,
    add,
    validateAndAdd,
    validateAndAddStrictOrder,
    getStatus,
    latestMessages,
    getHops: contacts.getHops,
    getProfiles: profiles.getProfiles,
    feedIndex,
    syncMissingProfiles,
    syncMissingContacts,
    syncMissingSequence,
    getMissingFeeds
  }
}
