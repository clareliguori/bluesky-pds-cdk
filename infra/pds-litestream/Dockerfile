FROM litestream/litestream

RUN apk --no-cache add bash dumb-init

COPY entrypoint.sh healthcheck.sh /
COPY litestream.yml /etc/

ENTRYPOINT ["dumb-init", "--"]
CMD ["/entrypoint.sh"]
