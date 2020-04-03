const Notify = require('pull-notify');

exports.manifest =  {
  tunnelMessage: 'async'
}

exports.permissions = {
  anonymous: {allow: ['tunnelMessage']}
}

exports.name = 'tunnelChat'

exports.init = function (sbot, config) {

  var messages = Notify()
  var remotes = []

  sbot.on('rpc:connect', function (rpc, isClient) {
    if (!isClient)
      remotes.push(rpc)
  })
  
  return {
    acceptMessages: function() {
      SSB.net.tunnel.setupIsConnectionOkHandler((remoteId) => {
	let isOk = confirm("Allow connection from: " + remoteId + "?")
	if (isOk)
	  messages({user: '', text: remoteId + " connected!"})
	return isOk
      })

      SSB.net.connect(SSB.remoteAddress, (err, rpc) => {
	if (err) throw(err)

	rpc.tunnel.announce()
      })
    },
    connect: function(remoteId) {
      var remoteKey = remoteId.substring(1, remoteId.indexOf('.'))
      messages({user: '', text: "waiting for @" + remoteKey + ".ed25519 to accept"})
      SSB.net.connect('tunnel:@'+SSB.remoteAddress.split(':')[3]+ ':' + remoteId + '~shs:' + remoteKey, (err, rpc) => {
	if (err) throw(err)

	remotes.push(rpc)
	messages({user: '', text: rpc.id + " connected!"})
      })
    },
    sendMessage: function(text) {
      var toRemove = []
      remotes.forEach(remote => {
        try {
          remote.tunnelChat.tunnelMessage(text)
        } catch (e) {
	  messages({user: '', text: 'remote end disconnected'})
          toRemove.push(remote)
        }
      })
      remotes = remotes.filter(remote => !toRemove.includes(remote))
      messages({user: 'me', text})
    },
    tunnelMessage: function(text) {
      messages({user: this.id, text})
    },
    messages: function() {
      return messages.listen()
    }
  }
}
