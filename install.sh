#!/usr/bin/env bash
#
# Killer Agent — 一键安装脚本
#
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/Zhifeng-Niu/killer/main/install.sh | bash
#   或: bash install.sh [安装目录]
#
set -e

# 颜色
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

step() { echo "  ${GREEN}✓${RESET} $1"; }
info() { echo "  ${CYAN}▸${RESET} $1"; }
fail() { echo "  ${RED}✗${RESET} $1"; exit 1; }

echo ""
echo "  ${BOLD}${CYAN}═══════════════════════════════════════════════${RESET}"
echo "  ${BOLD}  🧠 Killer Agent — 一键安装${RESET}"
echo "  ${CYAN}═══════════════════════════════════════════════${RESET}"
echo ""

# ── 检查 Node.js ──
if ! command -v node &>/dev/null; then
  echo ""
  echo "  ${RED}需要 Node.js >= 20${RESET}"
  echo "  请安装: ${CYAN}https://nodejs.org${RESET}"
  echo "  或使用 nvm: ${CYAN}curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash${RESET}"
  echo ""
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  fail "Node.js 版本太旧 (当前 $(node -v))。需要 >= 20。"
fi
step "Node.js $(node -v)"

# ── 检查 git ──
if ! command -v git &>/dev/null; then
  fail "需要 git。请先安装 git。"
fi
step "git $(git --version | cut -d' ' -f3)"

# ── 检查 / 安装 pnpm ──
if ! command -v pnpm &>/dev/null; then
  info "正在安装 pnpm..."
  if command -v corepack &>/dev/null; then
    corepack enable 2>/dev/null && corepack prepare pnpm@latest --activate 2>/dev/null
  fi
  if ! command -v pnpm &>/dev/null; then
    npm install -g pnpm 2>/dev/null || fail "无法安装 pnpm。请手动: npm install -g pnpm"
  fi
  step "pnpm $(pnpm -v) 已安装"
else
  step "pnpm $(pnpm -v)"
fi

# ── 克隆仓库 ──
INSTALL_DIR="${1:-$HOME/.killer/src}"

if [ ! -d "$INSTALL_DIR/.git" ]; then
  info "正在下载 Killer Agent..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 https://github.com/Zhifeng-Niu/killer.git "$INSTALL_DIR" 2>/dev/null \
    || git clone --depth 1 https://github.com/Zhifeng-Niu/killer.git "$INSTALL_DIR" \
    || fail "下载失败。请检查网络连接。"
  step "已下载到 $INSTALL_DIR"
else
  info "更新到最新版本..."
  cd "$INSTALL_DIR" && git pull --ff-only 2>/dev/null || true
  step "已更新"
fi

cd "$INSTALL_DIR"

# ── 安装依赖 ──
info "安装依赖..."
pnpm install 2>/dev/null || pnpm install --registry=https://registry.npmmirror.com \
  || fail "安装失败。请尝试: pnpm install --registry=https://registry.npmmirror.com"
step "依赖已安装"

# ── 构建 ──
info "构建项目..."
pnpm run build \
  || fail "构建失败。请尝试: cd $INSTALL_DIR && pnpm run build"
step "构建完成"

# ── 创建便捷命令 ──
KILLER_BIN="$HOME/.killer/bin/killer"
mkdir -p "$(dirname "$KILLER_BIN")"
cat > "$KILLER_BIN" << 'LAUNCHER'
#!/usr/bin/env bash
# Killer Agent launcher
exec node "$(dirname "$0")/../src/killer.mjs" "$@"
LAUNCHER
chmod +x "$KILLER_BIN"

# 添加到 PATH（如果尚未添加）
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ] && ! grep -q '.killer/bin' "$SHELL_RC" 2>/dev/null; then
  echo '' >> "$SHELL_RC"
  echo '# Killer Agent' >> "$SHELL_RC"
  echo 'export PATH="$HOME/.killer/bin:$PATH"' >> "$SHELL_RC"
  step "已添加到 PATH (请运行 source $SHELL_RC 或重新打开终端)"
fi

# ── 完成 ──
echo ""
echo "  ${GREEN}${BOLD}✓ 安装完成！${RESET}"
echo ""
echo "  直接运行: ${CYAN}killer${RESET}"
echo "  连接 AI:  ${CYAN}killer --init${RESET} ${DIM}(粘贴 Key 即可)${RESET}"
echo ""
