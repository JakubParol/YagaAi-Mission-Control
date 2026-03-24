#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROD_COMPOSE_FILE="$REPO_ROOT/infra/prod/docker-compose.prod.yml"
PROD_ENV="/etc/mission-control/prod.env"
PROD_PROJECT_NAME="mission-control-prod"
DEV_COMPOSE_FILE="$REPO_ROOT/infra/dev/docker-compose.yml"
DEV_ENV="$REPO_ROOT/infra/dev/.env"
DEV_ENV_EXAMPLE="$REPO_ROOT/infra/dev/.env.example"
DEV_PROJECT_NAME="mission-control-local"
ALLOW_MAIN_DEV_DEPLOY=0

log_info() { echo "[INFO] $*"; }
log_ok() { echo "[OK] $*"; }
log_error() { echo "[ERROR] $*" >&2; }

current_sha() { git -c safe.directory="$REPO_ROOT" rev-parse --short HEAD; }
previous_sha() { git -c safe.directory="$REPO_ROOT" rev-parse --short HEAD~1 2>/dev/null || current_sha; }
current_branch() { git -c safe.directory="$REPO_ROOT" rev-parse --abbrev-ref HEAD; }

ensure_prod_env() {
  if [[ ! -f "$PROD_ENV" ]]; then
    log_error "Missing $PROD_ENV"
    echo "Create it from $REPO_ROOT/infra/env/prod.env.example" >&2
    exit 1
  fi
}

ensure_dev_env() {
  if [[ -f "$DEV_ENV" ]]; then
    return 0
  fi
  cp "$DEV_ENV_EXAMPLE" "$DEV_ENV"
  log_info "Created infra/dev/.env from template"
}

require_safe_dev_branch() {
  local branch_name="$1"
  if [[ "$branch_name" == "main" && "$ALLOW_MAIN_DEV_DEPLOY" -ne 1 ]]; then
    log_error "Refusing DEV deploy from main"
    echo "Switch to an implementation branch before deploying to DEV, or re-run with --allow-main if this is intentional." >&2
    exit 1
  fi
}

smoke_check() {
  local api_url="$1"
  local web_url="$2"
  log_info "Running smoke checks..."
  curl -fsS "$api_url" >/dev/null
  curl -fsS "$web_url" >/dev/null
  log_info "Smoke checks passed"
}

show_runtime_status() {
  local compose_file="$1"
  local env_file="$2"
  local image_tag="$3"
  log_info "Runtime status (docker compose ps):"
  MC_IMAGE_TAG="$image_tag" docker compose -f "$compose_file" --env-file "$env_file" ps
}

deploy_prod() {
  local current_sha previous_sha branch_name
  ensure_prod_env
  cd "$REPO_ROOT"
  branch_name="$(current_branch)"
  current_sha="$(current_sha)"
  previous_sha="$(previous_sha)"

  log_info "Deploying PROD commit $current_sha from branch $branch_name"
  log_info "Building CLI (mc)..."
  (cd "$REPO_ROOT/apps/cli" && npm ci --ignore-scripts && npm run build)
  log_ok "CLI built: $REPO_ROOT/apps/cli/dist/index.js"

  log_info "Building production images..."
  DOCKER_BUILDKIT=1 MC_IMAGE_TAG="$current_sha" docker compose -f "$PROD_COMPOSE_FILE" --env-file "$PROD_ENV" build
  MC_IMAGE_TAG="$current_sha" bash "$REPO_ROOT/infra/scripts/run-api-migrations.sh" "$PROD_COMPOSE_FILE" "$PROD_ENV"

  log_info "Starting/updating production stack..."
  MC_IMAGE_TAG="$current_sha" docker compose -f "$PROD_COMPOSE_FILE" --env-file "$PROD_ENV" up -d --remove-orphans --wait
  smoke_check "http://127.0.0.1:5100/healthz" "http://127.0.0.1:3100/dashboard"

  log_info "Tagging images as :latest for systemd reboot..."
  for svc in api web worker; do
    docker tag "mission-control/$svc:$current_sha" "mission-control/$svc:latest" 2>/dev/null || true
  done
  log_ok "Images tagged as :latest ($current_sha)"
  show_runtime_status "$PROD_COMPOSE_FILE" "$PROD_ENV" "$current_sha"

  log_info "API /healthz response:"
  curl -fsS http://127.0.0.1:5100/healthz
  echo
  log_info "WEB /dashboard headers:"
  curl -fsS -I http://127.0.0.1:3100/dashboard
  echo
  log_info "CLI (mc) version check:"
  mc --help >/dev/null 2>&1 && log_ok "mc CLI operational" || log_error "mc CLI failed"

  log_ok "PROD deploy complete"
  echo "      project: $PROD_PROJECT_NAME"
  echo "      branch: $branch_name"
  echo "      web: http://127.0.0.1:3100"
  echo "      api: http://127.0.0.1:5100"
  echo "      cli: mc ($(which mc))"
  echo "      image_tag: $current_sha"
  echo "      previous_sha: $previous_sha"
}

