#!/usr/bin/env bash
#
# Killer Agent — 一键启动脚本
#
# 用法:
#   ./quickstart.sh           # 自动判断：有配置→启动，无配置→向导
#   ./quickstart.sh run       # 直接启动（已有配置）
#   ./quickstart.sh demo      # Demo 模式启动（无需 API key）
#   ./quickstart.sh init      # 强制进入配置向导
#

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/packages/killer-app"

# 颜色
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

step() {
  echo "${GREEN}✓${RESET} $1"
}

info() {
  echo "${CYAN}▸${RESET} $1"
}

warn() {
  echo "${YELLOW}!${RESET} $1"
}

fail() {
  echo "${RED}✗${RESET} $1"
  exit 1
}

# ── 检查 Node.js ──
if ! command -v node &>/dev/null; then
  fail "需要 Node.js >= 20。请先安装: https://nodejs.org"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  fail "Node.js 版本太旧 (当前 v$NODE_VERSION)。需要 >= 20。"
fi
step "Node.js $(node -v) ✓"

# ── 检查 / 安装 pnpm ──
if ! command -v pnpm &>/dev/null; then
  info "pnpm 未安装，正在自动安装..."
  # 优先用 corepack（Node 自带）
  if command -v corepack &>/dev/null; then
    corepack enable && corepack prepare pnpm@latest --activate 2>/dev/null
  fi
  # 如果 corepack 没搞定，用 npm 装
  if ! command -v pnpm &>/dev/null; then
    npm install -g pnpm 2>/dev/null || fail "无法安装 pnpm。请手动运行: npm install -g pnpm"
  fi
  step "pnpm $(pnpm -v) 已安装 ✓"
fi

# ── 安装依赖 ──
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  info "安装依赖（首次运行，需要几秒）..."
  cd "$ROOT_DIR" && pnpm install 2>/dev/null || pnpm install
  step "依赖安装完成"
fi

# ── 构建 ──
if [ ! -d "$APP_DIR/dist" ] || [ ! -f "$APP_DIR/dist/main.js" ]; then
  info "构建项目..."
  cd "$ROOT_DIR/packages/killer-core" && npx tsc
  cd "$APP_DIR" && pnpm run build
  step "构建完成"
fi

# ── 检查是否已有 API Key ──
has_key=false
if [ -f "$APP_DIR/.env" ]; then
  if grep -qE '(DEEPSEEK|GLM|MINIMAX|DASHSCOPE|MOONSHOT|SILICONFLOW|VOLCENGINE|BAICHUAN|YI|ANTHROPIC|OPENAI|OPENROUTER|GOOGLE)_API_KEY=.+' "$APP_DIR/.env" 2>/dev/null; then
    has_key=true
  fi
fi
# 也检查环境变量
for key in DEEPSEEK_API_KEY GLM_API_KEY MINIMAX_API_KEY DASHSCOPE_API_KEY MOONSHOT_API_KEY SILICONFLOW_API_KEY VOLCENGINE_API_KEY BAICHUAN_API_KEY YI_API_KEY ANTHROPIC_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY GOOGLE_API_KEY; do
  if [ -n "${!key:-}" ]; then
    has_key=true
    break
  fi
done

# ── 根据参数决定行为 ──
MODE="${1:-}"

# 如果没传参数，自动判断
if [ -z "$MODE" ]; then
  if $has_key; then
    MODE="run"
  else
    MODE="init"
  fi
fi

case "$MODE" in
  run)
    echo ""
    echo "  ${BOLD}Killer Agent${RESET} ${DIM}— The Brain That Never Stops${RESET}"
    echo ""
    cd "$APP_DIR" && node dist/main.js
    ;;
  demo)
    echo ""
    echo "  ${BOLD}Killer Agent${RESET} ${YELLOW}Demo Mode${RESET}"
    echo ""
    cd "$APP_DIR" && KILLER_LLM_PROVIDER=mock node dist/main.js
    ;;
  init)
    echo ""
    echo "  ${BOLD}${CYAN}═══════════════════════════════════════════════${RESET}"
    echo "  ${BOLD}  Killer Agent — 首次启动配置${RESET}"
    echo "  ${CYAN}═══════════════════════════════════════════════${RESET}"
    echo ""
    cd "$APP_DIR" && node dist/main.js --init
    ;;
  *)
    echo "用法: $0 [run|demo|init]"
    echo ""
    echo "  run   — 直接启动（已有 API Key）"
    echo "  demo  — Demo 模式（无需 API Key）"
    echo "  init  — 交互式配置向导"
    echo ""
    echo "  不带参数时自动判断: 有 .env → run，否则 → init"
    exit 1
    ;;
esac
