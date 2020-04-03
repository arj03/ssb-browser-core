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

  sbot.on('rpc:connect', function (rpc, isClient) {
    if (!isClient)
      remotes.push(rpc)
  })
  
  return {
    acceptMessages: function(confirmHandler) {
      SSB.net.tunnel.setupIsConnectionOkHandler((remoteId) => {
        const isOk = confirmHandler(remoteId)
        if (isOk)
	  messages({ type: "info", user: remoteId, data: "connected" })
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
      })
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
