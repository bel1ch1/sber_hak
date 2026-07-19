FROM python:3.11-slim
WORKDIR /app
ENV PIP_DEFAULT_TIMEOUT=120
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py wiki_store.py ./
COPY pages ./pages
ENV MCP_HOST=0.0.0.0 \
    MCP_PORT=9102
EXPOSE 9102
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["python", "-c", "import socket; s=socket.create_connection(('127.0.0.1',9102),2); s.close()"]
CMD ["python", "server.py"]
