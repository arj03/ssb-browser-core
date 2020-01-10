# SSB browser core

Scuttlebutt [ssb-server] in a browser. This was originally
made as a demo for my bornhack [talk][bornhack-talk].

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

The [friends](https://github.com/ssbc/ssb-friends) module

### peerInvites

The [peer-invites](https://github.com/ssbc/ssb-peer-invites) module

### getStatus

Gets the current db status, same functionality as
[db.status](https://github.com/ssbc/ssb-db#dbstatus) in ssb-db.

## net

This is the [secret-stack](https://github.com/ssbc/secret-stack)
module with a few extra modules
loaded. [ssb-ws](https://github.com/ssbc/ssb-ws) is used to create web
socket connections to pubs.

## dir

The path to where the database and blobs are stored.

## publish(msg, cb)

Validates a message and stores it in the database. See db.add for format.

## messagesByType

A convinience method around db.query to get messages of a particular type.

## state

The current [state](https://github.com/ssbc/ssb-validate#state) of
known feeds.

## remoteAddress

The remote server to connect to. Must be web socket.

## sync

Start a EBT replication with the remote server. This syncs all the
feeds known in `SSB.state.feeds`.

FIXME: document how this works with following

## validMessageTypes

An array of message types to store during sync.

FIXME: document how this works with following

## privateMessages

A boolean to indicate if private messages are to be stored during sync.

FIXME: document how this works with following


There are a few other undocumented methods, these will probably be
moved to another module in a later version as they are quite tied to
[ssb-browser-demo](https://github.com/arj03/ssb-browser-demo).

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

