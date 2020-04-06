const Notify = require('pull-notify');

exports.manifest =  {
  message: 'async'
}

exports.permissions = {
  anonymous: {allow: ['message']}
}

exports.name = 'tunnelMessage'

exports.init = function (sbot, config) {

  var messages = Notify()
  var remotes = []
  var incomingOk = ""

  sbot.on('rpc:connect', function (rpc, isClient) {
    if (!isClient && rpc.id == incomingOk) {
      incomingOk = ""
      remotes.push(rpc)

      rpc.on('closed', (err) => {
        remotes = remotes.filter(remote => remote.id != rpc.id)
        messages({ type: "info", user: rpc.id, data: "disconnected" })
      })
    }
  })

  return {
    acceptMessages: function(confirmHandler) {
      SSB.net.tunnel.setupIsConnectionOkHandler((remoteId) => {
        const isOk = confirmHandler(remoteId)
        if (isOk) {
          messages({ type: "info", user: remoteId, data: "connected" })
          incomingOk = remoteId
        }
        return isOk
      })

      SSB.net.connect(SSB.remoteAddress, (err, rpc) => {
        if (err) throw(err)

        rpc.tunnel.announce()
      })
    },
    connect: function(remoteId) {
      const remoteKey = remoteId.substring(1, remoteId.indexOf('.'))
      const remoteAddr = 'tunnel:@'+SSB.remoteAddress.split(':')[3]+ ':' + remoteId + '~shs:' + remoteKey
      messages({ type: "info", user: remoteId, data: "waiting for accept" })
      SSB.net.connect(remoteAddr, (err, rpc) => {
        if (err) throw(err)

        remotes.push(rpc)
        messages({ type: "info", user: rpc.id, data: "connected" })

        rpc.on('closed', (err) => {
          remotes = remotes.filter(remote => remote.id != rpc.id)
          messages({ type: "info", user: rpc.id, data: "disconnected" })
        })
      })
    },
    disconnect: function() {
      remotes.forEach(remote =>  {
        try {
          remote.close(true)
        } catch (e) {}
        messages({ type: "info", user: remote.id, data: "disconnected" })
      })
      remotes = []
    },
    sendMessage: function(type, message) {
      var toRemove = []
      remotes.forEach(remote => {
        try {
          remote.tunnelMessage.message({ type, message })
        } catch (e) {
          messages({ type: "info", user: remote.id, data: "disconnected" })
          toRemove.push(remote)
        }
      })
      if (toRemove.length > 0)
        remotes = remotes.filter(remote => !toRemove.includes(remote))

      messages({ type, user: SSB.net.id, data: message })
    },
    message: function(msg) {
      messages({ type: msg.type, user: this.id, data: msg.message })
    },
    messages: function() {
      return messages.listen()
    }
  }
}
