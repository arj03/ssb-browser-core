#!/bin/bash
# Fix issue with reconnecting-websocket when used with browserify.
if test -f node_modules/reconnecting-websocket/package.json; then
    sed -i '/reconnecting-websocket-mjs.js/d' node_modules/reconnecting-websocket/package.json
fi
if test -f ../node_modules/reconnecting-websocket/package.json; then
    sed -i '/reconnecting-websocket-mjs.js/d' ../node_modules/reconnecting-websocket/package.json
fi
