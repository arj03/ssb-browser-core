const bipf = require('bipf')
const pull = require('pull-stream')
const pl = require('pull-level')
const jsonCodec = require('flumecodec/json')
const Plugin = require('ssb-db2/indexes/plugin')
const promisify = require('promisify-4loc')

const isFeed = require('ssb-ref').isFeed

// 1 index:
// - [from, to] => distance

module.exports = function (log, dir) {
  const bValue = Buffer.from('value')
  const bAuthor = Buffer.from('author')
  const bContent = Buffer.from('content')
  const bType = Buffer.from('type')
  const bContact = Buffer.from('contact')

  let batch = []

  const name = 'contacts'
  const { level, offset, stateLoaded, onData, writeBatch } = Plugin(
    dir,
    name,
    1,
    handleData,
    writeData
  )

  function writeData(cb) {
    level.batch(batch, { keyEncoding: 'json' }, cb)
    batch = []
  }

  function handleData(record, processed) {
    if (record.offset < offset.value) return batch.length
    const recBuffer = record.value
    if (!recBuffer) return batch.length // deleted

    let p = 0 // note you pass in p!
    p = bipf.seekKey(recBuffer, p, bValue)
    if (!~p) return batch.length

    const pAuthor = bipf.seekKey(recBuffer, p, bAuthor)
    const author = bipf.decode(recBuffer, pAuthor)

    const pContent = bipf.seekKey(recBuffer, p, bContent)
    if (!~pContent) return batch.length

    const pType = bipf.seekKey(recBuffer, pContent, bType)
    if (!~pType) return batch.length

    if (bipf.compareString(recBuffer, pType, bContact) === 0) {
      const content = bipf.decode(recBuffer, pContent)
      const to = content.contact

      if (isFeed(author) && isFeed(to)) {
        batch.push({
          type: 'put',
          key: [author, to],
          value: getStatus(content)
        })
      }
    }

    return batch.length
  }

  function getStatus(content) {
    return content.blocking || content.flagged ? -1 :
      content.following === true ? 1
      : -2 // this -2 is wierd, but is how it is in ssb-friends
  }
  
  function get(from, to, cb) {
    level.get([from, to], (err, status) => {
      if (err) cb(err)
      else cb(null, parseInt(status, 10))
    })
  }

  function getFeed(from, cb) {
    pull(
      pl.read(level, {
        gte: [from, ''],
        lte: [from, undefined],
        keyEncoding: jsonCodec,
        keys: true
      }),
      pull.collect((err, data) => {
        let result = {}
        data.forEach(x => result[x.key[1]] = parseInt(x.value, 10))
        if (err) return cb(err)
        else cb(null, result)
      })
    )
  }

  function isFollowing(source, dest) {
    if (!hops[source]) return false
    return hops[source][dest] === 1
  }

  function isBlocking(source, dest) {
    if (!hops[source]) return false
    return hops[source][dest] === -1
  }

  function getGraphForFeed(feed, cb) {
    getFeed(feed, (err, data) => {
      hops[feed] = data
      let feedsToGet = []
      for (var other in data) {
        if (data[other] > 0) {
          const follow = other
          if (!hops[follow]) {
            feedsToGet.push(promisify((cb) => {
              getFeed(follow, (err, data) => {
                hops[follow] = data
                cb()
              })
            })())
          }
        }
      }
      Promise.all(feedsToGet).then(() => cb(err, getGraphForFeedSync(feed)))
    })
  }

  // FIXME: cache
  let hops = {}

  // might return empty when hops is not loaded yet
  function getGraphForFeedSync(feed) {
    let following = []
    let blocking = []
    let extended = []

    for (let relation in hops[feed]) {
      if (isFollowing(feed, relation))
        following.push(relation)
      else if (isBlocking(feed, relation))
        blocking.push(relation)
    }

    for (let feedId in hops) {
      if (feedId === feed)
        continue

      if (!following.includes(feedId))
        continue

      for (let relation in hops[feedId]) {
        if (isFollowing(feedId, relation)) {
          if (relation === feed)
            continue

          if (following.includes(relation))
            continue

          if (blocking.includes(relation))
            continue

          extended.push(relation)
        }
      }
    }

    return {
      following,
      blocking,
      extended: [...new Set(extended)]
    }
  }

  return {
    offset,
    stateLoaded,
    onData,
    writeBatch,
    name,

    remove: level.clear,
    close: level.close.bind(level),

    get,
    getFeed,
    getGraphForFeed,
    getGraphForFeedSync,
    isFollowing,
    isBlocking,
  }
}
