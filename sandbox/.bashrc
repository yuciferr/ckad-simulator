#!/bin/bash
# CKAD Simulator — Sandboxed Shell Environment

export SANDBOX_ROOT="$HOME"
export PS1='\[\e[32m\]student@ckad-node\[\e[0m\]:\[\e[34m\]\w\[\e[0m\]\$ '
export EDITOR=vim
export KUBE_EDITOR=vim
export TERM=xterm-256color

# k alias (pre-configured in real exam)
alias k='kubectl'
alias kn='kubectl config set-context --current --namespace'

# kubectl bash completion
_kubectl_complete() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local cmds="get describe create apply delete edit patch label annotate run expose logs exec port-forward top explain api-resources api-versions config rollout scale set autoscale"
  local resources="pods pod po deployments deployment deploy services service svc configmaps configmap cm secrets secret ingresses ingress ing persistentvolumeclaims persistentvolumeclaim pvc persistentvolumes persistentvolume pv nodes node no namespaces namespace ns serviceaccounts serviceaccount sa roles role rolebindings rolebinding clusterroles clusterrole clusterrolebindings clusterrolebinding jobs job cronjobs cronjob cj daemonsets daemonset ds replicasets replicaset rs statefulsets statefulset sts networkpolicies networkpolicy netpol endpoints ep events ev"

  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=($(compgen -W "$cmds" -- "$cur"))
  elif [ "$COMP_CWORD" -eq 2 ]; then
    COMPREPLY=($(compgen -W "$resources" -- "$cur"))
  fi
}
complete -F _kubectl_complete kubectl
complete -F _kubectl_complete k

# ─── Path translation: /opt/*, /etc/*, /tmp/* → sandbox paths ───────────
_sandbox_path() {
  local p="$1"
  case "$p" in
    /opt/*|/tmp/*|/etc/kubernetes/*)
      echo "${SANDBOX_ROOT}${p}"
      ;;
    *)
      echo "$p"
      ;;
  esac
}

_translate_args() {
  local args=()
  for arg in "$@"; do
    case "$arg" in
      /opt/*|/tmp/*|/etc/kubernetes/*)
        args+=("${SANDBOX_ROOT}${arg}")
        ;;
      *)
        args+=("$arg")
        ;;
    esac
  done
  echo "${args[@]}"
}

# Override file commands to translate sandbox paths
cat() { command cat $(_translate_args "$@"); }
ls() { command ls $(_translate_args "$@"); }
cp() { command cp $(_translate_args "$@"); }
mv() { command mv $(_translate_args "$@"); }
rm() { command rm $(_translate_args "$@"); }
touch() { command touch $(_translate_args "$@"); }
chmod() { command chmod $(_translate_args "$@"); }
chown() { command chown $(_translate_args "$@"); }
head() { command head $(_translate_args "$@"); }
tail() { command tail $(_translate_args "$@"); }
wc() { command wc $(_translate_args "$@"); }
grep() { command grep $(_translate_args "$@"); }
less() { command less $(_translate_args "$@"); }
more() { command more $(_translate_args "$@"); }
mkdir() { command mkdir $(_translate_args "$@"); }
diff() { command diff $(_translate_args "$@"); }

vim() {
  local args=()
  for arg in "$@"; do
    case "$arg" in
      /opt/*|/tmp/*|/etc/kubernetes/*) args+=("${SANDBOX_ROOT}${arg}") ;;
      *) args+=("$arg") ;;
    esac
  done
  command vim "${args[@]}"
}
alias vi='vim'
alias nano='vim'

# Prevent cd outside sandbox
cd() {
  local target="${1:-$HOME}"

  case "$target" in
    /opt/*|/tmp/*|/etc/kubernetes/*)
      target="${SANDBOX_ROOT}${target}"
      ;;
    ~*) target="$HOME${target#\~}" ;;
    /*) ;;
    *)  target="$(pwd)/$target" ;;
  esac

  local resolved
  resolved=$(python3 -c "import os; print(os.path.realpath('$target'))" 2>/dev/null || echo "$target")

  if [[ "$resolved" != "$SANDBOX_ROOT"* ]]; then
    echo "bash: cd: $1: restricted - cannot leave sandbox environment"
    return 1
  fi

  builtin cd "$target"
}

# Custom pwd to show sandbox-relative paths for /opt etc.
pwd() {
  local real
  real=$(builtin pwd)
  # Show cleaned path
  echo "$real" | sed "s|${SANDBOX_ROOT}|~|; s|^~||; s|^$|/|"
}

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║         CKAD Exam Environment (Sandbox)         ║"
echo "  ║  kubectl, vim, helm are available as wrappers   ║"
echo "  ║  Type 'k get pods -A' to test kubectl           ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""
