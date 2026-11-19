#!/usr/bin/env bash
set -euo pipefail

relative_path="${1:?expected the Explorer manual directory}"
destination="${2:?expected the Pad Sensei manual URL}"
if [[ "$relative_path:$destination" != "murinaikurashi.com/public_html/64-pad-explorer-manual:https://pad-sensei.com/64-pad-explorer-manual/" ]]; then
  echo "Unexpected redirect target. No files changed." >&2
  exit 64
fi

directory="$HOME/$relative_path"
cd "$directory"
if [[ -L .htaccess || (-e .htaccess && ! -f .htaccess) ]]; then
  echo "Existing .htaccess is not a regular file. No files changed." >&2
  exit 65
fi

begin_marker="# BEGIN PAD SENSEI EXPLORER MANUAL REDIRECT"
end_marker="# END PAD SENSEI EXPLORER MANUAL REDIRECT"
has_begin=0
has_end=0
grep -Fq "$begin_marker" .htaccess 2>/dev/null && has_begin=1 || true
grep -Fq "$end_marker" .htaccess 2>/dev/null && has_end=1 || true
if [[ "$has_begin" -ne "$has_end" ]]; then
  echo "Incomplete existing redirect markers. No files changed." >&2
  exit 66
fi
if [[ "$has_begin" -eq 1 ]]; then
  grep -Fq "RewriteRule ^(?:index\\.html)?$ $destination [R=301,L,NE]" .htaccess &&
    grep -Fq "RewriteRule ^(.*/)?index\\.html$ $destination\$1 [R=301,L,NE]" .htaccess &&
    grep -Fq "RewriteRule ^(.+)$ $destination\$1 [R=301,L,NE]" .htaccess || {
      echo "Existing redirect markers do not match this target. No files changed." >&2
      exit 67
    }
  echo "Explorer manual redirect is already installed."
  exit 0
fi

temporary_file="$(mktemp "$directory/.htaccess.pad-sensei.XXXXXX")"
trap 'rm -f "$temporary_file"' EXIT
{
  printf '%s\n' "$begin_marker"
  printf '%s\n' '<IfModule mod_rewrite.c>' 'RewriteEngine On'
  printf 'RewriteRule ^(?:index\\.html)?$ %s [R=301,L,NE]\n' "$destination"
  printf 'RewriteRule ^(.*/)?index\\.html$ %s$1 [R=301,L,NE]\n' "$destination"
  printf 'RewriteRule ^(.+)$ %s$1 [R=301,L,NE]\n' "$destination"
  printf '%s\n' '</IfModule>' "$end_marker"
  if [[ -f .htaccess ]]; then
    cat .htaccess
  fi
} > "$temporary_file"
if [[ -f .htaccess ]]; then
  chmod --reference=.htaccess "$temporary_file"
else
  chmod 644 "$temporary_file"
fi
mv -f "$temporary_file" .htaccess
trap - EXIT
echo "Explorer manual redirect installed."
