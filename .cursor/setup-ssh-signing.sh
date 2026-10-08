#!/usr/bin/env bash
set -euo pipefail

if [ -z "${SSH_SIGNING_KEY_BASE64:-}" ]; then
  echo "ERROR: SSH_SIGNING_KEY_BASE64 is not set. SSH commit signing was not configured." >&2
  exit 1
fi

email="60485595+jhonnyisaacc@users.noreply.github.com"
name="jhonnyisaacc"
ssh_dir="${HOME}/.ssh"
priv="${ssh_dir}/davar_signing_ed25519"
pub="${priv}.pub"
allowed="${ssh_dir}/davar_allowed_signers"
wrapper="${ssh_dir}/davar-git-ssh-keygen"
config_dir="${XDG_CONFIG_HOME:-${HOME}/.config}/git"
override="${config_dir}/davar-signing.gitconfig"

case "${priv}" in
  /workspace/*)
    echo "ERROR: refusing to write the signing key inside the repository." >&2
    exit 1
    ;;
esac

umask 077
mkdir -p "${ssh_dir}" "${config_dir}"
chmod 700 "${ssh_dir}"

key_tmp="$(mktemp "${ssh_dir}/.davar_signing.XXXXXX")"
if ! printf '%s' "${SSH_SIGNING_KEY_BASE64}" | tr -d '[:space:]' | base64 -d > "${key_tmp}"; then
  rm -f "${key_tmp}"
  echo "ERROR: SSH_SIGNING_KEY_BASE64 is not valid base64." >&2
  exit 1
fi
if [ ! -s "${key_tmp}" ]; then
  rm -f "${key_tmp}"
  echo "ERROR: decoded signing key is empty." >&2
  exit 1
fi
mv "${key_tmp}" "${priv}"
chmod 600 "${priv}"

if ! ssh-keygen -y -f "${priv}" > "${pub}"; then
  echo "ERROR: could not derive a public key from SSH_SIGNING_KEY_BASE64." >&2
  exit 1
fi
chmod 644 "${pub}"

fp_line="$(ssh-keygen -lf "${pub}")"
case "${fp_line}" in
  *ED25519*) ;;
  *)
    echo "ERROR: signing key is not ed25519." >&2
    exit 1
    ;;
esac
fp="$(printf '%s\n' "${fp_line}" | awk '{print $2}')"

pubkey="$(awk '{print $1 " " $2}' "${pub}")"
printf '%s %s\n' "${email}" "${pubkey}" > "${allowed}"
chmod 644 "${allowed}"

cat > "${wrapper}" << 'EOF'
#!/bin/sh
unset SSH_AUTH_SOCK
unset SSH_AGENT_PID
exec /usr/bin/ssh-keygen "$@"
EOF
chmod 700 "${wrapper}"

cat > "${override}" << EOF
[user]
	name = ${name}
	email = ${email}
	signingKey = ${pub}
[gpg]
	format = ssh
[gpg "ssh"]
	program = ${wrapper}
	allowedSignersFile = ${allowed}
[commit]
	gpgsign = true
[tag]
	gpgsign = true
EOF
chmod 644 "${override}"

git config --global gpg.format ssh
git config --global user.signingkey "${pub}"
git config --global commit.gpgsign true
git config --global tag.gpgsign true
git config --global user.name "${name}"
git config --global user.email "${email}"
git config --global gpg.ssh.program "${wrapper}"
git config --global gpg.ssh.allowedSignersFile "${allowed}"
git config --global --unset-all include.path "${override}" || true
git config --global --add include.path "${override}"

if [ "$(git config --global --get user.signingkey)" != "${pub}" ]; then
  echo "ERROR: user.signingkey does not point at the agents' public key." >&2
  exit 1
fi
if [ "$(git config --global --get gpg.ssh.program)" != "${wrapper}" ]; then
  echo "ERROR: Cursor's SSH signer program was not overridden." >&2
  exit 1
fi
case "$(git config --global --get gpg.ssh.program)" in
  *cursor-git-ssh-keygen*)
    echo "ERROR: Cursor's SSH signer program is still active." >&2
    exit 1
    ;;
esac

testdir="$(mktemp -d)"
cleanup() {
  rm -rf "${testdir}"
}
trap cleanup EXIT

git init -q "${testdir}"
if ! git -C "${testdir}" commit --allow-empty -q -m "ssh signing test" -s; then
  echo "ERROR: test commit failed." >&2
  exit 1
fi
if ! git -C "${testdir}" verify-commit HEAD > "${testdir}/verify.out" 2> "${testdir}/verify.err"; then
  echo "ERROR: SSH test signature failed verification." >&2
  exit 1
fi
if ! grep -q 'Good "git" signature' "${testdir}/verify.err"; then
  echo "ERROR: SSH test signature did not verify." >&2
  exit 1
fi
if ! grep -q "${fp}" "${testdir}/verify.err"; then
  echo "ERROR: test signature was not produced by the agents' SSH signing key." >&2
  exit 1
fi

got="$(git -C "${testdir}" log -1 --format='%an <%ae>|%cn <%ce>')"
want="${name} <${email}>|${name} <${email}>"
if [ "${got}" != "${want}" ]; then
  echo "ERROR: test commit identity was ${got}." >&2
  exit 1
fi

echo "SSH commit signing is configured and the test signature verified."
