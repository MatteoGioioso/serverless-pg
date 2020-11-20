FROM postgres

RUN apt-get update

CMD ["postgres", "-c", "log_statement=all", "-c", "log_destination=stderr"]
