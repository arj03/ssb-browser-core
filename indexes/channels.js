const bipf = require('bipf')
const pull = require('pull-stream')
const pl = require('pull-level')
const jsonCodec = require('flumecodec/json')
const Plugin = require('ssb-db2/indexes/plugin')

module.exports = function (log, dir) {
  const bValue = Buffer.from('value')
  const bContent = Buffer.from('content')
  const bType = Buffer.from('type')
  const bChannel = Buffer.from('channel')
  const bPost = Buffer.from('post')

  let batch = []

  const name = 'channels'
  const { level, offset, stateLoaded, onData, writeBatch } = Plugin(
    dir,
    name,
    1,
    handleData,
    writeData,
    beforeIndexUpdate
  )

  function writeData(cb) {
    level.batch(batch, { keyEncoding: 'json', valueEncoding: 'json' }, cb)
    batch = []
  }

  function handleData(record, processed) {
    if (record.offset < offset.value) return batch.length
    const recBuffer = record.value
    if (!recBuffer) return batch.length // deleted

    let p = 0 // note you pass in p!
    p = bipf.seekKey(recBuffer, p, bValue)
    if (!~p) return batch.length

    const pContent = bipf.seekKey(recBuffer, p, bContent)
    if (!~pContent) return batch.length

    const pType = bipf.seekKey(recBuffer, pContent, bType)
    if (!~pType) return batch.length

    if (bipf.compareString(recBuffer, pType, bPost) === 0) {
      const content = bipf.decode(recBuffer, pContent)
      if (!content.channel || content.channel == '') return batch.length
      const channel = content.channel.replace(/^[#]+/, '')

      updateChannelData(channel)

      batch.push({
        type: 'put',
        key: channel,
        value: channels[channel]
      })
    }

    return batch.length
  }
  
  function updateChannelData(channel) {
    if (!channels[channel])
      channels[channel] = { id: channel, count: 0 }
    ++channels[channel].count
  }

  let channels = {}
  
  function beforeIndexUpdate(cb) {
    console.time("start channels get")
    pull(
      pl.read(level, {
        gte: '',
        lte: undefined,
        keyEncoding: jsonCodec,
        valueEncoding: jsonCodec,
        keys: true
      }),
      pull.drain(
        (data) => channels[data.key] = data.value,
        () => {
          console.timeEnd("start channels get")
          cb()
        })
    )
  }

  function getChannels() {
    return Object.keys(channels)
  }

  function getChannelUsage(channel) {
    return (channels[channel] && channels[channel].count)
  }

  return {
    offset,
    stateLoaded,
    onData,
    writeBatch,
    name,

    remove: level.clear,
    close: level.close.bind(level),

    getChannels,
    getChannelUsage
  }
}
