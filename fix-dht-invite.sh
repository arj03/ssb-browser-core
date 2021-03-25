#!/bin/bash
# Fix issue with reconnecting-websocket when used with browserify.
sed -i '/reconnecting-websocket-mjs.js/d' node_modules/reconnecting-websocket/package.json