deploy_dev() {
  local current_sha previous_sha branch_name
  ensure_dev_env
  cd "$REPO_ROOT"
  branch_name="$(current_branch)"
  require_safe_dev_branch "$branch_name"
  current_sha="$(current_sha)"
  previous_sha="$(previous_sha)"

  log_info "Deploying DEV commit $current_sha from branch $branch_name"
  log_info "Building DEV images (api + web)..."
  DOCKER_BUILDKIT=1 MC_IMAGE_TAG="$current_sha" docker compose -f "$DEV_COMPOSE_FILE" --env-file "$DEV_ENV" build api web
  MC_IMAGE_TAG="$current_sha" bash "$REPO_ROOT/infra/scripts/run-api-migrations.sh" "$DEV_COMPOSE_FILE" "$DEV_ENV"

  log_info "Starting/updating DEV stack..."
  MC_IMAGE_TAG="$current_sha" docker compose -f "$DEV_COMPOSE_FILE" --env-file "$DEV_ENV" up -d --remove-orphans --wait
  smoke_check "http://127.0.0.1:5000/healthz" "http://127.0.0.1:3000/dashboard"

  log_info "Tagging images as :latest for systemd reboot..."
  for svc in api web; do
    docker tag "mission-control/$svc:$current_sha" "mission-control/$svc:latest" 2>/dev/null || true
  done
  log_ok "Images tagged as :latest ($current_sha)"
  show_runtime_status "$DEV_COMPOSE_FILE" "$DEV_ENV" "$current_sha"

  log_info "API /healthz response:"
  curl -fsS http://127.0.0.1:5000/healthz
  echo
  log_info "WEB /dashboard headers:"
  curl -fsS -I http://127.0.0.1:3000/dashboard
  echo

  log_ok "DEV deploy complete"
  echo "      project: $DEV_PROJECT_NAME"
  echo "      branch: $branch_name"
  echo "      web: http://127.0.0.1:3000"
  echo "      api: http://127.0.0.1:5000"
  echo "      image_tag: $current_sha"
  echo "      previous_sha: $previous_sha"
}

confirm_or_exit() {
  local env_name="$1"
  local whiptail_colors=$'root=white,black\nwindow=white,black\nborder=white,black\ntitle=yellow,black\ntextbox=white,black\nbutton=black,cyan\nactbutton=black,green\ncompactbutton=white,black\nactlistbox=black,green\nlistbox=white,black\nactsel=black,green\nsel=black,green\nentry=white,black\ncheckbox=white,black'
  if command -v whiptail >/dev/null 2>&1; then
    if ! NEWT_COLORS="$whiptail_colors" whiptail \
      --title "Mission Control Deploy" \
      --yesno "Run ${env_name} deploy now?" \
      10 60; then
      log_info "Cancelled"
      exit 0
    fi
    return 0
  fi
  read -r -p "Run ${env_name} deploy now? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) return 0 ;;
    *)
      log_info "Cancelled"
      exit 0
      ;;
  esac
}

show_menu() {
  local choice
  local whiptail_colors=$'root=white,black\nwindow=white,black\nborder=white,black\ntitle=yellow,black\ntextbox=white,black\nbutton=black,cyan\nactbutton=black,green\ncompactbutton=white,black\nactlistbox=black,green\nlistbox=white,black\nactsel=black,green\nsel=black,green\nentry=white,black\ncheckbox=white,black'
  if command -v whiptail >/dev/null 2>&1; then
    choice="$(
      NEWT_COLORS="$whiptail_colors" whiptail \
        --title "Mission Control Deploy" \
        --menu "Choose deployment target" \
        16 72 3 \
        "1" "Deploy Dev   (container runtime on 3000 / 5000)" \
        "2" "Deploy Prod  (container runtime on 3100 / 5100)" \
        "q" "Quit" \
        3>&1 1>&2 2>&3
    )"
  else
    clear
    echo "Mission Control Deploy"
    echo "======================="
    echo "1) Deploy Dev"
    echo "2) Deploy Prod"
    echo "q) Quit"
    read -r -p "> " choice
  fi
  case "$choice" in
    1)
      confirm_or_exit "DEV"
      deploy_dev
      ;;
    2)
      confirm_or_exit "PROD"
      deploy_prod
      ;;
    q|Q|"")
      log_info "Bye"
      ;;
    *)
      log_error "Unknown option: $choice"
      exit 1
      ;;
  esac
}

print_usage() {
  cat <<EOF
Usage: $0 [dev|prod|menu] [--allow-main]

Without arguments, opens an interactive deploy menu.

Options:
  --allow-main   Allow 'dev' deploys from the main branch.
EOF
}

main() {
  local command="${1:-menu}"
  case "$command" in
    -h|--help|help)
      print_usage
      return 0
      ;;
  esac

  if [[ $# -gt 0 ]]; then
    shift
  fi
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --allow-main)
        ALLOW_MAIN_DEV_DEPLOY=1
        ;;
      -h|--help|help)
        print_usage
        return 0
        ;;
      *)
        log_error "Unknown option: $1"
        print_usage
        exit 1
        ;;
    esac
    shift
  done

  if [[ "$command" != "dev" && "$ALLOW_MAIN_DEV_DEPLOY" -eq 1 ]]; then
    log_error "--allow-main is only valid with 'dev'"
    print_usage
    exit 1
  fi

  case "$command" in
    dev) deploy_dev ;;
    prod) deploy_prod ;;
    menu) show_menu ;;
    *)
      log_error "Unknown command: $command"
      print_usage
      exit 1
      ;;
  esac
}

main "$@"
