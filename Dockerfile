FROM node:24.11.0-slim

USER node

WORKDIR /home/node/langchain-rh

CMD ["tail", "-f", "/dev/null"]
