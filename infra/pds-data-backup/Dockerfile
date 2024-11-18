FROM public.ecr.aws/docker/library/alpine:3

RUN apk --no-cache add aws-cli bash findutils groff less inotify-tools dumb-init

COPY entrypoint.sh healthcheck.sh /

ENTRYPOINT ["dumb-init", "--"]
CMD ["/entrypoint.sh"]
