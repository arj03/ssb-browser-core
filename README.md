# SSB browser core

Secure scuttlebutt core (similar to [ssb-server]) in a browser.

# api

Once you load the `bundle-core.js` file in a browser a global SSB
object will be available.

The api is not meant to be 100% compatible with regular
ssb-db. Overall there are two major parts: `db` and `net`.

## db

### get(id, cb)

Will get a message with `id` from the database. If the message is not
found an err will be returned.

### add(msg, cb)

Add a raw message (without id and timestamp) to the database and
return the stored message (id, timestamp, value = original message) or
err.

### del(id, cb)

Remove a message from the database. Please note that if you remove a
message for a feed where you store all the messages in the log this
will mean that you won't be able to replicate this feed with other
peers.

### deleteFeed(feedId, cb)

Delete all messages for a particular feed.

### query

The query index

### last

The last index

### clock

The clock index

### friends

The [ssb-friends] module

### peerInvites

The [ssb-peer-invites] module

### getStatus

Gets the current db status, same functionality as
[db.status](https://github.com/ssbc/ssb-db#dbstatus) in ssb-db.

## net

This is the [secret-stack] module with a few extra modules
loaded. [ssb-ws] is used to create web socket connections to pubs.

Two modules are special compared to a normal SSB distribution and to
use this optional functionality the pub needs these plugins:

- [ssb-get-thread]
- [ssb-partial-replication]

## dir

The path to where the database and blobs are stored.

## validate

The [ssb-validate] module.

## state

The current [state](https://github.com/ssbc/ssb-validate#state) of
known feeds.

## connected(cb)

Will ensure a connection is ready. Cb signature is (err, rpc).

## profiles

FIXME: document this

## publish(msg, cb)

Validates a message and stores it in the database. See db.add for format.

## messagesByType

A convenience method around db.query to get messages of a particular type.

## remoteAddress

The remote server to connect to. Must be web socket.

## sync

Start a EBT replication with the remote server. This syncs all the
feeds known in `SSB.state.feeds`.

FIXME: document how this works with following

## initialSync

FIXME: document

FIXME: this requires the partial replication plugin

## box

[box](https://github.com/ssbc/ssb-keys#boxcontent-recipients--boxed)
method from ssb-keys. Useful for private messages.

## blobFiles

The [ssb-blob-files] module.

## validMessageTypes

An array of message types to store during sync.

FIXME: document how this works with following

## privateMessages

A boolean to indicate if private messages are to be stored during sync.

FIXME: document how this works with following


There are a few other undocumented methods, these will probably be
moved to another module in a later version as they are quite tied to
[ssb-browser-demo].

# Building

The following patches (patch -p0 < x.patch) from the patches folder
are needed:
 - epidemic-broadcast-fix-replicate-multiple.patch
 - ssb-ebt.patch
 - ssb-friends.patch
 - ssb-tunnel.patch
 - ssb-peer-invites.patch
 - ssb-blob-files.patch

The following branches are references directly until patches are merged and pushed:
 - https://github.com/ssbc/ssb-validate/pull/16

For a smaller bundle file, you can also apply
patches/sodium-browserify.patch

[ssb-server]: https://github.com/ssbc/ssb-server
[ssb-browser-demo]: https://github.com/arj03/ssb-browser-demo
[secret-stack]: https://github.com/ssbc/secret-stack
[ssb-ws]: https://github.com/ssbc/ssb-ws
[ssb-friends]: https://github.com/ssbc/ssb-friends
[ssb-peer-invites]: https://github.com/ssbc/ssb-peer-invites
[ssb-validate]: https://github.com/ssbc/ssb-validate
[ssb-blob-files]: https://github.com/ssbc/ssb-blob-files

[ssb-get-thread]: https://github.com/arj03/ssb-get-thread
[ssb-partial-replication]: https://github.com/arj03/ssb-partial-replication
