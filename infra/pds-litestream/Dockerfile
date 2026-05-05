FROM litestream/litestream AS litestream

FROM alpine:3

RUN apk add --no-cache bash dumb-init

COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY entrypoint.sh healthcheck.sh /
COPY litestream.yml /etc/

ENTRYPOINT ["dumb-init", "--"]
CMD ["/entrypoint.sh"]
