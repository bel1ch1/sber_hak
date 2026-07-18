FROM python:3.11-slim
WORKDIR /app
ENV PIP_DEFAULT_TIMEOUT=120
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py jira_client.py plan.py accounts.py ./
COPY templates ./templates
COPY accounts.csv ./accounts.csv
ENV MCP_HOST=0.0.0.0 \
    MCP_PORT=9101 \
    JIRA_MODE=mock
EXPOSE 9101
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["python", "-c", "import socket; s=socket.create_connection(('127.0.0.1',9101),2); s.close()"]
CMD ["python", "server.py"]
