# One-shot XeLaTeX compile job (scale-to-zero / `docker compose run --rm`).
FROM node:20-bookworm

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
    texlive-xetex \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-plain-generic \
    texlive-science \
    lmodern \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/compile/package.json ./
RUN npm install --omit=dev

COPY services/compile/tsconfig.json ./
COPY services/compile/src ./src

# Notebook template (sty + fonts). Prefer bundled public copy when present.
COPY notebook/main.tex notebook/notebook.sty /app/template/
COPY notebook/fonts /app/template/fonts

ENV TEMPLATE_DIR=/app/template
ENV CORE_API_URL=http://core:8080
ENV COMPILE_MODE=server
ENV PORT=8090
EXPOSE 8090

ENTRYPOINT ["npx", "tsx", "src/index.ts"]
