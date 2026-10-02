#!/usr/bin/env bash
# Imprime el commit corto del código que se va a construir (ej. 507ec06), o nada si no se sabe.
# Lo usan create-company.sh, la consola y las pruebas para que cada imagen sepa su versión.
# Funciona sin git instalado (la consola corre en un contenedor sin git): lee la carpeta .git.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --short=7 HEAD 2>/dev/null; then
  exit 0
fi

GIT_DIR="$ROOT/.git"
[ -f "$GIT_DIR/HEAD" ] || exit 0
HEAD="$(cat "$GIT_DIR/HEAD")"
if [[ "$HEAD" == ref:* ]]; then
  REF="${HEAD#ref: }"
  if [ -f "$GIT_DIR/$REF" ]; then
    HEAD="$(cat "$GIT_DIR/$REF")"
  else
    # Ramas empaquetadas (git gc): se busca en packed-refs, sin depender de otras herramientas.
    HEAD=""
    while read -r SHA NAME; do [ "$NAME" = "$REF" ] && HEAD="$SHA"; done < "$GIT_DIR/packed-refs" 2>/dev/null
  fi
fi
[ -n "$HEAD" ] && echo "${HEAD:0:7}"
