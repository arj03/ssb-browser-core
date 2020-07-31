const push = require('push-stream')

const hash = require('ssb-keys/util').hash
const validate = require('ssb-validate')
const keys = require('ssb-keys')
const path = require('path')

const Log = require('./log')
const FullScanIndexes = require('./indexes/full-scan')
const Partial = require('./indexes/partial')
const JITDb = require('jitdb')
const FeedSyncer = require('./feed-syncer')

function getId(msg) {
  return '%'+hash(JSON.stringify(msg, null, 2))
}

exports.init = function (dir, ssbId, config) {
  const log = Log(dir, ssbId, config)
  const jitdb = JITDb(log, path.join(dir, "indexes"))
  const fullIndex = FullScanIndexes(log, dir)
  const contacts = fullIndex.contacts
  const partial = Partial(dir)
  const feedSyncer = FeedSyncer(log, partial, contacts)

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

    /*
      Beware:

      There is a race condition here if you add the same message quickly
      after another because fullIndex is lazy. The default js SSB
      implementation adds messages in order, so it doesn't really have
      this problem.
    */

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
    fullIndex.keyToSeq(key, (err, seq) => {
      if (err) return cb(err)
      if (seq == null) return cb(new Error('seq is null!'))

      log.del(seq, cb)
    })
  }

  function deleteFeed(feedId, cb) {
    SSB.db.jitdb.onReady(() => {
      SSB.db.jitdb.query({
        type: 'EQUAL',
        data: {
          seek: SSB.db.jitdb.seekAuthor,
          value: Buffer.from(feedId),
          indexType: "author"
        }
      }, 0, (err, results) => {
        push(
          push.values(results),
          push.asyncMap((msg, cb) => {
            del(msg.key, cb)
          }),
          push.collect((err) => {
            if (!err) {
              delete SSB.state.feeds[feedId]
              fullIndex.removeFeedFromLatest(feedId)
            }
            cb(err)
          })
        )
      })
    })
  }

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
    const partialState = partial.getSync()
    const graph = contacts.getGraphForFeedSync(SSB.net.id)

    let profilesSynced = 0
    let contactsSynced = 0
    let messagesSynced = 0
    let total = 0

    graph.extended.forEach(relation => {
      if (partialState[relation] && partialState[relation]['syncedProfile'])
        profilesSynced += 1
      if (partialState[relation] && partialState[relation]['syncedContacts'])
        contactsSynced += 1
      if (partialState[relation] && partialState[relation]['syncedMessages'])
        messagesSynced += 1

      total += 1
    })

    return {
      log: log.since.value,
      indexes: fullIndex.seq.value,
      partial: {
        total,
        profilesSynced,
        contactsSynced,
        messagesSynced
      }
    }
  }

  function clearIndexes() {
    fullIndex.remove(() => {})
    partial.remove(() => {})
  }

  return {
    get,
    add,
    del,
    deleteFeed,
    validateAndAdd,
    validateAndAddOOO,
    getStatus,
    getAllLatest: fullIndex.getAllLatest,
    getClock: fullIndex.clockGet,
    contacts,
    profiles: fullIndex.profiles,
    getMessagesByRoot: fullIndex.getMessagesByRoot,
    getMessagesByMention: fullIndex.getMessagesByMention,
    jitdb,
    clearIndexes,

    // partial stuff
    partial,
    feedSyncer
  }
}
