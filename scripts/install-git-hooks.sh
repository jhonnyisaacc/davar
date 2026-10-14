#!/bin/sh
set -eu

marker='# installed by scripts/install-git-hooks.sh'
top=$(git rev-parse --show-toplevel)
common=$(git rev-parse --git-common-dir)
mkdir -p "$common/hooks"
hooks=$(cd "$common/hooks" && pwd -P)

dispatch=
hooks_path=$(git config --type=path --get core.hooksPath || true)
if [ -n "$hooks_path" ]; then
	dir=$(cd "$top" && cd "$hooks_path" 2>/dev/null && pwd -P || true)
	if [ -n "$dir" ] && [ -x "$dir/.dispatcher" ] && [ -f "$dir/.cursor-original-hooks-path" ]; then
		original=$(cd "$(cat "$dir/.cursor-original-hooks-path")" 2>/dev/null && pwd -P || true)
		if [ "$original" = "$hooks" ]; then
			dispatch=$dir
		fi
	fi
fi

shim() {
	cat <<EOF
#!/bin/sh
$marker
hook="\$(git rev-parse --show-toplevel)/.githooks/$1"
if [ -x "\$hook" ]; then
	exec "\$hook" "\$@"
fi
echo "$1: \$hook is not in this checkout. Skipped." >&2
EOF
}

status=0
for source in "$top"/.githooks/*; do
	if [ ! -f "$source" ] || [ ! -x "$source" ]; then
		continue
	fi
	name=${source##*/}
	target=$hooks/$name
	if [ -e "$target" ] && ! grep -qxF "$marker" "$target" && ! cmp -s "$source" "$target"; then
		echo "$target is not ours. Left unchanged." >&2
		status=1
		continue
	fi
	tmp=$(mktemp "$hooks/.$name.XXXXXX")
	shim "$name" > "$tmp"
	chmod 755 "$tmp"
	mv -f "$tmp" "$target"
	echo "installed $target"
	if [ -n "$dispatch" ] && [ ! -e "$dispatch/$name" ] && [ ! -L "$dispatch/$name" ]; then
		ln -s .dispatcher "$dispatch/$name"
		echo "linked $dispatch/$name"
	fi
done

for target in "$hooks"/*; do
	name=${target##*/}
	if [ -f "$target" ] && [ ! -x "$top/.githooks/$name" ] && grep -qxF "$marker" "$target"; then
		rm -f "$target"
		echo "removed $target"
	fi
done

exit "$status"
