import os
from websocket import create_connection

ws = create_connection(
    os.getenv("BSKY_PDS_WSS_URL") + "/xrpc/com.atproto.sync.subscribeRepos?cursor=0"
)

print(ws.recv())

ws.close()
